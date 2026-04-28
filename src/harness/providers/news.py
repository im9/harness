"""NewsProvider protocol and value types (ADR 008).

The protocol is intentionally narrow — `latest(limit, since=...)`
returns the most recent headlines aggregated from operator-configured
sources. Phase 1 ships an `rss` mock that polls public feeds via
`feedparser`; real-vendor adapters live outside the public tree and
register under a different key.

`NewsItem` mirrors the frontend's `NewsItem` wire shape (ADR 005
Dashboard layout — right-column NewsFeed widget). Impact tiering and
per-headline body / URL are populated when the upstream feed carries
them; the protocol does not synthesize them.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol

ImpactTier = Literal["low", "medium", "high"]


@dataclass(frozen=True)
class NewsItem:
    id: str
    title: str
    impact_tier: ImpactTier
    at: datetime
    source: str | None = None
    body: str | None = None
    url: str | None = None


class NewsProvider(Protocol):
    async def latest(
        self, limit: int = 20, since: datetime | None = None
    ) -> tuple[NewsItem, ...]: ...
