"""Contract tests for /api/dashboard + /ws/dashboard (ADR 008).

Two surfaces are exercised:

- `DashboardService.snapshot(...)` — the projection from providers +
  trend engine into the wire payload. Tests inject minimal in-memory
  providers so the projection is asserted independently of the
  network and the FastAPI routing layer.
- `GET /api/dashboard` + `WebSocket /ws/dashboard` — the FastAPI
  surface, including auth gating and `primarySymbol` parameterization.
"""

import json
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx
import pyotp
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import ASGITransport
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from harness.app import app
from harness.auth.init import init_auth
from harness.dashboard import (
    DashboardService,
    UniverseEntry,
    get_dashboard_service,
    reset_dashboard_service,
)
from harness.db import get_session
from harness.models import User
from harness.providers.market_data import Bar, SessionCalendar, SessionWindow
from harness.providers.news import NewsItem

_TEST_SECRET = "x" * 32
_USERNAME = "alice"
_PASSWORD = "correct-horse-battery-staple"

# Two symbols are enough to assert primary/watchlist swap mechanics
# without conflating "default symbol" with "only symbol".
_UNIVERSE = (
    UniverseEntry(
        symbol="AAA",
        display_name="Alpha",
        venue="V1",
        tick_size=Decimal("0.01"),
        tick_value=Decimal("1"),
        quote_currency="USD",
    ),
    UniverseEntry(
        symbol="BBB",
        display_name="Beta",
        venue="V1",
        tick_size=Decimal("0.01"),
        tick_value=Decimal("1"),
        quote_currency="USD",
    ),
)


def _make_bars(symbol: str, *, base: float, drift: float, count: int = 30) -> list[Bar]:
    # Generate `count` 1m bars walking by `drift` per bar so the trend
    # engine sees a predictable slope per symbol. drift > 0 → up,
    # drift < 0 → down, drift == 0 → flat (range).
    start = datetime(2026, 1, 1, tzinfo=UTC)
    bars: list[Bar] = []
    for i in range(count):
        close = base + drift * i
        bars.append(
            Bar(
                symbol=symbol,
                timestamp=start + timedelta(minutes=i),
                timeframe="1m",
                open=Decimal(str(close)),
                high=Decimal(str(close + 0.05)),
                low=Decimal(str(close - 0.05)),
                close=Decimal(str(close)),
                volume=1,
            )
        )
    return bars


class _StubMarketData:
    def __init__(self, series: dict[str, list[Bar]]) -> None:
        self._series = series

    async def subscribe(self, symbol: str):  # pragma: no cover - unused
        async def gen():
            return
            yield  # noqa: B901

        return gen()

    async def latest_bar(self, symbol: str, timeframe: str = "1m") -> Bar | None:
        s = self._series.get(symbol)
        return s[-1] if s else None

    async def bars(self, symbol: str, timeframe: str = "1m", count: int = 20) -> tuple[Bar, ...]:
        return tuple(self._series.get(symbol, [])[-count:])

    async def session_calendar(self, market: str) -> SessionCalendar:
        return SessionCalendar(
            market=market,
            trading_day=datetime(2026, 1, 1).date(),
            windows=(
                SessionWindow(
                    open=datetime(2026, 1, 1, 0, 0).time(),
                    close=datetime(2026, 1, 1, 23, 59).time(),
                ),
            ),
        )


class _StubNews:
    def __init__(self, items: list[NewsItem]) -> None:
        self._items = items

    async def latest(self, limit: int = 20, since: datetime | None = None) -> tuple[NewsItem, ...]:
        out = self._items
        if since is not None:
            out = [i for i in out if i.at >= since]
        return tuple(out[:limit])


def _make_service(
    *,
    aaa_drift: float = 0.5,
    bbb_drift: float = -0.5,
    news: list[NewsItem] | None = None,
) -> DashboardService:
    market_data = _StubMarketData(
        {
            "AAA": _make_bars("AAA", base=100.0, drift=aaa_drift),
            "BBB": _make_bars("BBB", base=200.0, drift=bbb_drift),
        }
    )
    return DashboardService(
        market_data=market_data,
        news=_StubNews(news or []),
        universe=_UNIVERSE,
        default_primary="AAA",
    )


# ---------- DashboardService unit tests ----------


async def test_snapshot_default_primary_when_symbol_missing():
    service = _make_service()
    payload = await service.snapshot(None)
    # Missing primarySymbol falls back to the configured default —
    # initial paint must always succeed.
    assert payload.primary.instrument.symbol == "AAA"


async def test_snapshot_unknown_primary_falls_back_to_default():
    service = _make_service()
    payload = await service.snapshot("UNKNOWN")
    # Stale primarySymbol cookies / freshly-rotated universes must not
    # blank the dashboard. Falling back to the default keeps the
    # surface populated for one paint cycle while the client corrects.
    assert payload.primary.instrument.symbol == "AAA"


async def test_snapshot_swap_promotes_requested_symbol():
    service = _make_service()
    payload = await service.snapshot("BBB")
    # Swap mechanics (ADR 005): requesting a non-default symbol
    # promotes it to primary; the displaced default lands in watchlist.
    assert payload.primary.instrument.symbol == "BBB"
    assert [w.instrument.symbol for w in payload.watchlist] == ["AAA"]


