"""Dashboard aggregation endpoint (ADR 008).

Stitches `MarketDataProvider`, `NewsProvider`, and the trend engine
into a single payload matching the frontend's `DashboardPayload`
contract (ADR 005 layout). Two surfaces share the same projection:

- `GET /api/dashboard?primarySymbol=...` — REST snapshot for the
  initial paint.
- `WebSocket /ws/dashboard` — push stream; takes `primarySymbol`
  via an initial JSON message so the operator can swap focus mid-
  session without reconnecting.

The contract carries some slots whose Phase 1 backing is a stub:
`markets`, `setup`, `macro`, `indicators`, and `rule` are surfaces
deferred under ADR 007's trend pivot or assigned to per-feature ADRs
not yet landed. The schema preserves them so the frontend types stay
load-bearing; the projection emits empty / default values until the
matching feature ADR fills them.

Auth follows the rest of the API surface (ADR 001 — cookie-borne
access JWT). The WebSocket reads the same cookie on handshake and
closes with a policy-violation code when verification fails;
without that, a logged-out tab could keep streaming the operator's
universe via a stale subscription.
"""

import asyncio
import json
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Annotated, Literal

import jwt
from fastapi import APIRouter, Depends, Query, WebSocket, status
from fastapi.websockets import WebSocketDisconnect, WebSocketState
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy.ext.asyncio import AsyncSession

from harness.auth.access_token import verify_access_token
from harness.auth.cookies import ACCESS_COOKIE
from harness.auth.dependencies import current_user
from harness.db import get_session
from harness.engine.trend import IndicatorConfig, TrendState, compute_trend
from harness.models import User
from harness.providers.market_data import MarketDataProvider
from harness.providers.market_data_synthesized import SynthesizedMarketData
from harness.providers.news import NewsProvider
from harness.providers.news_rss import RssNewsProvider

# camelCase wire format keeps the frontend zod / TS types field-aligned
# with the Pydantic shape (matches the convention in settings.py / help.py).
_FIELD_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    arbitrary_types_allowed=False,
)

TrendStateLiteral = Literal["up", "down", "range"]
ImpactTier = Literal["low", "medium", "high"]
Side = Literal["long", "short"]
IndicatorKind = Literal["ema", "sma", "vwap", "line"]


class _Wire(BaseModel):
    model_config = _FIELD_CONFIG


class Instrument(_Wire):
    symbol: str
    display_name: str
    venue: str
    tick_size: float
    tick_value: float
    quote_currency: str


class BarModel(_Wire):
    # UTC seconds since epoch — same time base lightweight-charts on the
    # frontend consumes directly via its `UTCTimestamp` shape.
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: int


class IndicatorPoint(_Wire):
    time: int
    value: float


class IndicatorLine(_Wire):
    name: str
    kind: IndicatorKind
    points: list[IndicatorPoint]


class PriceLevel(_Wire):
    price: float
    label: str


class SetupRange(_Wire):
    upper: PriceLevel
    lower: PriceLevel
    midline: PriceLevel | None = None


class SetupContext(_Wire):
    setup_name: str
    side: Side
    target: PriceLevel
    retreat: PriceLevel
    r_multiple: float
    setup_range: SetupRange | None = None


class MacroEventWindow(_Wire):
    event_name: str
    impact_tier: ImpactTier
    phase: Literal["pre", "event", "post"]
    starts_at: str
    ends_at: str


class RuleOverlayState(_Wire):
    used: float
    cap: float
    cap_reached: bool
    cooldown_active: bool
    cooldown_until: str | None = None
    quote_currency: str


class InstrumentRowState(_Wire):
    instrument: Instrument
    state: TrendStateLiteral
    setup: SetupContext | None = None
    last_price: float
    last_price_at: str
    macro: MacroEventWindow | None = None
    bars: list[BarModel]
    indicators: list[IndicatorLine]


class SparklinePoint(_Wire):
    time: int
    value: float


class WatchlistItem(_Wire):
    instrument: Instrument
    state: TrendStateLiteral
    last_price: float
    last_price_at: str
    pct_change: float
    sparkline: list[SparklinePoint]


