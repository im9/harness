"""Contract tests for /api/help (ADR 010 Phase 1 — Help UI Learning Surface).

Phase 1 scope: a `help_entries` SQLite table holding operator-curated
study material with bilingual title / body / aliases (Phase 1 Decision
Q1), exposed as `GET /api/help` (list with optional `?tag=` exact-
match against the neutral tag key and `?q=` substring across both
languages of title and aliases) and `GET /api/help/{slug}` (single by
slug). Auth is required because help content may include the
operator's personal notes (ADR 010 Q7 — single-user gate).
"""

from collections.abc import AsyncIterator

import httpx
import pyotp
import pytest
import pytest_asyncio
from httpx import ASGITransport
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from harness.app import app
from harness.auth.init import init_auth
from harness.db import get_session
from harness.help import HelpEntryDocument, save_help_entries
from harness.models import HelpEntry, User

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


def _entry(
    slug: str,
    title_en: str,
    title_ja: str,
    tags: list[str],
    body_en: str = "body_en",
    body_ja: str = "body_ja",
    aliases_en: list[str] | None = None,
    aliases_ja: list[str] | None = None,
) -> HelpEntryDocument:
    return HelpEntryDocument(
        slug=slug,
        title_en=title_en,
        title_ja=title_ja,
        tags=tags,
        body_en=body_en,
        body_ja=body_ja,
        aliases_en=aliases_en,
        aliases_ja=aliases_ja,
    )


async def _seed_entries(engine: AsyncEngine, *entries: HelpEntryDocument) -> None:
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        await save_help_entries(s, list(entries))


# ---------- list / empty ----------


