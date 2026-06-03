from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time


PASSWORD_ITERATIONS = 240_000
SESSION_COOKIE = "tradingagents_session"

# Login rate limiting. Five wrong passwords within the window locks the
# username for ``LOCKOUT_SECONDS``; legitimate users can recover by
# waiting (or by an admin resetting their password).
FAILED_LOGIN_WINDOW_SECONDS = 300
FAILED_LOGIN_LIMIT = 5
LOCKOUT_SECONDS = 900


class FailedLoginTracker:
    def __init__(self) -> None:
        self._attempts: dict[str, list[float]] = {}
        self._locked_until: dict[str, float] = {}
        self._lock = threading.Lock()

    def allow(self, username: str) -> bool:
        now = time.time()
        with self._lock:
            locked = self._locked_until.get(username)
            if locked and locked > now:
                return False
            if locked and locked <= now:
                self._locked_until.pop(username, None)
                self._attempts.pop(username, None)
            return True

    def record_failure(self, username: str) -> None:
        now = time.time()
        with self._lock:
            attempts = [t for t in self._attempts.get(username, []) if now - t <= FAILED_LOGIN_WINDOW_SECONDS]
            attempts.append(now)
            self._attempts[username] = attempts
            if len(attempts) >= FAILED_LOGIN_LIMIT:
                self._locked_until[username] = now + LOCKOUT_SECONDS

    def record_success(self, username: str) -> None:
        with self._lock:
            self._attempts.pop(username, None)
            self._locked_until.pop(username, None)


_FAILED_LOGIN_TRACKER: FailedLoginTracker | None = None
_FAILED_LOGIN_TRACKER_LOCK = threading.Lock()


def get_failed_login_tracker() -> FailedLoginTracker:
    global _FAILED_LOGIN_TRACKER
    if _FAILED_LOGIN_TRACKER is None:
        with _FAILED_LOGIN_TRACKER_LOCK:
            if _FAILED_LOGIN_TRACKER is None:
                _FAILED_LOGIN_TRACKER = FailedLoginTracker()
    return _FAILED_LOGIN_TRACKER


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
