# ADR 004: MVP Scope — Day-Trade Decision Dashboard

## Status: Implemented

## Context

ADR 001 settled the technology stack and verified an auth path; ADR
003 delivered the UI foundations. The product itself — what harness
*does* once logged in — was not yet defined.

harness' purpose (CLAUDE.md, ADR 001) is to **curb impulsive trading
and enforce rule-based decision-making**. Phase 1 concretizes that
into a single-asset-class **decision dashboard**: a realtime
advisory that flags when a mechanical setup triggers, when exit
conditions are met, and when to retreat. Execution stays manual in
the operator's broker client — harness never routes orders
(permanent ADR 001 constraint).

This ADR sets the Phase 1 scope at a declaration level: the routes,
the recommendation state set, the engine layering, the provider
abstractions, the persistence rule, the configuration boundary, and
the non-goals. Every detailed design decision — dashboard layout,
AI chat widget, backend engine internals, provider protocols and
mocks, Settings UI, Help UI — lives in its own focused ADR (005
through 010). That split happened post-hoc once this document grew
past the point where further sections could be added without
harming readability; the decision was to narrow this ADR back to
its scope-declaration role and let the feature ADRs carry the
detail.

## Decision

### Routes (three)

- `/login` — auth (ADR 001, Implemented).
- `/` — **Dashboard** (live engine output). Detailed design:
  [ADR 005](005-dashboard-layout.md).
- `/settings` — configuration. Detailed design:
  [ADR 009](../009-settings-ui.md).

The AI chat is a floating panel anchored to the dashboard's
bottom-right, invoked on demand and not a route of its own.
Detailed design: [ADR 006](006-ai-chat-widget.md). Notifications
are toasts + webhook push, not a screen. No other routes in Phase
1.

A subsequent ADR (010) adds a **Help UI** surface for operator
self-study of chart / securities / analysis terminology. It was
proposed after this ADR closed and is not part of the original
Phase 1 scope declaration; see [ADR 010](../010-help-ui.md).

### Recommendation (4 states)

Per tracked instrument, the engine emits:

| State | Meaning | Operator action |
|-------|---------|-----------------|
| `ENTER` | Setup triggered, all conditions satisfied | Evaluate and place manually |
| `HOLD` | In or near a setup, confirmation pending | Wait |
| `EXIT` | Target / take-profit met | Close for profit |
| `RETREAT` | Invalidation or stop hit | Close at a loss now |

These drive the dashboard UI (ADR 005), push notifications, and the
AI chat context (ADR 006).

### Engine layers

Three layers, applied in sequence, each feeding the recommendation
state above:

1. **Setup engine** — mechanical state machines per (instrument ×
   setup), tick-driven, pure `(state, tick) → (state, emission)`.
2. **Rule overlay** — daily loss cap, post-loss cooldown, explicit
   override. Advisory only (harness never blocks the broker).
3. **Macro overlay** — pre / event / post windows from a calendar
   provider, plus one-click manual toggle for unscheduled
   headlines.

Detailed design + implementation spec:
[ADR 007](../007-backend-engine.md).

### Provider abstractions (mock-first)

Four narrow protocols, all swappable via a registry:

- `MarketDataProvider` — `.subscribe` / `.latest_bar` /
  `.session_calendar`
- `EventCalendarProvider` — `.upcoming`
- `NewsProvider` — `.stream`
- `ChatProvider` — `.stream`

**Phase 1 ships mocks only.** Real-vendor adapters live outside the
public tree (separate package, private sibling repo, or gitignored
folder). The public tree must run end-to-end against mocks.

Detailed design (protocol shapes, mock modes, registry pattern,
privacy rule for fixtures, `GET /api/dashboard` + `WebSocket
/ws/dashboard` aggregation): [ADR 008](../008-backend-providers.md).

### Persistence (what survives a restart)

- **Persisted**: configuration only, in SQLite (instruments,
  sessions, rule parameters, setup params, provider selection,
  notifications, localization).
- **Not persisted**: ticks, bars, recommendations, rule-state
  transitions, AI chat, news headlines, P&L. All in-memory, reset
  at restart.

Journaling is deferred. Without persistence of recommendation /
rule logs, harness has no history surface in Phase 1 — no review
screen, no session archive. Revisit when Phase 2 analytics needs
(hit rate, R distribution, rule effectiveness) justify the schema
work.

### Configuration boundary

