# ADR 009: Settings UI

## Status: Proposed

## Context

ADR 004 declared `/settings` as one of the three Phase 1 routes and
listed the panels it would carry. This ADR covers the panel set in
full (including the **Localization** panel added after Phase 1
shipped with a hardcoded `Asia/Tokyo` reading frame in
`lib/display-timezone.ts`), the schema-driven form shape that keeps
each panel thin, the save / validate / "test connection" semantics,
and the CLI YAML import / export path for bootstrap and backup.

The underlying persistence is SQLite (ADR 004 persistence rule:
config is the only thing that survives a restart). The frontend
uses shadcn/ui + react-hook-form + zod on top of the ADR 003
foundations.

## Decision

### One panel per concern, persisted on save

Panels:

- **Sessions** — operator's trading calendar (market hours,
  holidays, after-hours policy).
- **Rule overlay** — daily loss cap, post-loss cooldown, override
  policy (ADR 007).
- **Setup library** — register / edit / remove named setups and
  their parameters (threshold values, side, target / retreat
  formulas). Does not cover per-instrument assignment — that's the
  [future] Instrument management ADR.
- **Macro overlay** — pre / event / post window durations, size
  reduction for the post window, RETREAT tightening factors
  (ADR 007).
- **Market-data provider** — vendor / mock selection + connection
  parameters (ADR 008).
- **Event-calendar provider** — vendor / mock selection + path or
  endpoint.
- **News provider** — vendor / mock selection.
- **AI chat provider** — vendor / mock selection (currently `echo`
  or `local`).
- **Notifications** — browser Notification toggle + webhook URL for
  `ENTER` / `RETREAT` pushes.
- **Localization** — display timezone (default `Asia/Tokyo`, the
  constant currently hardcoded in `lib/display-timezone.ts`). When
  the panel lands it replaces the constant with a DB-backed value;
  the chart's `tickMarkFormatter` + `localization.timeFormatter` and
  the NewsFeed row's exact time both read through the same module
  and get the update for free. Language / locale for UI chrome may
  layer in later but is out of scope for the initial panel (the UI
  copy is English-only today and harness is single-user, so
  priority is low).

### Schema-driven forms

Each panel's form is generated from a shared Pydantic schema so the
backend validator and the frontend form use the same field
definitions:

- Pydantic schema on the backend owns types, defaults, and
  validation rules.
- Zod schema on the frontend mirrors the Pydantic schema (generated
  or hand-kept in sync, TBD during implementation).
- `react-hook-form` wires the form to the zod schema; errors bubble
  up field-level.
- Save on submit; success toast on persist, field-level error on
  failure.

### "Test connection" button per provider panel

Provider panels (Market-data / Event-calendar / News / AI chat)
expose a "test connection" button. A failing test does **not** block
save — the panel is marked "unverified" in the UI so the operator
can still persist the intended config and fix the connection later.

### CLI YAML import / export

Optional CLI commands for bootstrap and backup:

- `harness config export <path>` — writes the current DB config as a
  YAML file. Useful before a destructive migration or to move
  settings between environments.
- `harness config import <path>` — loads a YAML file into the DB,
  validated against the Pydantic schemas.

Both paths are gitignored by convention — the YAML file carries
operator-specific values and must not be committed.

### Instrument management is NOT here

Adding / removing / editing the set of tracked instruments and
wiring them to setup-library entries is deliberately out of scope
for this ADR. The [future] Instrument management ADR will cover the
full add / edit / remove UX, including which instrument boots as
primary on page load. Settings consumes the result (a ready set of
tracked instruments in the DB) but does not cover the management UX.

Until that ADR lands, operators seed the instrument list via the
CLI YAML import (above) or direct DB edits.

## Implementation

- [ ] Backend: Pydantic config schema (instruments, sessions, rule,
      setup library, macro, providers, notifications, localization).
- [ ] Backend: config persistence in SQLite + migration story.
- [ ] Backend: `GET /api/settings`, `PUT /api/settings`,
      per-provider "test connection" endpoints.
- [ ] Frontend (on ADR 003 scaffold): `/settings` — schema-driven
      forms per section (zod mirror of Pydantic), test-connection
      feedback, persist on save.
- [ ] Frontend: **Localization** panel wired to
      `lib/display-timezone.ts` — replaces the `Asia/Tokyo`
      constant with a DB-backed value so chart axis labels and
      NewsFeed exact time pick up the operator's preference.
- [ ] CLI: `harness config export <yaml>` / `harness config import
      <yaml>` — gitignored outputs, round-trip validated against
      the Pydantic schemas.

## Considerations

**Save without block on connection failure.** Operators may know a
connection will fail (e.g. configuring a weekend-closed endpoint on
a Saturday) and still need to persist the intended config. "Test
connection" flags the panel as unverified; it does not reject the
save.

**No operator-specific literals in the tracked tree.** All values
edited through these panels land in the DB or `.env` (secrets). The
repository stays free of operator choices (ADR 004 configuration
boundary).

**Localization constant as seam.** `lib/display-timezone.ts` was
deliberately shipped as a single-source constant ahead of the
Localization panel so the rest of the UI (chart axis, NewsFeed
time) could adopt JST reading without waiting for the Settings
panel to exist. When the panel lands, only the module changes;
consumers don't move.

## Future extensions

- **Language / locale for UI chrome** — harness is English-only
  today. Japanese UI chrome would benefit CJK operators but needs a
  translation discipline + lint guard to keep in sync; low priority.
- **Config versioning + migration** — when the Pydantic schema
  evolves, loaded DB rows may need migration. Tackle when the first
  breaking schema change arrives.
- **Shared import for ops tooling** — the YAML export could feed a
  sibling ops tool (e.g. a screen that diffs two operator configs)
  if multi-user scenarios appear; not needed today.

## Related ADRs

- [ADR 004](archive/004-mvp-scope.md) — Phase 1 MVP scope
  (configuration boundary + Settings UI panel list declared there).
- [ADR 003](archive/003-ui-foundations.md) — shadcn/ui + Tailwind +
  react-hook-form + zod foundations the forms build on.
- [ADR 007](007-backend-engine.md) — Rule overlay / Setup library /
  Macro overlay panels edit the engine's config.
- [ADR 008](008-backend-providers.md) — Provider panels edit the
  registry's vendor/mock selection.
- [ADR 005](archive/005-dashboard-layout.md) — Localization panel
  replaces the dashboard's hardcoded JST timezone constant.
- **[future] Instrument management ADR** — tracked instruments +
  setup assignment UX.
