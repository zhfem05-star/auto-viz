def test_health_ok(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"


def test_openapi_exposed(client):
    res = client.get("/openapi.json")
    assert res.status_code == 200
    assert "/api/health" in res.json()["paths"]
