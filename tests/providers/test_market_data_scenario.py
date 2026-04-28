"""Contract tests for the `scenario` MarketDataProvider mock (ADR 008).

The scenario mock loads hand-authored bars from a YAML fixture and
plays them back deterministically. Unlike `synthesized`'s random walk,
every bar is operator-specified so trend-engine regression tests can
assert "this exact input window → this trend state" against a fixture
named in the test.

Tests assert *properties* (replay fidelity, determinism by construction,
independence across symbols) per CLAUDE.md "threshold justification":
fixture-derived expected values count as spec values; observed values
from running the code do not.
"""

from collections.abc import AsyncIterator
from decimal import Decimal
from pathlib import Path

import pytest

from harness.providers.market_data import SessionCalendar
from harness.providers.market_data_scenario import ScenarioMarketData

_FIXTURE = Path(__file__).parent / "fixtures" / "scenario_basic.yaml"

# Number of authored bars per symbol in the fixture. Spec value, not
# observed: change the fixture and this constant changes with it.
_AAPL_BAR_COUNT = 3


async def _take[T](stream: AsyncIterator[T], n: int) -> list[T]:
    out: list[T] = []
    async for item in stream:
        out.append(item)
        if len(out) >= n:
            break
    return out


async def _drain[T](stream: AsyncIterator[T]) -> list[T]:
    out: list[T] = []
    async for item in stream:
        out.append(item)
    return out


async def test_subscribe_replays_authored_bars_as_ticks_at_close_price():
    # Fixture authors AAPL closes 100.20 / 100.60 / 101.00. Subscribe
    # must yield one tick per bar at the bar's close — that's the
    # contract that lets a fixture feed a known sequence into the
    # trend engine via the existing tick surface.
    p = ScenarioMarketData(_FIXTURE)
    ticks = await _drain(p.subscribe("AAPL"))
    assert [t.price for t in ticks] == [
        Decimal("100.20"),
        Decimal("100.60"),
        Decimal("101.00"),
    ]


async def test_subscribe_emits_one_tick_per_authored_bar():
    # Fixture has 3 bars for AAPL; tick stream must terminate at 3.
    # An infinite stream here would prevent regression tests from
    # draining a scenario to completion.
    p = ScenarioMarketData(_FIXTURE)
    ticks = await _drain(p.subscribe("AAPL"))
    assert len(ticks) == _AAPL_BAR_COUNT


async def test_subscribe_preserves_authored_timestamps():
    # Fixture authors AAPL bars at 09:00 / 09:01 / 09:02 UTC; replay
    # must preserve them so engine windowing keys off authored times
    # rather than wall-clock playback time.
    p = ScenarioMarketData(_FIXTURE)
    ticks = await _drain(p.subscribe("AAPL"))
    assert ticks[0].timestamp.hour == 9
    assert [t.timestamp.minute for t in ticks] == [0, 1, 2]


async def test_latest_bar_reflects_most_recent_emitted_bar():
    # Pull one tick, then check latest_bar — must be the *first*
    # authored bar, not the last. Matches synthesized's
    # "latest = most recently observed" semantics so the engine
    # can poll latest_bar mid-stream and see a moving window.
    p = ScenarioMarketData(_FIXTURE)
    await _take(p.subscribe("AAPL"), 1)
    bar = await p.latest_bar("AAPL")
    assert bar is not None
    assert bar.close == Decimal("100.20")  # first authored bar


async def test_latest_bar_advances_to_final_bar_after_drain():
    # After draining, latest_bar must be the final authored bar —
    # engine code polling latest_bar after a stream completes should
    # see the end of the scenario.
    p = ScenarioMarketData(_FIXTURE)
    await _drain(p.subscribe("AAPL"))
    bar = await p.latest_bar("AAPL")
    assert bar is not None
    assert bar.close == Decimal("101.00")  # last authored bar


async def test_latest_bar_returns_none_before_any_subscribe():
    p = ScenarioMarketData(_FIXTURE)
    assert await p.latest_bar("AAPL") is None


