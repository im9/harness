"""Contract tests for the JWT access-token wrapper.

Algorithm and rationale: see ADR 001 §Authentication.
"""

import base64
import json
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from harness.auth.access_token import issue_access_token, verify_access_token

# 32 bytes satisfies ADR 001 §Authentication minimum and matches the
# HMAC-SHA256 output size (NIST SP 800-107: HMAC key ≥ output length for
# full security).
_TEST_SECRET = "x" * 32


@pytest.fixture(autouse=True)
def _set_secret(monkeypatch):
    monkeypatch.setenv("HARNESS_JWT_SECRET", _TEST_SECRET)


def _b64url_decode(segment: str) -> bytes:
    # JWT uses base64url without padding; pad to a multiple of 4 for stdlib.
    return base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))


def _decode_header(token: str) -> dict:
    return json.loads(_b64url_decode(token.split(".")[0]))


def _decode_payload(token: str) -> dict:
    return json.loads(_b64url_decode(token.split(".")[1]))


def test_issue_returns_compact_jwt_with_three_segments():
    # RFC 7519 §3.1 / RFC 7515 §7.1: JWS Compact Serialization is exactly
    # three base64url segments joined by dots (header.payload.signature).
    t = issue_access_token(42)
    assert t.count(".") == 2


def test_issue_signs_with_hs256():
    # ADR 001 §Authentication mandates HS256. The algorithm in the header
    # is what PyJWT's algorithms-allowlist will later match against.
    t = issue_access_token(42)
    assert _decode_header(t)["alg"] == "HS256"


def test_issue_sets_only_sub_iat_exp_claims():
    # ADR 001 §Token strategy: "JWT claims: sub (user id), iat, exp. No jti".
    # Strict equality enforces the "no extra claims" part.
    t = issue_access_token(42)
    payload = _decode_payload(t)
    assert set(payload.keys()) == {"sub", "iat", "exp"}
    # RFC 7519 §4.1.2: sub is a StringOrURI — store as string even when
    # the underlying user id is an integer.
    assert payload["sub"] == "42"


def test_issue_sets_exp_to_15_minutes_after_iat():
    # ADR 001 §Token strategy: access token TTL is 15 min. Short TTL bounds
    # the blast radius of a leaked access token since access tokens are not
    # individually revocable (no jti, no server-side store).
    t = issue_access_token(42)
    payload = _decode_payload(t)
    assert payload["exp"] - payload["iat"] == 15 * 60


def test_verify_accepts_fresh_token_and_returns_user_id():
    t = issue_access_token(42)
    assert verify_access_token(t) == 42


def test_verify_rejects_expired_token():
    # Issue a token 20 min in the past: it expired 5 min ago (20 min back
    # minus 15 min TTL). Client receives a distinct ExpiredSignatureError
    # so it knows to refresh rather than re-login.
    past = datetime.now(UTC) - timedelta(minutes=20)
    t = issue_access_token(42, now=past)
    with pytest.raises(jwt.ExpiredSignatureError):
        verify_access_token(t)


def test_verify_accepts_token_issued_within_ttl():
    # Issued 5 min ago → expires 10 min from now → still valid.
    recent = datetime.now(UTC) - timedelta(minutes=5)
    t = issue_access_token(42, now=recent)
    assert verify_access_token(t) == 42


def test_verify_rejects_tampered_signature():
    # Flipping the signature must invalidate the token; otherwise HMAC
    # provides no integrity guarantee.
    t = issue_access_token(42)
    header, payload, sig = t.rsplit(".", 2)
    tampered_sig = ("B" if sig[0] == "A" else "A") + sig[1:]
    with pytest.raises(jwt.InvalidSignatureError):
        verify_access_token(f"{header}.{payload}.{tampered_sig}")


def test_verify_rejects_token_signed_with_different_secret(monkeypatch):
    # ADR 001 §Authentication: "Rotating the secret invalidates all issued
    # tokens". This relies on old tokens failing verification under the new
    # secret.
    t = issue_access_token(42)
    monkeypatch.setenv("HARNESS_JWT_SECRET", "y" * 32)
    with pytest.raises(jwt.InvalidSignatureError):
        verify_access_token(t)


def test_verify_rejects_alg_none_token():
    # Algorithm-confusion attack: attacker forges an unsigned token with
    # alg=none. PyJWT's algorithms=['HS256'] allowlist must refuse it.
    forged = jwt.encode({"sub": "42"}, key="", algorithm="none")
    with pytest.raises(jwt.InvalidAlgorithmError):
        verify_access_token(forged)


def test_verify_rejects_malformed_token():
    with pytest.raises(jwt.DecodeError):
        verify_access_token("not-a-jwt")


def test_issue_raises_when_secret_missing(monkeypatch):
    monkeypatch.delenv("HARNESS_JWT_SECRET", raising=False)
    with pytest.raises(RuntimeError):
        issue_access_token(42)


def test_issue_raises_when_secret_too_short(monkeypatch):
    # ADR 001 §Authentication requires ≥32 bytes. One byte under the
    # threshold must still be rejected so misconfig surfaces at first use
    # rather than silently shipping weak tokens.
    monkeypatch.setenv("HARNESS_JWT_SECRET", "x" * 31)
    with pytest.raises(RuntimeError):
        issue_access_token(42)


def test_verify_raises_when_secret_missing(monkeypatch):
    # Issue under a valid secret first, then verify with no secret set:
    # the verify path must also guard against a missing env var.
    t = issue_access_token(42)
    monkeypatch.delenv("HARNESS_JWT_SECRET", raising=False)
    with pytest.raises(RuntimeError):
        verify_access_token(t)
