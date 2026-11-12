import logging

import httpx
import httpx2
import pytest
from sqlalchemy import text

from app.core import crypto
from app.services import llm

ANTHROPIC_KEY = "sk-ant-api03-SECRET-test-key-1234567890"
OPENAI_KEY = "sk-proj-SECRET-openai-0987654321"
GOOGLE_KEY = "AIzaSECRET-google-key-555"


# ── HTTP mock 헬퍼 ────────────────────────────────────────────────────────
def _route(routes: dict[tuple[str, str], object], calls: list):
    """(METHOD, URL 경로) → 응답 함수. 정의되지 않은 요청은 테스트를 실패시킨다."""

    def handler(request):
        calls.append(request)
        key = (request.method, request.url.path)
        if key not in routes:
            raise AssertionError(f"예상하지 못한 요청: {request.method} {request.url}")
        return routes[key](request)

    return handler


@pytest.fixture
def http(monkeypatch):
    """REST 제공사(OpenAI/Google/Ollama)용 httpx mock."""
    calls: list[httpx.Request] = []
    routes: dict = {}
    monkeypatch.setattr(
        llm,
        "http_client",
        lambda: httpx.Client(transport=httpx.MockTransport(_route(routes, calls))),
    )
    return routes, calls


@pytest.fixture
def anthropic_http(monkeypatch):
    """Anthropic SDK(httpx2)용 mock."""
    calls: list[httpx2.Request] = []
    routes: dict = {}
    monkeypatch.setattr(
        llm,
        "anthropic_http_client",
        lambda: httpx2.Client(transport=httpx2.MockTransport(_route(routes, calls))),
    )
    return routes, calls


OPERATOR_SECRET = "OPERATOR-CREDENTIAL-MUST-NOT-BE-USED"


def _assert_only_user_key(request):
    """요청에 사용자 키만 실리고, 서버 환경의 다른 자격 증명은 섞이지 않았는지 확인한다.
    (SDK 버전에 따라 x-api-key 또는 Authorization: Bearer로 보낸다)"""
    creds = [request.headers.get("x-api-key"), request.headers.get("authorization")]
    sent = " ".join(c for c in creds if c)
    assert ANTHROPIC_KEY in sent, f"사용자 키가 전송되지 않았습니다: {list(request.headers)}"
    assert OPERATOR_SECRET not in sent, "서버 환경의 자격 증명이 사용되었습니다"


def _anthropic_models_ok(request):
    _assert_only_user_key(request)
    return httpx2.Response(
        200,
        json={
            "data": [
                {
                    "type": "model",
                    "id": "claude-opus-5-5",
                    "display_name": "Claude Opus 5.5",
                    "created_at": "2026-01-01T00:00:00Z",
                },
                {
                    "type": "model",
                    "id": "claude-haiku-5-5",
                    "display_name": "Claude Haiku 5.5",
                    "created_at": "2026-01-01T00:00:00Z",
                },
            ],
            "has_more": False,
            "first_id": "claude-opus-5-5",
            "last_id": "claude-haiku-5-5",
        },
    )


# ── 제공사 목록 ──────────────────────────────────────────────────────────
def test_providers_endpoint(client):
    providers = {p["id"]: p for p in client.get("/api/llm/providers").json()}
    assert set(providers) == {"anthropic", "openai", "google", "ollama"}
    assert providers["ollama"]["requires_api_key"] is False
    assert providers["ollama"]["base_url_editable"] is True
    assert providers["anthropic"]["requires_api_key"] is True


# ── 제공사별 check_llm ───────────────────────────────────────────────────
def test_anthropic_valid_key(anthropic_http):
    routes, calls = anthropic_http
    routes[("GET", "/v1/models")] = _anthropic_models_ok

    result = llm.check_llm("anthropic", "claude-opus-5-5", ANTHROPIC_KEY, None)

    assert result.ok is True
    assert result.model_found is True
    assert result.supports_tools is True
    assert result.capability_source == "provider"
    assert [m.id for m in result.models] == ["claude-haiku-5-5", "claude-opus-5-5"]
    assert len(calls) == 1, "토큰을 쓰는 API를 호출하면 안 된다 (models.list만)"


