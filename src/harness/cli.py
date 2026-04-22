"""Command-line entry point for harness.

Currently exposes ``init-auth`` for initial credential setup per ADR 001.
This module is the thin I/O glue around :mod:`harness.auth.init`; the
business logic lives there and is unit-tested. This wrapper is intentionally
kept free of logic that would warrant tests (ADR 001 §Architecture).
"""

import argparse
import asyncio
import getpass
import sys

from harness import models  # noqa: F401  # register models on Base.metadata
from harness.auth.init import (
    UserAlreadyExistsError,
    UsernameMismatchError,
    init_auth,
)
from harness.db import Base, async_session_maker, engine


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

    args = parser.parse_args(argv)
    return asyncio.run(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