class NewsItemModel(_Wire):
    id: str
    title: str
    impact_tier: ImpactTier
    at: str
    source: str | None = None
    body: str | None = None
    url: str | None = None


class MarketIndex(_Wire):
    ticker: str
    display_name: str
    last_price: float
    pct_change: float


class DashboardPayload(_Wire):
    rule: RuleOverlayState
    markets: list[MarketIndex]
    primary: InstrumentRowState
    watchlist: list[WatchlistItem]
    news: list[NewsItemModel] = Field(default_factory=list)


@dataclass(frozen=True)
class UniverseEntry:
    """Operator-tracked instrument descriptor.

    Phase 1 stub: a small set of public market identifiers wired into
    a default service so a fresh install paints a populated dashboard
    against the synthesized mock. Real operator universes (with their
    actual venue / tick mappings) live in the DB and are written via
    ADR 009 Settings UI when that panel lands; the universe parameter
    here will swap from a constant to a session-loaded query then.
    """

    symbol: str
    display_name: str
    venue: str
    tick_size: Decimal
    tick_value: Decimal
    quote_currency: str


# Public-identifier default universe. Per ADR 008 privacy boundary
# public market codes (NKM = Nikkei mini, TPXM = TOPIX mini, ES = S&P
# 500 e-mini, USDJPY) are permissible in mocks; what stays out is the
# operator's actual subset and any threshold values.
_DEFAULT_UNIVERSE: tuple[UniverseEntry, ...] = (
    UniverseEntry(
        symbol="NKM",
        display_name="Nikkei 225 mini",
        venue="OSE",
        tick_size=Decimal("5"),
        tick_value=Decimal("500"),
        quote_currency="JPY",
    ),
    UniverseEntry(
        symbol="USDJPY",
        display_name="USD/JPY",
        venue="OTC",
        tick_size=Decimal("0.01"),
        tick_value=Decimal("0.01"),
        quote_currency="JPY",
    ),
    UniverseEntry(
        symbol="ES",
        display_name="S&P 500 e-mini",
        venue="CME",
        tick_size=Decimal("0.25"),
        tick_value=Decimal("12.50"),
        quote_currency="USD",
    ),
)
_DEFAULT_PRIMARY = "NKM"

# Bar window exposed to the chart and to the trend engine. 120 keeps
# the chart visually populated without flooding the wire; the trend
# engine reads its own window (ADR 007 default 20) off the tail.
_DASHBOARD_BAR_COUNT = 120
_DASHBOARD_TIMEFRAME = "1m"
_SPARKLINE_POINTS = 30


def _bar_to_model(bar) -> BarModel:
    return BarModel(
        time=int(bar.timestamp.timestamp()),
        open=float(bar.open),
        high=float(bar.high),
        low=float(bar.low),
        close=float(bar.close),
        volume=int(bar.volume),
    )


def _instrument_of(entry: UniverseEntry) -> Instrument:
    return Instrument(
        symbol=entry.symbol,
        display_name=entry.display_name,
        venue=entry.venue,
        tick_size=float(entry.tick_size),
        tick_value=float(entry.tick_value),
        quote_currency=entry.quote_currency,
    )


def _default_rule_overlay(quote_currency: str) -> RuleOverlayState:
    # ADR 007 narrowed the engine to trend; rule overlay survives as a
    # standalone surface (commit ead6a47) but no rule-engine ADR has
    # landed yet. Phase 1 emits an inert state so the gauge renders
    # "untriggered" rather than missing-data — operators see the
    # surface exists, configurable once the rule ADR lands.
    return RuleOverlayState(
        used=0.0,
        cap=0.0,
        cap_reached=False,
        cooldown_active=False,
        cooldown_until=None,
        quote_currency=quote_currency,
    )


