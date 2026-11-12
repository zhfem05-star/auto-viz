"""LLM 제공사 연결 (BYOK): 키 검증, 모델 목록, 도구 호출 지원 여부 확인.

비용 원칙: 사용자가 비용을 부담하므로 연결 테스트는 **토큰을 쓰지 않는 모델 목록 API**만 호출한다.
- Anthropic: 공식 SDK (`client.models.list()`)
- OpenAI / Google / Ollama: REST (httpx)
"""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

import anthropic
import httpx
import httpx2

logger = logging.getLogger(__name__)

ProviderId = Literal["anthropic", "openai", "google", "ollama"]
CapabilitySource = Literal["provider", "heuristic", "unknown"]
ErrorKind = Literal["auth", "permission", "rate_limit", "network", "not_found", "other"]

TIMEOUT_SEC = 10.0


@dataclass(frozen=True)
class ProviderMeta:
    id: ProviderId
    label: str
    requires_api_key: bool
    key_hint: str | None  # 키 형식 안내 (검증에는 쓰지 않는다)
    key_url: str | None  # 키 발급 페이지
    default_base_url: str
    base_url_editable: bool


PROVIDERS: dict[str, ProviderMeta] = {
    "anthropic": ProviderMeta(
        id="anthropic",
        label="Anthropic (Claude)",
        requires_api_key=True,
        key_hint="sk-ant-로 시작",
        key_url="https://console.anthropic.com/settings/keys",
        default_base_url="https://api.anthropic.com",
        base_url_editable=False,
    ),
    "openai": ProviderMeta(
        id="openai",
        label="OpenAI",
        requires_api_key=True,
        key_hint="sk-로 시작",
        key_url="https://platform.openai.com/api-keys",
        default_base_url="https://api.openai.com/v1",
        base_url_editable=False,
    ),
    "google": ProviderMeta(
        id="google",
        label="Google (Gemini)",
        requires_api_key=True,
        key_hint="AIza로 시작",
        key_url="https://aistudio.google.com/apikey",
        default_base_url="https://generativelanguage.googleapis.com/v1beta",
        base_url_editable=False,
    ),
    "ollama": ProviderMeta(
        id="ollama",
        label="Ollama (로컬)",
        requires_api_key=False,
        key_hint=None,
        key_url=None,
        default_base_url="http://localhost:11434",
        base_url_editable=True,
    ),
}


@dataclass(frozen=True)
class ModelInfo:
    id: str
    display_name: str
    supports_tools: bool | None
    capability_source: CapabilitySource


@dataclass
class LLMCheckResult:
    ok: bool
    latency_ms: int | None = None
    error: str | None = None
    error_kind: ErrorKind | None = None
    models: list[ModelInfo] = field(default_factory=list)
    model_found: bool | None = None
    supports_tools: bool | None = None
    capability_source: CapabilitySource = "unknown"


class ProviderError(Exception):
    def __init__(self, kind: ErrorKind, message: str):
        super().__init__(message)
        self.kind = kind


class UnknownProvider(ValueError):
    pass


def get_provider(provider: str) -> ProviderMeta:
    try:
        return PROVIDERS[provider]
    except KeyError as e:
        raise UnknownProvider(f"지원하지 않는 LLM 제공사입니다: {provider}") from e


# ── HTTP 클라이언트 훅 (테스트에서 MockTransport로 교체) ──────────────────────
# anthropic SDK 2.x는 httpx2를, 나머지 REST 호출은 httpx를 사용한다.
anthropic_http_client: Callable[[], httpx2.Client | None] = lambda: None  # noqa: E731
http_client: Callable[[], httpx.Client] = lambda: httpx.Client(timeout=TIMEOUT_SEC)  # noqa: E731


# ── 오류 메시지 ────────────────────────────────────────────────────────────
_MESSAGES: dict[ErrorKind, str] = {
    "auth": "API 키가 유효하지 않습니다.",
    "permission": "이 API 키로는 접근 권한이 없습니다.",
    "rate_limit": "요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.",
    "network": "제공사 서버에 연결할 수 없습니다.",
    "not_found": "요청한 리소스를 찾을 수 없습니다. 주소를 확인하세요.",
    "other": "제공사 응답 오류가 발생했습니다.",
}


def _kind_for_status(status: int) -> ErrorKind:
    if status == 401:
        return "auth"
    if status == 403:
        return "permission"
    if status == 404:
        return "not_found"
    if status == 429:
        return "rate_limit"
    return "other"


def _raise_for_status(res: httpx.Response) -> None:
    if res.is_success:
        return
    kind = _kind_for_status(res.status_code)
    # Google은 잘못된 키에 400(API_KEY_INVALID)을 돌려준다
    if res.status_code == 400 and "API_KEY_INVALID" in res.text:
        kind = "auth"
    raise ProviderError(kind, f"{_MESSAGES[kind]} (HTTP {res.status_code})")


def _get_json(url: str, *, headers: dict[str, str] | None = None) -> dict:
    try:
        with http_client() as client:
            res = client.get(url, headers=headers)
    except httpx.HTTPError as e:
        raise ProviderError("network", f"{_MESSAGES['network']} ({type(e).__name__})") from e
    _raise_for_status(res)
    return res.json()


def _post_json(url: str, body: dict) -> dict:
    try:
        with http_client() as client:
            res = client.post(url, json=body)
    except httpx.HTTPError as e:
        raise ProviderError("network", f"{_MESSAGES['network']} ({type(e).__name__})") from e
    _raise_for_status(res)
    return res.json()


