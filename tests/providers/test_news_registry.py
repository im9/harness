"""Registry dispatch for NewsProvider mock modes (ADR 008).

Mirrors the MarketDataProvider registry contract: string-keyed factory
map, fail-loud on duplicate / unknown keys, default registry exposes
the public-tree mocks (`rss`).
"""

import pytest

from harness.providers.news_registry import (
    NewsProviderRegistry,
    default_news_registry,
)
from harness.providers.news_rss import RssNewsProvider


def test_register_and_create():
    reg = NewsProviderRegistry()
    reg.register("rss", RssNewsProvider)
    p = reg.create("rss", feeds=[], fetcher=lambda url: b"")
    assert isinstance(p, RssNewsProvider)


def test_unknown_key_raises():
    reg = NewsProviderRegistry()
    with pytest.raises(KeyError):
        reg.create("does-not-exist")


def test_duplicate_key_rejected():
    # Two adapters claiming the same key is a config bug; fail loud at
    # startup rather than silently overwriting one of them.
    reg = NewsProviderRegistry()
    reg.register("rss", RssNewsProvider)
    with pytest.raises(ValueError):
        reg.register("rss", RssNewsProvider)


def test_default_registry_includes_rss():
    # Public tree must run end-to-end against the mock registry alone
    # (ADR 008 — Phase 1 ships mocks only). `rss` is the only mock.
    reg = default_news_registry()
    p = reg.create("rss", feeds=[], fetcher=lambda url: b"")
    assert isinstance(p, RssNewsProvider)
