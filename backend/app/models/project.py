from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def _uuid() -> str:
    return uuid4().hex


def _now() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )


class Project(TimestampMixin, Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(100))
    color: Mapped[str] = mapped_column(String(16))

    connection: Mapped["DBConnection | None"] = relationship(
        back_populates="project", cascade="all, delete-orphan", uselist=False
    )
    llm: Mapped["LLMConfig | None"] = relationship(
        back_populates="project", cascade="all, delete-orphan", uselist=False
    )


class DBConnection(TimestampMixin, Base):
    """사용자 DB 연결 정보. 비밀번호는 암호화해서 저장한다."""

    __tablename__ = "db_connections"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), unique=True
    )
    db_type: Mapped[str] = mapped_column(String(20))
    host: Mapped[str] = mapped_column(String(255))
    port: Mapped[int] = mapped_column(Integer)
    database: Mapped[str] = mapped_column(String(255))
    username: Mapped[str] = mapped_column(String(255))
    password_enc: Mapped[str | None] = mapped_column(Text)

    # 마지막 연결 테스트 결과
    status: Mapped[str] = mapped_column(String(20), default="untested")
    last_error: Mapped[str | None] = mapped_column(Text)
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # 스키마 캐시 (테이블/컬럼/FK/코멘트/추정 행 수)
    schema_cache: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    schema_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    project: Mapped[Project] = relationship(back_populates="connection")


class LLMConfig(TimestampMixin, Base):
    """사용자 본인의 LLM 설정 (BYOK). API 키는 암호화해서 저장한다."""

    __tablename__ = "llm_configs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), unique=True
    )
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(200))
    base_url: Mapped[str | None] = mapped_column(String(500))
    api_key_enc: Mapped[str | None] = mapped_column(Text)

    status: Mapped[str] = mapped_column(String(20), default="untested")
    last_error: Mapped[str | None] = mapped_column(Text)
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # 선택한 모델의 도구 호출(tool calling) 지원 여부. None = 확인 불가
    supports_tools: Mapped[bool | None] = mapped_column()

    project: Mapped[Project] = relationship(back_populates="llm")
