"""Pure trend engine — Phase 1 indicator (ADR 007).

Fits `y = a·x + b` over the most recent `window` bar closes (`x =
bar index`, `y = close`). Returns `up` / `down` / `range` based on
slope sign and R²:

- `up`    if slope > 0 AND R² ≥ min_confidence
- `down`  if slope < 0 AND R² ≥ min_confidence
- `range` otherwise (flat market, low confidence, or insufficient data)

The engine is stateless: same (bars, config) → same TrendState. No
RNG, no wall-clock reads, no shared mutable state. Replacement is
operator config, not code — adding indicators (MACD, ADX, custom
blends) means registering a new computer here, not revising ADR 007.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from harness.providers.market_data import Bar


class TrendState(StrEnum):
    UP = "up"
    DOWN = "down"
    RANGE = "range"


@dataclass(frozen=True)
class IndicatorConfig:
    # Most-recent-N bar closes considered. ADR 007 default; operator
    # override via ADR 009 Settings UI when the panel lands.
    window: int = 20
    # R² floor below which any slope is treated as untrustworthy
    # (state collapses to range). 0.5 is the ADR 007 default —
    # half the variance explained by the fit.
    min_confidence: float = 0.5


def compute_trend(bars: Sequence[Bar], config: IndicatorConfig) -> TrendState:
    window_bars = bars[-config.window :]
    n = len(window_bars)
    # Below 2 points there is no line to fit; emit range so callers
    # (dashboard banner, chat context) see a neutral state during
    # cold start rather than a synthetic direction.
    if n < 2:
        return TrendState.RANGE

    # Promote Decimal closes to float for least-squares math. Decimal
    # is the right type for monetary precision but unwieldy for
    # statistical operators — the engine consumes prices as a sample,
    # not as ledger values.
    xs = list(range(n))
    ys = [float(b.close) for b in window_bars]
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    cov_xy = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys, strict=True))
    var_x = sum((x - mean_x) ** 2 for x in xs)
    slope = cov_xy / var_x
    intercept = mean_y - slope * mean_x

    # Coefficient of determination R² = 1 - ss_res / ss_tot. A constant
    # series has ss_tot = 0 (no variance to explain) and slope = 0;
    # short-circuit before the division to keep the path arithmetic-safe
    # and emit the spec's "no signal" range.
    ss_tot = sum((y - mean_y) ** 2 for y in ys)
    if ss_tot == 0:
        return TrendState.RANGE
    ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in zip(xs, ys, strict=True))
    r_squared = 1.0 - ss_res / ss_tot

    if r_squared < config.min_confidence:
        return TrendState.RANGE
    if slope > 0:
        return TrendState.UP
    if slope < 0:
        return TrendState.DOWN
    return TrendState.RANGE
