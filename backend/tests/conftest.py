import pytest
from fastapi.testclient import TestClient


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
def client():
    from app.main import create_app

    with TestClient(create_app()) as c:
        yield c
