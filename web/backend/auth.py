from __future__ import annotations

import hashlib
import hmac
import secrets


PASSWORD_ITERATIONS = 240_000
SESSION_COOKIE = "tradingagents_session"


def new_salt() -> str:
    return secrets.token_hex(16)


def hash_password(password: str, salt: str) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), PASSWORD_ITERATIONS)
    return digest.hex()


def verify_password(password: str, salt: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_password(password, salt), stored_hash)


def new_session_token() -> str:
    return secrets.token_urlsafe(40)


def session_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
