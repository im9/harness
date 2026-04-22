# ADR 004: MVP Scope — Day-Trade Decision Cockpit

## Status: Proposed

## Context

ADR 001 settled the technology stack and verified an auth path. The product
itself — what harness *does* once you log in — was not yet defined. The
login lands on an empty dashboard.

harness' stated purpose (CLAUDE.md, ADR 001) is to **curb impulsive trading
and enforce rule-based decision-making**. Phase 1 concretizes that into a
single-asset-class decision cockpit: a realtime advisory that tells the
operator when a mechanical setup has triggered, when conditions for exit
are met, and when to retreat. Trade execution remains manual in the
operator's broker client — harness never routes orders (permanent ADR 001
constraint).

A critical product premise, established during scoping: **if the
recommendations are reliable, tracking the operator's actual executed
trades is not required in Phase 1**. The deliverable is a recommender, not
a bookkeeping tool. Journaling is deferred.

Operator-specific configuration — instrument class, loss thresholds,
session times, setup parameters, data/AI vendor selection — is recorded in
private, untracked notes (`docs/private/`, gitignored). This ADR describes
architecture and generic constraints only.

## Decision

### Configuration boundary (no hardcoded operator values)

A strict separation between the code and the operator's specifics applies to
the entire Phase 1 surface.

- **No operator-specific literals in source code.** Loss thresholds,
  instrument lists, session windows, setup parameters, rule-timeout
  durations, provider (vendor) selections, and credentials are all
  runtime configuration.
- **Operator values live in the app's own database**, edited via an
  in-app Settings UI (see below). Source files carry only the config
  *shape* (Pydantic models), never values.
- **Secrets (API keys, webhook URLs) live in `.env`.** The Settings UI
  references them by *env-var name*, never exposes the value itself.
- **No defaults that imply a profile.** Where a field is required, the
  default is a structurally safe placeholder (empty list → engine
  produces no recommendations) rather than a guess at the operator's
  likely choice.
- **Optional YAML seed**: a CLI utility can import a YAML file into the
  DB to bootstrap or restore a configuration; this is convenience, not
  the primary edit path, and any such YAML is gitignored.

### Settings UI (Phase 1)

The Settings surface is in scope for Phase 1 because the "configurable
vendors and thresholds" premise is void without it. Route: `/settings`
(protected, same auth as the cockpit).

Sections (one panel each, each editable and persisted to DB on save):

- **Instruments** — add / remove / reorder tracked instruments; per-entry
  symbol, display name, tick size, tick value.
- **Sessions** — enable windows; per-entry name, start/end, timezone.
- **Rule overlay** — daily loss cap (currency-agnostic; unit inferred from
  quote currency); cooldown mode (`until_next_day` / `fixed_window` /
  `none`); window minutes if applicable; override policy.
- **Setup library** — enable/disable setups registered in code; per-setup
  parameters via a schema-driven form (the setup registers its Zod/Pydantic
  param schema and the UI is generated from it).
- **Macro overlay** — pre/event/post windows; post-event size multiplier
  and retreat-tightening factor.
