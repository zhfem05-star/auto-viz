import pytest
from cryptography.fernet import Fernet

from app.core import config, crypto


def test_roundtrip_with_generated_key(tmp_path):
    token = crypto.encrypt("sk-ant-secret")
    assert token != "sk-ant-secret"
    assert crypto.decrypt(token) == "sk-ant-secret"
    assert (tmp_path / "master.key").exists()


def test_env_master_key_takes_precedence(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOVIZ_MASTER_KEY", Fernet.generate_key().decode())
    config.get_settings.cache_clear()
    crypto._fernet.cache_clear()

    assert crypto.decrypt(crypto.encrypt("pw")) == "pw"
    assert not (tmp_path / "master.key").exists()


def test_wrong_key_raises(monkeypatch):
    token = crypto.encrypt("pw")
    monkeypatch.setenv("AUTOVIZ_MASTER_KEY", Fernet.generate_key().decode())
    config.get_settings.cache_clear()
    crypto._fernet.cache_clear()

    with pytest.raises(crypto.DecryptionError):
        crypto.decrypt(token)


def test_mask():
    assert crypto.mask("sk-ant-1234567890") == "sk-a" + "*" * 12
    assert crypto.mask("abc") == "***"
