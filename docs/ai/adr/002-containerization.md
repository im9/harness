# ADR 002: Containerization Strategy

## Status

Accepted

## Context

Development is active on localhost; a deployment target has not yet been chosen. Two orthogonal questions must be answered:

1. Should the backend run in Docker during **development**?
2. Should the backend run in Docker when **deployed**?

The common reason to pick "Docker everywhere" is the reputation that Python breaks due to environment divergence. That reputation is largely rooted in pre-uv tooling (system Python + pip + conda + virtualenv). With the stack chosen in ADR 001:

- `uv` provides managed Python interpreters, `.venv` isolation, and a hash-pinned `uv.lock`
- `.tool-versions` pins Python, uv, Node, and pnpm per project
- C-extension dependencies (pandas, numpy, cryptography) ship prebuilt wheels for macOS arm64 and Linux x86_64

Local-dev reproducibility is therefore already high. What the dev stack does *not* guarantee is **OS parity** between the developer's macOS host and the eventual Linux deployment target — but that only matters at deploy time.

## Decision

### Development — native (no Docker)

- Backend runs via `uv run uvicorn harness.app:app` on the host.
- Frontend runs via `pnpm dev` on the host.
- Rationale:
  - Fast file-watch reload (uvicorn `--reload`, Vite HMR) without bind-mount I/O overhead
  - No Docker Desktop resource cost (~2-4 GB RAM) while iterating
  - uv's reproducibility removes the common motivation for "Docker at dev time"
  - When something breaks at the Python level, it breaks in a readable stack — not inside a container layer

### Deployment — containerized backend, SPA baked in

- Backend ships as a single Docker image.
- Frontend is a static build (`pnpm build`) copied into the backend image; FastAPI serves the built SPA via `StaticFiles`.
- Base image: `python:3.13-slim` with uv installed, multi-stage build (dependency layer separate from app layer to maximize cache reuse).
- SQLite database lives on a mounted volume.
- Rationale:
  - One container = one deploy unit = one volume to persist. Simpler than orchestrating two containers for a single-user tool.
  - OS parity is guaranteed by the image, eliminating "works on my Mac" failures.
  - Portability across hosting platforms (VPS, Fly, Cloud Run, etc.) without rewriting deploy scripts.

### What is explicitly NOT containerized

- The development environment.
- The frontend as a separate container (not worth the operational complexity for a single-user tool).

## Open Questions

### Hosting target

The hosting decision depends on three filters:

1. **Persistent filesystem** — SQLite requires a volume that survives container restarts. Platforms with ephemeral filesystems are effectively ruled out (e.g., Cloud Run without Cloud Storage FUSE).
2. **Always-on vs sleep-on-idle** — notifications and Tailscale access must not pay a multi-second cold start every time.
3. **Cost** — personal project, target is free-tier or ≤1,000 JPY/month.

Candidates:

| Platform | Persistent FS | Always-on | Cost | Notes |
|----------|---------------|-----------|------|-------|
| VPS (Sakura, ConoHa, Lightsail) | Yes | Yes | ~500-1,000 JPY/mo | Full control, docker-compose friendly, most reliable for SQLite |
| Oracle Cloud Free Tier (ARM) | Yes | Yes | Free | Free-tier account stability is the unknown |
| Fly.io | Paid volume | Sleep on free tier | Free/paid | Container-native but cold start hurts Tailscale UX |
| Render | Paid disk | Sleep on free tier | Free/paid | Docker-supported, free tier not viable for SQLite |
| Google Cloud Run | No (stateless) | Scale-to-zero | Pay-per-request | Poor fit for SQLite — would force Cloud SQL migration |

Decision deferred until MVP is functional on localhost and hosting tradeoffs can be evaluated concretely.

### Registry and tag strategy

Likely GHCR (GitHub Container Registry) for tight integration with GitHub Actions CI. Tag strategy (semver vs commit SHA vs `latest`) deferred to the hosting decision.

### Single-container vs compose

If the backend later grows auxiliary services (scheduled-analysis worker, cache), revisit whether `docker-compose.yml` is warranted. For MVP, single-container is sufficient.

## Consequences

- No `Dockerfile` exists during MVP development; it is added when hosting is selected.
- Frontend-backend wiring must work in both modes:
  - **Dev**: Vite dev server on one port, FastAPI on another; Vite dev server proxies API calls to FastAPI.
  - **Deploy**: FastAPI serves the built SPA as static files at `/` and API routes under `/api/*` (or similar).
- The Dockerize step is additive, not a refactor — it bolts onto the existing native-dev layout without reshaping the codebase.
- Hosting platform selection is filtered primarily by persistent-volume support, not by Docker compatibility (essentially every hosting target supports Docker today).
