"""Contract tests for the TOTP verification wrapper.

Algorithm and rationale: see ADR 001 §Authentication.
"""

from datetime import datetime, timedelta

import pyotp

from harness.auth.totp import generate_secret, verify_totp


def test_generate_secret_is_base32():
    # pyotp and Google Authenticator both require base32 (RFC 4648) secrets.
    s = generate_secret()
    # base32 alphabet is A-Z and 2-7 (optionally '=' for padding, but pyotp
    # emits unpadded secrets).
    assert set(s) <= set("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567")


def test_generate_secret_has_at_least_160_bits_of_entropy():
    # RFC 4226 §4 recommends a shared secret of at least 128 bits, and
    # §5.1 recommends 160 bits. One base32 character encodes 5 bits, so
    # 160 bits = 32 base32 characters (minimum).
    s = generate_secret()
    assert len(s) >= 32


def test_generate_secret_differs_each_call():
    # A fresh random secret is drawn each call; a collision between two
    # independent 160-bit draws has probability 2**-160, so equality here
    # would indicate a broken RNG rather than bad luck.
    assert generate_secret() != generate_secret()


def test_verify_accepts_current_code():
    secret = generate_secret()
    now = datetime(2026, 1, 1, 12, 0, 0)
    code = pyotp.TOTP(secret).at(now)
    assert verify_totp(secret, code, for_time=now) is True


def test_verify_rejects_wrong_code():
    secret = generate_secret()
    now = datetime(2026, 1, 1, 12, 0, 0)
    # "000000" is an almost-certain miss (probability 1/10**6 of coincidentally
    # matching the real code, negligible for a single assertion).
    assert verify_totp(secret, "000000", for_time=now) is False


def test_verify_accepts_code_from_previous_step():
    # Client clock is 30 s behind server clock. RFC 6238 uses a 30 s step
    # (pyotp default), so this is exactly one step of drift. A ±1 step window
    # is standard practice to tolerate normal device clock skew.
    secret = generate_secret()
    server_now = datetime(2026, 1, 1, 12, 0, 0)
    client_earlier = server_now - timedelta(seconds=30)
    code = pyotp.TOTP(secret).at(client_earlier)
    assert verify_totp(secret, code, for_time=server_now) is True


def test_verify_accepts_code_from_next_step():
    # Client clock is 30 s ahead of server clock — symmetric to the previous
    # case, within the same ±1 step tolerance.
    secret = generate_secret()
    server_now = datetime(2026, 1, 1, 12, 0, 0)
    client_later = server_now + timedelta(seconds=30)
    code = pyotp.TOTP(secret).at(client_later)
    assert verify_totp(secret, code, for_time=server_now) is True


def test_verify_rejects_code_two_steps_in_the_past():
    # 60 s of drift exceeds the ±1 step (±30 s) tolerance. Drift that large
    # is more likely a replay or tampering than legitimate clock skew, so
    # the code must be rejected.
    secret = generate_secret()
    server_now = datetime(2026, 1, 1, 12, 0, 0)
    too_old = server_now - timedelta(seconds=60)
    code = pyotp.TOTP(secret).at(too_old)
    assert verify_totp(secret, code, for_time=server_now) is False


def test_verify_rejects_code_two_steps_in_the_future():
    # Symmetric to the previous case: 60 s ahead is also outside ±1 step.
    secret = generate_secret()
    server_now = datetime(2026, 1, 1, 12, 0, 0)
    too_new = server_now + timedelta(seconds=60)
    code = pyotp.TOTP(secret).at(too_new)
    assert verify_totp(secret, code, for_time=server_now) is False


def test_verify_rejects_empty_code():
    secret = generate_secret()
    now = datetime(2026, 1, 1, 12, 0, 0)
    assert verify_totp(secret, "", for_time=now) is False


def test_verify_rejects_non_numeric_code():
    secret = generate_secret()
    now = datetime(2026, 1, 1, 12, 0, 0)
    # TOTP codes are numeric per RFC 6238 §5.3; a non-numeric input can
    # never be a legitimate code.
    assert verify_totp(secret, "abcdef", for_time=now) is False


def test_verify_rejects_wrong_length_code():
    secret = generate_secret()
    now = datetime(2026, 1, 1, 12, 0, 0)
    # Google Authenticator / pyotp default is 6 digits (RFC 6238 §5.3 allows
    # 6–8; we use the default). Any other length is malformed.
    assert verify_totp(secret, "12345", for_time=now) is False
    assert verify_totp(secret, "1234567", for_time=now) is False