async def test_snapshot_primary_never_appears_in_watchlist():
    service = _make_service()
    payload = await service.snapshot("AAA")
    # ADR 005 layout invariant: the two surfaces never duplicate the
    # same instrument. A consumer rendering both would otherwise paint
    # the same row twice.
    symbols = {w.instrument.symbol for w in payload.watchlist}
    assert payload.primary.instrument.symbol not in symbols


async def test_snapshot_trend_state_per_symbol():
    # AAA drifts up at 0.5/min, BBB drifts down at -0.5/min over 30
    # bars. Linear regression on a strict monotonic walk gives
    # R² = 1.0, well above the engine's 0.5 default min_confidence
    # (ADR 007), so the slope sign maps directly to up/down.
    service = _make_service(aaa_drift=0.5, bbb_drift=-0.5)
    payload = await service.snapshot("AAA")
    assert payload.primary.state == "up"
    bbb = next(w for w in payload.watchlist if w.instrument.symbol == "BBB")
    assert bbb.state == "down"


async def test_snapshot_trend_state_range_when_flat():
    # drift = 0 → constant series → ss_tot = 0 in the engine; ADR 007
    # specifies that path emits range (no signal).
    service = _make_service(aaa_drift=0.0, bbb_drift=0.0)
    payload = await service.snapshot("AAA")
    assert payload.primary.state == "range"


async def test_snapshot_news_round_trip():
    when = datetime(2026, 1, 2, 12, 0, tzinfo=UTC)
    news = [
        NewsItem(
            id="n1",
            title="Headline",
            impact_tier="low",
            at=when,
            source="src",
            body="body",
            url="https://example.com/1",
        )
    ]
    service = _make_service(news=news)
    payload = await service.snapshot("AAA")
    # NewsItem dataclass serializes into the wire model with `at`
    # rendered as ISO 8601. The frontend zod schema reads `at` as a
    # string; this is the round-trip contract.
    assert len(payload.news) == 1
    assert payload.news[0].id == "n1"
    assert payload.news[0].at == when.isoformat()


async def test_snapshot_pct_change_uses_first_to_last_close():
    # base=100, drift=0.5, count=30 → first close = 100, last close =
    # 100 + 0.5*29 = 114.5; pctChange = (114.5 - 100) / 100 * 100 = 14.5.
    # Derived from the bar series, not observed.
    service = _make_service(aaa_drift=0.5, bbb_drift=0.5)
    payload = await service.snapshot("BBB")
    aaa = next(w for w in payload.watchlist if w.instrument.symbol == "AAA")
    assert aaa.pct_change == pytest.approx(14.5)


async def test_snapshot_rule_quote_currency_matches_primary():
    service = _make_service()
    payload = await service.snapshot("AAA")
    # Phase 1 stub: rule overlay's quote currency tracks the primary
    # so the gauge labels match the focused instrument's denomination.
    # When a rule-engine ADR lands, this slot becomes engine-driven.
    assert payload.rule.quote_currency == "USD"


def test_dashboard_service_rejects_empty_universe():
    with pytest.raises(ValueError):
        DashboardService(
            market_data=_StubMarketData({}),
            news=_StubNews([]),
            universe=(),
            default_primary="AAA",
        )


def test_dashboard_service_rejects_default_primary_outside_universe():
    with pytest.raises(ValueError):
        DashboardService(
            market_data=_StubMarketData({}),
            news=_StubNews([]),
            universe=_UNIVERSE,
            default_primary="ZZZ",
        )


# ---------- HTTP fixtures ----------


@pytest.fixture(autouse=True)
def _set_secret(monkeypatch):
    monkeypatch.setenv("HARNESS_JWT_SECRET", _TEST_SECRET)


@pytest.fixture(autouse=True)
def _reset_dashboard_service():
    # Module-level singleton must not leak between tests.
    reset_dashboard_service()
    yield
    reset_dashboard_service()


@pytest_asyncio.fixture
async def seed(engine: AsyncEngine) -> tuple[int, str]:
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        await init_auth(s, _USERNAME, _PASSWORD)
        user = (await s.execute(select(User))).scalar_one()
        return user.id, user.totp_secret


@pytest_asyncio.fixture
async def http_client(engine: AsyncEngine) -> AsyncIterator[httpx.AsyncClient]:
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def override() -> AsyncIterator[AsyncSession]:
        async with maker() as s:
            yield s

    app.dependency_overrides[get_session] = override
    app.dependency_overrides[get_dashboard_service] = _make_service
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


# ---------- REST surface ----------


async def test_get_dashboard_401_without_auth(http_client: httpx.AsyncClient):
    # Dashboard payload includes the operator's universe + trend state;
    # auth must apply uniformly (ADR 001 cookie-borne JWT).
    r = await http_client.get("/api/dashboard")
    assert r.status_code == 401