class DashboardService:
    def __init__(
        self,
        market_data: MarketDataProvider,
        news: NewsProvider,
        *,
        universe: Sequence[UniverseEntry] = _DEFAULT_UNIVERSE,
        default_primary: str = _DEFAULT_PRIMARY,
        indicator_config: IndicatorConfig | None = None,
        bar_count: int = _DASHBOARD_BAR_COUNT,
        timeframe: str = _DASHBOARD_TIMEFRAME,
        news_limit: int = 20,
    ) -> None:
        if not universe:
            raise ValueError("dashboard universe must be non-empty")
        self._market_data = market_data
        self._news = news
        self._universe = tuple(universe)
        self._by_symbol = {e.symbol: e for e in universe}
        if default_primary not in self._by_symbol:
            raise ValueError(f"default_primary {default_primary!r} not in universe")
        self._default_primary = default_primary
        self._indicator_config = indicator_config or IndicatorConfig()
        self._bar_count = bar_count
        self._timeframe = timeframe
        self._news_limit = news_limit

    async def snapshot(self, primary_symbol: str | None = None) -> DashboardPayload:
        # Unknown / missing symbol falls back to the default rather
        # than 404-ing the dashboard — a stale primarySymbol cookie or
        # a freshly-rotated universe would otherwise blank the surface
        # for one paint cycle.
        symbol = primary_symbol if primary_symbol in self._by_symbol else self._default_primary

        per_symbol = await asyncio.gather(*(self._row_for(entry) for entry in self._universe))
        rows: dict[str, _SymbolRow] = {r.entry.symbol: r for r in per_symbol}

        primary_row = rows[symbol]
        primary = self._project_primary(primary_row)
        watchlist = [
            self._project_watchlist(rows[e.symbol]) for e in self._universe if e.symbol != symbol
        ]

        news_items = await self._news.latest(limit=self._news_limit)
        news = [
            NewsItemModel(
                id=item.id,
                title=item.title,
                impact_tier=item.impact_tier,
                at=item.at.isoformat(),
                source=item.source,
                body=item.body,
                url=item.url,
            )
            for item in news_items
        ]

        return DashboardPayload(
            rule=_default_rule_overlay(primary_row.entry.quote_currency),
            markets=[],
            primary=primary,
            watchlist=watchlist,
            news=news,
        )

    async def _row_for(self, entry: UniverseEntry) -> "_SymbolRow":
        bars = await self._market_data.bars(entry.symbol, self._timeframe, self._bar_count)
        trend = compute_trend(bars, self._indicator_config)
        return _SymbolRow(entry=entry, bars=tuple(bars), trend=trend)

    def _project_primary(self, row: "_SymbolRow") -> InstrumentRowState:
        last = row.bars[-1] if row.bars else None
        return InstrumentRowState(
            instrument=_instrument_of(row.entry),
            state=row.trend.value,
            setup=None,
            last_price=float(last.close) if last is not None else 0.0,
            last_price_at=last.timestamp.isoformat() if last is not None else "",
            macro=None,
            bars=[_bar_to_model(b) for b in row.bars],
            indicators=[],
        )

    def _project_watchlist(self, row: "_SymbolRow") -> WatchlistItem:
        last = row.bars[-1] if row.bars else None
        first = row.bars[0] if row.bars else None
        # `pctChange` from session anchor: the mock has no separate
        # anchor concept, so it's first-bar-to-last over the served
        # window. Real adapters supply a per-instrument anchor (open /
        # prior settle / prior close) — until then this proxies the
        # "today's story" readout the widget exists for.
        if first is None or last is None or first.close == 0:
            pct_change = 0.0
        else:
            pct_change = float((last.close - first.close) / first.close * 100)
        sparkline_bars = row.bars[-_SPARKLINE_POINTS:]
        return WatchlistItem(
            instrument=_instrument_of(row.entry),
            state=row.trend.value,
            last_price=float(last.close) if last is not None else 0.0,
            last_price_at=last.timestamp.isoformat() if last is not None else "",
            pct_change=pct_change,
            sparkline=[
                SparklinePoint(time=int(b.timestamp.timestamp()), value=float(b.close))
                for b in sparkline_bars
            ],
        )


@dataclass(frozen=True)
class _SymbolRow:
    entry: UniverseEntry
    bars: tuple
    trend: TrendState


_default_service: DashboardService | None = None


