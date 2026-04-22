"""TOTP (RFC 6238) secret generation and verification.

Thin wrapper over pyotp using Google Authenticator-compatible defaults
(30 s step, 6-digit SHA-1). Parameter choice rationale: ADR 001 §Authentication.
"""

from datetime import datetime

import pyotp

# ±1 step window (~±30 s) tolerates normal device clock drift while still
# rejecting replays older/newer than one step. Standard practice for TOTP.
_DRIFT_WINDOW_STEPS = 1


def generate_secret() -> str:
    return pyotp.random_base32()


def verify_totp(secret: str, code: str, for_time: datetime | None = None) -> bool:
    return pyotp.TOTP(secret).verify(code, for_time=for_time, valid_window=_DRIFT_WINDOW_STEPS)
