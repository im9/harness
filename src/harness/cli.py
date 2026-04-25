"""Command-line entry point for harness.

Exposes ``init-auth`` for initial credential setup and ``dev`` for running the
FastAPI dev server, per ADR 001. This module is thin I/O glue; business logic
lives in the modules it delegates to. The wrapper is intentionally kept free of
logic that would warrant tests (ADR 001 §Architecture).
"""

import argparse
import asyncio
import getpass
import os
import sys
from pathlib import Path

from harness import models  # noqa: F401  # register models on Base.metadata
from harness.auth.init import (
    UserAlreadyExistsError,
    UsernameMismatchError,
    init_auth,
)
from harness.db import Base, async_session_maker, engine
from harness.help_import import import_help_yaml


async def _ensure_schema() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def _cmd_init_auth(args: argparse.Namespace) -> int:
    await _ensure_schema()

    username = input("Username: ").strip()
    if not username:
        print("Username must not be empty.", file=sys.stderr)
        return 2

    if args.reset:
        # Confirm destructive intent by re-typing the username; blocks
        # typo-driven credential overwrites from history or muscle memory.
        confirm = input(f"Retype username {username!r} to confirm reset: ").strip()
        if confirm != username:
            print("Confirmation did not match. Aborting.", file=sys.stderr)
            return 2

    password = getpass.getpass("Password: ")
    if not password:
        print("Password must not be empty.", file=sys.stderr)
        return 2
    if getpass.getpass("Confirm password: ") != password:
        print("Passwords did not match.", file=sys.stderr)
        return 2

    try:
        async with async_session_maker() as session:
            uri = await init_auth(session, username, password, reset=args.reset)
    except (UserAlreadyExistsError, UsernameMismatchError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print()
    print("Credentials saved. Register this URI in your authenticator app:")
    print(uri)
    return 0


async def _cmd_help_import(args: argparse.Namespace) -> int:
    await _ensure_schema()

    path = Path(args.path)
    try:
        async with async_session_maker() as session:
            count = await import_help_yaml(session, path)
    except FileNotFoundError:
        print(f"File not found: {path}", file=sys.stderr)
        return 2
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(f"Imported {count} help entries from {path}.")
    return 0


def _cmd_dev(args: argparse.Namespace) -> int:
    # Imported lazily so `harness --help` and `harness init-auth` don't pay
    # the uvicorn import cost.
    import uvicorn

    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8787"))
    uvicorn.run("harness.app:app", host=host, port=port, reload=True)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="harness")
    subs = parser.add_subparsers(dest="cmd", required=True)

    init = subs.add_parser(
        "init-auth",
        help="Create or rotate the single user's credentials.",
    )
    init.add_argument(
        "--reset",
        action="store_true",
        help="Rotate password and TOTP secret of the existing user.",
    )
    init.set_defaults(func=_cmd_init_auth)

    dev = subs.add_parser(
        "dev",
        help="Run the FastAPI dev server with autoreload (reads HOST/PORT from env).",
    )
    dev.set_defaults(func=_cmd_dev)

    help_import = subs.add_parser(
        "help-import",
        help="Upsert help entries from a YAML file (ADR 010 — idempotent by slug).",
    )
    help_import.add_argument(
        "path",
        help="Path to the YAML file (e.g. config/help-entries.yaml).",
    )
    help_import.set_defaults(func=_cmd_help_import)

    args = parser.parse_args(argv)
    if asyncio.iscoroutinefunction(args.func):
        return asyncio.run(args.func(args))
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
