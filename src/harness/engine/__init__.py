"""Trend engine package (ADR 007).

Phase 1 ships the trend core only — pure `(bars, indicator_config)
→ TrendState`. Setup detection, rule overlay, macro overlay, and
news-coupling layers each become per-feature ADRs and live as
sibling modules here when their data sources materialize.
"""

from .trend import IndicatorConfig, TrendState, compute_trend

__all__ = ["IndicatorConfig", "TrendState", "compute_trend"]
