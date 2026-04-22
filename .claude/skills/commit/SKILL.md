---
name: commit
description: Analyze current changes, run `make check`, generate a commit message, stage relevant files, and commit. Project-local override of the user-global /commit skill.
allowed-tools: Bash, Read
---

# Commit (harness)

Analyze current changes, generate a commit message, stage relevant files,
and commit. The addition over the global skill is step 4: run `make check`
before staging so ruff format / pytest / eslint / vitest drift is caught
before committing, not after the pre-push hook rejects the push.

## Process

1. Run `git diff` (unstaged) and `git diff --cached` (staged) to see all
   changes.
2. Run `git status -u` to see untracked files.
3. Run `git log --oneline -5` to match the repository's commit style.
4. **Run `make check`.** This is the canonical quality gate (ruff check,
   ruff format --check, pytest, eslint, vitest — mirrored by the pre-push
   hook). If it fails, fix the issues first. Never commit code that does
   not pass `make check`: the pre-push hook will reject it and the
   follow-up "fix" commit clutters history.
5. Analyze all changes and draft a commit message.
6. Stage relevant files (`git add` — prefer specific files over `-A`).
7. Create the commit.

## Commit Message Format

- First line: `type: short summary` (under 72 chars)
  - Types: `feat`, `fix`, `refactor`, `style`, `docs`, `chore`
- Blank line, then bullet-point details for non-trivial changes
- End with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- If changes span multiple concerns, use multiple `type:` paragraphs in
  the body
- Write in English (per CLAUDE.md conventions)
- Pass the message via HEREDOC for proper formatting

## Safety

- Never stage files that may contain secrets (.env, credentials, etc.)
  — note that `.env`, `config/harness.yaml`, and `docs/private/` are
  already gitignored; do not attempt to force-add them
- Never use `git add -A` — always add specific files
- Never push to remote — only commit locally

## Why this overrides the global skill

The global `/commit` skill does not run a pre-commit quality gate, so lint
/ format / test drift surfaces only at push time. In this repo that means:
push fails → extra commit to fix → history pollution. `make check` is the
single-source-of-truth gate (also invoked by `.githooks/pre-push`);
running it here deduplicates that work and catches drift at the earliest
moment.
