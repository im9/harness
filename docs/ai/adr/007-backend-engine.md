# ADR 007: Backend Engine — Setup / Rule / Macro

## Status: Proposed

## Context

ADR 004 declared three engine layers at the topology level: a setup
engine, a rule overlay, and a macro overlay, all feeding the four
recommendation states (`ENTER` / `HOLD` / `EXIT` / `RETREAT`) that
drive the dashboard (ADR 005), notifications, and the AI chat
context (ADR 006). This ADR fills in what each layer looks like —
the state machine shape, the rule semantics, the macro window
effects — so the backend implementation can be built against a
concrete spec.

## Decision

### Setup engine

Mechanical state machines per (instrument × setup), tick-driven,
pure `(state, tick) → (state, emission)`. The setup library is
operator-configured; the engine itself is setup-agnostic. A "setup"
is a rule set for detecting and exiting a mechanical pattern (e.g.
opening-range break, VWAP reclaim, trend-day continuation) — the
engine runs whatever setups the operator registered, without
baked-in knowledge of any specific pattern.

Emissions from the setup engine:

- `ENTER` — the setup has triggered and all conditions are
  satisfied. Operator evaluates and places manually.
- `HOLD` — in or near a setup, confirmation pending. Operator waits.
- `EXIT` — target / take-profit level reached. Operator closes for
  profit.
- `RETREAT` — invalidation or stop hit. Operator closes at a loss.

### Rule overlay

Applied on top of the setup engine's emissions. Cap / cooldown /
override semantics:

- **Daily loss cap.** When tripped, suppresses new `ENTER` emissions
  (existing `HOLD` / `EXIT` / `RETREAT` pass through unchanged). The
  operator still sees the underlying setup state in the dashboard,
  just without the `ENTER` upgrade.
- **Post-loss cooldown.** After a loss, new `ENTER` is suppressed
  for a configured duration. Same pass-through rule as above.
- **Explicit override.** Operator can manually lift a cap / cooldown
  for a specific trade. Overrides are logged (Phase 2 journaling
  consumes the log; Phase 1 has no persistence for it).

**Advisory only.** harness does not see orders, so these are UI /
notification effects, not enforcement. The operator remains free to
trade in the broker client regardless; overrides are logged but not
mechanically blocked at any layer.

### Macro overlay

Applied after the rule overlay. Pre / event / post windows come from
the `EventCalendarProvider` (ADR 008):

- **Pre window** — suppress new `ENTER`, flag held positions as
  `HOLD`, tighten `RETREAT` thresholds.
- **Event window** — mute signals entirely (no `ENTER`, no `HOLD`
  upgrade, `RETREAT` only if the underlying setup triggers one
  independently).
- **Post window** — reduced recommended size on new `ENTER`, tighter
  `RETREAT`. The "reduced size" is advisory and surfaces in the
  state banner + notification.

One-click manual toggle for unscheduled headlines (e.g. a surprise
central-bank comment) lets the operator flip the macro overlay on
for a duration without editing the calendar.

## Implementation

- [ ] Backend: `SetupEngine` — starter setups as tick-driven pure
      state machines. Starter library is illustrative, not the
      operator's actual edge (see Considerations).
- [ ] Backend: `RuleOverlay` — cap, cooldown, overrides. Logged but
      not persisted in Phase 1.
- [ ] Backend: `MacroOverlay` — event-window effects (pre / event /
      post) + manual toggle for unscheduled headlines.

## Considerations

**Determinism.** Every recommendation must be reproducible from the
tick log + rule state. No wall-clock reads in engine logic, no
random tiebreaks, no mutable shared state. Since Phase 1 does not
persist the tick log (ADR 004's persistence rule), this is an
invariant on the engine's *shape*, not a historical audit trail —
when tick-log persistence lands (Future extension), the engine's
determinism makes replay-for-review a straightforward add.

**Starter setup library is illustrative.** Phase 1 ships mechanically
clear setups for ease of verification, not as the operator's edge.
Expect replacement during live use; setup additions are
configuration, not code, and should not require ADR revision.

**Rule overlay is structural, not prompt-driven (AI-chat boundary).**
Rule state is computed here, upstream of the chat request in ADR
006. The chat's output channel is text back to the operator and has
no writable path to mutate rule state. System-prompt framing is
secondary defense.

## Future extensions

- **Tick / recommendation / rule-state log persistence** — enables
  post-hoc analytics (hit rate, R distribution, rule effectiveness)
  and a natural precursor to a review screen. Deferred past Phase 1
  because without the UI surface, persisting the log has no
  immediate consumer.
- **Setup-library expansion** — additional setups as operator-
  private configuration; generic setup *categories* (e.g. "breakout
  family", "mean-revert family") may warrant their own ADR once the
  categories stabilize.
- **Backtest UI** — run the setup engine over historical ranges,
  refine thresholds. Engine determinism above is the precondition.
- **Setup-performance feedback loop** — surface the worst-performing
  setup of the prior period and prompt for retune / retire. Depends
  on journaling (Phase 2) + tick-log persistence.

## Related ADRs

- [ADR 004](archive/004-mvp-scope.md) — Phase 1 MVP scope (this ADR
  realizes the engine layers declared there).
- [ADR 008](008-backend-providers.md) — Provider protocols
  (`MarketDataProvider` ticks feed the setup engine;
  `EventCalendarProvider` feeds the macro overlay).
- [ADR 005](archive/005-dashboard-layout.md) — Dashboard layout
  (consumes the engine's recommendation states).
- [ADR 006](archive/006-ai-chat-widget.md) — AI chat widget
  (consumes rule state as auto-injected context, cannot mutate it).
