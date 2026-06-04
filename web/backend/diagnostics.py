# web/backend/diagnostics.py
# Client-side error reporting endpoint. React's ErrorBoundary and the
# global window error / unhandledrejection listeners in main.tsx POST
# here when the browser hits an uncaught exception. We log to the
# server's normal logger so an operator can `tail -f` the uvicorn
# output and see exactly what crashed on the client. The endpoint
# accepts anonymous reports (no auth required) because a crashing
# client may not have a valid session.
#
# This router is intentionally small and side-effect free. It must
# never raise (a 500 from the diagnostic endpoint would itself be
# reported back and create a loop). All exceptions are swallowed
# and the request still returns ok=True.

from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])
log = logging.getLogger("webui.client_diagnostics")


class ClientErrorReport(BaseModel):
    message: str = Field(..., max_length=4000)
    stack: str = Field(default="", max_length=8000)
    componentStack: str = Field(default="", max_length=8000)
    url: str = Field(..., max_length=2000)
    userAgent: str = Field(default="", max_length=2000)
    timestamp: str = Field(..., max_length=64)


@router.post("/client-error")
async def receive_client_error(report: ClientErrorReport, request: Request) -> dict:
    try:
        client = request.client
        client_host = client.host if client else "unknown"
        log.error(
            "client error from %s at %s: %s | stack: %s | componentStack: %s",
            client_host,
            report.url,
            report.message,
            report.stack,
            report.componentStack,
        )
    except Exception:
        # Never let a diagnostic endpoint raise.
        pass
    return {"ok": True}


def configure_diagnostics_logging() -> None:
    """Ensure the diagnostics logger emits at ERROR level even if the
    root logger is configured more conservatively. Call once at app
    startup from app.py."""
    if not log.handlers:
        handler = logging.StreamHandler()
        handler.setLevel(logging.ERROR)
        handler.setFormatter(
            logging.Formatter("%(asctime)s [%(name)s] %(levelname)s: %(message)s")
        )
        log.addHandler(handler)
    log.setLevel(logging.ERROR)
    log.propagate = True


__all__ = [
    "router",
    "configure_diagnostics_logging",
    "ClientErrorReport",
]
