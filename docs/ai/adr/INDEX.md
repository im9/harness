# ADR Index

Quick reference for all Architecture Decision Records. Read individual ADRs only when relevant to the current task.

## Status Legend

- **Implemented**: Done. Code is the source of truth. Read only for historical rationale.
- **Proposed**: Not yet implemented (or partially). Read before working on related features.
- **Superseded**: Replaced by a newer ADR. Generally skip.

## File Organization

- **Top-level** (`docs/ai/adr/`): Proposed ADRs only — active design decisions awaiting (or mid-)implementation.
- **Archive** (`docs/ai/adr/archive/`): Implemented + Superseded ADRs — historical record, not actively maintained.

## Conventions

- Filename: `NNN-kebab-case-title.md`
- Header format: inline `## Status: Proposed` (not two-line)
- Every ADR has: Status, Context, Decision, Consequences (and optionally Open Questions, Implementation)
- Update this index whenever a new ADR is added or status changes

## ADRs

| # | Title | Status | Notes |
|---|-------|--------|-------|
| [001](archive/001-tech-stack.md) | Tech Stack Selection | Implemented | FastAPI + React + SQLite, self-implemented auth (Argon2id + TOTP + JWT + refresh rotation), cookie-based transport (C). login→dashboard MVP verified on localhost |
| [002](002-containerization.md) | Containerization Strategy | Proposed | Native dev (no Docker), single-container deploy. Hosting: Oracle Cloud Free ARM (primary) / Lightsail 1 GB (fallback). Dockerfile not yet written |
| [003](archive/003-ui-foundations.md) | UI Foundations | Implemented | shadcn/ui + Tailwind v4 + react-hook-form + zod + lucide-react + sonner + lightweight-charts + Tremor Raw (CategoryBar/Tracker/AreaChart/BarChart). AppShell, dark mode default, 404/ErrorBoundary, jsx-a11y. Scaffold through Dashboard spike complete. |
| [004](archive/004-mvp-scope.md) | MVP Scope — Day-Trade Decision Dashboard | Implemented | Phase 1 scope declaration: three routes (`/login`, `/`, `/settings`), four recommendation states, three-layer engine, four provider protocols, config-only persistence, configuration boundary (DB/.env + privacy rule for fixtures). Detailed design lives in per-feature ADRs 005–010; this ADR carries only the scope sketch. Narrowed + archived after growing past readability — future mega-ADRs avoided |
| [005](archive/005-dashboard-layout.md) | Dashboard Layout | Implemented | Hero primary + right-column widgets (Watchlist above NewsFeed) + top MarketsStrip. Three-tier state banner (hero / sub / meta). Swap mechanics (primary is a view mode, not a property). NewsFeed master–detail paging inside the widget. JST axis labels / crosshair tooltip via `lib/display-timezone.ts`. Charting: lightweight-charts + Tremor Raw. Wire to real `GET /api/dashboard` / WS is a Future extension pending ADR 008 |
| [006](archive/006-ai-chat-widget.md) | AI Chat Widget | Implemented | Bottom-right FAB morphs into a ~420×640 chat card (width / height / border-radius interpolation only). Streaming via `streamChatReply` (TTFT + per-token cadence split). `ChatContext` auto-injected per turn (primary / watchlist / markets / rule / news). IME-safe Enter-to-send, pending indicator gated to first-chunk wait. "Chat stays chat" non-goal: no text-scraping to drive UI actions. Cross-link returns only with real-LLM tool-use / structured citations (Phase 2) |
| [007](007-backend-engine.md) | Backend Engine — Setup / Rule / Macro | Proposed | Setup engine: tick-driven pure state machines per (instrument × setup), setup-agnostic registry. Rule overlay: daily loss cap, post-loss cooldown, explicit override — advisory only (harness never blocks the broker). Macro overlay: pre / event / post windows from the EventCalendarProvider, plus one-click manual toggle for unscheduled headlines. Determinism invariant on engine shape |
| [008](008-backend-providers.md) | Backend Providers | Proposed | Four narrow protocols (MarketData / EventCalendar / News / Chat) with registry dispatch. Phase 1 ships mocks only; real-vendor adapters live outside the public tree. Mock modes: MarketData synthesized / replay / scenario, EventCalendar yaml, News seeded, Chat echo / local. `GET /api/dashboard` + `WebSocket /ws/dashboard` aggregation. Privacy rule: public identifiers OK, operator-specific layer forbidden in tracked code |
| [009](009-settings-ui.md) | Settings UI | Proposed | One panel per concern (Sessions / Rule / Setup library / Macro / four providers / Notifications / Localization), schema-driven forms via shared Pydantic + zod. Save without block on connection failure (panel marked "unverified"). Localization panel replaces the hardcoded `Asia/Tokyo` constant in `lib/display-timezone.ts`. CLI YAML import / export for bootstrap + backup (gitignored). Instrument management deferred to a separate future ADR |
| [010](010-help-ui.md) | Help UI — Learning Surface | Proposed | Phase 1 shipped: `/help` list + `/help/:slug` detail under ProtectedRoute, AppShell header link as discoverable affordance (no `?` keybind). Bilingual `HelpEntry` (`title_{en,ja}` / `body_{en,ja}` / `aliases_{en,ja}`); tags are language-neutral keys with i18n display labels via `tTag()`. Client-side filter in active language; server `?tag=`/`?q=` exists for future paging. CLI `harness help-import` upserts by slug from `config/help-entries.yaml` (gitignored, operator-private). Editor surface + dashboard cross-links deferred to follow-on ADRs |
