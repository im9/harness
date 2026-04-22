"""Contract tests for the auth HTTP routes.

Endpoints, cookie attributes, and rotation semantics: ADR 001 §Authentication
and §Token strategy.
"""

from collections.abc import AsyncIterator

import httpx
import pyotp
import pytest
import pytest_asyncio
from httpx import ASGITransport
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from harness.app import app
from harness.auth.init import init_auth
from harness.db import get_session
from harness.models import RefreshToken, User

# 32 bytes satisfies ADR 001 §Authentication minimum and matches the
# HMAC-SHA256 output size (NIST SP 800-107: HMAC key ≥ output length for
# full security).
_TEST_SECRET = "x" * 32
_USERNAME = "alice"
_PASSWORD = "correct-horse-battery-staple"


@pytest.fixture(autouse=True)
def _set_secret(monkeypatch):
    monkeypatch.setenv("HARNESS_JWT_SECRET", _TEST_SECRET)


@pytest_asyncio.fixture
async def seed(engine: AsyncEngine) -> tuple[int, str]:
    """Create the single user; return (user_id, totp_secret)."""
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        await init_auth(s, _USERNAME, _PASSWORD)
        user = (await s.execute(select(User))).scalar_one()
        return user.id, user.totp_secret


@pytest_asyncio.fixture
async def client(engine: AsyncEngine) -> AsyncIterator[httpx.AsyncClient]:
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def override() -> AsyncIterator[AsyncSession]:
        async with maker() as s:
            yield s

    app.dependency_overrides[get_session] = override
    try:
        # https base so cookies with the Secure attribute are accepted and
        # re-sent by the httpx jar. The ASGI transport does not negotiate TLS;
        # the scheme only tells cookielib "treat this as a secure transport".
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="https://testserver") as c:
            yield c
    finally:
        app.dependency_overrides.clear()


def _totp(secret: str) -> str:
    return pyotp.TOTP(secret).now()


def _wrong_totp(secret: str) -> str:
    # Shift by 1 so the code is guaranteed distinct from the current valid code.
    # Using a random guess risks a 1-in-1,000,000 collision with the real code
    # and a flaky test.
    return f"{(int(_totp(secret)) + 1) % 1_000_000:06d}"


def _set_cookie(resp: httpx.Response, name: str) -> str:
    headers = resp.headers.get_list("set-cookie")
    matches = [h for h in headers if h.startswith(f"{name}=")]
    assert len(matches) == 1, f"expected exactly one Set-Cookie for {name}; got {matches}"
    return matches[0]


async def _login(client: httpx.AsyncClient, secret: str) -> httpx.Response:
    return await client.post(
        "/api/auth/login",
        json={"username": _USERNAME, "password": _PASSWORD, "totp_code": _totp(secret)},
    )


async def _post_with_only_cookie(
    client: httpx.AsyncClient, path: str, name: str, value: str
) -> httpx.Response:
    # httpx 0.28+ deprecates per-request cookies= with a jar-owning client;
    # the recommended path is a fresh client. We need "post with this single
    # cookie and nothing else" to exercise attack scenarios (stolen token,
    # unknown token) without the jar's current session cookies interfering.
    transport = client._transport  # reuse the ASGI transport bound to the app
    async with httpx.AsyncClient(transport=transport, base_url="https://testserver") as c:
        c.cookies.set(name, value)
        return await c.post(path)


async def _get_with_only_cookie(
    client: httpx.AsyncClient, path: str, name: str, value: str
) -> httpx.Response:
    transport = client._transport
    async with httpx.AsyncClient(transport=transport, base_url="https://testserver") as c:
        c.cookies.set(name, value)
        return await c.get(path)


# ---------- /api/auth/login ----------


