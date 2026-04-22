"""Initial credential setup for the single-user system.

Per ADR 001 §Authentication: CLI-based initial setup, no registration flow.
Supports --reset as the recovery path for a lost password or authenticator
device; see discussion in the ADR for the threat-model rationale.
"""

import pyotp
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from harness.auth.password import hash_password
from harness.auth.totp import generate_secret
from harness.models import User

_ISSUER = "Harness"


class UserAlreadyExistsError(Exception):
    """A user already exists and --reset was not specified."""


class UsernameMismatchError(Exception):
    """--reset was given but the username does not match the existing account.

    init-auth rotates credentials only; renaming is out of scope to keep the
    "accidental takeover via typo" surface small.
    """


async def init_auth(
    session: AsyncSession,
    username: str,
    password: str,
    *,
    reset: bool = False,
) -> str:
    """Create the initial user or rotate its credentials.

    Returns the ``otpauth://`` URI the user should register in their
    authenticator app.
    """
    existing = (await session.execute(select(User))).scalars().all()

    if not existing:
        secret = generate_secret()
        session.add(
            User(
                username=username,
                password_hash=hash_password(password),
                totp_secret=secret,
            )
        )
        await session.commit()
        return _otpauth_uri(username, secret)

    # Single-user invariant (ADR 001): at most one row.
    (current,) = existing

    if not reset:
        raise UserAlreadyExistsError(
            f"User {current.username!r} already exists; pass reset=True to rotate credentials."
        )

    if current.username != username:
        raise UsernameMismatchError(
            f"Cannot reset: provided username {username!r} does not match "
            f"existing user {current.username!r}. init-auth rotates credentials, not usernames."
        )

    current.password_hash = hash_password(password)
    current.totp_secret = generate_secret()
    await session.commit()
    return _otpauth_uri(current.username, current.totp_secret)


def _otpauth_uri(username: str, secret: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=_ISSUER)
