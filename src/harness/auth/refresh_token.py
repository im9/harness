"""Refresh-token issue / rotate / revoke with reuse detection.

Pattern and rationale: ADR 001 §Token strategy.

- issue: start a new family (login) or a new row in an existing family (called
  by rotate).
- rotate: verify a presented token, revoke it, and issue a successor in the
  same family. A re-presentation of an already-revoked token is treated as
  theft and revokes the whole family.
- revoke_family: logout — kills every active row in the presented token's
  family.

The server stores only SHA-256 hashes of token values, never plaintext.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from harness.models import RefreshToken

# ADR 001 §Token strategy: "Opaque random string (≥32 bytes)". 32 bytes =
# 256 bits of entropy; collision probability across any realistic population
# of tokens is cryptographically negligible.
_TOKEN_BYTES = 32
# ADR 001 §Token strategy: refresh token TTL = 7 days.
_REFRESH_TTL = timedelta(days=7)


class InvalidRefreshToken(Exception):
    """Presented token is unknown, expired, or (post-revocation) replayed."""


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _as_utc(dt: datetime) -> datetime:
    # SQLite has no native tz-aware timestamp, so values round-tripped through
    # the DB come back naive. We always write UTC, so attaching UTC on read is
    # information-preserving — the alternative is a cross-awareness comparison
    # that raises TypeError.
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


def _new_token() -> str:
    # token_urlsafe(n) returns base64url-encoded n random bytes — safe for
    # cookies without additional escaping.
    return secrets.token_urlsafe(_TOKEN_BYTES)


async def _lookup(session: AsyncSession, presented: str) -> RefreshToken:
    row = (
        await session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == _hash(presented))
        )
    ).scalar_one_or_none()
    if row is None:
        raise InvalidRefreshToken("unknown token")
    return row


async def _revoke_family(session: AsyncSession, family_id: str, *, at: datetime) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=at)
    )
    await session.flush()


async def issue(
    session: AsyncSession,
    user_id: int,
    *,
    family_id: str | None = None,
    now: datetime | None = None,
) -> str:
    """Create a new refresh-token row and return the plaintext token.

    `family_id=None` starts a new family (login). Passing an existing family_id
    continues rotation within that family.
    """
    moment = now if now is not None else datetime.now(UTC)
    token = _new_token()
    session.add(
        RefreshToken(
            id=str(uuid.uuid4()),
            user_id=user_id,
            token_hash=_hash(token),
            family_id=family_id if family_id is not None else str(uuid.uuid4()),
            expires_at=moment + _REFRESH_TTL,
        )
    )
    await session.flush()
    return token


async def rotate(
    session: AsyncSession,
    presented: str,
    *,
    now: datetime | None = None,
) -> str:
    """Verify and rotate. Returns the new plaintext token.

    Raises InvalidRefreshToken on unknown / expired / replayed input. Replay
    of an already-revoked token revokes the entire family before raising.
    """
    _, token = await rotate_with_user(session, presented, now=now)
    return token


async def rotate_with_user(
    session: AsyncSession,
    presented: str,
    *,
    now: datetime | None = None,
) -> tuple[int, str]:
    """Same as ``rotate`` but also returns the owning user_id.

    Route handlers need the user_id to issue a fresh access token alongside
    the rotated refresh token, and otherwise would have to re-query the new
    row by hash to recover it.
    """
    moment = now if now is not None else datetime.now(UTC)
    row = await _lookup(session, presented)

    if row.revoked_at is not None:
        # Reuse detection: someone presented a token we already burned on a
        # prior rotation. Either the legitimate client replayed (bug) or an
        # attacker captured the old token (theft). Either way the family is
        # no longer trustworthy.
        await _revoke_family(session, row.family_id, at=moment)
        raise InvalidRefreshToken("reuse detected")

    if _as_utc(row.expires_at) <= moment:
        raise InvalidRefreshToken("expired")

    row.revoked_at = moment
    await session.flush()
    new_token = await issue(session, row.user_id, family_id=row.family_id, now=moment)
    return row.user_id, new_token


async def revoke_family(
    session: AsyncSession,
    presented: str,
    *,
    now: datetime | None = None,
) -> None:
    """Logout: revoke every active row in the presented token's family."""
    moment = now if now is not None else datetime.now(UTC)
    row = await _lookup(session, presented)
    await _revoke_family(session, row.family_id, at=moment)
