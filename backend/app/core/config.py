from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """앱 설정. 환경변수(AUTOVIZ_ 접두어) 또는 .env 파일에서 읽는다."""

    model_config = SettingsConfigDict(env_prefix="AUTOVIZ_", env_file=".env", extra="ignore")

    app_name: str = "auto-viz"
    version: str = "0.1.0"
    log_level: str = "INFO"

    # 앱 데이터 디렉터리 (메타 DB, 데이터셋, 마스터 키 파일)
    data_dir: Path = Path("data")

    # 비밀 정보 암호화용 Fernet 키. 비어 있으면 data_dir/master.key를 생성해 사용한다.
    master_key: str | None = None

    # 개발 서버(Vite) CORS 허용 출처
    cors_origins: list[str] = ["http://localhost:5173"]

    @property
    def database_url(self) -> str:
        return f"sqlite:///{(self.data_dir / 'autoviz.db').as_posix()}"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    return settings
