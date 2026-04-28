"""Hand-authored scenario MarketDataProvider mock (ADR 008).

Loads bars from a YAML fixture and replays them so trend-engine
regressions reproduce offline against a known input window. Unlike
synthesized's random walk, every bar is operator-specified, which
makes scenario the natural source for engine TDD: a test names a
fixture file, the engine's output for that exact input is asserted.

Privacy: fixtures may reference public market identifiers but must
not encode operator-specific watchlist composition or threshold
values (ADR 008 — privacy boundary; CLAUDE.md no-PII rule).
"""

from collections.abc import AsyncIterator
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any

import yaml

from .market_data import Bar, SessionCalendar, SessionWindow, Tick


def _to_decimal(v: Any) -> Decimal:
    # YAML floats lose precision (0.1 → 0.1000000000000000055…); fixtures
    # author prices as quoted strings and we round-trip via Decimal(str).
    return Decimal(str(v))


def _to_datetime(v: Any) -> datetime:
    if isinstance(v, datetime):
        return v
    return datetime.fromisoformat(str(v))


def _to_date(v: Any) -> date:
    if isinstance(v, date) and not isinstance(v, datetime):
        return v
    if isinstance(v, datetime):
        return v.date()
    return date.fromisoformat(str(v))


class ScenarioMarketData:
    def __init__(self, path: Path | str) -> None:
        raw = yaml.safe_load(Path(path).read_text())
        self._market: str = raw["market"]
        self._trading_day: date = _to_date(raw["trading_day"])
        sess = raw["session"]
        self._session = SessionWindow(
            open=time.fromisoformat(sess["open"]),
            close=time.fromisoformat(sess["close"]),
        )
        self._bars_by_symbol: dict[str, list[Bar]] = {}
        for symbol, spec in raw["symbols"].items():
            timeframe = spec["timeframe"]
            self._bars_by_symbol[symbol] = [
                Bar(
                    symbol=symbol,
                    timestamp=_to_datetime(b["timestamp"]),
                    timeframe=timeframe,
                    open=_to_decimal(b["open"]),
                    high=_to_decimal(b["high"]),
                    low=_to_decimal(b["low"]),
                    close=_to_decimal(b["close"]),
                    volume=int(b["volume"]),
                )
                for b in spec["bars"]
            ]
        self._latest_bar: dict[str, Bar] = {}

    async def subscribe(self, symbol: str) -> AsyncIterator[Tick]:
        if symbol not in self._bars_by_symbol:
            raise KeyError(f"symbol {symbol!r} not in scenario fixture")
        for bar in self._bars_by_symbol[symbol]:
            self._latest_bar[symbol] = bar
            yield Tick(
                symbol=symbol,
                timestamp=bar.timestamp,
                price=bar.close,
                volume=bar.volume,
            )

    async def latest_bar(self, symbol: str, timeframe: str = "1m") -> Bar | None:
        return self._latest_bar.get(symbol)

    async def bars(self, symbol: str, timeframe: str = "1m", count: int = 20) -> tuple[Bar, ...]:
        if symbol not in self._bars_by_symbol:
            raise KeyError(f"symbol {symbol!r} not in scenario fixture")
        # Authored sequences are by definition stateless: no advance,
        # no mutation, no dependency on subscribe progress. Caller asks
        # for the latest N; we return up to N from the tail.
        return tuple(self._bars_by_symbol[symbol][-count:])

    async def session_calendar(self, market: str) -> SessionCalendar:
        return SessionCalendar(
            market=self._market,
            trading_day=self._trading_day,
            windows=(self._session,),
        )
