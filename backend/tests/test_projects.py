from sqlalchemy import text


def test_create_uses_defaults_and_cycles_colors(client):
    a = client.post("/api/projects", json={}).json()
    b = client.post("/api/projects", json={}).json()

    assert a["name"] == "새 프로젝트"
    assert a["color"] != b["color"]
    assert a["connection_status"] is None
    assert a["llm_status"] is None


def test_list_is_ordered_by_creation(client):
    names = ["첫째", "둘째", "셋째"]
    for n in names:
        client.post("/api/projects", json={"name": n})

    assert [p["name"] for p in client.get("/api/projects").json()] == names


def test_update_only_given_fields(client, project):
    res = client.patch(f"/api/projects/{project['id']}", json={"name": "바뀐 이름"})
    assert res.status_code == 200
    assert res.json()["name"] == "바뀐 이름"
    assert res.json()["color"] == project["color"]


def test_validation(client, project):
    assert client.post("/api/projects", json={"name": ""}).status_code == 422
    assert client.post("/api/projects", json={"name": "x" * 101}).status_code == 422
    bad_color = client.patch(f"/api/projects/{project['id']}", json={"color": "red"})
    assert bad_color.status_code == 422


def test_unknown_project_is_404(client):
    assert client.get("/api/projects/nope").status_code == 404
    assert client.patch("/api/projects/nope", json={"name": "x"}).status_code == 404
    assert client.delete("/api/projects/nope").status_code == 404
    assert client.get("/api/projects/nope/connection").status_code == 404
    assert client.get("/api/projects/nope/llm").status_code == 404


def test_delete_cascades_connection_and_llm(client, project, raw_db):
    pid = project["id"]
    client.put(
        f"/api/projects/{pid}/connection",
        json={
            "db_type": "postgresql",
            "host": "db",
            "port": 5432,
            "database": "x",
            "username": "u",
            "password": "pw",
        },
    )
    client.put(f"/api/projects/{pid}/llm", json={"provider": "anthropic", "api_key": "sk-ant-x"})

    assert client.delete(f"/api/projects/{pid}").status_code == 204
    assert client.get(f"/api/projects/{pid}").status_code == 404
    for table in ("db_connections", "llm_configs"):
        count = raw_db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
        assert count == 0, f"{table}에 고아 행이 남았습니다"


def test_status_summary_reflects_settings(client, project):
    pid = project["id"]
    client.put(f"/api/projects/{pid}/llm", json={"provider": "ollama", "model": "llama3"})

    summary = client.get(f"/api/projects/{pid}").json()
    assert summary["llm_status"] == "untested"
    assert summary["connection_status"] is None
