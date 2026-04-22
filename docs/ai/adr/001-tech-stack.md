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
| Auth | Self-implemented (Argon2id + pyotp + JWT) | Password + TOTP (Google Authenticator). Learning objective. No user registration flow needed — CLI-based initial setup. See [Authentication](#authentication) for details. |

### Authentication

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Password hash | Argon2id via `argon2-cffi` | OWASP 2024 recommendation. Memory-hard, resistant to GPU/ASIC attacks. Default parameters acceptable for single-user scale. |
| TOTP | `pyotp` | De facto standard. Compatible with Google Authenticator / Authy. |
| JWT | `PyJWT` | Minimal, actively maintained. Scope fits single-service needs. |
| Signing algorithm | HS256 (symmetric) | Single service verifies its own tokens. Asymmetric keys add complexity without benefit here. |
| 2FA flow | Password + TOTP verified in one `/login` call, then JWT issued | Single-step is simpler than partial-token → full-token. Acceptable for single user. |
| Signing secret | Env var `HARNESS_JWT_SECRET` (≥32 bytes, random) | Rotating the secret invalidates all issued tokens — acceptable recovery mechanism. |

#### Token strategy

Access + refresh tokens with rotation and reuse detection (OAuth 2.0 pattern).

| Token | Form | TTL | Storage (client) | Storage (server) |
|-------|------|-----|------------------|------------------|
| Access | JWT (HS256) | 15 min | httpOnly + Secure + SameSite=Strict cookie | Stateless (not stored) |
| Refresh | Opaque random string (≥32 bytes) | 7 days | httpOnly + Secure + SameSite=Strict cookie, path=`/auth/refresh` | SQLite, hashed (SHA-256) |

Rules:
- **Rotation**: every `/auth/refresh` call invalidates the presented refresh token and issues a new one in the same family.
- **Reuse detection**: if an already-revoked refresh token is presented, the entire family is revoked — forces re-login on suspected theft.
- **Logout**: revokes the current refresh token family. Access token expires naturally within 15 min.
- **JWT claims**: `sub` (user id), `iat`, `exp`. No `jti` — access tokens are not revoked individually; rely on short TTL.

Refresh token table:

```sql
CREATE TABLE refresh_tokens (
  id          TEXT PRIMARY KEY,        -- random uuid
  user_id     INTEGER NOT NULL,
  token_hash  TEXT NOT NULL,           -- SHA-256 of the token value
  family_id   TEXT NOT NULL,           -- new on login; preserved on rotation
  expires_at  TIMESTAMP NOT NULL,
  revoked_at  TIMESTAMP                -- set on rotation, logout, or reuse detection
);
```

Rationale for choosing the full pattern (vs. access-only with long TTL):
- Learning objective: this is the standard pattern used in production systems; worth implementing end-to-end at least once.
- Revocation: refresh tokens stored server-side enable explicit logout and compromise recovery.
- Short-lived access tokens limit blast radius if a token does leak.

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

Order: build a working local boilerplate, publish the repo and set up a local quality gate (git hooks), then proceed with auth and dev-server integration. CI/CD (build + deploy) is out of scope for this ADR and will be specified alongside the hosting decision in a future ADR.

- [x] `.gitignore`, `.env.example`
- [x] Python project setup (uv, pyproject.toml, FastAPI hello world)
- [x] Test infrastructure: pytest (backend), vitest (frontend)
- [x] React project setup (Vite + React + TypeScript)
- [x] SQLite + SQLAlchemy schema skeleton
- [x] Initial commit (bootstrap scaffold)
- [x] Create GitHub repository (public)
- [x] Push to remote
- [x] Git hooks: `.githooks/pre-push` runs lint + test (native shell, enabled via `git config core.hooksPath .githooks`)
- [x] Auth — password hashing (Argon2id via argon2-cffi)
- [x] Auth — TOTP verification (pyotp)
- [ ] Auth — JWT issue/verify (PyJWT, HS256)
- [ ] Auth — refresh token table + rotation + reuse detection
- [ ] Auth CLI: `harness init-auth` for initial credential setup
- [ ] Dev server wiring: FastAPI serves React SPA
- [ ] Verify on localhost (login → dashboard)

## Consequences

- Two-language stack (Python + TypeScript) adds complexity but plays to each language's strength
- SQLite limits future multi-user scenarios — acceptable since multi-user is out of scope
- Self-implemented auth carries security responsibility — HTTPS via Tailscale mitigates transport-layer risk
- Refresh token rotation + reuse detection adds ~200-300 lines of backend code vs. access-only, but exercises the standard production pattern and enables explicit logout/revocation
- Development starts on localhost; deployment strategy is decoupled and decided later
