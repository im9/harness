"""Contract tests for the `rss` NewsProvider mock (ADR 008).

The fetcher is dependency-injected so tests run on in-memory feed
bytes — no network, no flakiness, and the parsing path through
`feedparser` is exercised end-to-end.
"""

from datetime import UTC, datetime, timedelta

from harness.providers.news_rss import RssNewsProvider

# Three RSS items dated 60s apart so ordering and `since=` filtering
# are unambiguous. UTC chosen because RSS pubDate strings vary by
# upstream feed; tests pin the wire bytes to GMT to keep parsing
# deterministic across runs.
_RSS_FEED_A = b"""<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Feed A</title>
    <item>
      <title>Headline A1</title>
      <link>https://example.com/a/1</link>
      <guid>a-1</guid>
      <description>body of A1</description>
      <pubDate>Wed, 01 Jan 2026 00:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Headline A2</title>
      <link>https://example.com/a/2</link>
      <guid>a-2</guid>
      <pubDate>Wed, 01 Jan 2026 00:01:00 GMT</pubDate>
    </item>
  </channel>
</rss>
"""

_RSS_FEED_B = b"""<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Feed B</title>
    <item>
      <title>Headline B1</title>
      <link>https://example.com/b/1</link>
      <guid>b-1</guid>
      <pubDate>Wed, 01 Jan 2026 00:02:00 GMT</pubDate>
    </item>
  </channel>
</rss>
"""


def _make_fetcher(mapping: dict[str, bytes]) -> tuple[list[str], object]:
    calls: list[str] = []

    def fetch(url: str) -> bytes:
        calls.append(url)
        return mapping[url]

    return calls, fetch


async def test_latest_returns_aggregated_items_newest_first():
    calls, fetch = _make_fetcher({"a": _RSS_FEED_A, "b": _RSS_FEED_B})
    p = RssNewsProvider(["a", "b"], fetcher=fetch)
    items = await p.latest(limit=10)
    # Newest-first ordering is the contract because the dashboard
    # NewsFeed renders top-down by recency. Three items at +0/+60/+120s
    # so the order is fully determined by the timestamps.
    assert [i.title for i in items] == ["Headline B1", "Headline A2", "Headline A1"]


async def test_latest_respects_limit():
    _, fetch = _make_fetcher({"a": _RSS_FEED_A, "b": _RSS_FEED_B})
    p = RssNewsProvider(["a", "b"], fetcher=fetch)
    items = await p.latest(limit=2)
    # `limit=2` truncates the aggregated list — caller controls the
    # widget's row budget.
    assert len(items) == 2


async def test_latest_filters_by_since():
    _, fetch = _make_fetcher({"a": _RSS_FEED_A})
    p = RssNewsProvider(["a"], fetcher=fetch)
    cutoff = datetime(2026, 1, 1, 0, 0, 30, tzinfo=UTC)
    items = await p.latest(since=cutoff)
    # cutoff falls between A1 (00:00:00) and A2 (00:01:00); only A2
    # is at-or-after the cutoff. `since=` is the polling caller's
    # tool for "give me what's new since my last tick".
    assert [i.title for i in items] == ["Headline A2"]


async def test_news_item_carries_source_body_url_and_id():
    _, fetch = _make_fetcher({"a": _RSS_FEED_A})
    p = RssNewsProvider(["a"], fetcher=fetch)
    items = await p.latest()
    a1 = next(i for i in items if i.title == "Headline A1")
    # Optional fields are populated when the upstream feed carries them
    # (ADR 008 — protocol does not synthesize). The mock derives source
    # from the feed channel title; body from <description>; url from
    # <link>; id from <guid>.
    assert a1.source == "Feed A"
    assert a1.body == "body of A1"
    assert a1.url == "https://example.com/a/1"
    assert a1.id == "a-1"


async def test_default_impact_tier_is_low():
    _, fetch = _make_fetcher({"a": _RSS_FEED_A})
    p = RssNewsProvider(["a"], fetcher=fetch)
    items = await p.latest()
    # Real impact tagging is a Future extension (ADR 008). The mock
    # does not fabricate signals the upstream feed has not declared.
    assert all(i.impact_tier == "low" for i in items)


