"""Print the current TOTP code for the single user in the DB.

Dev convenience: saves the round-trip of looking up the secret and running
pyotp manually every 30 seconds while iterating on the login flow. Reads the
DB location from DATABASE_URL (set in .env and auto-exported by the Makefile).
"""

import asyncio

import pyotp
from sqlalchemy import select

from harness import models  # noqa: F401  # register models on Base.metadata
from harness.db import async_session_maker
from harness.models import User


async def main() -> None:
    async with async_session_maker() as s:
        user = (await s.execute(select(User))).scalar_one()
        print(pyotp.TOTP(user.totp_secret).now())


if __name__ == "__main__":
    asyncio.run(main())
