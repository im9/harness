"""Contract tests for initial credential setup (init-auth).

Rationale and constraints: see ADR 001 §Authentication.
"""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from harness.auth.init import (
    UserAlreadyExistsError,
    UsernameMismatchError,
    init_auth,
)
from harness.auth.password import verify_password
from harness.models import User


async def test_creates_user_when_none_exists(session: AsyncSession):
    await init_auth(session, "alice", "correct horse battery staple")
    users = (await session.execute(select(User))).scalars().all()
    assert len(users) == 1
    assert users[0].username == "alice"


async def test_created_user_password_verifies(session: AsyncSession):
    # The stored hash must be one that the login path can verify — guards
    # against regressions where init stores plaintext or a non-Argon2 value.
    await init_auth(session, "alice", "s3cret-P@ssw0rd!")
    user = (await session.execute(select(User))).scalar_one()
    assert verify_password(user.password_hash, "s3cret-P@ssw0rd!") is True


async def test_created_user_totp_secret_is_base32_at_least_160_bits(session: AsyncSession):
    # RFC 4226 §5.1 recommends ≥160-bit shared secrets. One base32 character
    # encodes 5 bits, so 160 bits = 32 base32 characters (minimum).
    await init_auth(session, "alice", "pw")
    user = (await session.execute(select(User))).scalar_one()
    assert len(user.totp_secret) >= 32
    assert set(user.totp_secret) <= set("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567")


async def test_returns_otpauth_uri_containing_stored_secret_and_issuer(session: AsyncSession):
    # The returned URI is what the user registers in their authenticator app;
    # if its embedded secret doesn't match what's stored, first login fails.
    uri = await init_auth(session, "alice", "pw")
    user = (await session.execute(select(User))).scalar_one()
    assert uri.startswith("otpauth://totp/")
    assert f"secret={user.totp_secret}" in uri
    # The issuer parameter is how authenticator apps label the account;
    # omitting it would leave the user with an unnamed entry.
    assert "issuer=Harness" in uri


async def test_refuses_when_same_user_exists_and_reset_false(session: AsyncSession):
    # Default behavior must not silently clobber existing credentials.
    await init_auth(session, "alice", "pw")
    with pytest.raises(UserAlreadyExistsError):
        await init_auth(session, "alice", "new-pw")


async def test_refuses_when_different_user_exists_and_reset_false(session: AsyncSession):
    # ADR 001 mandates a single-user system; creating a second account via
    # init-auth would violate that constraint.
    await init_auth(session, "alice", "pw")
    with pytest.raises(UserAlreadyExistsError):
        await init_auth(session, "bob", "pw")


async def test_reset_updates_password_hash(session: AsyncSession):
    await init_auth(session, "alice", "old-pw")
    await init_auth(session, "alice", "new-pw", reset=True)
    user = (await session.execute(select(User))).scalar_one()
    assert verify_password(user.password_hash, "new-pw") is True
    # Old password must stop working — otherwise "reset" leaves a back door.
    assert verify_password(user.password_hash, "old-pw") is False


async def test_reset_rotates_totp_secret(session: AsyncSession):
    # Reset is the recovery path for a lost/stolen authenticator device, so
    # the TOTP secret must actually change; otherwise the old device still works.
    await init_auth(session, "alice", "pw")
    user = (await session.execute(select(User))).scalar_one()
    old_secret = user.totp_secret

    await init_auth(session, "alice", "pw", reset=True)
    assert user.totp_secret != old_secret


async def test_reset_keeps_exactly_one_user_row(session: AsyncSession):
    # Reset must update in place, not delete-and-recreate — the user row is
    # referenced by trade_journals, refresh_tokens, etc., and recreating would
    # orphan those (or violate the single-user invariant mid-operation).
    await init_auth(session, "alice", "pw")
    await init_auth(session, "alice", "new-pw", reset=True)
    users = (await session.execute(select(User))).scalars().all()
    assert len(users) == 1
    assert users[0].username == "alice"


async def test_reset_refuses_username_mismatch(session: AsyncSession):
    # init-auth rotates credentials; it does not rename accounts. Conflating
    # the two would allow an accidental typo to take over the only account.
    await init_auth(session, "alice", "pw")
    with pytest.raises(UsernameMismatchError):
        await init_auth(session, "bob", "pw", reset=True)
