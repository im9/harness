# ADR 004: MVP Scope — Day-Trade Decision Dashboard

## Status: Proposed

## Context

ADR 001 settled the technology stack and verified an auth path; ADR 003
delivered the UI foundations. The product itself — what harness *does*
once logged in — was not yet defined.

harness' purpose (CLAUDE.md, ADR 001) is to **curb impulsive trading
and enforce rule-based decision-making**. Phase 1 concretizes that into
a single-asset-class **decision dashboard**: a realtime advisory that
flags when a mechanical setup triggers, when exit conditions are met,
and when to retreat. Execution stays manual in the operator's broker
client — harness never routes orders (permanent ADR 001 constraint).

Operator-specific values (instrument list, thresholds, session times,
vendor selection) are not in this repository. They live in the app
database (edited via `/settings`) or in `.env`. This ADR describes
architecture only.

## Decision

### Routes (three)

- `/login` — auth (ADR 001)
- `/` — **Dashboard** (live engine output)
- `/settings` — configuration

The AI chat is a right-side drawer on the dashboard, not a route.
Notifications are toasts + webhook push, not a screen. No other routes
in Phase 1.

### Recommendation (4 states)

Per tracked instrument, the engine emits:

| State | Meaning | Operator action |
|-------|---------|-----------------|
| `ENTER` | Setup triggered, all conditions satisfied | Evaluate and place manually |
| `HOLD` | In or near a setup, confirmation pending | Wait |
| `EXIT` | Target / take-profit met | Close for profit |
| `RETREAT` | Invalidation or stop hit | Close at a loss now |

These drive the dashboard UI, push notifications, and the AI chat
context.

### Engine layers

- **Setup engine**: mechanical state machines per (instrument × setup),
  tick-driven, pure `(state, tick) → (state, emission)`. Setup library
  is operator-configured; the engine is setup-agnostic.
- **Rule overlay**: daily loss cap (suppresses `ENTER`), post-loss
  cooldown, explicit override. Advisory only — harness does not see
  orders, so these are UI / notification effects, not enforcement. The
  operator remains free to trade in the broker client regardless;
  overrides are logged.
- **Macro overlay**: pre / event / post windows from a calendar
  provider. Pre: suppress new `ENTER`, flag held positions as `HOLD`,
  tighten `RETREAT`. Event: mute signals. Post: reduced recommended
  size on new `ENTER`, tighter `RETREAT`. One-click manual toggle for
  unscheduled headlines.

### Provider abstractions (mock-first)

Three narrow protocols, all swappable:

```
MarketDataProvider    .subscribe / .latest_bar / .session_calendar
EventCalendarProvider .upcoming
ChatProvider          .stream
```

**Phase 1 ships mocks only.** Real-vendor adapters live outside the
public tree (separate package, private sibling repo, or gitignored
folder). The public tree must run end-to-end against mocks.

Mock modes:

| Protocol | Modes |
|---|---|
| `MarketDataProvider` | `synthesized` (random walk), `replay` (neutral CSV / Parquet), `scenario` (hand-authored sequences) |
| `EventCalendarProvider` | `yaml` (operator override file) |
| `ChatProvider` | `echo` (deterministic), `local` (self-hosted LLM) |

No test, fixture, or example may reference a real adapter by name
(public-repo privacy, CLAUDE.md rule).

### Persistence (what survives a restart)

- **Persisted**: configuration only, in SQLite (instruments, sessions,
  rule parameters, setup params, provider selection, notifications).
- **Not persisted**: ticks, bars, recommendations, rule-state
  transitions, AI chat, P&L. All in-memory, reset at restart.

Journaling is deferred. Without persistence of recommendation / rule
logs, harness has no history surface in Phase 1 — no review screen, no
session archive. Revisit when Phase 2 analytics needs (hit rate,
R distribution, rule effectiveness) justify the schema work.

### Configuration boundary

- No operator-specific literals in source code.
- Operator values live in the DB (edited via `/settings`); secrets in
  `.env` (the Settings UI references secrets by env-var name, never
  exposes the value itself).
- Required fields default to a structurally safe empty (engine emits
  nothing) rather than a guess.
- Optional CLI YAML import / export for bootstrap and backup
  (gitignored).

### Settings UI

One panel per concern, persisted on save, validated via shared
Pydantic schemas:

Instruments · Sessions · Rule overlay · Setup library · Macro overlay
· Market-data provider · Event-calendar provider · AI chat provider ·
Notifications.

Provider panels expose a "test connection" button. A failing test does
not block save — the panel is marked "unverified".

### AI chat (drawer, user-initiated)

- Never pushes proactively — responds only to operator-submitted
  messages.
- Cannot mutate rule state (structural, not prompt-driven: rule state
  is computed upstream of the chat request and has no writable channel
  back).
- Session-only; no persistence.
- Auto-injected per turn (prompt-cached): current price / VWAP / setup
  state per instrument, current recommendation and reason, today's
  P&L and distance to cap, upcoming macro events.
- Text in, text out. No tool use in Phase 1.

### Dashboard layout

Chart-centric, one row per tracked instrument, vertically stacked.
Each row:

```
┌────────────────────────────────────────────────────────────┐
│ State banner (color-coded, setup name, side, R target)     │
├────────────────────────────────────────────────────────────┤
│              Price chart (candles)                         │
│   - VWAP dashed line                                       │
│   - Setup range / levels as shaded regions and lines       │
│   - Target / retreat price lines with labels               │
│   - Setup trigger markers on originating bars              │
│   - Macro event vertical band when active                  │
├────────────────────────────────────────────────────────────┤
│              Volume pane                                   │
├────────────────────────────────────────────────────────────┤
│ Rule gauge: [████░░░░░░░░] used / cap (color by proximity) │
└────────────────────────────────────────────────────────────┘
```

