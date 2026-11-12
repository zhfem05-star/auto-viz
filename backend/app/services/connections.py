"""사용자 DB 연결: URL 생성, 연결 테스트, 스키마 수집.

DB 종류별 차이는 DBAdapter로 분리한다. 새 DB를 추가하려면 ADAPTERS에 어댑터를 등록한다.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

from sqlalchemy import Engine, create_engine, inspect, text
from sqlalchemy.engine import URL
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool

logger = logging.getLogger(__name__)

DBType = Literal["postgresql", "mysql"]

CONNECT_TIMEOUT_SEC = 5
MAX_TABLES = 500  # 스키마 수집 상한 (LLM 컨텍스트와 응답 크기 보호)


@dataclass(frozen=True)
class ConnectionParams:
    db_type: str
    host: str
    port: int
    database: str
    username: str
    password: str | None


@dataclass(frozen=True)
class DBAdapter:
    label: str
    driver: str
    default_port: int
    connect_args: dict[str, Any]
    # 사용자 스키마 목록 (시스템 스키마 제외). None이면 기본 스키마만.
    list_schemas_sql: str | None
    # 테이블별 추정 행 수: (schema, table) -> rows. 실패해도 스키마 수집은 계속한다.
    row_estimates_sql: str | None
    server_version_sql: str


ADAPTERS: dict[str, DBAdapter] = {
    "postgresql": DBAdapter(
        label="PostgreSQL",
        driver="postgresql+pg8000",
        default_port=5432,
        connect_args={"timeout": CONNECT_TIMEOUT_SEC},
        list_schemas_sql=(
            "SELECT schema_name FROM information_schema.schemata "
            "WHERE schema_name NOT IN ('pg_catalog', 'information_schema') "
            "AND schema_name NOT LIKE 'pg_toast%' AND schema_name NOT LIKE 'pg_temp%'"
        ),
        row_estimates_sql=(
            "SELECT n.nspname, c.relname, c.reltuples::bigint FROM pg_class c "
            "JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r', 'p')"
        ),
        server_version_sql="SELECT version()",
    ),
    "mysql": DBAdapter(
        label="MySQL",
        driver="mysql+pymysql",
        default_port=3306,
        connect_args={"connect_timeout": CONNECT_TIMEOUT_SEC},
        list_schemas_sql=None,  # MySQL은 연결한 database 하나만 대상으로 한다
        row_estimates_sql=(
            "SELECT table_schema, table_name, table_rows FROM information_schema.tables "
            "WHERE table_schema = DATABASE()"
        ),
        server_version_sql="SELECT VERSION()",
    ),
}


class UnsupportedDBType(ValueError):
    pass


def get_adapter(db_type: str) -> DBAdapter:
    try:
        return ADAPTERS[db_type]
    except KeyError as e:
        raise UnsupportedDBType(f"지원하지 않는 DB 종류입니다: {db_type}") from e


def build_url(params: ConnectionParams) -> URL:
    # URL.create는 비밀번호의 특수문자(@, :, / 등)를 안전하게 이스케이프한다.
    return URL.create(
        get_adapter(params.db_type).driver,
        username=params.username,
        password=params.password,
        host=params.host,
        port=params.port,
        database=params.database,
    )


def _default_engine_factory(params: ConnectionParams) -> Engine:
    adapter = get_adapter(params.db_type)
    return create_engine(build_url(params), connect_args=adapter.connect_args, poolclass=NullPool)


# 테스트에서 교체할 수 있도록 모듈 수준 훅으로 둔다.
engine_factory: Callable[[ConnectionParams], Engine] = _default_engine_factory


def _redact(message: str, params: ConnectionParams) -> str:
    """오류 메시지에 비밀번호가 섞여 나오지 않도록 가린다."""
    if params.password:
        message = message.replace(params.password, "****")
    return message


def short_error(e: Exception, params: ConnectionParams) -> str:
    """사용자에게 보여줄 한 줄 오류 메시지 (비밀번호는 가린다)."""
    if isinstance(e, UnicodeEncodeError):
        # 예: PyMySQL은 비밀번호를 Latin-1로 인코딩하므로 한글 등이 들어가면 접속 전에 실패한다.
        return "사용자명 또는 비밀번호에 이 DB 드라이버가 지원하지 않는 문자가 있습니다."
    # SQLAlchemy 예외는 원본 DBAPI 오류를 orig에 담는다. 사용자에게는 원본 메시지만 보여준다.
    orig = getattr(e, "orig", None) or e
    return _redact(str(orig).strip().splitlines()[0][:500] or type(orig).__name__, params)


@dataclass
class CheckResult:
    ok: bool
    latency_ms: int | None = None
    server_version: str | None = None
    error: str | None = None


def check_connection(params: ConnectionParams) -> CheckResult:
    adapter = get_adapter(params.db_type)
    started = time.perf_counter()
    engine = engine_factory(params)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            version = conn.execute(text(adapter.server_version_sql)).scalar()
        return CheckResult(
            ok=True,
            latency_ms=int((time.perf_counter() - started) * 1000),
            server_version=str(version)[:200] if version else None,
        )
    except Exception as e:  # noqa: BLE001 — 진단 함수: 어떤 실패든 결과로 돌려준다
        logger.info("DB 연결 테스트 실패 (%s:%s): %s", params.host, params.port, type(e).__name__)
        return CheckResult(ok=False, error=short_error(e, params))
    finally:
        engine.dispose()


@dataclass
class SchemaSnapshot:
    tables: list[dict[str, Any]] = field(default_factory=list)
    truncated: bool = False
    collected_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "tables": self.tables,
            "truncated": self.truncated,
            "collected_at": self.collected_at,
        }


def _row_estimates(conn, adapter: DBAdapter) -> dict[tuple[str | None, str], int]:
    if not adapter.row_estimates_sql:
        return {}
    try:
        rows = conn.execute(text(adapter.row_estimates_sql)).all()
    except SQLAlchemyError:
        logger.info("추정 행 수 조회 실패 (권한 부족 등) — 생략")
        return {}
    return {(r[0], r[1]): max(int(r[2] or 0), 0) for r in rows}


def collect_schema(params: ConnectionParams) -> SchemaSnapshot:
    """테이블/컬럼/PK/FK/코멘트/추정 행 수를 수집한다. 조회 전용 작업만 수행한다."""
    adapter = get_adapter(params.db_type)
    engine = engine_factory(params)
    snapshot = SchemaSnapshot(collected_at=datetime.now(UTC).isoformat())
    try:
        with engine.connect() as conn:
            insp = inspect(conn)
            if adapter.list_schemas_sql:
                schemas: list[str | None] = [
                    r[0] for r in conn.execute(text(adapter.list_schemas_sql)).all()
                ]
            else:
                schemas = [None]  # 기본 스키마 (MySQL: 연결한 database)
            estimates = _row_estimates(conn, adapter)
            default_schema = insp.default_schema_name

            for schema in schemas:
                for table in sorted(insp.get_table_names(schema=schema)):
                    if len(snapshot.tables) >= MAX_TABLES:
                        snapshot.truncated = True
                        break
                    snapshot.tables.append(
                        _describe_table(insp, schema, table, estimates, default_schema)
                    )
                if snapshot.truncated:
                    break
        return snapshot
    finally:
        engine.dispose()


def _describe_table(insp, schema, table, estimates, default_schema) -> dict[str, Any]:
    pk = set(insp.get_pk_constraint(table, schema=schema).get("constrained_columns") or [])
    columns = [
        {
            "name": c["name"],
            "type": str(c["type"]),
            "nullable": bool(c.get("nullable", True)),
            "primary_key": c["name"] in pk,
            "comment": c.get("comment"),
        }
        for c in insp.get_columns(table, schema=schema)
    ]
    foreign_keys = [
        {
            "columns": fk["constrained_columns"],
            "ref_schema": fk.get("referred_schema"),
            "ref_table": fk["referred_table"],
            "ref_columns": fk["referred_columns"],
        }
        for fk in insp.get_foreign_keys(table, schema=schema)
    ]
    try:
        comment = insp.get_table_comment(table, schema=schema).get("text")
    except NotImplementedError:
        comment = None
    estimate_key_schema = schema if schema is not None else default_schema
    return {
        "schema": schema,
        "name": table,
        "comment": comment,
        "row_estimate": estimates.get((estimate_key_schema, table)),
        "columns": columns,
        "foreign_keys": foreign_keys,
    }
