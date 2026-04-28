"""Registry dispatch for MarketDataProvider mock modes (ADR 008).

The registry is a string-keyed factory map. Mocks (`synthesized`,
`scenario`) and out-of-tree real-vendor adapters register themselves
the same way. Selection at runtime comes from the operator's provider
config (DB-backed, edited via ADR 009 Settings UI).
"""

from pathlib import Path

import pytest

from harness.providers.market_data_registry import (
    MarketDataRegistry,
    default_market_data_registry,
)
from harness.providers.market_data_scenario import ScenarioMarketData
from harness.providers.market_data_synthesized import SynthesizedMarketData

_SCENARIO_FIXTURE = Path(__file__).parent / "fixtures" / "scenario_basic.yaml"


def test_register_and_create():
    reg = MarketDataRegistry()
    reg.register("synthesized", SynthesizedMarketData)
    p = reg.create("synthesized", seed=42)
    assert isinstance(p, SynthesizedMarketData)


def test_unknown_key_raises():
    reg = MarketDataRegistry()
    with pytest.raises(KeyError):
        reg.create("does-not-exist")


def test_duplicate_key_rejected():
    # Re-registration is almost always a config bug (two adapters
    # claiming the same key) — fail loud at startup rather than silently
    # overwriting one with the other.
    reg = MarketDataRegistry()
    reg.register("synthesized", SynthesizedMarketData)
    with pytest.raises(ValueError):
        reg.register("synthesized", SynthesizedMarketData)


def test_default_registry_includes_synthesized():
    # `default_market_data_registry()` is what app startup will call;
    # synthesized must be present so a fresh install runs end-to-end
    # with no operator config (ADR 008 — public tree runs against mocks).
    reg = default_market_data_registry()
    p = reg.create("synthesized", seed=42)
    assert isinstance(p, SynthesizedMarketData)


def test_default_registry_includes_scenario():
    # `scenario` is the trend-engine regression precursor (ADR 008
    # implementation checklist) — must be selectable through the same
    # registry the operator config dispatches on.
    reg = default_market_data_registry()
    p = reg.create("scenario", path=_SCENARIO_FIXTURE)
    assert isinstance(p, ScenarioMarketData)
