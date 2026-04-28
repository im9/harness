# ADR 008: Backend Providers

## Status: Proposed

## Context

ADR 004 declared four provider abstractions at the topology
level and committed Phase 1 to ship mocks only, with real-vendor
adapters living outside the public tree. The original draft of
this ADR specified four providers: MarketData, EventCalendar,
News, Chat. After the trend pivot (ADR 007 revision 2026-04-25)
the engine consumes only bars, not scheduled events, so
`EventCalendarProvider` has no Phase 1 consumer. The provider
set narrows to three.

## Decision

### Three narrow protocols

Each as small as possible so the concrete adapter is reversible:

```
MarketDataProvider .subscribe / .bars / .latest_bar / .session_calendar
NewsProvider       .latest
ChatProvider       .stream
```

`NewsProvider.latest(limit, since=...)` returns the most recent
headlines from operator-configured RSS / Atom feeds. The
dashboard's WS push channel carries news updates alongside
engine state — no separate SSE channel for news in Phase 1.

### Phase 1 ships mocks only

Real-vendor adapters live outside the public tree (separate
package, private sibling repo, or gitignored folder). The public
tree must run end-to-end against mocks. This keeps vendor trade-
offs out of the tracked repository and makes Phase 1
independently verifiable by anyone cloning the public tree.

### Mock modes

| Protocol | Modes |
|---|---|
| `MarketDataProvider` | `synthesized` (random walk), `scenario` (hand-authored sequences) |
| `NewsProvider` | `rss` (poll a list of public RSS / Atom feeds via `feedparser`) |
| `ChatProvider` | `echo` (deterministic) |

The `ChatProvider.echo` mode is already consumed by ADR 006
(AI chat widget) via the frontend's `chat-client.ts`.

For RSS feeds: feed URLs that are publicly documented and free
are permissible in `config/news-feeds.example.yaml`; the
operator's actual subscribed feed list lives in the gitignored
`config/news-feeds.yaml`. Default poll cadence ~5 minutes.

### Privacy boundary for fixtures

Public market identifiers (Nikkei 225, TOPIX, USD/JPY, S&P 500,
WTI crude, etc.) are permitted in mocks, tests, fixtures, and
ADR examples — without them the UI and its tests cannot
communicate what a real session looks like. What must not appear
in tracked code is the *operator-specific* layer: which subset
they actually track, their threshold values, session specifics,
vendor selection. Those live only in the DB and `.env`.

**No test, fixture, or example may reference a real adapter by
name** (public-repo privacy, CLAUDE.md rule).

### Registry pattern

Each protocol has a registry that dispatches by the operator's
provider selection config (stored in the DB, edited via ADR 009
Settings UI). Mocks register under string keys (`synthesized`,
`scenario`, `rss`, `echo`). Real-vendor adapters — when they
exist — register themselves the same way from their out-of-tree
package.

### Dashboard aggregation endpoint

Above the three provider abstractions sits the dashboard's
HTTP + WS surface:

- `GET /api/dashboard` — REST snapshot for the initial paint;
  takes `primarySymbol` as a query parameter so the backend
  re-projects the payload for the operator's focus (ADR 005
  swap mechanics).
- `WebSocket /ws/dashboard` — push stream for trend state and
  news updates; accepts `primarySymbol` via an initial message
  so swaps don't require a reconnect.

Both endpoints stitch primary + watchlist + news + trend state
into a single payload matching the frontend's `DashboardPayload`
contract.

## Implementation

- [x] `MarketDataProvider` protocol + registry + in-memory tick / bar
      ring buffer.
- [x] `MarketDataProvider` mock: `synthesized` (random walk,
      deterministic per `(seed, symbol)`).
- [ ] `MarketDataProvider` mock: `scenario` (hand-authored
      sequences; YAML schema with deterministic per-seed
      replay for trend-engine regression tests).
- [ ] `MarketDataProvider`: extend with
      `.bars(symbol, timeframe, count)` for trend-engine input
      (current `latest_bar` returns one bar; the engine needs
      a window).
- [ ] `NewsProvider` + registry + mock (`rss` polling public
      feeds via `feedparser`; ~5 minute cadence; cached
      in-memory; emits via the dashboard WS).
- [ ] `ChatProvider` + registry + mock (`echo`). `echo` already
      fronted by the frontend mock client (`chat-client.ts`);
      the backend-side registry makes it available through the
      server when the chat endpoint lands.
- [ ] `GET /api/dashboard` + `WebSocket /ws/dashboard` (primary
      + watchlist + news + trend state in a single payload, with
      `primarySymbol` parameterization).

## Considerations

**Data-source selection is deployment-private.** The protocol
is narrow so the concrete adapter is reversible. Trade-offs
among candidate vendors (cost, account friction, API maturity)
are operator-specific and out of the public tree.

**Mock determinism matches engine determinism.** The `scenario`
mock mode is deterministic per seed so trend-engine regressions
(ADR 007 determinism invariant) reproduce offline.

**Why drop EventCalendarProvider in this revision.** The engine
narrowing in ADR 007 (setup / rule / macro → trend) removed the
only Phase 1 consumer. Keeping the protocol around as future-
proofing contradicts the "narrow protocols, reversible
adapters" principle — an unused protocol grows assumptions that
the eventual macro-overlay ADR may want to revisit. The Phase 1
implementation we shipped at f-ish (yaml mock + registry) is
removed in the same commit that lands this revision (2026-04-25).

**Why `feedparser` over hand-rolled stdlib XML.** Real-world
RSS / Atom feeds vary widely in encoding, date formats, and
namespace handling; `feedparser` (~20 years of bug fixes)
absorbs that variance into a normalized output. A hand-rolled
parser would spend the saved dependency on dozens of edge-case
patches.

## Future extensions

- **`EventCalendarProvider`** — re-introduced when macro
  overlay returns as a per-feature ADR. The yaml mock pattern
  and macro window semantics from this ADR's earlier draft are
  preserved in git history.
- **MarketData `replay` mock** — neutral CSV / Parquet of
  recorded sessions; precursor to backtest UI and tick-log
  persistence (ADR 007 Future extensions). Lands when a
  recording source exists (real adapter or sanctioned public-
  data import).
- **News impact tagging** — categorize headlines by event type
  (rate decision, central-bank speech, employment, etc.).
  Powers ADR 007's L2 trend-news coupling.
- **News sentiment scoring** — sentiment per headline, used for
  ADR 007's L3 trend bias.
- **`ChatProvider.local`** — self-hosted LLM endpoint adapter
  (operator-private endpoint URL / model selection).
- **Real-vendor adapter** (outside public tree) — concrete
  implementations of the three protocols for the operator's
  chosen data sources; live dry-run is the acceptance
  criterion. Adapter code is not tracked here.

## Related ADRs

- [ADR 004](archive/004-mvp-scope.md) — Phase 1 MVP scope.
- [ADR 007](007-backend-engine.md) — Trend engine consumes
  `MarketDataProvider`'s bar window.
- [ADR 005](archive/005-dashboard-layout.md) — Dashboard layout
  (consumes the `GET /api/dashboard` + `WebSocket /ws/dashboard`
  aggregation).
- [ADR 006](archive/006-ai-chat-widget.md) — AI chat widget
  (consumes `ChatProvider`'s `echo` mock).
- [ADR 009](009-settings-ui.md) — Settings UI (edits the DB-
  backed provider selection config this registry dispatches on).
