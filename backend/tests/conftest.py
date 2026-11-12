from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(autouse=True)
def _isolated_settings(tmp_path, monkeypatch):
    """테스트마다 임시 data 디렉터리를 쓰도록 캐시를 초기화한다."""
    from app.core import config, crypto
    from app.db import session

    monkeypatch.setenv("AUTOVIZ_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("AUTOVIZ_MASTER_KEY", raising=False)
    for fn in (config.get_settings, crypto._fernet, session.get_engine, session._session_factory):
        fn.cache_clear()
    yield
    session.get_engine().dispose()
    for fn in (config.get_settings, crypto._fernet, session.get_engine, session._session_factory):
        fn.cache_clear()


@pytest.fixture
def migrated():
    """실제 Alembic 마이그레이션으로 스키마를 만든다 (마이그레이션 자체도 함께 검증)."""
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(cfg, "head")


@pytest.fixture
def client(migrated):
    from app.main import create_app

    with TestClient(create_app()) as c:
        yield c


@pytest.fixture
def project(client):
    res = client.post("/api/projects", json={"name": "테스트"})
    assert res.status_code == 201
    return res.json()


@pytest.fixture
def raw_db():
    """API를 거치지 않고 메타 DB를 직접 조회한다 (암호화 저장 여부 확인용)."""
    from app.db.session import get_engine

    with get_engine().connect() as conn:
        yield conn
