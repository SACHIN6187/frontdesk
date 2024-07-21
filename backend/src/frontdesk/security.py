"""Password hashing and JWT issue/verify. No secrets logged."""

from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import get_settings

# Cost is configurable so tests can drop to a cheap factor (bcrypt at the default 12
# rounds is deliberately slow; a suite doing many signups would take minutes).
# Production keeps the strong default via FRONTDESK_BCRYPT_ROUNDS.
_pwd = CryptContext(
    schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=get_settings().bcrypt_rounds
)


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def create_access_token(user_id: str, org_id: str) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    claims: dict[str, Any] = {
        "sub": user_id,
        "org": org_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=s.jwt_ttl_minutes)).timestamp()),
    }
    token: str = jwt.encode(claims, s.jwt_secret, algorithm=s.jwt_algorithm)
    return token


def decode_token(token: str) -> dict[str, Any] | None:
    s = get_settings()
    try:
        claims: dict[str, Any] = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
        return claims
    except JWTError:
        return None
