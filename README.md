# Harness

Personal trading analysis tool for Japanese/US equities, FX, Nikkei futures, and mutual funds.

Harness helps curb impulsive trading by enforcing rule-based decision-making through analysis, notifications, and trade journaling.

## Features (planned)

- Trading rule definition and signal notifications
- Entry/exit logging and retrospective review
- Technical indicator dashboard
- Push notifications (pluggable: LINE, Slack, etc.)

## Development

- ADR-driven: design decisions recorded in `docs/ai/adr/`
- TDD: test-first development
- See [CLAUDE.md](CLAUDE.md) for full development workflow

### Running the dev servers

Backend (FastAPI) listens on `:8787`, frontend (Vite) on `:5787`. Open the
Vite URL in the browser; `/api/*` requests are proxied to the backend.

```sh
make dev-up      # start both in the background; logs in .dev/*.log
make dev-status  # show which ports are listening
make dev-logs    # tail both logs (Ctrl-C to exit)
make dev-down    # stop both
```

Or run them directly in separate terminals:

```sh
uv run harness dev         # backend (override with HOST / PORT env)
pnpm -C frontend dev       # frontend
```

## Disclaimer

This tool is for personal investment analysis only and does not constitute investment advice. All trading decisions are made at your own risk. The author assumes no responsibility for any losses arising from the use of this software.