def test_anthropic_ignores_operator_credentials_in_env(anthropic_http, monkeypatch):
    """BYOK: 서버에 운영자 키/토큰이 설정돼 있어도 사용자의 키로만 호출해야 한다."""
    routes, calls = anthropic_http
    routes[("GET", "/v1/models")] = _anthropic_models_ok
    monkeypatch.setenv("ANTHROPIC_API_KEY", OPERATOR_SECRET)
    monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", OPERATOR_SECRET)

    result = llm.check_llm("anthropic", "claude-opus-5-5", ANTHROPIC_KEY, None)

    assert result.ok is True
    assert len(calls) == 1


def test_anthropic_invalid_key(anthropic_http):
    routes, _ = anthropic_http
    routes[("GET", "/v1/models")] = lambda r: httpx2.Response(
        401, json={"type": "error", "error": {"type": "authentication_error", "message": "bad"}}
    )

    result = llm.check_llm("anthropic", "claude-opus-5-5", ANTHROPIC_KEY, None)

    assert result.ok is False
    assert result.error_kind == "auth"
    assert ANTHROPIC_KEY not in (result.error or "")


def test_anthropic_model_not_in_list(anthropic_http):
    routes, _ = anthropic_http
    routes[("GET", "/v1/models")] = _anthropic_models_ok

    result = llm.check_llm("anthropic", "claude-unknown", ANTHROPIC_KEY, None)

    assert result.ok is True
    assert result.model_found is False
    assert result.supports_tools is None


def test_openai_heuristics_and_auth_header(http):
    routes, calls = http

    def models(request):
        assert request.headers["authorization"] == f"Bearer {OPENAI_KEY}"
        ids = ["gpt-5", "o3-mini", "text-embedding-3-large", "chatgpt-4o-latest", "whisper-1"]
        return httpx.Response(200, json={"data": [{"id": i} for i in ids]})

    routes[("GET", "/v1/models")] = models

    result = llm.check_llm("openai", "gpt-5", OPENAI_KEY, None)

    assert result.ok is True
    assert result.supports_tools is True
    assert result.capability_source == "heuristic"
    # 도구 호출이 불가능한 모델(임베딩, 음성, ChatGPT 별칭)은 선택지에서 제외
    assert [m.id for m in result.models] == ["gpt-5", "o3-mini"]
    assert llm._openai_tool_support("chatgpt-4o-latest") is False
    assert llm._openai_tool_support("some-finetune") is None


def test_google_key_in_header_not_url_and_invalid_key_is_auth(http):
    routes, calls = http
    routes[("GET", "/v1beta/models")] = lambda r: httpx.Response(
        400,
        json={"error": {"status": "INVALID_ARGUMENT", "details": [{"reason": "API_KEY_INVALID"}]}},
    )

    result = llm.check_llm("google", "gemini-2.5-pro", GOOGLE_KEY, None)

    assert result.ok is False
    assert result.error_kind == "auth"
    assert calls[0].headers["x-goog-api-key"] == GOOGLE_KEY
    assert GOOGLE_KEY not in str(calls[0].url), "키가 URL(로그에 남는 곳)에 들어가면 안 된다"


def test_google_models(http):
    routes, _ = http
    routes[("GET", "/v1beta/models")] = lambda r: httpx.Response(
        200,
        json={
            "models": [
                {
                    "name": "models/gemini-2.5-pro",
                    "displayName": "Gemini 2.5 Pro",
                    "supportedGenerationMethods": ["generateContent", "countTokens"],
                },
                {
                    "name": "models/text-embedding-004",
                    "displayName": "Embedding",
                    "supportedGenerationMethods": ["embedContent"],
                },
            ]
        },
    )

    result = llm.check_llm("google", "gemini-2.5-pro", GOOGLE_KEY, None)

    assert result.ok and result.model_found and result.supports_tools is True
    assert [m.id for m in result.models] == ["gemini-2.5-pro"]


@pytest.mark.parametrize(
    ("caps", "expected"), [(["completion", "tools"], True), (["completion"], False)]
)
def test_ollama_uses_base_url_and_show_capabilities(http, caps, expected):
    routes, calls = http
    routes[("GET", "/api/tags")] = lambda r: httpx.Response(
        200, json={"models": [{"name": "qwen3:8b"}]}
    )

    def show(request):
        assert request.read() == b'{"model":"qwen3:8b"}'
        return httpx.Response(200, json={"capabilities": caps})

    routes[("POST", "/api/show")] = show

    result = llm.check_llm("ollama", "qwen3:8b", None, "http://gpu-box:11434/")

    assert result.ok is True
    assert result.supports_tools is expected
    assert result.capability_source == "provider"
    assert all(c.url.host == "gpu-box" for c in calls)