async def test_subscribe_streams_are_independent_per_symbol():
    # AAPL and MSFT have distinct authored sequences (different price
    # levels in the fixture); iterating one must not consume the other.
    p = ScenarioMarketData(_FIXTURE)
    aapl = await _drain(p.subscribe("AAPL"))
    msft = await _drain(p.subscribe("MSFT"))
    assert [t.price for t in aapl] != [t.price for t in msft]


async def test_subscribe_unknown_symbol_raises():
    # Unknown symbol = operator config bug (fixture omitted the symbol
    # the dashboard tried to track). Fail loud rather than silently
    # emitting an empty stream — same fail-loud pattern as the
    # registry's unknown-key path.
    p = ScenarioMarketData(_FIXTURE)
    with pytest.raises(KeyError):
        async for _ in p.subscribe("UNKNOWN"):
            pass


async def test_two_providers_loaded_from_same_fixture_replay_identically():
    # "Deterministic-by-construction" (ADR 008): no RNG, no seed —
    # identical fixtures must produce identical streams. This is what
    # makes scenario suitable as the trend-engine regression precursor.
    p1 = ScenarioMarketData(_FIXTURE)
    p2 = ScenarioMarketData(_FIXTURE)
    s1 = await _drain(p1.subscribe("AAPL"))
    s2 = await _drain(p2.subscribe("AAPL"))
    assert s1 == s2


async def test_bars_returns_last_n_authored_bars_in_chronological_order():
    # Scenario.bars is the trend-engine input surface (ADR 007 — pure
    # `(bars, indicator_config) → TrendState`). For a fixture with 3
    # authored bars, count=3 must return all three with timestamps
    # increasing — engine linreg fits y=a·x+b over indices, so order
    # is part of the contract.
    p = ScenarioMarketData(_FIXTURE)
    bars = await p.bars("AAPL", "1m", 3)
    assert len(bars) == _AAPL_BAR_COUNT
    assert [b.close for b in bars] == [
        Decimal("100.20"),
        Decimal("100.60"),
        Decimal("101.00"),
    ]
    assert bars[0].timestamp < bars[1].timestamp < bars[2].timestamp


async def test_bars_count_smaller_than_authored_returns_tail():
    # Engine windowing: count=2 over a 3-bar fixture must return the
    # *latest* 2, not the first 2 — "most recent N" is the contract.
    p = ScenarioMarketData(_FIXTURE)
    bars = await p.bars("AAPL", "1m", 2)
    assert len(bars) == 2
    assert [b.close for b in bars] == [Decimal("100.60"), Decimal("101.00")]


async def test_bars_count_exceeding_authored_returns_all_available():
    # Engine asks for a window larger than the fixture; provider
    # returns what it has and lets the engine decide whether to fall
    # back (e.g. min_confidence) — fewer-than-window is an engine
    # concern, not a provider error.
    p = ScenarioMarketData(_FIXTURE)
    bars = await p.bars("AAPL", "1m", 100)
    assert len(bars) == _AAPL_BAR_COUNT


async def test_bars_unknown_symbol_raises():
    # Same fail-loud pattern as subscribe — operator config bug.
    p = ScenarioMarketData(_FIXTURE)
    with pytest.raises(KeyError):
        await p.bars("UNKNOWN", "1m", 10)


async def test_bars_is_stateless_across_calls():
    # No mutation, no advance — same fixture, same arguments must
    # return identical bars every time. This is what makes scenario
    # safe as an engine regression input (call once for assertion,
    # call again for diagnostic, both see the same window).
    p = ScenarioMarketData(_FIXTURE)
    first = await p.bars("AAPL", "1m", 3)
    second = await p.bars("AAPL", "1m", 3)
    assert first == second


async def test_session_calendar_uses_fixture_market_and_window():
    # Fixture declares JPX 09:00 / 15:00. Scenario serves the authored
    # calendar rather than synthesized's 24/7 stub so engine code that
    # gates on session boundaries can be tested against realistic hours.
    p = ScenarioMarketData(_FIXTURE)
    cal = await p.session_calendar("JPX")
    assert isinstance(cal, SessionCalendar)
    assert cal.market == "JPX"
    assert len(cal.windows) == 1
    assert cal.windows[0].open.hour == 9
    assert cal.windows[0].close.hour == 15
