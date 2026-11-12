import tomllib
from pathlib import Path

from sqlalchemy.exc import OperationalError

from app.db.session import get_db

PYPROJECT = Path(__file__).resolve().parents[1] / "pyproject.toml"


def test_health_ok(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {
        "status": "ok",
        "version": tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))["project"]["version"],
        "database": "ok",
    }


def test_health_degraded_when_db_fails(client):
    """DB 쿼리가 실패하면 200을 유지하되 degraded/error로 보고해야 한다."""

    class BrokenSession:
        def execute(self, *_args, **_kwargs):
            raise OperationalError("SELECT 1", {}, Exception("db down"))

    client.app.dependency_overrides[get_db] = lambda: BrokenSession()
    try:
        res = client.get("/api/health")
    finally:
        client.app.dependency_overrides.clear()

    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "degraded"
    assert body["database"] == "error"


def test_health_uses_isolated_data_dir(client, tmp_path):
    """테스트가 실제 backend/data가 아니라 임시 디렉터리의 DB를 사용하는지 확인한다."""
    client.get("/api/health")
    assert (tmp_path / "autoviz.db").exists()


def test_openapi_exposed(client):
    res = client.get("/openapi.json")
    assert res.status_code == 200
    assert "/api/health" in res.json()["paths"]
