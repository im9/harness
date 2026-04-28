"""Contract tests for the `synthesized` MarketDataProvider mock (ADR 008).

The synthesized mock is a deterministic random walk: same seed → same
tick sequence. ADR 008 mandates this so engine regressions (ADR 007
determinism invariant) can be reproduced offline.

Tests assert *properties* (determinism, aggregation correctness) rather
than baked-in tick values, per CLAUDE.md "threshold justification" rule:
'observed value from running the code' is not a derivation.
"""

from collections.abc import AsyncIterator

from harness.providers.market_data import Bar, SessionCalendar, Tick
from harness.providers.market_data_synthesized import SynthesizedMarketData


async def _take[T](stream: AsyncIterator[T], n: int) -> list[T]:
    out: list[T] = []
    async for item in stream:
        out.append(item)
        if len(out) >= n:
            break
    return out


# Sample size for sequence-comparison tests. 16 is small enough to run
# fast and large enough that a degenerate "always-equal" implementation
# (e.g. constant price) would be obvious from the bar stats below.
_SEQ_LEN = 16


async def test_subscribe_is_deterministic_per_seed():
    p1 = SynthesizedMarketData(seed=42)
    p2 = SynthesizedMarketData(seed=42)
    seq1 = await _take(p1.subscribe("AAPL"), _SEQ_LEN)
    seq2 = await _take(p2.subscribe("AAPL"), _SEQ_LEN)
    assert seq1 == seq2


async def test_subscribe_differs_across_seeds():
    p1 = SynthesizedMarketData(seed=42)
    p2 = SynthesizedMarketData(seed=43)
    seq1 = await _take(p1.subscribe("AAPL"), _SEQ_LEN)
    seq2 = await _take(p2.subscribe("AAPL"), _SEQ_LEN)
    # With a binary up/down step and 16 independent draws, the probability
    # that two distinct seeds produce identical sequences is 2^-16 ≈ 1.5e-5
    # — small enough that a flake here means the seeds are not actually
    # being mixed into the RNG state.
    assert seq1 != seq2


async def test_subscribe_differs_across_symbols_for_same_seed():
    # Per-symbol RNG branching: same provider + same seed should still
    # yield distinct streams per symbol, otherwise a multi-watchlist
    # dashboard would show identical walks across instruments.
    p = SynthesizedMarketData(seed=42)
    seq_a = await _take(p.subscribe("AAPL"), _SEQ_LEN)
    seq_b = await _take(p.subscribe("MSFT"), _SEQ_LEN)
    assert [t.price for t in seq_a] != [t.price for t in seq_b]


async def test_tick_shape():
    p = SynthesizedMarketData(seed=42)
    ticks = await _take(p.subscribe("AAPL"), 1)
    t = ticks[0]
    assert isinstance(t, Tick)
    assert t.symbol == "AAPL"
    assert t.volume >= 1


async def test_latest_bar_aggregates_recent_ticks():
    p = SynthesizedMarketData(seed=42)
    ticks = await _take(p.subscribe("AAPL"), _SEQ_LEN)
    bar = await p.latest_bar("AAPL")
    assert isinstance(bar, Bar)
    assert bar.symbol == "AAPL"
    # OHLCV derived from the tick window — open=first, close=last,
    # high/low=extrema, volume=sum. These are the OHLCV bar definitions,
    # not observed values.
    assert bar.open == ticks[0].price
    assert bar.close == ticks[-1].price
    assert bar.high == max(t.price for t in ticks)
    assert bar.low == min(t.price for t in ticks)
    assert bar.volume == sum(t.volume for t in ticks)


async def test_latest_bar_returns_none_before_any_subscribe():
    p = SynthesizedMarketData(seed=42)
    assert await p.latest_bar("AAPL") is None


async def test_session_calendar_returns_open_window_for_synthesized_mock():
    # Synthesized mock declares 24/7 so tests don't wait on session
    # boundaries; real markets supply real hours via the out-of-tree
    # adapter (ADR 008 — privacy boundary).
    p = SynthesizedMarketData(seed=42)
    cal = await p.session_calendar("JPX")
    assert isinstance(cal, SessionCalendar)
    assert cal.market == "JPX"
    assert len(cal.windows) >= 1