Top status strip: today's P&L (Tremor `AreaChart` sparkline + the
current number), session phase, next macro event + countdown.

Right-side AI chat drawer (shadcn `Sheet`). When an AI message
references a chart element by time ("the sweep at 14:23"), the
corresponding marker pulses briefly (cross-link).

`ENTER` and `RETREAT` transitions animate the banner; they also fire a
browser Notification and the configured webhook. No motion during
steady state — only state-change moments are kinetic.

Charting primitives: **`lightweight-charts`** for candles, price
lines, markers, and sub-panes (price and volume). **Tremor Raw** for
`CategoryBar` (rule gauge) and `AreaChart` (status-strip sparkline).

Mobile: single-column stack, chat in a bottom sheet. Banner and rule
gauge keep vertical priority so a glance from a locked phone reads
the same story.

## What Phase 1 does NOT include

- Trade journaling / executed-trade logging (deferred)
- Automated order placement (permanent, ADR 001)
- Backtest UI (logic is backtestable offline; no UI module in Phase 1)
- Multi-asset-class portfolio view
- History / review / archive screens (no persistence → no surface)

## Implementation

Ordered so each step is independently demonstrable. Frontend builds
mock-first against the payload contract; backend follows.

- [ ] Backend: Pydantic config schema (instruments, sessions, rule,
      setup library, macro, providers, notifications)
- [ ] Backend: config persistence in SQLite + migration story
- [ ] Backend: `GET /api/settings`, `PUT /api/settings`, per-provider
      "test connection" endpoints
- [ ] Backend: `MarketDataProvider` + registry + mock (synthesized /
      replay / scenario) + in-memory tick / bar ring buffer
- [ ] Backend: `EventCalendarProvider` + registry + mock (YAML)
- [ ] Backend: `ChatProvider` + registry + mock (echo / local) + SSE
- [ ] Backend: `SetupEngine` — starter setups as tick-driven pure
      state machines
- [ ] Backend: `RuleOverlay` (cap, cooldown, overrides)
- [ ] Backend: `MacroOverlay` (event-window effects)
- [ ] Backend: `GET /api/dashboard` + `WebSocket /ws/dashboard`
- [ ] Frontend (on ADR 003 scaffold): `/settings` — schema-driven
      forms per section, test-connection feedback, persist on save
- [ ] Frontend: `/` dashboard — built mock-first against a frozen
      payload contract, wired to the real API last:
  - [x] (a) `lib/dashboard-types.ts` payload contract +
        `lib/mocks/dashboard.ts` scenarios + route shell composing
        `StateBanner`, `RuleGauge` (Tremor `CategoryBar`), and
        `StatusStrip` (Tremor `AreaChart`). Chart slot is a
        placeholder pending (b).
  - [ ] (b) `lightweight-charts` price and volume panes with
        annotations (VWAP dashed line, setup range shading, target /
        retreat price lines, trigger markers, macro vertical band).
        Per-row timeframe switcher.
  - [ ] Wire to the real `GET /api/dashboard` /
        `WebSocket /ws/dashboard` payload.
- [ ] Frontend: AI chat drawer (SSE consumer, cross-link to chart
      markers)
- [ ] CLI: `harness config import / export <yaml>`
- [ ] E2E on mocks: scenario-driven session exercises the full
      pipeline (tick → engine → recommendation → UI → chat context)
- [ ] Real-vendor adapter (outside public tree); live dry-run

## Considerations

**Determinism.** Every recommendation must be reproducible from the
tick log + rule state. No wall-clock reads in engine logic, no random
tiebreaks, no mutable shared state. Since Phase 1 does not persist the
tick log, this is an invariant on the engine's *shape*, not a
historical audit trail.

**AI guardrail is structural.** Rule state is computed upstream of the
chat request; the AI's output channel is text back to the operator
and has no path to mutate rule state. System-prompt framing is
secondary defense.

**Starter setup library is illustrative.** Phase 1 ships mechanically
clear setups for ease of verification, not as the operator's edge.
Expect replacement during live use; setup additions are
configuration, not code, and should not require ADR revision.

**Data-source selection is deployment-private.** The protocol is
narrow so the concrete adapter is reversible. Trade-offs among
candidate vendors (cost, account friction, API maturity) are
operator-specific and out of the public tree.

**Compliance framing.** harness is a private, single-user tool served
over an authenticated tunnel (ADR 001). It is not marketed, not
offered to third parties. Output phrasing favors descriptive ("setup
triggered, conditions are X, Y, Z") over prescriptive ("you should
buy") as cheap insurance on top of the private-access model.

## Future extensions

- **Journaling** (Phase 2) — executed-trade logging,
  recommendation-vs-actual analysis.
- **Tick / recommendation / rule-state log persistence** — enables
  post-hoc analytics (hit rate, R distribution, rule effectiveness).
  Natural precursor to a review screen.
- **Setup-library expansion** — additional setups as operator-private
  configuration; generic setup *categories* may warrant their own ADR.
- **Backtest UI** — run the setup engine over historical ranges,
  refine thresholds.
- **AI tool use** (Phase 2) — backtest-on-demand, similar-day search,
  event-impact history.
- **Additional asset-class phases** — FX, long-term equities, EOD
  modes. Each phase is a successor ADR.
- **Setup-performance feedback loop** — surface the worst-performing
  setup of the prior period and prompt for retune / retire.
