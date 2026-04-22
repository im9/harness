"""Access-token issue/verify (HS256 JWT).

Thin wrapper over PyJWT. Secret is loaded from the HARNESS_JWT_SECRET env var
at each call so rotation takes effect without a process restart.
Parameter choice rationale: ADR 001 §Authentication.
"""

import os
from datetime import UTC, datetime, timedelta

import jwt

_ALGORITHM = "HS256"
# ADR 001 §Token strategy: 15 min TTL bounds the blast radius of a leaked
# access token given access tokens are not individually revocable.
_ACCESS_TTL = timedelta(minutes=15)
# ADR 001 §Authentication: signing secret ≥ 32 bytes. 32 bytes equals the
# HMAC-SHA256 output size (NIST SP 800-107: key ≥ output for full security).
_MIN_SECRET_BYTES = 32
_SECRET_ENV_VAR = "HARNESS_JWT_SECRET"


def _secret() -> bytes:
    raw = os.environ.get(_SECRET_ENV_VAR, "")
    encoded = raw.encode()
    if len(encoded) < _MIN_SECRET_BYTES:
        raise RuntimeError(f"{_SECRET_ENV_VAR} must be set to at least {_MIN_SECRET_BYTES} bytes")
    return encoded


def issue_access_token(user_id: int, now: datetime | None = None) -> str:
    issued_at = now if now is not None else datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "iat": int(issued_at.timestamp()),
        "exp": int((issued_at + _ACCESS_TTL).timestamp()),
    }
    return jwt.encode(payload, _secret(), algorithm=_ALGORITHM)


def verify_access_token(token: str) -> int:
    payload = jwt.decode(token, _secret(), algorithms=[_ALGORITHM])
    return int(payload["sub"])
