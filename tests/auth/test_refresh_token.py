"""Contract tests for refresh-token issue / rotate / revoke.

Pattern and rationale: ADR 001 §Token strategy.
"""

import hashlib
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from harness.auth.refresh_token import (
    InvalidRefreshToken,
    issue,
    revoke_family,
    rotate,
)
from harness.models import RefreshToken, User


async def _make_user(session: AsyncSession, username: str = "alice") -> User:
    user = User(
        username=username,
        password_hash="$2b$12$placeholder",
        totp_secret="JBSWY3DPEHPK3PXP",
    )
    session.add(user)
    await session.flush()
    return user


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _utc(dt):
    # SQLite strips tz on round-trip (no native tz-aware timestamp). Reads are
    # naive; our writes are always UTC, so attaching UTC is lossless.
    return dt if dt is None or dt.tzinfo is not None else dt.replace(tzinfo=UTC)


async def _row_for(session: AsyncSession, token: str) -> RefreshToken:
    # expire so subsequent attribute access reloads from DB — needed because
    # revoke_family runs a bulk UPDATE that may not sync the identity map.
    row = (
        await session.execute(select(RefreshToken).where(RefreshToken.token_hash == _hash(token)))
    ).scalar_one()
    await session.refresh(row)
    return row


# ---------- issue ----------


async def test_issue_persists_a_row_and_starts_a_new_family(session: AsyncSession) -> None:
    user = await _make_user(session)
    token = await issue(session, user.id)

    row = await _row_for(session, token)
    # Login starts a new family — there is exactly one row and it belongs to
    # this user. The family_id is a fresh uuid, not derivable from anything.
    assert row.user_id == user.id
    assert row.family_id  # non-empty uuid string


async def test_issue_sets_expires_at_seven_days_after_now(session: AsyncSession) -> None:
    # ADR 001 §Token strategy: refresh token TTL = 7 days. Longer than the
    # 15-min access-token window so normal sessions refresh without re-login,
    # short enough that a stolen-and-unused token eventually dies on its own.
    user = await _make_user(session)
    now = datetime(2026, 4, 22, 9, 0, tzinfo=UTC)
    token = await issue(session, user.id, now=now)

    row = await _row_for(session, token)
    assert _utc(row.expires_at) - now == timedelta(days=7)


async def test_issue_stores_only_the_hash_not_the_plaintext(session: AsyncSession) -> None:
    # ADR 001 §Token strategy: "SQLite, hashed (SHA-256)". A DB dump must not
    # contain the plaintext token — otherwise hashing adds no value over
    # storing the raw token.
    user = await _make_user(session)
    token = await issue(session, user.id)

    rows = (await session.execute(select(RefreshToken))).scalars().all()
    assert len(rows) == 1
    assert rows[0].token_hash == _hash(token)
    assert rows[0].token_hash != token  # hex digest != opaque token


async def test_issue_generates_a_distinct_token_per_call(session: AsyncSession) -> None:
    # Two back-to-back issuances must return different tokens. If issue() ever
    # returned a deterministic value, two concurrent logins would collide and
    # rotation would become ambiguous. 32 bytes of entropy make accidental
    # collision cryptographically negligible.
    user = await _make_user(session)
    a = await issue(session, user.id)
    b = await issue(session, user.id)
    assert a != b


# ---------- rotate ----------


async def test_rotate_issues_a_new_token_in_the_same_family(session: AsyncSession) -> None:
    # ADR 001 §Token strategy: "family_id: new on login; preserved on
    # rotation". Family continuity is how reuse detection later links a
    # revoked token to its siblings.
    user = await _make_user(session)
    first = await issue(session, user.id)
    original_family = (await _row_for(session, first)).family_id

    second = await rotate(session, first)

    new_row = await _row_for(session, second)
    assert new_row.family_id == original_family
    assert second != first


