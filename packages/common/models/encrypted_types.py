"""Encrypted field types for sensitive data."""

import json
import logging
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import Text, TypeDecorator

from packages.common.core.config import settings

logger = logging.getLogger(__name__)


def get_fernet() -> Fernet | None:
    """Get Fernet instance for encryption/decryption."""
    if not settings.encryption_key:
        return None
    return Fernet(settings.encryption_key.encode())


class EncryptedString(TypeDecorator[str]):
    """Encrypted string field type.

    Automatically encrypts values before storing and decrypts when reading.
    Falls back to plaintext in development if no encryption key is set.

    Usage:
        class ApiKey(BaseModel):
            __tablename__ = "api_keys"

            secret: Mapped[str] = mapped_column(EncryptedString())
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: str | None, _dialect: Any) -> str | None:
        """Encrypt value before storing in database."""
        if value is None:
            return None

        fernet = get_fernet()
        if fernet is None:
            logger.warning("No ENCRYPTION_KEY configured — storing value as plaintext")
            return value

        encrypted = fernet.encrypt(value.encode())
        return encrypted.decode()

    def process_result_value(self, value: str | None, _dialect: Any) -> str | None:
        """Decrypt value when reading from database."""
        if value is None:
            return None

        fernet = get_fernet()
        if fernet is None:
            logger.warning("No ENCRYPTION_KEY configured — returning plaintext value")
            return value

        try:
            return fernet.decrypt(value.encode()).decode()
        except InvalidToken:
            logger.warning(
                "Decryption failed — returning raw value (may be unencrypted legacy data)"
            )
            return value


class EncryptedJSON(TypeDecorator[dict[str, Any]]):
    """Encrypted JSON field type.

    Automatically encrypts JSON data before storing and decrypts when reading.

    Usage:
        class UserSettings(BaseModel):
            __tablename__ = "user_settings"

            sensitive_data: Mapped[dict] = mapped_column(EncryptedJSON())
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: dict[str, Any] | None, _dialect: Any) -> str | None:
        """Encrypt JSON value before storing in database."""
        if value is None:
            return None

        json_str = json.dumps(value)
        fernet = get_fernet()

        if fernet is None:
            return json_str

        encrypted = fernet.encrypt(json_str.encode())
        return encrypted.decode()

    def process_result_value(self, value: str | None, _dialect: Any) -> dict[str, Any] | None:
        """Decrypt JSON value when reading from database."""
        if value is None:
            return None

        fernet = get_fernet()

        if fernet is None:
            return json.loads(value)

        try:
            decrypted = fernet.decrypt(value.encode()).decode()
            return json.loads(decrypted)
        except InvalidToken:
            logger.warning(
                "EncryptedJSON decryption failed — attempting raw JSON parse"
            )
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return None
