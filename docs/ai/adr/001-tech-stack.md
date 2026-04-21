# ADR 001: Tech Stack Selection

## Status

Accepted

## Context

Harness is a personal trading analysis tool covering Japanese/US equities, FX, Nikkei futures, and mutual funds. Current trading decisions are gut-feel based; the tool must enforce rule-based discipline.

Requirements:
- Rich, seamless UI accessible from desktop and mobile browsers
- Real-time-ish dashboard (not sub-millisecond; seconds-level refresh is fine)
- Trade journaling with entry/exit reasoning
- Push notifications (messaging app integration)
- Authentication: password + TOTP (self-implemented for learning purposes)
- Single user

## Decision

### Application

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Backend | Python + FastAPI | Data analysis ecosystem (pandas, yfinance, pandas-ta) is unmatched. FastAPI is lightweight and testable. |
| Frontend | React (SPA) | Rich UI, seamless navigation. Largest ecosystem for charting libraries (recharts, lightweight-charts). |
| Database | SQLite + SQLAlchemy | Single user, no write contention. File-based backup. Migrating to PostgreSQL later requires only a connection string change. |
| Notifications | Pluggable (LINE, Slack, etc.) | Primary notification channel is configurable. |
| Auth | Self-implemented (bcrypt + pyotp + JWT) | Password + TOTP (Google Authenticator). Learning objective. No user registration flow needed — CLI-based initial setup. |

### Infrastructure

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Networking | Tailscale | Encrypted tunnel between devices. No ports exposed to the internet. Free for personal use. |
| HTTPS | Tailscale MagicDNS + auto certs | Provides `https://*.ts.net` with valid certificates. No domain purchase needed. |
| Hosting | **Open question** | Deferred to [ADR 002](002-containerization.md). |

### Open Questions

- **Hosting** and **containerization strategy**: moved to [ADR 002](002-containerization.md). Dev runs natively; Docker is introduced at deploy time. Hosting target is still open.

### Package Management

- Python: uv (fast, modern, replaces pip + venv)
- Node: pnpm (fast, disk-efficient via a content-addressable store; strict peer-dep resolution catches issues npm would hide)

### Repository Layout

```
harness/
├── src/harness/      # Python package (backend)
├── tests/            # pytest (backend)
├── frontend/         # React + Vite + TypeScript app
├── docs/ai/adr/      # Architecture Decision Records
└── pyproject.toml    # Python project config
```

Backend and frontend live side-by-side under one repo. `frontend/` is a dedicated subdirectory so the Node toolchain (`package.json`, `node_modules/`, Vite config) stays isolated from the Python package at `src/harness/`. This keeps CI paths, Dockerfiles, and lint/format configs cleanly separable per language.

### Runtime Version Management

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Version manager | asdf | Already in use for Python globally. Centralizes all runtimes under one tool rather than mixing asdf + Homebrew for similar concerns. |
| uv install path | asdf plugin (`asdf-uv`) | Consistent with the Python toolchain. Pinned per-project via `.tool-versions`. |
| Python version | 3.13 | Matches the developer's asdf global, so no extra version installed. By 2026-Q2, major libs (FastAPI, SQLAlchemy, pandas) support 3.13. `pandas-ta` historically lags on new Python/numpy — acceptable risk; fall back to 3.12 only if it blocks. |
| Node version | 24.x | Matches the developer's asdf global (24.7.0). Current LTS line, full support through Vite 6 / Vitest. |
| pnpm version | 9.x | asdf-managed, pinned per-project. |
| Project pinning | `.tool-versions` | Commits exact Python, uv, Node, and pnpm versions so collaborators/CI use the same stack. |

## Implementation

Order: build a working local boilerplate first, verify on localhost, then push to a new remote.

- [x] `.gitignore`, `.env.example`
- [x] Python project setup (uv, pyproject.toml, FastAPI hello world)
- [x] Test infrastructure: pytest (backend), vitest (frontend)
- [x] React project setup (Vite + React + TypeScript)
- [x] SQLite + SQLAlchemy schema skeleton
- [ ] Auth module: password hash (bcrypt) + TOTP (pyotp) + JWT
- [ ] Auth CLI: `harness init-auth` for initial credential setup
- [ ] Dev server wiring: FastAPI serves React SPA
- [ ] Verify on localhost (login → dashboard)
- [ ] Create GitHub repository (public)
- [ ] Initial commit and push
- [ ] CI: GitHub Actions (lint + test)

## Consequences

- Two-language stack (Python + TypeScript) adds complexity but plays to each language's strength
- SQLite limits future multi-user scenarios — acceptable since multi-user is out of scope
- Self-implemented auth carries security responsibility — HTTPS via Tailscale mitigates transport-layer risk
- Development starts on localhost; deployment strategy is decoupled and decided later
