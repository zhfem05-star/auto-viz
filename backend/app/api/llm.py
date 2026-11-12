from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import DbSession
from app.api.projects import get_project_or_404
from app.core import crypto
from app.models import LLMConfig
from app.schemas.project import LLMConfigIn, LLMConfigOut, LLMTestOut, ModelOut, ProviderOut
from app.services import llm

providers_router = APIRouter(prefix="/llm", tags=["llm"])
router = APIRouter(prefix="/projects/{project_id}/llm", tags=["llm"])


@providers_router.get("/providers", response_model=list[ProviderOut])
def list_providers() -> list[ProviderOut]:
    return [ProviderOut(**vars(p)) for p in llm.PROVIDERS.values()]


def _to_out(c: LLMConfig) -> LLMConfigOut:
    return LLMConfigOut(
        provider=c.provider,
        model=c.model,
        base_url=c.base_url,
        has_api_key=c.api_key_enc is not None,
        api_key_masked=crypto.mask(crypto.decrypt(c.api_key_enc)) if c.api_key_enc else None,
        status=c.status,
        last_error=c.last_error,
        last_tested_at=c.last_tested_at,
        supports_tools=c.supports_tools,
    )


def _get_or_404(db: Session, project_id: str) -> LLMConfig:
    project = get_project_or_404(db, project_id)
    if project.llm is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "LLM 설정이 없습니다.")
    return project.llm


@router.get("", response_model=LLMConfigOut | None)
def get_llm(project_id: str, db: DbSession) -> LLMConfigOut | None:
    project = get_project_or_404(db, project_id)
    return _to_out(project.llm) if project.llm else None


@router.put("", response_model=LLMConfigOut)
def put_llm(project_id: str, body: LLMConfigIn, db: DbSession) -> LLMConfigOut:
    project = get_project_or_404(db, project_id)
    meta = llm.get_provider(body.provider)
    cfg = project.llm
    if cfg is None:
        cfg = LLMConfig(project_id=project.id, status="untested")
        project.llm = cfg

    provider_changed = cfg.provider != body.provider
    base_url = (body.base_url or "").strip() or None if meta.base_url_editable else None
    changed = provider_changed or cfg.model != body.model or cfg.base_url != base_url

    if body.api_key is not None:
        key = body.api_key.strip()
        cfg.api_key_enc = crypto.encrypt(key) if key else None
        changed = True
    elif provider_changed:
        # 키는 제공사별로 다르므로, 제공사를 바꾸면 이전 키를 남기지 않는다.
        cfg.api_key_enc = None

    if not meta.requires_api_key:
        cfg.api_key_enc = None

    cfg.provider = body.provider
    cfg.model = body.model.strip()
    cfg.base_url = base_url
    if changed:
        cfg.status = "untested"
        cfg.last_error = None
        cfg.last_tested_at = None
        cfg.supports_tools = None

    db.commit()
    db.refresh(cfg)
    return _to_out(cfg)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_llm(project_id: str, db: DbSession) -> Response:
    db.delete(_get_or_404(db, project_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/test", response_model=LLMTestOut)
def test_llm(project_id: str, db: DbSession) -> LLMTestOut:
    """키 검증 + 모델 목록 + 도구 호출 지원 확인. 모델 목록 API만 호출하므로 토큰 비용이 없다."""
    cfg = _get_or_404(db, project_id)
    api_key = crypto.decrypt(cfg.api_key_enc) if cfg.api_key_enc else None
    result = llm.check_llm(cfg.provider, cfg.model, api_key, cfg.base_url)

    # 키는 유효해도 선택한 모델이 없으면 대화에 쓸 수 없으므로 error로 본다.
    usable = result.ok and (result.model_found is True)
    cfg.status = "ok" if usable else "error"
    if result.ok and not cfg.model:
        cfg.last_error = "모델을 선택하세요."
    elif result.ok and result.model_found is False:
        cfg.last_error = f"'{cfg.model}' 모델을 찾을 수 없습니다."
    else:
        cfg.last_error = result.error
    cfg.supports_tools = result.supports_tools
    cfg.last_tested_at = datetime.now(UTC)
    db.commit()

    return LLMTestOut(
        ok=result.ok,
        latency_ms=result.latency_ms,
        error=result.error,
        error_kind=result.error_kind,
        models=[ModelOut(**vars(m)) for m in result.models],
        model_found=result.model_found,
        supports_tools=result.supports_tools,
        capability_source=result.capability_source,
    )