async def test_rotate_revokes_the_presented_token(session: AsyncSession) -> None:
    # ADR 001 §Token strategy: rotation "invalidates the presented refresh
    # token". Without this, a single leaked token could be used indefinitely.
    user = await _make_user(session)
    now = datetime(2026, 4, 22, 9, 0, tzinfo=UTC)
    first = await issue(session, user.id, now=now)
    await rotate(session, first, now=now)

    presented = await _row_for(session, first)
    assert _utc(presented.revoked_at) == now


async def test_rotate_rejects_unknown_token(session: AsyncSession) -> None:
    # An attacker who guesses / fabricates a token string must be distinguished
    # from a legitimate client with a stale-but-known token. Unknown tokens
    # cannot trigger family revocation because there's no family to revoke.
    await _make_user(session)
    with pytest.raises(InvalidRefreshToken):
        await rotate(session, "not-a-real-token")


async def test_rotate_rejects_expired_token(session: AsyncSession) -> None:
    # ADR 001 §Token strategy: 7-day TTL. A token used one second past expiry
    # must be rejected — otherwise the TTL provides no bound on damage after
    # a client device is lost and later recovered by an attacker.
    user = await _make_user(session)
    issued_at = datetime(2026, 4, 22, 9, 0, tzinfo=UTC)
    token = await issue(session, user.id, now=issued_at)

    just_past_expiry = issued_at + timedelta(days=7, seconds=1)
    with pytest.raises(InvalidRefreshToken):
        await rotate(session, token, now=just_past_expiry)


async def test_rotate_reuse_detection_revokes_the_whole_family(session: AsyncSession) -> None:
    # ADR 001 §Token strategy: "if an already-revoked refresh token is
    # presented, the entire family is revoked — forces re-login on suspected
    # theft". If only the re-presented token were re-revoked, an attacker
    # holding the rotated-out token would leave the legitimate session
    # (holding the NEW token) unaffected and the theft undetected.
    user = await _make_user(session)
    now = datetime(2026, 4, 22, 9, 0, tzinfo=UTC)
    first = await issue(session, user.id, now=now)
    second = await rotate(session, first, now=now)  # legitimate rotation

    with pytest.raises(InvalidRefreshToken):
        await rotate(session, first, now=now)  # attacker replays the stolen token

    # The legitimate NEW token (second) must now also be dead.
    second_row = await _row_for(session, second)
    assert second_row.revoked_at is not None
    with pytest.raises(InvalidRefreshToken):
        await rotate(session, second, now=now)


# ---------- revoke_family (logout) ----------


async def test_revoke_family_kills_all_active_tokens_in_the_family(session: AsyncSession) -> None:
    # ADR 001 §Token strategy: "Logout: revokes the current refresh token
    # family". After logout, neither the presented token nor any rotation
    # sibling may continue the session.
    user = await _make_user(session)
    now = datetime(2026, 4, 22, 9, 0, tzinfo=UTC)
    first = await issue(session, user.id, now=now)
    second = await rotate(session, first, now=now)  # same family, now-active

    await revoke_family(session, second, now=now)

    active = (
        (await session.execute(select(RefreshToken).where(RefreshToken.revoked_at.is_(None))))
        .scalars()
        .all()
    )
    # Both tokens are rows in the same family; after logout, zero active rows
    # remain. If revoke_family missed the presented token, `second` would
    # still be usable — an actual session-continuation bug.
    assert active == []


async def test_revoke_family_does_not_touch_other_users(session: AsyncSession) -> None:
    # A logout for user A must not affect user B's active tokens. If
    # revoke_family matched on something broader than family_id (e.g. user_id
    # by mistake, or nothing at all), this would fail.
    alice = await _make_user(session, "alice")
    bob = await _make_user(session, "bob")
    alice_token = await issue(session, alice.id)
    bob_token = await issue(session, bob.id)

    await revoke_family(session, alice_token)

    bobs_row = await _row_for(session, bob_token)
    assert bobs_row.revoked_at is None


async def test_revoke_family_rejects_unknown_token(session: AsyncSession) -> None:
    # Same reasoning as rotate: an unknown token has no family to revoke, so
    # the call must fail loudly rather than silently succeed.
    await _make_user(session)
    with pytest.raises(InvalidRefreshToken):
        await revoke_family(session, "not-a-real-token")
