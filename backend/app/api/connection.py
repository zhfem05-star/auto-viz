from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import DbSession
from app.api.projects import get_project_or_404
from app.core import crypto
from app.models import DBConnection
from app.schemas.project import ConnectionIn, ConnectionOut, ConnectionTestOut, SchemaOut
from app.services import connections

router = APIRouter(prefix="/projects/{project_id}/connection", tags=["connection"])

# 이 값이 바뀌면 다른 DB를 가리키므로 테스트 결과와 스키마 캐시를 초기화한다.
_TARGET_FIELDS = ("db_type", "host", "port", "database", "username")


def _to_out(c: DBConnection) -> ConnectionOut:
    return ConnectionOut(
        db_type=c.db_type,
        host=c.host,
        port=c.port,
        database=c.database,
        username=c.username,
        has_password=c.password_enc is not None,
        status=c.status,
        last_error=c.last_error,
        last_tested_at=c.last_tested_at,
        schema_updated_at=c.schema_updated_at,
        table_count=len(c.schema_cache["tables"]) if c.schema_cache else None,
    )


def _params(c: DBConnection) -> connections.ConnectionParams:
    return connections.ConnectionParams(
        db_type=c.db_type,
        host=c.host,
        port=c.port,
        database=c.database,
        username=c.username,
        password=crypto.decrypt(c.password_enc) if c.password_enc else None,
    )


def _get_or_404(db: Session, project_id: str) -> DBConnection:
    project = get_project_or_404(db, project_id)
    if project.connection is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "DB 연결 정보가 없습니다.")
    return project.connection


@router.get("", response_model=ConnectionOut | None)
def get_connection(project_id: str, db: DbSession) -> ConnectionOut | None:
    project = get_project_or_404(db, project_id)
    return _to_out(project.connection) if project.connection else None


@router.put("", response_model=ConnectionOut)
def put_connection(project_id: str, body: ConnectionIn, db: DbSession) -> ConnectionOut:
    project = get_project_or_404(db, project_id)
    conn = project.connection
    if conn is None:
        conn = DBConnection(project_id=project.id, status="untested")
        project.connection = conn
        target_changed = True
    else:
        target_changed = any(getattr(conn, f) != getattr(body, f) for f in _TARGET_FIELDS)

    for f in _TARGET_FIELDS:
        setattr(conn, f, getattr(body, f))

    if body.password is not None:
        conn.password_enc = crypto.encrypt(body.password) if body.password else None
        target_changed = True

    if target_changed:
        conn.status = "untested"
        conn.last_error = None
        conn.last_tested_at = None
        conn.schema_cache = None
        conn.schema_updated_at = None

    db.commit()
    db.refresh(conn)
    return _to_out(conn)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection(project_id: str, db: DbSession) -> Response:
    db.delete(_get_or_404(db, project_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/test", response_model=ConnectionTestOut)
def test_connection(project_id: str, db: DbSession) -> ConnectionTestOut:
    conn = _get_or_404(db, project_id)
    result = connections.check_connection(_params(conn))
    conn.status = "ok" if result.ok else "error"
    conn.last_error = result.error
    conn.last_tested_at = datetime.now(UTC)
    db.commit()
    return ConnectionTestOut(
        ok=result.ok,
        latency_ms=result.latency_ms,
        server_version=result.server_version,
        error=result.error,
    )


@router.get("/schema", response_model=SchemaOut | None)
def get_schema(project_id: str, db: DbSession) -> SchemaOut | None:
    conn = _get_or_404(db, project_id)
    return SchemaOut.from_cache(conn.schema_cache) if conn.schema_cache else None


@router.post("/schema/refresh", response_model=SchemaOut)
def refresh_schema(project_id: str, db: DbSession) -> SchemaOut:
    conn = _get_or_404(db, project_id)
    params = _params(conn)
    try:
        snapshot = connections.collect_schema(params)
    except Exception as e:  # noqa: BLE001 — 드라이버별 예외 종류가 제각각이다
        conn.status = "error"
        conn.last_error = connections.short_error(e, params)
        db.commit()
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"스키마를 가져오지 못했습니다: {conn.last_error}"
        ) from e

    conn.schema_cache = snapshot.to_dict()
    conn.schema_updated_at = datetime.now(UTC)
    conn.status = "ok"
    conn.last_error = None
    db.commit()
    return SchemaOut.from_cache(conn.schema_cache)
