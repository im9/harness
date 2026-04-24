# ADR 008: Backend Providers

## Status: Proposed

## Context

ADR 004 declared four provider abstractions at the topology level
and committed Phase 1 to ship mocks only, with real-vendor adapters
living outside the public tree. This ADR fills in the protocols,
the mock modes, the registry pattern, and the privacy boundary for
fixtures so the backend implementation can be built against a
concrete spec.

## Decision

### Four narrow protocols

All swappable, each as small as possible so the concrete adapter is
reversible:

```
MarketDataProvider    .subscribe / .latest_bar / .session_calendar
EventCalendarProvider .upcoming
NewsProvider          .stream
ChatProvider          .stream
```

`NewsProvider` is distinct from `EventCalendarProvider`: calendar
items are known-in-advance scheduled releases consumed by the macro
overlay (ADR 007); news is streamed headlines rendered in the
dashboard's sidebar widget (ADR 005). In Phase 1 news does not
affect engine state — it is context for the operator and, via the
auto-inject, for the AI chat (ADR 006).

### Phase 1 ships mocks only

Real-vendor adapters live outside the public tree (separate package,
private sibling repo, or gitignored folder). The public tree must
run end-to-end against mocks. This keeps vendor trade-offs (cost,
account friction, API maturity) out of the tracked repository and
makes Phase 1 independently verifiable by anyone cloning the public
tree.

### Mock modes

| Protocol | Modes |
|---|---|
| `MarketDataProvider` | `synthesized` (random walk), `replay` (neutral CSV / Parquet), `scenario` (hand-authored sequences) |
| `EventCalendarProvider` | `yaml` (operator override file) |
| `NewsProvider` | `seeded` (hand-authored headlines with timing + impact tags) |
| `ChatProvider` | `echo` (deterministic), `local` (self-hosted LLM) |

The ChatProvider `echo` mode is already consumed by ADR 006
(AI chat widget); `local` mode lands here when the provider registry
grows a concrete adapter.

### Privacy boundary for fixtures

Public market identifiers (Nikkei 225, TOPIX, USD/JPY, S&P 500, WTI
crude, etc.) are permitted in mocks, tests, fixtures, and ADR
examples — without them the UI and its tests cannot communicate
what a real session looks like. What must not appear in tracked code
is the *operator-specific* layer: which subset they actually track,
their threshold values, session specifics, setup choices, and
vendor selection. Those live only in the DB and `.env`.

**No test, fixture, or example may reference a real adapter by
name** (public-repo privacy, CLAUDE.md rule).

### Registry pattern

Each protocol has a registry that dispatches by the operator's
`provider selection` config (stored in the DB, edited via ADR 009
Settings UI). The registry exposes the protocol's methods;
individual mock modes are registered by string keys (`synthesized`,
`replay`, `scenario`, `yaml`, `seeded`, `echo`, `local`). Real-
vendor adapters — when they exist — register themselves the same
way from their out-of-tree package.

### Dashboard aggregation endpoint

Above the four provider abstractions sits the dashboard's HTTP + WS
surface:

- `GET /api/dashboard` — REST snapshot for the initial paint; takes
  `primarySymbol` as a query parameter so the backend re-projects
  the payload for the operator's focus (ADR 005 swap mechanics).
- `WebSocket /ws/dashboard` — push stream for engine state updates;
  accepts `primarySymbol` via an initial message so swaps don't
  require a reconnect.

Both endpoints stitch together primary + watchlist + news + engine
outputs into a single payload matching the frontend's
`DashboardPayload` contract.

## Implementation

- [ ] `MarketDataProvider` + registry + mock (`synthesized` /
      `replay` / `scenario`) + in-memory tick / bar ring buffer.
- [ ] `EventCalendarProvider` + registry + mock (`yaml`).
- [ ] `NewsProvider` + registry + mock (`seeded`) + SSE.
- [ ] `ChatProvider` + registry + mock (`echo` / `local`) + SSE.
      `echo` already fronted by the frontend mock client
      (`chat-client.ts`); this backend-side registry makes it
      available through the server when the `/ws/dashboard` /
      separate chat endpoint lands.
- [ ] `GET /api/dashboard` + `WebSocket /ws/dashboard` (primary +
      watchlist + news + engine outputs in a single payload, with
      `primarySymbol` parameterization).

## Considerations

**Data-source selection is deployment-private.** The protocol is
narrow so the concrete adapter is reversible. Trade-offs among
candidate vendors (cost, account friction, API maturity) are
operator-specific and out of the public tree.

**Mock determinism matches engine determinism.** The `scenario`
mock mode for `MarketDataProvider` in particular should be
deterministic per seed so setup-engine regressions (ADR 007
determinism invariant) are reproducible offline.

## Future extensions

- **Real-vendor adapter** (outside public tree) — concrete
  implementations of the four protocols for the operator's chosen
  data sources; live dry-run is the acceptance criterion. Adapter
  code is not tracked here.

## Related ADRs

- [ADR 004](archive/004-mvp-scope.md) — Phase 1 MVP scope (this ADR
  realizes the provider abstractions declared there).
- [ADR 007](007-backend-engine.md) — Engine layers (consumes
  `MarketDataProvider` ticks and `EventCalendarProvider` windows).
- [ADR 005](archive/005-dashboard-layout.md) — Dashboard layout
  (consumes the `GET /api/dashboard` + `WebSocket /ws/dashboard`
  aggregation).
- [ADR 006](archive/006-ai-chat-widget.md) — AI chat widget
  (consumes `ChatProvider`'s `echo` mock today; `local` mode
  unlocks real-LLM scenarios).
- [ADR 009](009-settings-ui.md) — Settings UI (edits the DB-backed
  provider selection config this registry dispatches on).