async def test_cache_hits_within_ttl_skip_fetcher():
    calls, fetch = _make_fetcher({"a": _RSS_FEED_A})
    # 5-minute TTL is the ADR 008 default cadence. Two calls 30s apart
    # must reuse the cache; the fetcher records every URL it served.
    now = datetime(2026, 1, 1, 0, 0, 0, tzinfo=UTC)
    times = iter([now, now + timedelta(seconds=30)])
    p = RssNewsProvider(["a"], fetcher=fetch, clock=lambda: next(times))
    await p.latest()
    await p.latest()
    assert calls == ["a"]


async def test_cache_misses_after_ttl_refresh_fetcher():
    calls, fetch = _make_fetcher({"a": _RSS_FEED_A})
    # Two calls 6 minutes apart with a 5-minute TTL must refetch — that
    # is the cadence guarantee operators rely on for freshness.
    now = datetime(2026, 1, 1, 0, 0, 0, tzinfo=UTC)
    times = iter([now, now + timedelta(minutes=6)])
    p = RssNewsProvider(["a"], fetcher=fetch, ttl=timedelta(minutes=5), clock=lambda: next(times))
    await p.latest()
    await p.latest()
    assert calls == ["a", "a"]


async def test_fetcher_failure_falls_back_to_cache():
    feed_a = _RSS_FEED_A
    state = {"hit": 0}

    def fetch(url: str) -> bytes:
        state["hit"] += 1
        if state["hit"] == 1:
            return feed_a
        raise RuntimeError("network down")

    now = datetime(2026, 1, 1, 0, 0, 0, tzinfo=UTC)
    times = iter([now, now + timedelta(minutes=10)])
    p = RssNewsProvider(["a"], fetcher=fetch, ttl=timedelta(minutes=5), clock=lambda: next(times))
    first = await p.latest()
    # Second call: TTL expired, fetcher raises — we keep the previous
    # snapshot rather than emptying the widget on a transient blip.
    # Without this the dashboard would flicker to empty on every
    # network glitch upstream.
    second = await p.latest()
    assert first == second


async def test_fetcher_failure_on_first_load_returns_empty():
    def fetch(url: str) -> bytes:
        raise RuntimeError("network down")

    p = RssNewsProvider(["a"], fetcher=fetch)
    # No cache to fall back on; the empty result is the honest signal
    # that the provider produced nothing this poll. Callers see a
    # blank NewsFeed rather than fabricated headlines.
    assert await p.latest() == ()


async def test_duplicate_id_across_feeds_is_deduplicated():
    feed_dup = b"""<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Feed Dup</title>
    <item>
      <title>Headline A1</title>
      <link>https://example.com/a/1</link>
      <guid>a-1</guid>
      <pubDate>Wed, 01 Jan 2026 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
"""
    _, fetch = _make_fetcher({"a": _RSS_FEED_A, "dup": feed_dup})
    p = RssNewsProvider(["a", "dup"], fetcher=fetch)
    items = await p.latest()
    # Same `<guid>` syndicated across two operator-configured feeds
    # must paint exactly once — otherwise the widget shows phantom
    # duplicates the user has to mentally collapse.
    assert sum(1 for i in items if i.id == "a-1") == 1


async def test_entries_without_timestamp_are_skipped():
    feed = b"""<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Feed C</title>
    <item>
      <title>Undated</title>
      <link>https://example.com/c/1</link>
      <guid>c-1</guid>
    </item>
    <item>
      <title>Dated</title>
      <link>https://example.com/c/2</link>
      <guid>c-2</guid>
      <pubDate>Wed, 01 Jan 2026 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
"""
    _, fetch = _make_fetcher({"c": feed})
    p = RssNewsProvider(["c"], fetcher=fetch)
    items = await p.latest()
    # Recency-sorted display can't place an entry that has no
    # timestamp; the mock drops it rather than guessing wall-clock now.
    assert [i.title for i in items] == ["Dated"]