- **Market-data provider** — pick `kind` from registered providers;
  provider-specific options form (generated from the provider's schema);
  "test connection" button.
- **Event-calendar provider** — same shape.
- **AI chat provider** — `kind`, model, env-var name for API key; "test
  prompt" button; enable/disable toggle.
- **Notifications** — env-var name for webhook URL; "send test" button.

All inputs validate on save (the same Pydantic models used on the
backend). A failing connection test does not block save — the operator is
free to persist a provisional config — but the panel is labeled
"unverified".

### Phase 1 product: a single-asset-class decision cockpit

Backend emits, per tracked instrument, a four-state recommendation:

| State | Meaning | Operator action |
|-------|---------|-----------------|
| `ENTER` | A setup has triggered with all conditions satisfied | Evaluate and place the trade manually |
| `HOLD` | In or near a setup, confirmation pending | Wait |
| `EXIT` | Target or take-profit conditions met | Close for profit |
| `RETREAT` | Invalidation or stop conditions met | Close at a loss now |

These drive the UI cockpit, push notifications, and the AI chat context.

### Setup engine

Setups are mechanical state machines evaluated per tick. The library is
operator-configured; Phase 1 ships with a small starter set intended to be
replaced or augmented as the operator codifies their edge. The engine
itself is setup-agnostic.

Setups coexist: the engine produces state per (instrument × setup); the
cockpit aggregates into a primary state per instrument using a
most-recent-trigger heuristic for display.

### Macro event overlay

Scheduled events from an event calendar modulate recommendations across
all setups:

| Phase | Effect |
|-------|--------|
| Pre-event window | Suppress new `ENTER`; existing positions flagged `HOLD`; `RETREAT` thresholds tightened |
| Event window | All signals muted; UI banner |
| Post-event window | News-volatility mode: reduced recommended size on new `ENTER`; tighter `RETREAT` |

Window lengths and the event impact tier mapping are operator-configured.
Unscheduled events (breaking headlines, ad-hoc speeches) are out of scope
for automation; a one-click UI toggle applies the post-event volatility
mode manually.

### Rule overlay

- **Daily loss cap**: cumulative realized + unrealized loss over the
  operator-defined trading day. On reach, the engine stops emitting
  `ENTER`. `HOLD`/`EXIT`/`RETREAT` continue.
- **Post-loss cooldown**: after a losing round-trip, suppress `ENTER` for
  an operator-configured window (zero to multi-day).
- **Override**: the operator retains freedom to bypass lockouts via an
  explicit override action. Overrides are logged and surfaced in the
  monthly review.

Because harness does not see orders, these rules are **advisory** — they
disable the UI `ENTER` indicator and push warnings, but the operator is
free to trade in the broker's client regardless. The system records rule
state for post-hoc review.

### Market data source

Phase 1 consumes realtime instrument data through a single abstraction:

```
MarketDataProvider (protocol)
  .subscribe(instrument) -> AsyncIterator[Tick]
  .latest_bar(instrument, timeframe) -> Bar
  .session_calendar() -> SessionCalendar
```

Exactly one concrete implementation ships in Phase 1. Requirements the
implementation must satisfy:

- Realtime tick + push delivery (bars must be computable with sub-second
  freshness for the shortest timeframe used by the setup library)
- Coverage of the chosen day-trade instrument class
- Predictable, bounded ongoing cost
- No order-routing capability (ADR 001 boundary)

Concrete vendor, authentication flow, gateway/runtime requirements, and
pricing are deployment specifics recorded in the operator's private
configuration. The protocol is intentionally narrow so the concrete
implementation remains swappable without setup-engine changes.

### Macro event data source

Similar abstraction:

```
EventCalendarProvider (protocol)
  .upcoming(within: timedelta) -> list[MacroEvent]
```

Phase 1 uses a primary public calendar source supplemented by an operator-
maintained YAML override file for entries the primary source misses or
mislabels. The override file is read at startup and file-watched in dev.

### AI chat assistant (user-initiated)

A reasoning partner, not an advisor. Complements the deterministic setup
engine for novel or ambiguous situations.

**Non-negotiable constraints** (enforced structurally, not just by prompt):

- Never pushes proactively — the AI responds only to operator-submitted
  messages.
- Cannot modify rule-overlay state. Rule state is computed before the AI
  sees it and has no writable channel back.
- System prompt frames output as *considerations*, not *recommendations*.
- Session-only in Phase 1; no persistence.

**Provider abstraction:**

```
ChatProvider (protocol)
  .stream(messages, system) -> AsyncIterator[str]
```

Concrete default and fallback are operator configuration. The default
targets a free-tier provider; fallback targets a higher-quality paid
provider if reasoning quality proves insufficient. Swap is an env-var
change.

**Context auto-injected per turn** (prompt-cached for cost):

- Current price, session VWAP, setup states per tracked instrument
- Currently displayed cockpit recommendation and its reason
- Today's P&L state and distance to the rule-overlay cap
- Upcoming macro events (name, time, impact tier)

No tool use in Phase 1 — text in, text out.

### Development providers (mock-first strategy)

The three provider protocols (`MarketDataProvider`,
`EventCalendarProvider`, `ChatProvider`) are deliberately narrow so that
**all Phase 1 development, testing, and demos run against mock
implementations** without any real vendor account.

Two constraints make this non-optional:

1. **Time-to-value.** Provisioning broker / market-data / paid-API
   accounts is measured in days to weeks. Engine, rule overlay, and
   cockpit work must not block on external onboarding.
2. **Public-repo privacy.** harness is a public repository
   (`CLAUDE.md` constraint: no broker names, device types, or messaging
   apps). Concrete vendor selections are operator-private and must not
   be identifiable from source code, config schema field names,
   dependency manifests, test fixtures, or example values. The mock
   providers are the *only* concrete providers that ship in the public
   tree.

**Design constraints on mock providers:**

- Implement the abstract protocol faithfully — no fields, methods,
  metadata, or error shapes that would only appear in a specific real
  vendor's API. The mock is a reference implementation of the
  protocol, not a mirror of any one broker.
- Settings UI lists `mock` first among registered providers and
  selects it by default.
- Multiple mock *modes* are supported under a single `kind: "mock"`
  entry (selected by provider-options form):
  - `synthesized` — random-walk tick stream with configurable drift,
    volatility, and session-gap behavior.
  - `replay` — tick / bar / event playback from a recorded file in a
    project-defined neutral format (CSV or Parquet), never a
    vendor-specific dump.
  - `scenario` — hand-authored sequences for testing specific engine
    paths (opening-range breakout, failed breakout, macro-event mute,
    rule-cap lockout, retreat trigger).
- Fixture files in `tests/fixtures/` are synthetic or heavily
  redacted — no raw capture from any real vendor, and nothing that
  would fingerprint the operator's actual instrument universe,
  session times, or typical trade sizes.

**Mock modes per protocol:**

| Protocol | Mock modes | Notes |
|---|---|---|
| `MarketDataProvider` | `synthesized`, `replay`, `scenario` | Random walk suffices for UI/plumbing; scenario files drive engine unit tests |
| `EventCalendarProvider` | `yaml` | Reads directly from the operator override YAML; no primary source |
| `ChatProvider` | `echo`, `local` | Echo is deterministic for tests; local LLM (e.g. self-hosted) for reasoning-quality PoC without a paid key |

**Real-vendor adapters (out of public tree):**

Real adapters are loaded via the registry's plugin-discovery mechanism.
The protocol definitions and registry live in this repo; concrete
adapter classes live outside it — a separately-installed Python
package, a private sibling repo, or a gitignored `src/providers/private/`
folder, at the operator's discretion. The public tree must remain able
to run end-to-end against mocks alone, and no test, fixture, or
example may reference a real adapter by name.

### UI (built on ADR 003 foundations)

Two top-level routes in Phase 1:

- `/` — **Cockpit** (live engine output)
- `/settings` — **Settings** (edit everything described in the
  Configuration boundary section; no hardcoded operator values elsewhere)

Both are protected by the auth path from ADR 001. Navigation between them
lives in the header nav (per ADR 003 AppShell).

#### Cockpit (`/`)

Chart-centric. Each tracked instrument gets a full-width price chart as
its primary surface. Recommendation state, setup context, target/retreat
levels, and rule-overlay status are rendered **as annotations on the
chart itself**, not as adjacent text. The goal is that any decision the
engine has made is legible at a glance from the chart — text labels are
supporting, not primary.

The charting primitive is `lightweight-charts`, pinned in ADR 003 as a
foundation choice. This ADR describes how the cockpit uses it.

#### Visual language

Every piece of engine state has a distinct visual that a glance decodes:

| State / value | Visual |
|---|---|
| OHLC candles | Primary series, color-coded up/down |
| Session VWAP | Dashed line, color-coded by setup context |
| Setup range (e.g. opening range, prior-day H/L) | Translucent shaded rectangle or horizontal line, labeled |
| Setup trigger event | Arrow marker at the originating bar, labeled with setup name |
| Target level | Solid horizontal price line, labeled (price + R multiple) |
| Retreat level | Solid red price line, labeled |
| Current recommendation = `ENTER` | Full-width color-coded banner above the chart + pulsing marker at the current bar |
| `HOLD` | Muted banner |
| `EXIT` | Steady accent banner + marker |
| `RETREAT` | High-contrast red banner + pulsing marker + browser/webhook notification |
| Volume | Dedicated sub-pane below price |
| Rule-overlay state | Horizontal gauge bar beneath volume: used loss vs cap, live-updated with unrealized P&L; color transitions as the cap is approached |
| Macro event window | Vertical band on the chart covering the pre/event/post window, labeled with event name |

#### Layout

One row per tracked instrument, vertically stacked. Each row:

```
┌────────────────────────────────────────────────────────────┐
│ State banner (color-coded, setup name, side, R target)     │
├────────────────────────────────────────────────────────────┤
│                                                            │
│              Price chart (candles)                         │
│   - VWAP dashed line                                       │
│   - Setup range/levels as shaded regions + lines           │
│   - Target / retreat price lines with labels               │
│   - Setup trigger markers on originating bars              │
│   - Macro event vertical band when active                  │
│                                                            │
├────────────────────────────────────────────────────────────┤
│              Volume pane                                   │
├────────────────────────────────────────────────────────────┤
│ Rule gauge: [████░░░░░░░░] used / cap (color by proximity) │
└────────────────────────────────────────────────────────────┘
```

A right-side **AI chat drawer** (collapsible, per ADR 003 shadcn `Sheet`)
opens on demand. When an AI message references a chart element by time or
name (e.g. "the sweep at 14:23"), the corresponding marker pulses briefly
on the chart (cross-link between text and visual context).

A top **status strip** spans the header with: today's aggregate P&L,
session phase, next macro event and countdown.

#### Timeframes

Each chart exposes a timeframe switcher (short / medium intraday) whose
specific options are setup-library-dependent and therefore operator-
configured, not hardcoded.

#### Motion and notification

- State transitions (HOLD→ENTER, any→RETREAT) animate the banner color
  change over a sub-second duration; the transition is visually distinct
  enough that peripheral vision catches it.
- `ENTER` and `RETREAT` additionally fire a browser Notification API push
  and the configured webhook.
- No gratuitous animation; the chart itself does not pulse or shimmer
  during steady state — only state-change moments are kinetic.

#### Mobile

Single-column stack per instrument; chat in a bottom sheet drawer; all
chart annotations remain visible — only the width shrinks. The banner
and rule gauge keep their vertical priority so a glance from a locked
phone screen tells the same story.

### Notifications

Push triggers:
- State change to `ENTER` or `RETREAT` on any tracked instrument
- Daily loss cap reached
- Pre-event window opens
- Session-end summary

Channel: pluggable webhook per ADR 001.

### What Phase 1 explicitly does NOT include

- Trade journaling (deferred: revisit in Phase 2 if recommendation-vs-actual
  analysis becomes desired)
- Automated order placement (permanent ADR 001 constraint)
- Backtest UI (setup logic is backtestable offline; no UI module in Phase 1)
- Multi-instrument / multi-asset-class portfolio view (single asset class
  in Phase 1)
- Phase 2+ asset classes

## Implementation

Ordered so each step is independently demonstrable and upstream-blocking
uncertainties surface early.

- [ ] Backend: Pydantic config schema (instruments, sessions, rule overlay,
      setup library, macro overlay, provider selections)
- [ ] Backend: config persistence in SQLite + versioned migration story
- [ ] Backend: `GET /api/settings`, `PUT /api/settings` + per-provider
      "test connection" endpoints
- [ ] Backend: `MarketDataProvider` protocol + provider registry + mock
      implementation (synthesized + replay + scenario modes) +
      in-memory tick/bar ring buffer
- [ ] Backend: `EventCalendarProvider` protocol + registry + mock (YAML)
- [ ] Backend: `ChatProvider` protocol + registry + mock (echo + local)
      + SSE route
- [ ] Backend: `SetupEngine` — starter setup library as state machines,
      tick-driven, pure functions of (state, tick) → (new state, emission)
- [ ] Backend: `RuleOverlay` (cap, cooldown, overrides)
- [ ] Backend: `MacroOverlay` (event-window effects on recommendations)
- [ ] Backend: `GET /api/cockpit` + `WebSocket /ws/cockpit`
- [ ] Frontend (on ADR 003 scaffold): `/settings` screen — schema-driven
      forms per section, "test connection" feedback, persist on save
- [ ] Frontend: `/` cockpit layout with lightweight-charts, instrument
      rows, chart annotations (price lines, setup overlays, markers,
      state banner), volume pane, rule gauge
- [ ] Frontend: AI chat drawer (collapsible, SSE consumer, cross-link
      from AI references to chart annotations)
- [ ] CLI: `harness config import <yaml>` / `harness config export <yaml>`
      for bootstrap and backup
- [ ] End-to-end on mocks: scenario-driven session exercises the full
      pipeline (tick → engine → recommendation → UI → chat context)
      without any real vendor dependency
- [ ] (Post-mock) Resolve data-source onboarding per operator private
      config; develop the real-vendor adapter outside the public tree
- [ ] (Post-mock) Live dry-run: one session with the real adapter
      running passively

## Considerations

### Determinism and auditability

Every recommendation must be reproducible from a tick log and rule state.
Non-determinism (wall-clock reads in engine logic, random tiebreaks,
mutable shared state) is prohibited. This lets the operator — and future
investigation — answer "why did the engine say `ENTER` at 10:04?" from the
logs alone.

### The AI guardrail is structural, not aspirational

Rule-overlay state is computed upstream of the chat request construction.
The AI's output channel is text back to the operator and cannot mutate
recommendation state or unlock the daily cap. System-prompt framing is
additional defense-in-depth, not the primary guarantee.

### Starter setup library is illustrative, not doctrine

The Phase 1 setup library is chosen for mechanical clarity and ease of
verification, not because it represents the operator's edge. Expect the
library to be replaced or augmented during live use. Setup additions are
data, not code — they should not require ADR revision for each change.

### Data-source selection is deployment-private

Trade-offs among candidate providers (cost, account friction, API
maturity, OS dependencies) are operator-specific and were evaluated
privately. The abstraction keeps this decision reversible.

### Instrument-class quirks

Some instrument classes have structural quirks: futures contract rolls
and expiry-week behavior, session gaps, limited after-hours liquidity.
Phase 1 handles these at two layers only:

- Continuous stitching in the market-data layer (definition of "front
  month" / "primary contract" per operator config)
- A coarse anomaly flag that tightens `RETREAT` thresholds globally

Finer per-setup treatment is a Phase 2 concern.

### Data we retain without journaling

The tick log + recommendation log + rule-state log together make post-hoc
analyses possible in Phase 2 without knowing which trades the operator
actually placed:

- Setup hit rate and R-multiple distribution (from the engine alone)
- Rule-overlay effectiveness (how often would the cap have saved vs cost)
- Macro-event volatility verification (was the mute window correctly sized?)

This allows the "should I keep or retune this setup?" question to be
answered even in pure recommender mode.

### Compliance framing

harness is a private, single-user analysis tool delivered over an
authenticated tunnel (ADR 001). It is not marketed, not offered to third
parties, and does not accept external users. Output phrasing favors
descriptive ("setup triggered, conditions are X, Y, Z") over prescriptive
("you should buy") as cheap insurance on top of the private-access model.

## Future Extensions

- **Journal mode (Phase 2)**: add executed-trade logging if recommendation-
  vs-actual analysis becomes desired.
- **Setup-library expansion**: additional mechanical setups added as
  operator-private configuration; generic-enough setup *categories* may
  warrant ADRs (e.g. "volume-profile-aware setups" as a pattern family).
- **Backtest UI**: run the setup engine over a historical range, review
  hypothetical R distributions, refine thresholds.
- **AI tool use (Phase 2)**: backtest-on-demand, similar-day search,
  event-impact history — gives the chat partner real analytical depth.
- **Additional asset-class phases**: FX, long-term equities (journaling-
  heavy, low rule-engine), EOD-only modes. Each phase is a successor ADR.
- **Rule-override analytics**: monthly summary highlighting override
  frequency and its correlation with outcomes.
- **Setup-performance feedback loop**: surface the worst-performing setup
  of the prior period and prompt the operator to retune or retire it.
