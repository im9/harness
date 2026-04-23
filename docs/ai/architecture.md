# Architecture

High-level summary of settled design decisions. Rationale and tradeoffs live in the ADRs at [adr/INDEX.md](adr/INDEX.md); this document is a map, not a manifesto.

## What harness is

A personal, single-user web tool for logging trades, enforcing rule-based decision discipline, and delivering notifications across Japanese/US equities, FX, Nikkei futures, and mutual funds. It journals, analyzes, and notifies — it is neither an advisory service nor an automated trader.

Access is always-on and private (Tailscale); no ports are exposed to the public internet.

## Component map

- **Frontend** — Vite + React + TypeScript SPA (`frontend/`). Tested with vitest + Testing Library.
- **Backend** — FastAPI (async) in `src/harness/`, managed by uv. Async SQLAlchemy 2.0 + aiosqlite. JWT + TOTP self-implemented auth. Tested with pytest + pytest-asyncio.
- **Database** — SQLite file (`harness.db`). Single-user, no write contention. Future migration to PostgreSQL is a connection-string change.
- **Notifications** — Pluggable messaging-app webhook (provider decided at config time).
- **Networking** — Tailscale tunnel; HTTPS via MagicDNS certificates.

## Dev vs deploy

|            | Dev (localhost)                     | Deploy                          |
|------------|-------------------------------------|---------------------------------|
| Runtime    | uv + pnpm native                    | Single Docker container         |
| Backend    | `uv run uvicorn harness.app:app`    | uvicorn inside the container    |
| Frontend   | `pnpm dev` (Vite, HMR)              | Static build served by backend  |
| Database   | `harness.db` in repo directory      | SQLite on a mounted volume      |

See [ADR 002](adr/002-containerization.md) for the containerization rationale.

## Repository layout

```
harness/
├── src/harness/          # backend package
├── tests/                # pytest
├── frontend/             # Vite + React + TS
└── docs/ai/
    ├── architecture.md   # (this file)
    └── adr/              # Architecture Decision Records
```

## Decision pointers

- [ADR 001](adr/archive/001-tech-stack.md) — Tech stack (FastAPI, React, SQLite, self-implemented auth, asdf + uv + pnpm)
- [ADR 002](adr/002-containerization.md) — Dev native; deploy containerized; hosting target remains open
- [ADR 003](adr/archive/003-ui-foundations.md) — UI foundations (shadcn/ui + Tailwind v4 + react-hook-form + zod, lightweight-charts, Tremor Raw, AppShell, dark mode default)
- [ADR 004](adr/004-mvp-scope.md) — Day-trade decision dashboard (swap-based primary, markets overview strip, click-to-swap watchlist, setup + rule + macro overlays, user-initiated AI chat)

## Hard constraints

- No investment-advisory features (legal risk)
- No automated trading — journaling, analysis, and notifications only
- Public repository — no PII, no broker/device/messaging-app names
- Frontend logic split into a unit-testable layer and a renderer (renderer is not unit-tested)
