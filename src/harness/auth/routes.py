"""HTTP routes for authentication: login, refresh, logout, me.

Transport, cookie attributes, and rotation semantics: ADR 001 §Authentication
and §Token strategy. Any login failure collapses to a single 401 response so
the attacker cannot distinguish wrong-password from wrong-totp from
unknown-user (oracle prevention).
"""

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from harness.auth.access_token import issue_access_token
from harness.auth.cookies import (
    REFRESH_COOKIE,
    clear_auth_cookies,
    set_access_cookie,
    set_refresh_cookie,
)
from harness.auth.dependencies import current_user
from harness.auth.password import verify_password
from harness.auth.refresh_token import (
    InvalidRefreshToken,
    issue,
    revoke_family,
    rotate_with_user,
)
from harness.auth.totp import verify_totp
from harness.db import get_session
from harness.models import User

router = APIRouter(prefix="/api")

_LOGIN_FAILED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials"
)
_INVALID_REFRESH = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid refresh token"
)


class LoginRequest(BaseModel):
    username: str
    password: str
    totp_code: str


class LoginResponse(BaseModel):
    username: str


class MeResponse(BaseModel):
    id: int
    username: str


@router.post("/auth/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> LoginResponse:
    user = (
        await session.execute(select(User).where(User.username == body.username))
    ).scalar_one_or_none()

    # user / password / totp are checked in that order but all three failure
    # modes collapse to the same 401 to prevent an attacker from distinguishing
    # which factor was wrong.
    if user is None or not verify_password(user.password_hash, body.password):
        raise _LOGIN_FAILED
    if not verify_totp(user.totp_secret, body.totp_code):
        raise _LOGIN_FAILED

    refresh = await issue(session, user.id)
    access = issue_access_token(user.id)
    await session.commit()

    set_access_cookie(response, access)
    set_refresh_cookie(response, refresh)
    return LoginResponse(username=user.username)


@router.post("/auth/refresh")
async def refresh(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if refresh_token is None:
        raise _INVALID_REFRESH
    try:
        user_id, new_refresh = await rotate_with_user(session, refresh_token)
    except InvalidRefreshToken:
        # rotate() already revoked the family on reuse detection; commit that
        # revocation before raising so it is not rolled back with the session.
        await session.commit()
        raise _INVALID_REFRESH from None

    access = issue_access_token(user_id)
    await session.commit()

    set_access_cookie(response, access)
    set_refresh_cookie(response, new_refresh)
    return {}


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    session: AsyncSession = Depends(get_session),
) -> Response:
    # Logout is idempotent: when called without a cookie (concurrent logout in
    # another tab, expired session) it still clears any residual cookies and
    # returns 204. An error here would surface a confusing failure in the UI.
    if refresh_token is not None:
        try:
            await revoke_family(session, refresh_token)
        except InvalidRefreshToken:
            pass
        await session.commit()

    clear_auth_cookies(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=MeResponse)
async def me(user: User = Depends(current_user)) -> MeResponse:
    return MeResponse(id=user.id, username=user.username)
