"""String-keyed registry for NewsProvider implementations (ADR 008).

Mirrors the MarketDataProvider registry pattern: factories register
under string keys, the operator's provider config (DB-backed via ADR
009 Settings UI) selects one at runtime. Mocks (`rss`) and real-vendor
adapters register the same way; real-vendor adapters live out-of-tree.
"""

from collections.abc import Callable
from typing import Any

from .news import NewsProvider
from .news_rss import RssNewsProvider

NewsProviderFactory = Callable[..., NewsProvider]


class NewsProviderRegistry:
    def __init__(self) -> None:
        self._factories: dict[str, NewsProviderFactory] = {}

    def register(self, key: str, factory: NewsProviderFactory) -> None:
        if key in self._factories:
            raise ValueError(f"news mode {key!r} already registered")
        self._factories[key] = factory

    def create(self, key: str, **kwargs: Any) -> NewsProvider:
        if key not in self._factories:
            raise KeyError(f"unknown news mode {key!r}")
        return self._factories[key](**kwargs)


def default_news_registry() -> NewsProviderRegistry:
    reg = NewsProviderRegistry()
    reg.register("rss", RssNewsProvider)
    return reg