async def test_list_help_returns_empty_when_db_empty(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    # First load with no rows must return [], not 404 — the page
    # renders an empty-state UI from this; a 404 would force the
    # frontend to treat "no entries yet" as an error.
    _, secret = seed
    await _login(client, secret)

    r = await client.get("/api/help")
    assert r.status_code == 200
    assert r.json() == []


async def test_list_help_returns_seeded_rows_with_camelcase_wire(
    client: httpx.AsyncClient, seed: tuple[int, str], engine: AsyncEngine
) -> None:
    # Wire format is camelCase per the project-wide convention (mirrors
    # settings.py). The frontend zod schema mirrors this case so both
    # ends stay in sync without a codegen step.
    _, secret = seed
    await _login(client, secret)
    await _seed_entries(
        engine,
        _entry(
            "vwap",
            "VWAP",
            "出来高加重平均価格",
            ["chart", "indicator"],
            body_en="Volume-weighted price.",
            body_ja="出来高加重の価格基準。",
        ),
    )

    r = await client.get("/api/help")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    entry = body[0]
    assert entry["slug"] == "vwap"
    assert entry["titleEn"] == "VWAP"
    assert entry["titleJa"] == "出来高加重平均価格"
    assert entry["bodyEn"] == "Volume-weighted price."
    assert entry["bodyJa"] == "出来高加重の価格基準。"
    assert entry["tags"] == ["chart", "indicator"]


# ---------- filters ----------


async def test_list_help_filters_by_tag_exact_match_against_neutral_key(
    client: httpx.AsyncClient, seed: tuple[int, str], engine: AsyncEngine
) -> None:
    # `?tag=chart` must NOT match an entry tagged `charting`. Tags are
    # neutral keys with i18n display labels (Phase 1 Decision Q5) —
    # exact match preserves tag identity across languages.
    _, secret = seed
    await _login(client, secret)
    await _seed_entries(
        engine,
        _entry("vwap", "VWAP", "VWAP", ["chart"]),
        _entry("trendline", "Trendline", "トレンドライン", ["charting"]),
        _entry("spread", "Spread", "スプレッド", ["securities"]),
    )

    r = await client.get("/api/help", params={"tag": "chart"})
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["slug"] == "vwap"


async def test_list_help_q_filter_matches_both_language_titles(
    client: httpx.AsyncClient, seed: tuple[int, str], engine: AsyncEngine
) -> None:
    # The server doesn't know which language the caller reads in, so
    # `?q=` matches across all four searchable fields (title_en /
    # title_ja / aliases_en / aliases_ja). The frontend filters more
    # tightly in the active language (Phase 1 Decision Q5).
    _, secret = seed
    await _login(client, secret)
    await _seed_entries(
        engine,
        _entry("vwap", "Volume Weighted", "出来高加重", ["chart"]),
        _entry("rsi", "Relative Strength", "相対力指数", ["indicator"]),
    )

    # English needle finds the EN title.
    r1 = await client.get("/api/help", params={"q": "volume"})
    assert {e["slug"] for e in r1.json()} == {"vwap"}

    # Japanese needle finds the JA title.
    r2 = await client.get("/api/help", params={"q": "相対"})
    assert {e["slug"] for e in r2.json()} == {"rsi"}


async def test_list_help_q_filter_matches_aliases_in_both_languages(
    client: httpx.AsyncClient, seed: tuple[int, str], engine: AsyncEngine
) -> None:
    # Regression guard: aliases exist precisely so the operator can
    # search by the term they remember (e.g. "VWAP" alias for the long
    # form, or "ブイダブリュー" for the JA variant). A title-only
    # implementation would silently drop alias hits in either language.
    _, secret = seed
    await _login(client, secret)
    await _seed_entries(
        engine,
        _entry(
            "vwap",
            "Volume Weighted Average Price",
            "出来高加重平均価格",
            ["chart"],
            aliases_en=["VWAP"],
            aliases_ja=["ブイダブリュー"],
        ),
    )

    r_en = await client.get("/api/help", params={"q": "vwap"})
    assert {e["slug"] for e in r_en.json()} == {"vwap"}

    r_ja = await client.get("/api/help", params={"q": "ブイダブリュー"})
    assert {e["slug"] for e in r_ja.json()} == {"vwap"}


async def test_list_help_combines_tag_and_q_filters(
    client: httpx.AsyncClient, seed: tuple[int, str], engine: AsyncEngine
) -> None:
    # Tag and q must AND together — both narrow independently.
    # Otherwise paging UX breaks (operator picks a tag, then types,
    # expects narrowing inside that tag, not a widened search).
    _, secret = seed
    await _login(client, secret)
    await _seed_entries(
        engine,
        _entry("vwap", "VWAP", "VWAP", ["chart"]),
        _entry("rsi", "Relative Strength", "相対力指数", ["chart"]),
        _entry("vwap-stocks", "VWAP for stocks", "VWAP 株式", ["securities"]),
    )

    r = await client.get("/api/help", params={"tag": "chart", "q": "vwap"})
    body = r.json()
    assert len(body) == 1
    assert body[0]["slug"] == "vwap"


# ---------- single by slug ----------


async def test_get_help_by_slug_returns_entry(
    client: httpx.AsyncClient, seed: tuple[int, str], engine: AsyncEngine
) -> None:
    _, secret = seed
    await _login(client, secret)
    await _seed_entries(
        engine,
        _entry(
            "vwap",
            "VWAP",
            "VWAP",
            ["chart"],
            body_en="EN body.",
            body_ja="JA 本文。",
        ),
    )

    r = await client.get("/api/help/vwap")
    assert r.status_code == 200
    body = r.json()
    assert body["slug"] == "vwap"
    assert body["bodyEn"] == "EN body."
    assert body["bodyJa"] == "JA 本文。"


async def test_get_help_by_unknown_slug_returns_404(
    client: httpx.AsyncClient, seed: tuple[int, str]
) -> None:
    # Unknown slug must 404 (not 200 with empty body) so the
    # `/help/:slug` route can show a clean "not found" rather than
    # render a blank entry. Direct-link flows (Phase 2 chart cross-
    # links into stale slugs) need this contract.
    _, secret = seed
    await _login(client, secret)

    r = await client.get("/api/help/nonexistent")
    assert r.status_code == 404


# ---------- auth gate ----------


async def test_list_help_401_without_auth(client: httpx.AsyncClient) -> None:
    # Help content may include operator-personal study notes (ADR 010
    # Q7). All routes must gate uniformly from day one.
    r = await client.get("/api/help")
    assert r.status_code == 401


async def test_get_help_by_slug_401_without_auth(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/help/vwap")
    assert r.status_code == 401


# ---------- DB constraint ----------


async def test_help_entry_slug_unique_constraint(session: AsyncSession) -> None:
    # Slug is the stable seed key for idempotent CLI imports. The DB-
    # level UNIQUE constraint is the enforcement floor; the import
    # path's upsert logic sits on top.
    session.add(
        HelpEntry(
            slug="vwap",
            title_en="VWAP",
            title_ja="VWAP",
            tags="[]",
            body_en="a",
            body_ja="a",
        )
    )
    await session.commit()
    session.add(
        HelpEntry(
            slug="vwap",
            title_en="VWAP again",
            title_ja="VWAP 再",
            tags="[]",
            body_en="b",
            body_ja="b",
        )
    )
    with pytest.raises(IntegrityError):
        await session.commit()
