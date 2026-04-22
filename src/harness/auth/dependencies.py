"""FastAPI dependencies for authenticated routes.

``current_user`` reads the access-token cookie, verifies the JWT, and returns
the owning User. Any failure (missing cookie, bad JWT, unknown user) collapses
to HTTP 401; callers do not distinguish causes to avoid leaking an oracle on
which part of the token went wrong.
"""

import jwt
from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from harness.auth.access_token import verify_access_token
from harness.auth.cookies import ACCESS_COOKIE
from harness.db import get_session
from harness.models import User

_UNAUTHENTICATED = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthenticated")


async def current_user(
    access_token: str | None = Cookie(default=None, alias=ACCESS_COOKIE),
    session: AsyncSession = Depends(get_session),
) -> User:
    if access_token is None:
        raise _UNAUTHENTICATED
    try:
        user_id = verify_access_token(access_token)
    except (jwt.PyJWTError, ValueError):
        # PyJWTError covers expired, invalid signature, malformed, alg=none.
        # ValueError guards against a non-integer sub claim.
        raise _UNAUTHENTICATED from None

    user = await session.get(User, user_id)
    if user is None:
        # The JWT verified but its sub points at a deleted user — treat the
        # session as dead rather than crashing with a 500.
        raise _UNAUTHENTICATED
    return user