async def test_login_returns_200_and_username_on_valid_credentials(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    _, secret = seed
    r = await _login(client, secret)
    # 200 = authenticated. The body returns the username so the frontend can
    # populate AuthContext on the login response without an immediate follow-up
    # /api/me call.
    assert r.status_code == 200
    assert r.json() == {"username": _USERNAME}


async def test_login_sets_access_cookie_with_security_attributes(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    # ADR 001 §Token strategy: access token is delivered as an httpOnly +
    # Secure + SameSite=Strict cookie. The three attributes together defeat
    # (a) XSS token theft via document.cookie, (b) plaintext transport over
    # http, (c) CSRF via cross-site cookie submission.
    _, secret = seed
    r = await _login(client, secret)
    header = _set_cookie(r, "access_token")
    assert "HttpOnly" in header
    assert "Secure" in header
    assert "samesite=strict" in header.lower()


async def test_login_sets_refresh_cookie_scoped_to_auth_path(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    # ADR 001 §Token strategy: the refresh cookie is path-scoped so it is not
    # attached to non-auth endpoints. Path=/api/auth covers login/refresh/logout
    # in a single scope (per ADR 001 Implementation checklist).
    _, secret = seed
    r = await _login(client, secret)
    header = _set_cookie(r, "refresh_token")
    assert "Path=/api/auth" in header
    assert "HttpOnly" in header
    assert "Secure" in header
    assert "samesite=strict" in header.lower()


async def test_login_access_cookie_ttl_matches_access_token_ttl(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    # ADR 001 §Token strategy: access token TTL is 15 min = 900 seconds. The
    # cookie's Max-Age must match so the browser evicts it at the same time
    # the JWT expires; a longer cookie lifetime would keep dead tokens on the
    # wire, a shorter one would force refresh before the token actually expired.
    _, secret = seed
    r = await _login(client, secret)
    header = _set_cookie(r, "access_token")
    assert "Max-Age=900" in header


async def test_login_refresh_cookie_ttl_matches_refresh_token_ttl(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    # ADR 001 §Token strategy: refresh token TTL is 7 days = 604800 seconds.
    # Same reasoning as the access-cookie TTL test.
    _, secret = seed
    r = await _login(client, secret)
    header = _set_cookie(r, "refresh_token")
    assert "Max-Age=604800" in header


async def test_login_returns_401_on_wrong_password(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    _, secret = seed
    r = await client.post(
        "/api/auth/login",
        json={"username": _USERNAME, "password": "nope", "totp_code": _totp(secret)},
    )
    # 401 = authentication failed. No auth cookies may be set on failure,
    # otherwise a "bad password" response could still establish a session.
    assert r.status_code == 401
    set_cookies = r.headers.get_list("set-cookie")
    assert not any(h.startswith("access_token=") for h in set_cookies)
    assert not any(h.startswith("refresh_token=") for h in set_cookies)


async def test_login_returns_401_on_wrong_totp(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    _, secret = seed
    r = await client.post(
        "/api/auth/login",
        json={"username": _USERNAME, "password": _PASSWORD, "totp_code": _wrong_totp(secret)},
    )
    assert r.status_code == 401


async def test_login_returns_401_on_unknown_user(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    _, secret = seed
    r = await client.post(
        "/api/auth/login",
        json={"username": "nosuch", "password": _PASSWORD, "totp_code": _totp(secret)},
    )
    assert r.status_code == 401


async def test_login_error_does_not_disclose_which_factor_failed(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    # Returning distinct errors for "bad password" / "bad totp" / "unknown
    # user" hands attackers a username oracle and a stepwise credential check.
    # All three failure modes must produce byte-identical responses.
    _, secret = seed
    r_pw = await client.post(
        "/api/auth/login",
        json={"username": _USERNAME, "password": "nope", "totp_code": _totp(secret)},
    )
    r_totp = await client.post(
        "/api/auth/login",
        json={"username": _USERNAME, "password": _PASSWORD, "totp_code": _wrong_totp(secret)},
    )
    r_user = await client.post(
        "/api/auth/login",
        json={"username": "nosuch", "password": _PASSWORD, "totp_code": _totp(secret)},
    )
    assert r_pw.status_code == r_totp.status_code == r_user.status_code == 401
    assert r_pw.json() == r_totp.json() == r_user.json()


async def test_login_persists_a_refresh_token_row(
    client: httpx.AsyncClient, seed: tuple[int, str], engine: AsyncEngine
) -> None:
    # Contract: /login starts a new refresh-token family. A missing row would
    # mean /refresh can never succeed (no family to rotate from).
    _, secret = seed
    await _login(client, secret)

    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        rows = (await s.execute(select(RefreshToken))).scalars().all()
    # Exactly one active row — the freshly issued refresh token. revoked_at
    # must be None; otherwise the token is dead at birth.
    assert len(rows) == 1
    assert rows[0].revoked_at is None


# ---------- /api/me ----------


async def test_me_returns_user_after_login(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    # /api/me is the frontend's "am I logged in?" probe on app mount. It must
    # return the authenticated identity so the UI can render authed state.
    user_id, secret = seed
    await _login(client, secret)
    r = await client.get("/api/me")
    assert r.status_code == 200
    assert r.json() == {"id": user_id, "username": _USERNAME}


async def test_me_401_without_cookie(client: httpx.AsyncClient, seed: tuple[int, str]) -> None:
    # With no access cookie, /api/me must return 401. This is how the frontend
    # distinguishes "logged out" from "server error" on app mount. 403 would
    # mean "authenticated but not authorized" — a different class of failure.
    r = await client.get("/api/me")
    assert r.status_code == 401


async def test_me_401_on_tampered_access_cookie(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    r = await _get_with_only_cookie(client, "/api/me", "access_token", "not-a-jwt")
    assert r.status_code == 401


# ---------- /api/auth/refresh ----------


async def test_refresh_rotates_refresh_cookie_and_keeps_access_valid(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    _, secret = seed
    await _login(client, secret)
    old_refresh = client.cookies.get("refresh_token")

    r = await client.post("/api/auth/refresh")
    # 200 = rotation succeeded. The body carries no payload; the Set-Cookie
    # headers do the work.
    assert r.status_code == 200
    new_refresh = client.cookies.get("refresh_token")
    new_access = client.cookies.get("access_token")
    # Refresh rotation is a strict requirement of ADR 001 §Token strategy:
    # the old refresh token must be a different value (and server-side the
    # presented token is revoked and its family carries forward).
    assert new_refresh != old_refresh
    # The access cookie must still be present after refresh. The JWT value
    # may be byte-identical to the login-issued one when the refresh happens
    # within the same 1-second iat resolution — that is correct behavior
    # (the token is still within its 15 min TTL); do not assert inequality.
    assert new_access is not None


async def test_refresh_401_without_cookie(client: httpx.AsyncClient, seed: tuple[int, str]) -> None:
    r = await client.post("/api/auth/refresh")
    assert r.status_code == 401


async def test_refresh_401_with_unknown_cookie(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    r = await _post_with_only_cookie(
        client, "/api/auth/refresh", "refresh_token", "not-a-real-token"
    )
    assert r.status_code == 401


async def test_refresh_reuse_revokes_entire_family(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    # ADR 001 §Token strategy: presenting an already-rotated refresh token
    # signals either a client-side bug or theft — either way the family is
    # revoked so the attacker's captured token dies along with the legitimate
    # session, forcing a re-login.
    _, secret = seed
    await _login(client, secret)
    stolen = client.cookies.get("refresh_token")

    # Legitimate rotation — the jar now holds the new value.
    await client.post("/api/auth/refresh")
    fresh = client.cookies.get("refresh_token")
    assert fresh != stolen

    # Attacker replays the stolen (now-revoked) token: must fail AND revoke
    # the family.
    r_stolen = await _post_with_only_cookie(
        client, "/api/auth/refresh", "refresh_token", stolen
    )
    assert r_stolen.status_code == 401

    # The legitimate fresh token must now also be dead. Without family-wide
    # revocation, the legitimate client would continue uninterrupted and the
    # theft would go undetected.
    r_fresh = await _post_with_only_cookie(
        client, "/api/auth/refresh", "refresh_token", fresh
    )
    assert r_fresh.status_code == 401


# ---------- /api/auth/logout ----------


async def test_logout_clears_both_cookies(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    _, secret = seed
    await _login(client, secret)
    r = await client.post("/api/auth/logout")
    # 204 No Content: logout has no body. Both cookies must be cleared so
    # the browser evicts them; a stray access cookie would keep the user
    # "authenticated" for up to 15 min after logout.
    assert r.status_code == 204

    access_clear = _set_cookie(r, "access_token")
    refresh_clear = _set_cookie(r, "refresh_token")
    # RFC 6265: Max-Age=0 instructs the UA to evict the cookie immediately.
    # FastAPI's delete_cookie emits Max-Age=0 (also sets Expires to the past
    # as a belt-and-braces for older UAs); asserting on Max-Age=0 is the
    # portable contract.
    assert "Max-Age=0" in access_clear
    assert "Max-Age=0" in refresh_clear


async def test_logout_prevents_subsequent_refresh(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    _, secret = seed
    await _login(client, secret)
    # Capture before logout wipes the jar, so we can prove the server-side
    # revocation — not just that the browser forgot the cookie.
    refresh = client.cookies.get("refresh_token")

    await client.post("/api/auth/logout")

    r = await _post_with_only_cookie(client, "/api/auth/refresh", "refresh_token", refresh)
    # Even explicitly re-presenting the pre-logout token must fail: logout
    # revokes the whole family. Without this, a stolen cookie would outlive
    # logout for up to 7 days.
    assert r.status_code == 401


async def test_logout_is_idempotent_without_cookie(client: httpx.AsyncClient) -> None:
    # A logout request with no cookie must still succeed (204). The frontend
    # fires logout even if the session was already torn down (concurrent tab,
    # expiry) and returning an error in that case would surface a confusing
    # failure state.
    r = await client.post("/api/auth/logout")
    assert r.status_code == 204
