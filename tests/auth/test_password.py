"""Contract tests for the Argon2id password hash wrapper.

Algorithm and rationale: see ADR 001 §Authentication.
"""

import pytest
from argon2.exceptions import InvalidHashError

from harness.auth.password import hash_password, verify_password


def test_hash_produces_argon2id_format():
    # ADR 001 §Authentication mandates Argon2id specifically (not argon2i / argon2d).
    h = hash_password("correct horse battery staple")
    assert h.startswith("$argon2id$")


def test_hash_uses_salt_so_same_password_differs_each_call():
    # Argon2id includes a random salt per hash; two calls with the same
    # password must therefore produce different encoded outputs.
    p = "correct horse battery staple"
    assert hash_password(p) != hash_password(p)


def test_verify_accepts_correct_password():
    h = hash_password("s3cret-P@ssw0rd!")
    assert verify_password(h, "s3cret-P@ssw0rd!") is True


def test_verify_rejects_wrong_password():
    h = hash_password("s3cret-P@ssw0rd!")
    assert verify_password(h, "wrong-password") is False


def test_verify_rejects_empty_string_against_nonempty_hash():
    h = hash_password("s3cret-P@ssw0rd!")
    assert verify_password(h, "") is False


def test_verify_raises_on_malformed_hash():
    # A non-Argon2 hash string indicates data corruption or a caller bug —
    # surface it as an exception rather than silently returning False,
    # so the caller doesn't confuse "wrong password" with "broken storage".
    with pytest.raises(InvalidHashError):
        verify_password("not-a-valid-hash", "any-password")


def test_hash_and_verify_handle_unicode():
    # Passwords must support non-ASCII (e.g. Japanese, emoji) since the user
    # may choose any Unicode string as a password.
    p = "パスワード🔐"
    h = hash_password(p)
    assert verify_password(h, p) is True
    assert verify_password(h, "パスワード") is False