# ── 제공사별 모델 목록 ──────────────────────────────────────────────────────
def _anthropic_models(api_key: str) -> list[ModelInfo]:
    client = anthropic.Anthropic(
        api_key=api_key,
        max_retries=0,
        timeout=TIMEOUT_SEC,
        http_client=anthropic_http_client(),
    )
    try:
        # 현행 Claude 모델은 모두 도구 호출(tool use)을 지원한다.
        return [
            ModelInfo(m.id, m.display_name, True, "provider")
            for m in client.models.list()  # 자동 페이지네이션
        ]
    except anthropic.AuthenticationError as e:
        raise ProviderError("auth", _MESSAGES["auth"]) from e
    except anthropic.PermissionDeniedError as e:
        raise ProviderError("permission", _MESSAGES["permission"]) from e
    except anthropic.RateLimitError as e:
        raise ProviderError("rate_limit", _MESSAGES["rate_limit"]) from e
    except anthropic.APIStatusError as e:
        kind = _kind_for_status(e.status_code)
        raise ProviderError(kind, f"{_MESSAGES[kind]} (HTTP {e.status_code})") from e
    except anthropic.APIConnectionError as e:
        raise ProviderError("network", _MESSAGES["network"]) from e
    finally:
        client.close()


_OPENAI_NON_CHAT = re.compile(
    r"embedding|tts|whisper|dall-e|moderation|transcribe|image|audio|realtime|search|"
    r"davinci|babbage|computer-use|sora"
)


def _openai_tool_support(model_id: str) -> bool | None:
    if _OPENAI_NON_CHAT.search(model_id):
        return False
    if model_id.startswith("chatgpt-"):
        return False  # ChatGPT 스냅샷 별칭은 도구 호출을 지원하지 않는다
    if model_id.startswith("gpt-") or re.match(r"o\d", model_id):
        return True
    return None


def _openai_models(api_key: str) -> list[ModelInfo]:
    data = _get_json(
        f"{PROVIDERS['openai'].default_base_url}/models",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    models = []
    for m in data.get("data", []):
        support = _openai_tool_support(m["id"])
        models.append(
            ModelInfo(m["id"], m["id"], support, "heuristic" if support is not None else "unknown")
        )
    return models


def _google_models(api_key: str) -> list[ModelInfo]:
    # 키를 쿼리스트링(?key=)이 아닌 헤더로 보내 URL/로그에 남지 않게 한다.
    data = _get_json(
        f"{PROVIDERS['google'].default_base_url}/models?pageSize=1000",
        headers={"x-goog-api-key": api_key},
    )
    models = []
    for m in data.get("models", []):
        model_id = m["name"].removeprefix("models/")
        chat = "generateContent" in m.get("supportedGenerationMethods", [])
        support: bool | None
        if not chat:
            support = False
        elif model_id.startswith("gemini-"):
            support = True
        else:
            support = None
        models.append(
            ModelInfo(
                model_id,
                m.get("displayName") or model_id,
                support,
                "heuristic" if support is not None else "unknown",
            )
        )
    return models


def _ollama_base(base_url: str | None) -> str:
    return (base_url or PROVIDERS["ollama"].default_base_url).rstrip("/")


def _ollama_models(base_url: str | None) -> list[ModelInfo]:
    data = _get_json(f"{_ollama_base(base_url)}/api/tags")
    # 목록 API에는 기능 정보가 없다. 선택한 모델만 /api/show로 확인한다.
    return [ModelInfo(m["name"], m["name"], None, "unknown") for m in data.get("models", [])]


def _ollama_tool_support(base_url: str | None, model: str) -> bool | None:
    data = _post_json(f"{_ollama_base(base_url)}/api/show", {"model": model})
    caps = data.get("capabilities")
    if caps is None:
        return None  # 구버전 Ollama: 기능 정보 없음
    return "tools" in caps


def list_models(provider: str, api_key: str | None, base_url: str | None) -> list[ModelInfo]:
    meta = get_provider(provider)
    if meta.requires_api_key and not api_key:
        raise ProviderError("auth", "API 키가 필요합니다.")
    match provider:
        case "anthropic":
            return _anthropic_models(api_key or "")
        case "openai":
            return _openai_models(api_key or "")
        case "google":
            return _google_models(api_key or "")
        case "ollama":
            return _ollama_models(base_url)
    raise UnknownProvider(provider)


def _redact(message: str, api_key: str | None) -> str:
    if api_key:
        message = message.replace(api_key, "****")
    return message


def check_llm(
    provider: str, model: str, api_key: str | None, base_url: str | None
) -> LLMCheckResult:
    """키 유효성 + 선택한 모델 존재 여부 + 도구 호출 지원 여부를 확인한다 (토큰 소모 없음)."""
    started = time.perf_counter()
    try:
        models = list_models(provider, api_key, base_url)
        found = next((m for m in models if m.id == model), None)
        supports, source = (
            (found.supports_tools, found.capability_source) if found else (None, "unknown")
        )
        if found and provider == "ollama":
            supports = _ollama_tool_support(base_url, model)
            source = "provider" if supports is not None else "unknown"
    except ProviderError as e:
        logger.info("LLM 연결 테스트 실패 (%s): %s", provider, e.kind)
        return LLMCheckResult(ok=False, error=_redact(str(e), api_key), error_kind=e.kind)

    usable = [m for m in models if m.supports_tools is not False]
    return LLMCheckResult(
        ok=True,
        latency_ms=int((time.perf_counter() - started) * 1000),
        models=sorted(usable, key=lambda m: m.id),
        model_found=found is not None,
        supports_tools=supports,
        capability_source=source,
    )
