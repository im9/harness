# Harness

Personal analysis tool for Japanese/US equities, FX, Nikkei futures, and mutual funds.
Designed to curb impulsive trading and enforce rule-based decision-making.

Future extensions: crude oil, CFDs, and other derivatives.

## Setup

After cloning, enable the pre-push hook (lint + test):

```sh
git config core.hooksPath .githooks
```

## Mandatory Workflow — 4 Gates

Must not skip or reorder.

### Gate 0 — Read before doing

Read relevant ADRs in `docs/ai/adr/` and check INDEX.md before implementation.

### Gate 1 — Tests first (TDD)

Write or update tests BEFORE editing implementation code.
Every numeric threshold in a test assertion must have a derivation comment
(physics formula, specification value, or user-experience requirement).
"Observed value from running the code" is not a justification.

### Gate 2 — Implement

Keep changes minimal and focused. Do not add features beyond what was asked.

### Gate 3 — Build and test

All tests must pass before proceeding.

## Conventions

- All documentation in English
- Conversation may be in Japanese
- ADRs live in `docs/ai/adr/` with an INDEX.md
- Imperative commit messages
- Never commit without explicit user approval
- Measure before fixing — when a bug is reported, write a diagnostic first

## Architecture

```
harness/
├── docs/
│   └── ai/
│       └── adr/        # Architecture Decision Records
│       └── INDEX.md
├── src/                 # Application code
├── tests/               # Tests
├── CLAUDE.md
└── README.md
```

## Privacy

- Public repository — do not include any personally identifiable information
- No references to specific broker names, device types, or messaging apps used by the author
- Keep ADRs and docs generic (e.g., "messaging app integration" not "LINE")

## Constraints

- No investment advisory features (legal risk)
- No automated trading — analysis, notifications, and record-keeping only
- Split UI into logic layer (unit-testable) and renderer (not unit-tested)