def _build_default_service() -> DashboardService:
    # Module-level singleton so app startup wires one service and every
    # request reuses the synthesized mock's deterministic state. Real
    # provider selection (ADR 009 operator config) will replace this
    # factory; until then `synthesized` + `rss(no feeds)` is the
    # minimum end-to-end mock-only stack ADR 008 requires.
    market_data = SynthesizedMarketData(seed=42)
    news = RssNewsProvider(feeds=[])
    return DashboardService(market_data=market_data, news=news)


def get_dashboard_service() -> DashboardService:
    global _default_service
    if _default_service is None:
        _default_service = _build_default_service()
    return _default_service


def reset_dashboard_service() -> None:
    """Drop the module-level service so tests start clean."""
    global _default_service
    _default_service = None


router = APIRouter(prefix="/api")


@router.get(
    "/dashboard",
    response_model=DashboardPayload,
    response_model_by_alias=True,
)
async def get_dashboard(
    primary_symbol: Annotated[str | None, Query(alias="primarySymbol")] = None,
    _user: User = Depends(current_user),
    service: DashboardService = Depends(get_dashboard_service),
) -> DashboardPayload:
    return await service.snapshot(primary_symbol)


# WS push cadence. Trend state and bar windows shift on every new bar;
# 1s gives the chart a near-live feel while keeping payload volume
# bounded for a small universe. Real provider adapters will push on
# event (new tick / news arrival) instead of poll — the per-tick path
# replaces the interval here without changing the wire shape.
_WS_PUSH_INTERVAL_SECONDS = 1.0


def _verify_ws_user(websocket: WebSocket, session: AsyncSession) -> int | None:
    # WebSocket auth path: same access cookie as the REST surface,
    # verified before `accept()`. We can't return a 401 status on a WS
    # handshake the way HTTP routes do, so the failure mode is
    # `close(POLICY_VIOLATION)`. Returning the user_id keeps the
    # success path explicit; None signals "do not accept".
    token = websocket.cookies.get(ACCESS_COOKIE)
    if not token:
        return None
    try:
        return verify_access_token(token)
    except (jwt.PyJWTError, ValueError):
        return None


ws_router = APIRouter()


@ws_router.websocket("/ws/dashboard")
async def ws_dashboard(
    websocket: WebSocket,
    session: AsyncSession = Depends(get_session),
    service: DashboardService = Depends(get_dashboard_service),
) -> None:
    user_id = _verify_ws_user(websocket, session)
    if user_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    user = await session.get(User, user_id)
    if user is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    primary_symbol: str | None = None

    async def _push_once() -> None:
        payload = await service.snapshot(primary_symbol)
        await websocket.send_json(payload.model_dump(by_alias=True))

    try:
        # Send an initial snapshot so the client paints without waiting
        # for the first interval — matches the REST + stream pairing on
        # the frontend's data hook.
        await _push_once()

        while True:
            # Race the recv (operator swap) against the periodic push.
            # First task to complete wins; the other is cancelled and
            # re-scheduled on the next loop iteration.
            recv_task = asyncio.create_task(websocket.receive_text())
            timer_task = asyncio.create_task(asyncio.sleep(_WS_PUSH_INTERVAL_SECONDS))
            done, pending = await asyncio.wait(
                {recv_task, timer_task}, return_when=asyncio.FIRST_COMPLETED
            )
            for t in pending:
                t.cancel()
            if recv_task in done:
                try:
                    msg = recv_task.result()
                except WebSocketDisconnect:
                    return
                try:
                    parsed = json.loads(msg)
                except json.JSONDecodeError:
                    parsed = {}
                if isinstance(parsed, dict):
                    new_primary = parsed.get("primarySymbol")
                    if isinstance(new_primary, str):
                        primary_symbol = new_primary
                await _push_once()
            else:
                await _push_once()
    except WebSocketDisconnect:
        return
    finally:
        if websocket.client_state != WebSocketState.DISCONNECTED:
            try:
                await websocket.close()
            except RuntimeError:
                # Connection already torn down on the peer side; nothing
                # to clean up.
                pass