async def test_get_dashboard_returns_payload_shape(http_client: httpx.AsyncClient, seed):
    _, secret = seed
    await _login(http_client, secret)
    r = await http_client.get("/api/dashboard")
    assert r.status_code == 200
    body = r.json()
    # Top-level keys mirror the frontend's `DashboardPayload` shape
    # (ADR 005). The JSON keys are camelCase via Pydantic alias
    # generator so the TS types and zod schemas don't need a
    # translation table.
    for key in ("rule", "markets", "primary", "watchlist", "news"):
        assert key in body
    assert body["primary"]["instrument"]["symbol"] == "AAA"


async def test_get_dashboard_camelcase_keys(http_client: httpx.AsyncClient, seed):
    _, secret = seed
    await _login(http_client, secret)
    r = await http_client.get("/api/dashboard")
    body = r.json()
    # Spot-check a sampling of nested keys — `displayName`, `tickSize`,
    # `lastPrice`, `pctChange` — to confirm the alias generator runs
    # on every model, not just the top level. A snake_case leak here
    # would silently break the frontend zod schemas.
    instrument = body["primary"]["instrument"]
    assert "displayName" in instrument
    assert "tickSize" in instrument
    assert "lastPrice" in body["primary"]
    if body["watchlist"]:
        assert "pctChange" in body["watchlist"][0]


async def test_get_dashboard_primary_symbol_query_param(http_client: httpx.AsyncClient, seed):
    _, secret = seed
    await _login(http_client, secret)
    r = await http_client.get("/api/dashboard?primarySymbol=BBB")
    body = r.json()
    # Query-param-driven swap — frontend uses this on initial paint
    # before the WS connection is established (ADR 008 swap mechanics).
    assert body["primary"]["instrument"]["symbol"] == "BBB"


# ---------- WebSocket surface ----------


def _cookie_header(client: TestClient) -> dict[str, str]:
    # Starlette's TestClient does not forward its cookie jar onto
    # websocket_connect handshakes, so authenticated WS tests must pass
    # the cookies through the request headers explicitly. Centralized
    # here so every WS test uses the same construction.
    pieces = [f"{k}={v}" for k, v in client.cookies.items()]
    return {"cookie": "; ".join(pieces)} if pieces else {}


@pytest.fixture
def ws_client(
    engine: AsyncEngine, seed: tuple[int, str]
) -> Iterator[tuple[TestClient, dict[str, str]]]:
    """Authenticated TestClient + the cookie header WS calls must pass.

    Uses the synchronous TestClient because FastAPI's WebSocket test
    API only exposes a sync handle; the ASGI async transport httpx
    uses for REST does not support `websocket_connect`.
    """
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def override() -> AsyncIterator[AsyncSession]:
        async with maker() as s:
            yield s

    app.dependency_overrides[get_session] = override
    app.dependency_overrides[get_dashboard_service] = _make_service

    client = TestClient(app)
    try:
        _, totp_secret = seed
        r = client.post(
            "/api/auth/login",
            json={
                "username": _USERNAME,
                "password": _PASSWORD,
                "totp_code": pyotp.TOTP(totp_secret).now(),
            },
        )
        assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
        yield client, _cookie_header(client)
    finally:
        app.dependency_overrides.clear()


def test_ws_dashboard_rejects_unauthenticated_connection(engine: AsyncEngine):
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def override() -> AsyncIterator[AsyncSession]:
        async with maker() as s:
            yield s

    app.dependency_overrides[get_session] = override
    app.dependency_overrides[get_dashboard_service] = _make_service
    try:
        client = TestClient(app)
        # No login: cookie missing → handshake closes immediately with
        # policy-violation. Without this gate any tab could keep
        # streaming the operator's universe via a stale subscription.
        from starlette.websockets import WebSocketDisconnect

        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect("/ws/dashboard"):
                pass
        # 1008 = WebSocket policy violation, the standard code for
        # auth failure on a WS handshake.
        assert exc_info.value.code == 1008
    finally:
        app.dependency_overrides.clear()


def test_ws_dashboard_pushes_initial_snapshot(
    ws_client: tuple[TestClient, dict[str, str]],
):
    client, cookies = ws_client
    with client.websocket_connect("/ws/dashboard", headers=cookies) as ws:
        msg = ws.receive_json()
        # Initial-paint contract: an authenticated client receives a
        # snapshot immediately on accept rather than waiting on the
        # first push interval. Mirrors the REST + stream pairing on
        # the frontend's data hook.
        assert msg["primary"]["instrument"]["symbol"] == "AAA"


def test_ws_dashboard_handles_primary_symbol_message(
    ws_client: tuple[TestClient, dict[str, str]],
):
    client, cookies = ws_client
    with client.websocket_connect("/ws/dashboard", headers=cookies) as ws:
        ws.receive_json()  # drain initial snapshot
        ws.send_text(json.dumps({"primarySymbol": "BBB"}))
        msg = ws.receive_json()
        # In-stream swap (ADR 008): the operator sends a new
        # primarySymbol via JSON message, the server re-projects on
        # the next push without a reconnect.
        assert msg["primary"]["instrument"]["symbol"] == "BBB"