def test_network_error(http):
    routes, _ = http

    def boom(request):
        raise httpx.ConnectError("refused", request=request)

    routes[("GET", "/api/tags")] = boom
    result = llm.check_llm("ollama", "x", None, None)
    assert result.ok is False
    assert result.error_kind == "network"


def test_missing_key_fails_without_network(http):
    _, calls = http
    result = llm.check_llm("openai", "gpt-5", None, None)
    assert result.ok is False
    assert result.error_kind == "auth"
    assert calls == []


# ── API: 키 저장/마스킹/상태 ──────────────────────────────────────────────
def test_api_key_encrypted_masked_and_never_returned(client, project, raw_db):
    pid = project["id"]
    res = client.put(
        f"/api/projects/{pid}/llm",
        json={"provider": "anthropic", "model": "claude-opus-5-5", "api_key": ANTHROPIC_KEY},
    )

    body = res.json()
    assert res.status_code == 200
    assert body["has_api_key"] is True
    assert body["api_key_masked"].startswith("sk-a") and "*" in body["api_key_masked"]
    assert ANTHROPIC_KEY not in res.text
    assert ANTHROPIC_KEY not in client.get(f"/api/projects/{pid}/llm").text

    stored = raw_db.execute(text("SELECT api_key_enc FROM llm_configs")).scalar()
    assert ANTHROPIC_KEY not in stored
    assert crypto.decrypt(stored) == ANTHROPIC_KEY


def test_key_kept_when_omitted_and_cleared_on_provider_change(client, project):
    pid = project["id"]
    url = f"/api/projects/{pid}/llm"
    client.put(url, json={"provider": "anthropic", "api_key": ANTHROPIC_KEY})

    kept = client.put(url, json={"provider": "anthropic", "model": "claude-opus-5-5"})
    assert kept.json()["has_api_key"] is True

    switched = client.put(url, json={"provider": "openai", "model": "gpt-5"})
    assert switched.json()["has_api_key"] is False, "다른 제공사로 이전 키를 보내면 안 된다"


def test_base_url_only_kept_for_ollama(client, project):
    pid = project["id"]
    url = f"/api/projects/{pid}/llm"
    a = client.put(url, json={"provider": "anthropic", "base_url": "http://evil.example"})
    assert a.json()["base_url"] is None
    o = client.put(
        url, json={"provider": "ollama", "base_url": " http://gpu:11434 ", "api_key": "x"}
    )
    assert o.json()["base_url"] == "http://gpu:11434"
    assert o.json()["has_api_key"] is False


def test_test_endpoint_updates_status(client, project, anthropic_http):
    routes, _ = anthropic_http
    routes[("GET", "/v1/models")] = _anthropic_models_ok
    pid = project["id"]
    url = f"/api/projects/{pid}/llm"

    # 모델 미선택: 키는 유효하지만 대화에 쓸 수 없으므로 error
    client.put(url, json={"provider": "anthropic", "api_key": ANTHROPIC_KEY})
    first = client.post(f"{url}/test").json()
    assert first["ok"] is True and len(first["models"]) == 2
    cfg = client.get(url).json()
    assert cfg["status"] == "error"
    assert cfg["last_error"] == "모델을 선택하세요."

    # 목록에서 모델을 고르면 ok
    client.put(url, json={"provider": "anthropic", "model": "claude-opus-5-5"})
    client.post(f"{url}/test")
    cfg = client.get(url).json()
    assert cfg["status"] == "ok"
    assert cfg["supports_tools"] is True
    assert cfg["last_error"] is None
    assert client.get(f"/api/projects/{pid}").json()["llm_status"] == "ok"


def test_key_never_logged(client, project, anthropic_http, caplog):
    routes, _ = anthropic_http
    routes[("GET", "/v1/models")] = lambda r: httpx2.Response(
        401,
        json={"type": "error", "error": {"type": "authentication_error", "message": ANTHROPIC_KEY}},
    )
    pid = project["id"]
    caplog.set_level(logging.DEBUG)

    client.put(f"/api/projects/{pid}/llm", json={"provider": "anthropic", "api_key": ANTHROPIC_KEY})
    res = client.post(f"/api/projects/{pid}/llm/test")

    assert res.json()["error_kind"] == "auth"
    assert ANTHROPIC_KEY not in res.text
    assert ANTHROPIC_KEY not in caplog.text
    assert ANTHROPIC_KEY not in (client.get(f"/api/projects/{pid}/llm").json()["last_error"] or "")
