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
- **Market-data provider** — vendor / mock selection + connection
  parameters (ADR 008).
- **News provider** — vendor / mock selection (Phase 1: `rss`
  feed URL list + poll cadence).
- **AI chat provider** — vendor / mock selection (Phase 1:
  `echo`).
- **Notifications** — browser Notification toggle + webhook URL
  for significant trend transitions (e.g. `range` → `up` /
  `down`).
- **Localization** — two fields:
  1. **Display timezone** (default `Asia/Tokyo`, the constant
     currently hardcoded in `lib/display-timezone.ts`). When the
     panel lands it replaces the constant with a DB-backed value;
     the chart's `tickMarkFormatter` + `localization.timeFormatter`
     and the NewsFeed row's exact time both read through the same
     module and get the update for free.
  2. **UI language** (`'ja' | 'en'`, default `'ja'`). The operator
     is a Japanese trader; surfacing UI chrome in their first
     language removes a small but constant friction during heavy
     reading. Pairs with ADR 010's bilingual terminology entries —
     toggling the UI language gives a paired JA↔EN learning path
     alongside Help UI lookups.

  **Translation policy** (resolved during Phase A). Translate UI
  chrome — nav / form labels / headings / descriptions / errors /
  validation / aria-labels / empty states / status messages.
  Keep verbatim:
  - product name (`harness`)
  - state markers in the four-state engine (`ENTER` / `HOLD` /
    `EXIT` / `RETREAT`) — universal one-word signals
  - timeframe abbreviations (`10s` `1m` `5m` `15m` `1H` `1D` `1W`)
  - market / region codes (`PT` `ET` `GMT/BST` `JST`) and IANA
    zone names (`America/New_York` etc.)
  - theme tokens (`light` / `dark`)
  - DB-stored content (ticker symbols, news titles, operator notes)

  Domain terms: `Watchlist` / `News` / `Markets` /
  `setup range` / `macro event window` use katakana
  (`ウォッチリスト` etc.); `target` / `retreat` (lowercase,
  in descriptive text — distinct from the `RETREAT` state marker)
  translate to `目標` / `撤退`.

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

Staged so the backbone (schema layer, persistence, settings API,
`/settings` route) lands first behind the smallest user-visible
panel — Localization. Subsequent panels arrive alongside their
backing ADRs (three Provider panels with ADR 008) and don't have
to rebuild the foundation.

### Phase A — Localization slice (foundation + first panel)

- [x] Backend: `app_config` single-row JSON table in SQLite; future
      panels extend the JSON shape rather than adding tables.
- [x] Backend: Pydantic config schema seeded with `localization`
      (`displayTimezone: string`, default `"Asia/Tokyo"`),
      designed to grow as panels land.
- [x] Backend: `GET /api/settings`, `PUT /api/settings`
      (full-document replace; per-panel partial PATCH deferred until
      multi-panel concurrency becomes a concern).
- [x] Frontend (on ADR 003 scaffold): `/settings` route with the
      Localization panel. Schema-driven form pattern (zod mirror of
      Pydantic) is established here so later panels plug in without
      re-deciding shape.
- [x] Frontend: settings loaded once at app boot into a context;
      `lib/display-timezone.ts` reads the operator's value through
      that context (fallback `Asia/Tokyo` for first run / API
      failure). Chart `tickMarkFormatter` /
      `localization.timeFormatter` and NewsFeed exact time pick up
      the change without further edits.
- [x] Backend: extend `LocalizationConfig` with `language: 'ja' |
      'en'` (default `'ja'`).
- [x] Frontend: `lib/i18n/` module — `messages-en.ts` +
      `messages-ja.ts` typed dictionaries; `useTranslation()` hook
      reads `useSettings().settings.localization.language` and
      returns a `t(key)` function. Keep dictionary keys in sync via
      TypeScript (JA dict typed `Record<MessageKey, string>` so a
      missing key is a build error).
- [x] Frontend: migrate visible UI chrome through `t()` per the
      translation policy above. State markers / timeframe
      abbreviations / product name / theme tokens / market codes
      stay verbatim; domain terms use katakana.
- [x] Frontend: Localization panel adds **Language** field
      (`select` between Japanese / English) alongside Display
      timezone.

### Phase B — remaining panels (deferred)

Land alongside the ADRs that own the underlying config:

- [ ] Sessions / Notifications panels (independent — no upstream
      dependency, can land any time after Phase A).
- [ ] Market-data / News / AI chat provider panels — arrive
      with ADR 008 backend providers, including per-provider
      "test connection" endpoints.
- [ ] CLI: `harness config export <yaml>` / `harness config import
      <yaml>` — round-trips the full schema; defer until the
      schema covers more than one panel (single-panel YAML is busy
      work).

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

- **Trend engine indicator panel** — `window`, `min_confidence`,
  indicator selector (regression / SMA / EMA / etc.). Arrives
  when the operator's defaults need to be edited from the UI;
  Phase 1 ships indicator config as code defaults only.
- **Rule overlay / Setup library / Macro overlay panels** —
  return when their backing engine layers do, as per-feature
  ADRs (deferred from Phase 1 by ADR 007 trend pivot
  2026-04-25).
- **Event-calendar provider panel** — returns when the
  `EventCalendarProvider` does (ADR 008 Future extension).
- **AI chat provider `local` mode field** — vendor-private LLM
  endpoint URL / model selection. Lands when ADR 008's `local`
  mock returns from Future extensions.
- **Config versioning + migration** — when the Pydantic schema
  evolves, loaded DB rows may need migration. Tackle when the
  first breaking schema change arrives.
- **Shared import for ops tooling** — the YAML export could
  feed a sibling ops tool (e.g. a screen that diffs two operator
  configs) if multi-user scenarios appear; not needed today.

## Related ADRs

- [ADR 004](archive/004-mvp-scope.md) — Phase 1 MVP scope
  (configuration boundary + Settings UI panel list declared there).
- [ADR 003](archive/003-ui-foundations.md) — shadcn/ui + Tailwind +
  react-hook-form + zod foundations the forms build on.
- [ADR 007](007-backend-engine.md) — Trend engine indicator
  config defaults; an indicator panel arrives in Future
  extensions when operator-editable defaults are needed.
- [ADR 008](008-backend-providers.md) — Provider panels edit the
  registry's vendor / mock selection.
- [ADR 005](archive/005-dashboard-layout.md) — Localization panel
  replaces the dashboard's hardcoded JST timezone constant.
- **[future] Instrument management ADR** — tracked instruments +
  setup assignment UX.
