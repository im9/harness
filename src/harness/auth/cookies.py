"""Auth cookie set/clear helpers.

Cookie attributes and scoping: ADR 001 §Token strategy. The refresh cookie is
path-scoped to ``/api/auth`` so it is not attached to non-auth endpoints,
reducing exposure in request logs and proxies.
"""

from fastapi import Response

from harness.auth.access_token import _ACCESS_TTL
from harness.auth.refresh_token import _REFRESH_TTL

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
# Path=/api/auth covers login/refresh/logout in a single scope; see ADR 001
# Implementation checklist for the "slight broadening over /auth/refresh" note.
REFRESH_COOKIE_PATH = "/api/auth"

_ACCESS_MAX_AGE = int(_ACCESS_TTL.total_seconds())
_REFRESH_MAX_AGE = int(_REFRESH_TTL.total_seconds())


def set_access_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=ACCESS_COOKIE,
        value=token,
        max_age=_ACCESS_MAX_AGE,
        path="/",
        httponly=True,
        secure=True,
        samesite="strict",
    )


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        max_age=_REFRESH_MAX_AGE,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=True,
        samesite="strict",
    )


def clear_auth_cookies(response: Response) -> None:
    # Path on delete must match the path used when setting, otherwise the
    # browser treats them as different cookies and the Set-Cookie: Max-Age=0
    # directive does not evict the live cookie.
    response.delete_cookie(key=ACCESS_COOKIE, path="/")
    response.delete_cookie(key=REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)
