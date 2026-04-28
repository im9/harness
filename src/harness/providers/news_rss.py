"""RSS / Atom NewsProvider mock (ADR 008).

Polls operator-configured feed URLs through `feedparser` (~20 years
of bug fixes against the encoding / date-format / namespace variance
of real-world feeds). Results are cached in-memory; a refresh fires
only when the cache TTL has elapsed. Default cadence ~5 minutes per
ADR 008.

Network access is abstracted behind an injectable `fetcher` callable
so tests exercise the parsing + aggregation paths against in-memory
feed bytes. The default fetcher uses `urllib.request` to keep the
mock dependency-light — operators replacing this with a real-vendor
adapter would supply their own HTTP client.

Impact tiering is `low` for every entry: real-world tagging is a
Future extension (ADR 008 — News impact tagging) and the mock
deliberately does not fabricate signals the upstream feed has not
declared.
"""

import hashlib
from collections.abc import Callable, Iterable
from datetime import UTC, datetime, timedelta
from urllib.request import Request, urlopen

import feedparser

from .news import NewsItem

Fetcher = Callable[[str], bytes]

_DEFAULT_TTL = timedelta(minutes=5)
_DEFAULT_USER_AGENT = "harness-news-mock/0.1 (+https://github.com/)"


def _default_fetcher(url: str) -> bytes:
    # Real-world feed servers reject blank User-Agent or quietly
    # rate-limit it; identifying as a project keeps the mock polite.
    req = Request(url, headers={"User-Agent": _DEFAULT_USER_AGENT})
    with urlopen(req, timeout=10) as resp:  # noqa: S310 — RSS URLs are operator-configured
        return resp.read()


def _entry_id(entry: feedparser.FeedParserDict, feed_url: str) -> str:
    # Prefer the feed's own id (RSS `<guid>` / Atom `<id>`), fall back
    # to link, then a content hash. Stable id is what lets the dashboard
    # de-duplicate across polls without relying on title equality.
    for key in ("id", "link"):
        v = entry.get(key)
        if isinstance(v, str) and v:
            return v
    digest = hashlib.sha256(f"{feed_url}|{entry.get('title', '')}".encode()).hexdigest()
    return digest[:32]


def _entry_at(entry: feedparser.FeedParserDict) -> datetime | None:
    # feedparser normalizes `published` / `updated` into a `*_parsed`
    # struct_time; treat as UTC since real feeds are inconsistent about
    # tz declarations and downstream display layers re-project to the
    # operator's display timezone.
    for key in ("published_parsed", "updated_parsed"):
        ts = entry.get(key)
        if ts is None:
            continue
        return datetime(*ts[:6], tzinfo=UTC)
    return None


def _entry_to_news(
    entry: feedparser.FeedParserDict,
    feed_url: str,
    source_title: str | None,
) -> NewsItem | None:
    title = entry.get("title")
    if not isinstance(title, str) or not title.strip():
        return None
    at = _entry_at(entry)
    if at is None:
        return None
    link = entry.get("link") if isinstance(entry.get("link"), str) else None
    summary = entry.get("summary") if isinstance(entry.get("summary"), str) else None
    return NewsItem(
        id=_entry_id(entry, feed_url),
        title=title.strip(),
        impact_tier="low",
        at=at,
        source=source_title,
        body=summary,
        url=link,
    )


class RssNewsProvider:
    def __init__(
        self,
        feeds: Iterable[str],
        *,
        fetcher: Fetcher | None = None,
        ttl: timedelta = _DEFAULT_TTL,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._feeds = tuple(feeds)
        self._fetcher = fetcher or _default_fetcher
        self._ttl = ttl
        self._clock = clock or (lambda: datetime.now(UTC))
        self._cache: dict[str, tuple[datetime, tuple[NewsItem, ...]]] = {}

    async def latest(self, limit: int = 20, since: datetime | None = None) -> tuple[NewsItem, ...]:
        items: list[NewsItem] = []
        for url in self._feeds:
            items.extend(self._items_for(url))
        # De-dup by stable id; a single headline syndicated across two
        # operator-configured feeds otherwise paints the widget twice.
        unique: dict[str, NewsItem] = {}
        for item in items:
            if since is not None and item.at < since:
                continue
            unique.setdefault(item.id, item)
        ordered = sorted(unique.values(), key=lambda i: i.at, reverse=True)
        return tuple(ordered[:limit])

    def _items_for(self, url: str) -> tuple[NewsItem, ...]:
        now = self._clock()
        cached = self._cache.get(url)
        if cached is not None and now - cached[0] < self._ttl:
            return cached[1]
        try:
            raw = self._fetcher(url)
        except Exception:
            # A single feed dropping out must not poison the aggregate.
            # Fall back to whatever we last cached; first-load failure
            # surfaces as an empty contribution from this feed.
            return cached[1] if cached is not None else ()
        parsed = feedparser.parse(raw)
        source_title = None
        if isinstance(parsed.feed, dict):
            t = parsed.feed.get("title")
            if isinstance(t, str) and t.strip():
                source_title = t.strip()
        items: list[NewsItem] = []
        for entry in parsed.entries or ():
            item = _entry_to_news(entry, url, source_title)
            if item is not None:
                items.append(item)
        result = tuple(items)
        self._cache[url] = (now, result)
        return result