- No operator-specific literals in source code.
- Operator values live in the DB (edited via `/settings`, ADR
  009); secrets in `.env` (the Settings UI references secrets by
  env-var name, never exposes the value itself).
- Required fields default to a structurally safe empty (engine
  emits nothing) rather than a guess.
- Optional CLI YAML import / export for bootstrap and backup
  (gitignored). Covered in ADR 009.
- **Privacy boundary for fixtures and documentation.** Public
  market identifiers (Nikkei 225, TOPIX, USD/JPY, S&P 500, WTI
  crude, etc.) are permitted in mocks, tests, fixtures, and ADR
  examples — without them the UI and its tests cannot communicate
  what a real session looks like. What must not appear in tracked
  code is the *operator-specific* layer: which subset they
  actually track, their threshold values, session specifics, setup
  choices, and vendor selection. Those live only in the DB and
  `.env`.

## What Phase 1 does NOT include

- Trade journaling / executed-trade logging (deferred).
- Automated order placement (permanent, ADR 001).
- Backtest UI (logic is backtestable offline; no UI module in
  Phase 1).
- Multi-asset-class portfolio view.
- **Simultaneous** multi-primary (two or more full charts visible
  side-by-side). Phase 1 ships single-active-with-swap; a genuine
  multi-chart grid is a different UX concern and lives in Future
  extensions of ADR 005.
- Instrument management UI (add / edit / remove tracked
  instruments, assign setup-library entries per instrument) —
  covered by a separate future ADR.
- History / review / archive screens (no persistence → no
  surface).

## Considerations

**Compliance framing.** harness is a private, single-user tool
served over an authenticated tunnel (ADR 001). It is not marketed,
not offered to third parties. Output phrasing favors descriptive
("setup triggered, conditions are X, Y, Z") over prescriptive ("you
should buy") as cheap insurance on top of the private-access model.
This framing is inherited by every Phase 1 surface — dashboard
copy, AI chat replies, Help UI entries — and is the default unless
a child ADR explicitly revisits it.

**Integration coverage is deferred.** End-to-end test scaffolding
that exercises the full tick → engine → recommendation → UI →
chat context pipeline against mocks was contemplated here and
kicked down the road. It's a cross-cutting concern that fits none
of ADRs 005–010 cleanly; revisit when mock + real-vendor parity
testing becomes a real need (likely around the real-vendor cutover
tracked in ADR 008).

## Future extensions

Phase-level extensions (feature-scoped Future work lives in the
relevant child ADR):

- **Journaling** (Phase 2) — executed-trade logging,
  recommendation-vs-actual analysis. Precondition for several
  downstream ADR 007 extensions (tick-log persistence,
  setup-performance feedback loop).
- **Additional asset-class phases** — FX, long-term equities, EOD
  modes. Each phase is a successor ADR.
- **Real-vendor cutover coordination** — tracked in ADR 008. Will
  likely involve staged promotion of mock modes to real-vendor
  adapters, with operator verification at each step.

## Related ADRs

- [ADR 001](001-tech-stack.md) — Tech stack + auth foundations
  (FastAPI + React + SQLite).
- [ADR 003](003-ui-foundations.md) — UI foundations (shadcn/ui +
  Tailwind + form stack).
- [ADR 005](005-dashboard-layout.md) — Dashboard layout (realizes
  the `/` route).
- [ADR 006](006-ai-chat-widget.md) — AI chat widget (realizes the
  AiChatFloat surface).
- [ADR 007](../007-backend-engine.md) — Backend engine (realizes
  the three engine layers).
- [ADR 008](../008-backend-providers.md) — Backend providers
  (realizes the four protocol abstractions + the dashboard
  aggregation endpoint).
- [ADR 009](../009-settings-ui.md) — Settings UI (realizes the
  `/settings` route, the configuration-boundary rules, and the
  CLI YAML import / export path).
- [ADR 010](../010-help-ui.md) — Help UI (added post-closure as a
  fourth operator-facing surface for domain-language learning).
- **[future] Instrument management ADR** — adding, editing, and
  removing tracked instruments; assigning setup-library entries
  per instrument; choosing which instrument boots as the default
  primary. ADR 004 consumes the result (a ready set of tracked
  instruments in the DB) but does not cover the management UX.
  Until that ADR lands, operators seed the instrument list via
  the CLI YAML import (ADR 009) or direct DB edits.
