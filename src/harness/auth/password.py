"""Argon2id password hashing.

Thin wrapper over argon2-cffi's PasswordHasher using library defaults.
Parameter choice rationale: ADR 001 §Authentication.
"""

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(hashed: str, password: str) -> bool:
    try:
        _hasher.verify(hashed, password)
    except VerifyMismatchError:
        return False
    return True
