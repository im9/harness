"""Contract tests for /api/settings (ADR 009 Phase A — Localization slice).

Phase A scope: a single-row `app_config` JSON document holding the operator's
config, exposed as `GET /api/settings` and `PUT /api/settings`. The Pydantic
schema only carries `localization.displayTimezone` for now and grows as
later panels land. Auth is required (single-user system but Settings is
operator-private config, so an unauthenticated caller must not read or
overwrite it).
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
from harness.models import User

_TEST_SECRET = "x" * 32
_USERNAME = "alice"
_PASSWORD = "correct-horse-battery-staple"


@pytest.fixture(autouse=True)
def _set_secret(monkeypatch):
    monkeypatch.setenv("HARNESS_JWT_SECRET", _TEST_SECRET)


@pytest_asyncio.fixture
async def seed(engine: AsyncEngine) -> tuple[int, str]:
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
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="https://testserver") as c:
            yield c
    finally:
        app.dependency_overrides.clear()


async def _login(client: httpx.AsyncClient, secret: str) -> None:
    r = await client.post(
        "/api/auth/login",
        json={
            "username": _USERNAME,
            "password": _PASSWORD,
            "totp_code": pyotp.TOTP(secret).now(),
        },
    )
    assert r.status_code == 200, f"login fixture failed: {r.status_code} {r.text}"


# ---------- defaults / first load ----------


async def test_get_settings_returns_defaults_when_db_empty(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    # First load (no row in app_config yet) must still return a usable
    # config document with the documented defaults. A 404 here would
    # force the frontend to handle "no settings yet" everywhere; cleaner
    # to seed defaults on read.
    # Default timezone is Asia/Tokyo per ADR 009 (matches the constant
    # currently in lib/display-timezone.ts that this slice replaces).
    # Default language is `ja` because the operator is a Japanese
    # trader (ADR 009 policy); an `en` operator overrides via the
    # Localization panel.
    _, secret = seed
    await _login(client, secret)
    r = await client.get("/api/settings")
    assert r.status_code == 200
    assert r.json() == {"localization": {"displayTimezone": "Asia/Tokyo", "language": "ja"}}


# ---------- auth gate ----------


async def test_get_settings_401_without_auth(client: httpx.AsyncClient) -> None:
    # Settings is operator-private config (ADR 004 configuration boundary).
    # An unauthenticated caller must not read it — operator timezone is
    # low-sensitivity but the panel grows to hold provider endpoints,
    # webhook URLs, and rule overlays; auth must apply uniformly from
    # day one rather than retrofitted per panel.
    r = await client.get("/api/settings")
    assert r.status_code == 401


async def test_put_settings_401_without_auth(client: httpx.AsyncClient) -> None:
    # Same reasoning as the GET — an unauthenticated PUT must not be able
    # to overwrite operator config.
    r = await client.put(
        "/api/settings",
        json={"localization": {"displayTimezone": "UTC", "language": "en"}},
    )
    assert r.status_code == 401


# ---------- persistence round-trip ----------


async def test_put_settings_persists_and_get_returns_saved_value(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    # Round-trip: a successful PUT must be visible to a subsequent GET.
    # Without this contract, the frontend's optimistic "save then
    # re-fetch" pattern breaks silently.
    _, secret = seed
    await _login(client, secret)

    body = {"localization": {"displayTimezone": "America/New_York", "language": "en"}}
    put = await client.put("/api/settings", json=body)
    assert put.status_code == 200
    assert put.json() == body

    get = await client.get("/api/settings")
    assert get.status_code == 200
    assert get.json() == body


async def test_put_settings_is_idempotent(client: httpx.AsyncClient, seed: tuple[int, str]) -> None:
    # The single-row JSON document model means PUT is full-document
    # replace; calling it twice with the same body must be a no-op
    # observable to GET. This is the ADR 009 "save on submit" semantic
    # — re-submitting unchanged values must not mutate persisted state.
    _, secret = seed
    await _login(client, secret)

    body = {"localization": {"displayTimezone": "Europe/London", "language": "ja"}}
    r1 = await client.put("/api/settings", json=body)
    r2 = await client.put("/api/settings", json=body)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json() == r2.json() == body


async def test_put_settings_rejects_unknown_language(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    # Phase A locks language to the two values harness ships
    # translations for ('ja' / 'en'). Accepting arbitrary BCP-47 tags
    # would invite the frontend to receive a code it has no message
    # dictionary for — better to reject at the schema boundary so the
    # operator sees a 422 in the panel rather than an English-only
    # render after they "selected" Spanish.
    _, secret = seed
    await _login(client, secret)

    r = await client.put(
        "/api/settings",
        json={"localization": {"displayTimezone": "Asia/Tokyo", "language": "es"}},
    )
    assert r.status_code == 422


async def test_put_settings_rejects_missing_language(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    # `language` is a required field — the schema is strict so the
    # frontend stays honest about sending the full document on PUT.
    # Backfilling on the server would mask client-side bugs that
    # send a stale shape after the schema grew.
    _, secret = seed
    await _login(client, secret)

    r = await client.put(
        "/api/settings",
        json={"localization": {"displayTimezone": "Asia/Tokyo"}},
    )
    assert r.status_code == 422


# ---------- validation ----------


async def test_put_settings_rejects_unknown_timezone(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    # Unknown IANA zones must be rejected at PUT time, not silently
    # stored — a bad zone name would crash every consumer that builds an
    # Intl.DateTimeFormat from it. Validating against zoneinfo (Python
    # stdlib's IANA tz database) covers the full canonical name space
    # without us hand-curating a list that drifts as the tz database
    # evolves.
    _, secret = seed
    await _login(client, secret)

    r = await client.put(
        "/api/settings",
        json={"localization": {"displayTimezone": "Mars/Olympus_Mons", "language": "ja"}},
    )
    # 422 is FastAPI's default for Pydantic validation failure. Asserting
    # on the status (not the body shape) keeps this test resilient to
    # FastAPI's evolving error envelope.
    assert r.status_code == 422


async def test_put_settings_rejects_missing_field(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    # The Pydantic schema is strict — every field declared today
    # must be sent. When later panels join the schema, this strictness
    # keeps the frontend honest about sending the full document on PUT.
    _, secret = seed
    await _login(client, secret)

    r = await client.put("/api/settings", json={"localization": {}})
    assert r.status_code == 422


async def test_get_settings_recovers_from_corrupt_row(
    client: httpx.AsyncClient, seed: tuple[int, str], engine: AsyncEngine
) -> None:
    # If the JSON document fails to validate against the current schema
    # (older shape, hand-edited DB, future migration mid-rollout), GET
    # must still return defaults rather than 500. The operator can then
    # re-save through the panel and the row gets fixed in place. A 500
    # here would hard-block the Settings route.
    from harness.models import AppConfig

    _, secret = seed
    await _login(client, secret)

    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        # Stale shape that no longer satisfies the schema.
        s.add(AppConfig(id=1, data='{"localization": {"displayTimezone": "Garbage/Zone"}}'))
        await s.commit()

    r = await client.get("/api/settings")
    assert r.status_code == 200
    # Falls back to defaults (Asia/Tokyo, ja) so the UI is never wedged.
    assert r.json() == {"localization": {"displayTimezone": "Asia/Tokyo", "language": "ja"}}
