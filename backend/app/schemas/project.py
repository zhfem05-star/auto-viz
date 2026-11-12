from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

ConnStatus = Literal["untested", "ok", "error"]
DBTypeIn = Literal["postgresql", "mysql"]
ProviderIn = Literal["anthropic", "openai", "google", "ollama"]


# ── Project ──────────────────────────────────────────────────────────────
class ProjectCreate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")


class ProjectOut(BaseModel):
    id: str
    name: str
    color: str
    created_at: datetime
    updated_at: datetime
    # 사이드바 상태 표시용 요약. 설정이 없으면 None.
    connection_status: ConnStatus | None
    llm_status: ConnStatus | None


# ── DB connection ────────────────────────────────────────────────────────
class ConnectionIn(BaseModel):
    db_type: DBTypeIn
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(ge=1, le=65535)
    database: str = Field(min_length=1, max_length=255)
    username: str = Field(min_length=1, max_length=255)
    # None(생략) = 기존 비밀번호 유지. 빈 문자열 = 비밀번호 없음으로 변경.
    password: str | None = Field(default=None, max_length=1000)


class ConnectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    db_type: DBTypeIn
    host: str
    port: int
    database: str
    username: str
    has_password: bool
    status: ConnStatus
    last_error: str | None
    last_tested_at: datetime | None
    schema_updated_at: datetime | None
    table_count: int | None


class ConnectionTestOut(BaseModel):
    ok: bool
    latency_ms: int | None
    server_version: str | None
    error: str | None


class ColumnOut(BaseModel):
    name: str
    type: str
    nullable: bool
    primary_key: bool
    comment: str | None


class ForeignKeyOut(BaseModel):
    columns: list[str]
    ref_schema: str | None
    ref_table: str
    ref_columns: list[str]


class TableOut(BaseModel):
    schema_: str | None = Field(alias="schema", serialization_alias="schema")
    name: str
    comment: str | None
    row_estimate: int | None
    columns: list[ColumnOut]
    foreign_keys: list[ForeignKeyOut]

    model_config = ConfigDict(populate_by_name=True)


class SchemaOut(BaseModel):
    tables: list[TableOut]
    truncated: bool
    collected_at: str

    @classmethod
    def from_cache(cls, cache: dict[str, Any]) -> "SchemaOut":
        return cls.model_validate(cache)


# ── LLM ──────────────────────────────────────────────────────────────────
class ProviderOut(BaseModel):
    id: ProviderIn
    label: str
    requires_api_key: bool
    key_hint: str | None
    key_url: str | None
    default_base_url: str
    base_url_editable: bool


class LLMConfigIn(BaseModel):
    provider: ProviderIn
    model: str = Field(default="", max_length=200)
    base_url: str | None = Field(default=None, max_length=500)
    # None(생략) = 기존 키 유지 (단, 제공사를 바꾸면 기존 키는 삭제). 빈 문자열 = 키 삭제.
    api_key: str | None = Field(default=None, max_length=1000)


class LLMConfigOut(BaseModel):
    provider: ProviderIn
    model: str
    base_url: str | None
    has_api_key: bool
    api_key_masked: str | None
    status: ConnStatus
    last_error: str | None
    last_tested_at: datetime | None
    supports_tools: bool | None


class ModelOut(BaseModel):
    id: str
    display_name: str
    supports_tools: bool | None
    capability_source: Literal["provider", "heuristic", "unknown"]


class LLMTestOut(BaseModel):
    ok: bool
    latency_ms: int | None
    error: str | None
    error_kind: Literal["auth", "permission", "rate_limit", "network", "not_found", "other"] | None
    models: list[ModelOut]
    model_found: bool | None
    supports_tools: bool | None
    capability_source: Literal["provider", "heuristic", "unknown"]
