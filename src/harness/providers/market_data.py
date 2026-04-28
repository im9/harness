"""MarketDataProvider protocol and value types (ADR 008).

The protocol is intentionally narrow — `subscribe` (tick stream),
`latest_bar` (most recent OHLCV), `bars` (recent OHLCV window for
trend-engine input), `session_calendar` (when the market is open) —
so concrete adapters stay reversible. Phase 1 ships mocks only;
real-vendor adapters live outside the public tree.
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
from typing import Protocol


@dataclass(frozen=True)
class Tick:
    symbol: str
    timestamp: datetime
    price: Decimal
    volume: int


@dataclass(frozen=True)
class Bar:
    symbol: str
    timestamp: datetime
    timeframe: str
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int


@dataclass(frozen=True)
class SessionWindow:
    open: time
    close: time


@dataclass(frozen=True)
class SessionCalendar:
    market: str
    trading_day: date
    windows: tuple[SessionWindow, ...]


class MarketDataProvider(Protocol):
    def subscribe(self, symbol: str) -> AsyncIterator[Tick]: ...

    async def latest_bar(self, symbol: str, timeframe: str = "1m") -> Bar | None: ...

    async def bars(
        self, symbol: str, timeframe: str = "1m", count: int = 20
    ) -> tuple[Bar, ...]: ...

    async def session_calendar(self, market: str) -> SessionCalendar: ...
