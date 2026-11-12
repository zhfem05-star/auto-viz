import socket

import pytest
from sqlalchemy import create_engine, text

from app.core import crypto
from app.services import connections

SECRET = "p@ss:w/rd#한글"


def _payload(**overrides):
    body = {
        "db_type": "postgresql",
        "host": "db.example.com",
        "port": 5432,
        "database": "shop",
        "username": "reader",
        "password": SECRET,
    }
    body.update(overrides)
    return body


def _free_port() -> int:
    """아무것도 listen하지 않는 로컬 포트 (연결 거부를 실제 드라이버로 재현)."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


# ── URL ──────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    ("db_type", "driver"), [("postgresql", "postgresql+pg8000"), ("mysql", "mysql+pymysql")]
)
def test_build_url_uses_driver_and_escapes_password(db_type, driver):
    params = connections.ConnectionParams(db_type, "h", 1, "d", "u", SECRET)
    url = connections.build_url(params)

    assert url.drivername == driver
    assert url.password == SECRET  # 원문 보존
    rendered = url.render_as_string(hide_password=False)
    assert "p%40ss%3Aw%2Frd" in rendered  # 특수문자가 이스케이프되어 URL이 깨지지 않음


def test_unsupported_db_type():
    with pytest.raises(connections.UnsupportedDBType):
        connections.get_adapter("oracle")


# ── 비밀번호 저장 ─────────────────────────────────────────────────────────
def test_password_is_encrypted_and_never_returned(client, project, raw_db):
    pid = project["id"]
    res = client.put(f"/api/projects/{pid}/connection", json=_payload())

    assert res.status_code == 200
    assert res.json()["has_password"] is True
    assert SECRET not in res.text
    assert SECRET not in client.get(f"/api/projects/{pid}/connection").text

    stored = raw_db.execute(text("SELECT password_enc FROM db_connections")).scalar()
    assert stored and SECRET not in stored
    assert crypto.decrypt(stored) == SECRET


def test_omitting_password_keeps_it_and_empty_clears_it(client, project, raw_db):
    pid = project["id"]
    client.put(f"/api/projects/{pid}/connection", json=_payload())

    body = _payload()
    del body["password"]
    assert client.put(f"/api/projects/{pid}/connection", json=body).json()["has_password"] is True
    stored = raw_db.execute(text("SELECT password_enc FROM db_connections")).scalar()
    assert crypto.decrypt(stored) == SECRET

    cleared = client.put(f"/api/projects/{pid}/connection", json=_payload(password=""))
    assert cleared.json()["has_password"] is False


def test_validation(client, project):
    pid = project["id"]
    url = f"/api/projects/{pid}/connection"
    assert client.put(url, json=_payload(db_type="oracle")).status_code == 422
    assert client.put(url, json=_payload(port=0)).status_code == 422
    assert client.put(url, json=_payload(port=70000)).status_code == 422
    assert client.put(url, json=_payload(host="")).status_code == 422


# ── 연결 테스트 (실제 드라이버, 연결 거부) ─────────────────────────────────────
ASCII_SECRET = "ascii-Secret-123"


@pytest.mark.parametrize("db_type", ["postgresql", "mysql"])
def test_connection_refused_reports_error_without_password(client, project, db_type):
    # ASCII 비밀번호: 드라이버가 실제로 소켓 연결을 시도하고 거부당하는 경로를 검증한다.
    pid = project["id"]
    client.put(
        f"/api/projects/{pid}/connection",
        json=_payload(db_type=db_type, host="127.0.0.1", port=_free_port(), password=ASCII_SECRET),
    )

    res = client.post(f"/api/projects/{pid}/connection/test")

    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is False
    assert any(w in body["error"].lower() for w in ("refused", "connect", "거부")), body["error"]
    assert ASCII_SECRET not in res.text
    conn = client.get(f"/api/projects/{pid}/connection").json()
    assert conn["status"] == "error"
    assert conn["last_error"] == body["error"]
    assert conn["last_tested_at"] is not None


def test_mysql_non_latin1_password_returns_clear_error(client, project):
    """PyMySQL은 비밀번호를 Latin-1로 인코딩한다.
    한글 비밀번호는 500이 아니라 안내 메시지로 끝나야 한다."""
    pid = project["id"]
    client.put(
        f"/api/projects/{pid}/connection",
        json=_payload(db_type="mysql", host="127.0.0.1", port=_free_port()),
    )

    res = client.post(f"/api/projects/{pid}/connection/test")

    assert res.status_code == 200
    assert res.json()["ok"] is False
    assert "지원하지 않는 문자" in res.json()["error"]
    assert SECRET not in res.text


def test_error_message_redacts_password():
    params = connections.ConnectionParams("postgresql", "h", 1, "d", "u", SECRET)
    err = RuntimeError(f"auth failed for password {SECRET}")
    assert SECRET not in connections.short_error(err, params)


# ── 스키마 수집 (SQLite로 SQLAlchemy inspector 경로 검증) ──────────────────────
@pytest.fixture
def sqlite_user_db(tmp_path, monkeypatch):
    """postgresql 어댑터 자리에 SQLite를 끼워 넣어 실제 inspector로 스키마를 수집한다."""
    db_file = tmp_path / "user.db"
    engine = create_engine(f"sqlite:///{db_file.as_posix()}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"))
        conn.execute(
            text(
                "CREATE TABLE orders (id INTEGER PRIMARY KEY, "
                "customer_id INTEGER REFERENCES customers(id), amount NUMERIC)"
            )
        )
    engine.dispose()

    adapter = connections.DBAdapter(
        label="SQLite(test)",
        driver="sqlite",
        default_port=0,
        connect_args={},
        list_schemas_sql=None,
        row_estimates_sql=None,
        server_version_sql="SELECT sqlite_version()",
    )
    monkeypatch.setitem(connections.ADAPTERS, "postgresql", adapter)
    monkeypatch.setattr(
        connections, "engine_factory", lambda _p: create_engine(f"sqlite:///{db_file.as_posix()}")
    )


def test_successful_check_reports_version(sqlite_user_db):
    result = connections.check_connection(
        connections.ConnectionParams("postgresql", "h", 1, "d", "u", None)
    )
    assert result.ok is True
    assert result.server_version and result.server_version[0].isdigit()
    assert result.latency_ms is not None


def test_schema_refresh_collects_tables_columns_and_fks(client, project, sqlite_user_db):
    pid = project["id"]
    client.put(f"/api/projects/{pid}/connection", json=_payload())

    res = client.post(f"/api/projects/{pid}/connection/schema/refresh")

    assert res.status_code == 200
    tables = {t["name"]: t for t in res.json()["tables"]}
    assert set(tables) == {"customers", "orders"}

    cols = {c["name"]: c for c in tables["customers"]["columns"]}
    assert cols["id"]["primary_key"] is True
    assert cols["name"]["nullable"] is False
    assert tables["orders"]["foreign_keys"] == [
        {
            "columns": ["customer_id"],
            "ref_schema": None,
            "ref_table": "customers",
            "ref_columns": ["id"],
        }
    ]

    conn = client.get(f"/api/projects/{pid}/connection").json()
    assert conn["table_count"] == 2
    assert conn["status"] == "ok"
    assert client.get(f"/api/projects/{pid}/connection/schema").json() == res.json()


def test_changing_target_resets_status_and_schema(client, project, sqlite_user_db):
    pid = project["id"]
    client.put(f"/api/projects/{pid}/connection", json=_payload())
    client.post(f"/api/projects/{pid}/connection/schema/refresh")

    same = client.put(f"/api/projects/{pid}/connection", json={**_payload(), "password": None})
    assert same.json()["table_count"] == 2, "대상이 같으면 스키마 캐시를 유지해야 한다"

    moved = client.put(f"/api/projects/{pid}/connection", json=_payload(host="other-host"))
    assert moved.json()["status"] == "untested"
    assert moved.json()["table_count"] is None
    assert client.get(f"/api/projects/{pid}/connection/schema").json() is None


def test_schema_collection_is_capped(sqlite_user_db, monkeypatch):
    monkeypatch.setattr(connections, "MAX_TABLES", 1)
    snapshot = connections.collect_schema(
        connections.ConnectionParams("postgresql", "h", 1, "d", "u", None)
    )
    assert len(snapshot.tables) == 1
    assert snapshot.truncated is True


def test_schema_refresh_failure_returns_502(client, project):
    pid = project["id"]
    client.put(
        f"/api/projects/{pid}/connection",
        json=_payload(host="127.0.0.1", port=_free_port()),
    )
    res = client.post(f"/api/projects/{pid}/connection/schema/refresh")
    assert res.status_code == 502
    assert SECRET not in res.text
    assert client.get(f"/api/projects/{pid}/connection").json()["status"] == "error"
