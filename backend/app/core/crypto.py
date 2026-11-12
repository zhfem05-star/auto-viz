"""DB 비밀번호, LLM API 키 등 비밀 정보 암호화 유틸."""

import logging
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class DecryptionError(Exception):
    pass


def _load_or_create_key() -> bytes:
    settings = get_settings()
    if settings.master_key:
        return settings.master_key.encode()

    key_file = settings.data_dir / "master.key"
    if key_file.exists():
        return key_file.read_bytes().strip()

    key = Fernet.generate_key()
    key_file.write_bytes(key)
    logger.warning(
        "AUTOVIZ_MASTER_KEY가 없어 %s 에 새 키를 생성했습니다. 이 파일을 잃으면 "
        "저장된 비밀 정보를 복호화할 수 없습니다.",
        key_file,
    )
    return key


@lru_cache
def _fernet() -> Fernet:
    return Fernet(_load_or_create_key())


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as e:
        raise DecryptionError("비밀 정보를 복호화할 수 없습니다 (마스터 키 불일치)") from e


def mask(secret: str, visible: int = 4) -> str:
    """화면 표시용 마스킹. 앞 몇 글자만 남긴다."""
    if len(secret) <= visible:
        return "*" * len(secret)
    return secret[:visible] + "*" * min(len(secret) - visible, 12)
