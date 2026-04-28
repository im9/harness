"""String-keyed registry for MarketDataProvider implementations (ADR 008).

Concrete adapters — mocks in the public tree, real-vendor adapters
out-of-tree — register under string keys. Runtime selection comes from
the operator's provider config (DB-backed, edited via ADR 009 Settings
UI). The registry is sync; the providers it produces are async.
"""

from collections.abc import Callable
from typing import Any

from .market_data import MarketDataProvider
from .market_data_scenario import ScenarioMarketData
from .market_data_synthesized import SynthesizedMarketData

ProviderFactory = Callable[..., MarketDataProvider]


class MarketDataRegistry:
    def __init__(self) -> None:
        self._factories: dict[str, ProviderFactory] = {}

    def register(self, key: str, factory: ProviderFactory) -> None:
        if key in self._factories:
            raise ValueError(f"market-data mode {key!r} already registered")
        self._factories[key] = factory

    def create(self, key: str, **kwargs: Any) -> MarketDataProvider:
        if key not in self._factories:
            raise KeyError(f"unknown market-data mode {key!r}")
        return self._factories[key](**kwargs)


def default_market_data_registry() -> MarketDataRegistry:
    reg = MarketDataRegistry()
    reg.register("synthesized", SynthesizedMarketData)
    reg.register("scenario", ScenarioMarketData)
    return reg
