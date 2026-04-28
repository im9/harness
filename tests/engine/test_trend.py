"""Tests for the trend engine (ADR 007).

The engine is pure: `(bars, indicator_config) → TrendState`. Tests
construct bar windows by hand so every threshold is spec-derived,
not implementation-fitted (CLAUDE.md "threshold justification").

Numeric expected values either fall out of definition (perfect line
→ R² = 1.0; constant series → no variance) or are derived in the
adjacent comment via the regression formulas in ADR 007.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from harness.engine import IndicatorConfig, TrendState, compute_trend
from harness.providers.market_data import Bar
from harness.providers.market_data_scenario import ScenarioMarketData

_FIXTURE = Path(__file__).parent.parent / "providers" / "fixtures" / "scenario_basic.yaml"


def _bars_with_closes(closes: list[str | int | float]) -> list[Bar]:
    """Synthesize a bar list with the given closes.

    Open / high / low are pegged to close — the engine reads only
    `.close`, so the rest are placeholders that don't affect the test.
    """
    start = datetime(2026, 1, 1, tzinfo=UTC)
    return [
        Bar(
            symbol="TEST",
            timestamp=start + timedelta(minutes=i),
            timeframe="1m",
            open=Decimal(str(c)),
            high=Decimal(str(c)),
            low=Decimal(str(c)),
            close=Decimal(str(c)),
            volume=1,
        )
        for i, c in enumerate(closes)
    ]


def test_perfectly_increasing_closes_yield_up():
    # Linear y = x + 100 → R² = 1.0 (perfect fit) ≥ 0.5 default,
    # slope > 0 → up.
    bars = _bars_with_closes([100, 101, 102, 103, 104])
    assert compute_trend(bars, IndicatorConfig()) == TrendState.UP


def test_perfectly_decreasing_closes_yield_down():
    # Linear y = -x + 104 → R² = 1.0, slope < 0 → down.
    bars = _bars_with_closes([104, 103, 102, 101, 100])
    assert compute_trend(bars, IndicatorConfig()) == TrendState.DOWN


def test_constant_closes_yield_range():
    # ss_tot = 0 (no variance) → range. ADR 007: range covers both
    # flat and low-confidence cases — operator gets a "no signal"
    # rather than a synthetic direction off a degenerate fit.
    bars = _bars_with_closes([100, 100, 100, 100, 100])
    assert compute_trend(bars, IndicatorConfig()) == TrendState.RANGE


def test_low_r_squared_with_positive_slope_yields_range_at_default_confidence():
    # Closes [100, 100, 100, 200, 100], xs = 0..4:
    #   mean_x = 2,  mean_y = 120
    #   cov_xy = (-2·-20)+(-1·-20)+0+(1·80)+(2·-20) = 40+20+0+80-40 = 100
    #   var_x  = 4+1+0+1+4 = 10
    #   slope  = 100/10 = 10
    #   intercept = 120 - 10·2 = 100
    #   y_hat  = [100, 110, 120, 130, 140]
    #   ss_res = 0+100+400+4900+1600 = 7000
    #   ss_tot = 400+400+400+6400+400 = 8000
    #   R²     = 1 - 7000/8000 = 0.125
    # 0.125 < default 0.5 → range despite slope > 0 (ADR 007 R² gate).
    bars = _bars_with_closes([100, 100, 100, 200, 100])
    assert compute_trend(bars, IndicatorConfig()) == TrendState.RANGE


def test_lowering_min_confidence_unblocks_low_r_squared_uptrend():
    # Same series — R² = 0.125 by the derivation above. Operator
    # config drops the gate to 0.1: now R² ≥ 0.1 AND slope > 0 → up.
    # This exercises the ADR 009 Settings UI hook (operator-tunable
    # min_confidence).
    bars = _bars_with_closes([100, 100, 100, 200, 100])
    assert compute_trend(bars, IndicatorConfig(min_confidence=0.1)) == TrendState.UP


def test_empty_bars_yield_range():
    # Cold start (no data yet) must not crash. Range is the neutral
    # state callers can render before the stream warms up.
    assert compute_trend([], IndicatorConfig()) == TrendState.RANGE


def test_single_bar_yields_range():
    # n = 1: one point doesn't define a line. Stay neutral until
    # the second bar arrives.
    bars = _bars_with_closes([100])
    assert compute_trend(bars, IndicatorConfig()) == TrendState.RANGE


def test_two_increasing_bars_yield_up():
    # n = 2: any two distinct points fit a perfect line, so R² = 1.0
    # by definition (no residuals). Slope > 0 → up.
    bars = _bars_with_closes([100, 101])
    assert compute_trend(bars, IndicatorConfig()) == TrendState.UP


def test_uses_last_window_bars_not_full_history():
    # Engine considers only the most recent `window` bars (ADR 007).
    # 5 bars supplied with window=3: the first two are noise; the
    # last three form a perfect line. Engine must isolate the tail
    # — otherwise the noise pulls R² below threshold and we miss
    # the recent signal.
    bars = _bars_with_closes([0, 1000, 100, 101, 102])
    assert compute_trend(bars, IndicatorConfig(window=3)) == TrendState.UP


def test_is_deterministic_for_same_input():
    # ADR 007 determinism invariant: same (bars, config) → same
    # state on every call. Pure function — required for replay-for-
    # review when bar log persistence lands.
    bars = _bars_with_closes([100, 101, 102, 103, 104])
    config = IndicatorConfig()
    assert compute_trend(bars, config) == compute_trend(bars, config)


async def test_integrates_with_scenario_provider_aapl_uptrend():
    # End-to-end smoke: scenario fixture → bars() → engine.
    # AAPL closes (100.20 → 100.60 → 101.00) step linearly by 0.40
    # — perfect line, R² = 1.0, slope > 0 → up. This is the
    # regression-test surface ADR 008's scenario mock was scoped
    # for: name a fixture, assert the engine's output for that
    # exact input.
    p = ScenarioMarketData(_FIXTURE)
    bars = await p.bars("AAPL", "1m", 3)
    assert compute_trend(bars, IndicatorConfig()) == TrendState.UP


async def test_integrates_with_scenario_provider_msft_downtrend():
    # MSFT fixture closes (200.10 → 199.90): 2 points, perfectly
    # decreasing → R² = 1.0, slope < 0 → down.
    p = ScenarioMarketData(_FIXTURE)
    bars = await p.bars("MSFT", "1m", 2)
    assert compute_trend(bars, IndicatorConfig()) == TrendState.DOWN
