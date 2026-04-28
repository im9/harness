"""Synthesized random-walk MarketDataProvider mock (ADR 008).

Deterministic per (seed, symbol) so engine regressions (ADR 007
determinism invariant) reproduce offline. Cross-process stability comes
from SHA-256 — Python's built-in `hash()` on strings is randomized per
process via PYTHONHASHSEED and would defeat reproducibility.
"""

import hashlib
import random
from collections.abc import AsyncIterator
from datetime import UTC, datetime, time, timedelta
from decimal import Decimal

from ._ring_buffer import RingBuffer
from .market_data import Bar, SessionCalendar, SessionWindow, Tick

_DEFAULT_BUFFER_SIZE = 1024
_DEFAULT_START_PRICE = Decimal("100.00")
_DEFAULT_STEP = Decimal("0.05")
_DEFAULT_START = datetime(2026, 1, 1, tzinfo=UTC)
_DEFAULT_INTERVAL = timedelta(seconds=1)


def _stream_seed(base_seed: int, symbol: str) -> int:
    digest = hashlib.sha256(f"{base_seed}:{symbol}".encode()).digest()
    return int.from_bytes(digest[:8], "big")


class SynthesizedMarketData:
    def __init__(
        self,
        seed: int,
        *,
        start_price: Decimal = _DEFAULT_START_PRICE,
        step: Decimal = _DEFAULT_STEP,
        start_time: datetime = _DEFAULT_START,
        tick_interval: timedelta = _DEFAULT_INTERVAL,
        buffer_size: int = _DEFAULT_BUFFER_SIZE,
    ) -> None:
        self._seed = seed
        self._start_price = start_price
        self._step = step
        self._start_time = start_time
        self._tick_interval = tick_interval
        self._buffer_size = buffer_size
        self._tick_buffers: dict[str, RingBuffer[Tick]] = {}

    async def subscribe(self, symbol: str) -> AsyncIterator[Tick]:
        rng = random.Random(_stream_seed(self._seed, symbol))
        buf = self._tick_buffers.setdefault(symbol, RingBuffer(self._buffer_size))
        price = self._start_price
        ts = self._start_time
        while True:
            direction = 1 if rng.random() < 0.5 else -1
            price = price + self._step * direction
            tick = Tick(symbol=symbol, timestamp=ts, price=price, volume=1)
            buf.push(tick)
            yield tick
            ts = ts + self._tick_interval

    async def latest_bar(self, symbol: str, timeframe: str = "1m") -> Bar | None:
        buf = self._tick_buffers.get(symbol)
        if buf is None or len(buf) == 0:
            return None
        ticks = list(buf)
        return Bar(
            symbol=symbol,
            timestamp=ticks[0].timestamp,
            timeframe=timeframe,
            open=ticks[0].price,
            high=max(t.price for t in ticks),
            low=min(t.price for t in ticks),
            close=ticks[-1].price,
            volume=sum(t.volume for t in ticks),
        )

    async def session_calendar(self, market: str) -> SessionCalendar:
        # 24/7 window so tests don't wait on session boundaries. Real
        # markets supply real hours via the out-of-tree adapter.
        return SessionCalendar(
            market=market,
            trading_day=self._start_time.date(),
            windows=(SessionWindow(open=time(0, 0), close=time(23, 59)),),
        )
