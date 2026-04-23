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
| [004](004-mvp-scope.md) | MVP Scope — Day-Trade Decision Dashboard | Proposed | Phase 1 = swap-based primary-instrument dashboard (ENTER/HOLD/EXIT/RETREAT recommendations). Top Markets overview strip + hero primary panel (state banner + chart + rule gauge) + right-column Watchlist (click-to-swap mini rows) + NewsFeed. Setup engine + rule overlay + macro overlay + user-initiated AI chat (floating FAB). Three routes: `/login`, `/` dashboard, `/settings`. Four providers (MarketData / EventCalendar / News / Chat). Only config is persisted — everything else in-memory. Instrument management lives in a separate future ADR |
