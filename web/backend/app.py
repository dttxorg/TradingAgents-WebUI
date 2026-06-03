from __future__ import annotations

import asyncio
import json
import queue
import os
import shutil
from pathlib import Path
from typing import Any, AsyncIterator

from dotenv import load_dotenv
from fastapi import Cookie, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from requests import RequestException

from .auth import SESSION_COOKIE, get_failed_login_tracker
from .backtesting import BacktestEngine, BacktestScheduler
from .constants import metadata_payload
from .model_discovery import fetch_provider_models
from .runner import RunManager
from .schemas import (
    AnalysisEstimateRequest,
    AnalysisEstimateResponse,
    AdminUserCreate,
    AdminUserUpdate,
    BacktestRecord,
    BacktestRunRequest,
    BacktestScheduleConfig,
    BatchRunRequest,
    BatchRunResponse,
    BootstrapRequest,
    BootstrapStatus,
    LoginRequest,
    ModelFetchRequest,
    PricingConfig,
    RechargeRequest,
    RunListResponse,
    RunRequest,
    SecretsUpdate,
    SessionResponse,
    UserListResponse,
    UserPublic,
    WebConfig,
)
from .storage import WebStorage


load_dotenv()
load_dotenv(".env.enterprise", override=False)

storage = WebStorage()
storage.load_secrets_into_env()
# Refund any analysis order that was preauthorized but never settled
# (e.g. the previous process died between preauth and billing settle).
# This must run before RunManager starts so the storage layer's view of
# frozen balances matches reality.
try:
    storage.reconcile_orphan_orders()
except Exception:
    pass

# Refuse to start under a multi-worker process manager. The RunManager
# stores in-memory state (run queue, worker threads, event queues) and the
# storage layer's RLock only synchronises within a single process. Running
# more than one worker would silently lose runs, double-bill users, and
# leak preauthorized balances. Operators wanting horizontal scale must
# run multiple single-worker instances behind a shared front-end (e.g.
# a load balancer with sticky sessions) and migrate storage to a real
# database first.
if os.getenv("TRADINGAGENTS_REFUSE_MULTI_WORKER", "1") not in {"0", "false", "no"}:
    worker_count_env = os.getenv("WEB_CONCURRENCY") or os.getenv("UVICORN_WORKERS") or ""
    try:
        worker_count = int(worker_count_env) if worker_count_env else 1
    except ValueError:
        worker_count = 1
    if worker_count > 1:
        raise RuntimeError(
            "Refusing to start: TRADINGAGENTS does not support multi-worker"
            " deployments. Run a single uvicorn worker and replicate at the"
            " load-balancer layer once storage is migrated to a shared backend."
        )

run_manager = RunManager(storage)
backtest_scheduler = BacktestScheduler(storage)

app = FastAPI(
    title="TradingAgents Web API",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.on_event("startup")
def _on_startup() -> None:
    # Start the backtest scheduler as part of FastAPI's startup hook so
    # that tests importing this module do not eagerly spawn threads.
    backtest_scheduler.start()


@app.on_event("shutdown")
def _on_shutdown() -> None:
    backtest_scheduler.stop()


SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "font-src 'self' data:; "
        "connect-src 'self'; "
        "base-uri 'self'; "
        "form-action 'self'; "
        "frame-ancestors 'none'"
    ),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    for key, value in SECURITY_HEADERS.items():
        response.headers.setdefault(key, value)
    if request.url.scheme == "https" or os.getenv("TRADINGAGENTS_ENABLE_HSTS", "0").lower() in {"1", "true", "yes"}:
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


def _cookie_secure_default() -> bool:
    """Cookie ``secure`` flag should follow the request scheme in production.

    Operators can still force-disable via ``TRADINGAGENTS_SECURE_COOKIES=0``
    for local plain-HTTP development. The default used to be ``False``,
    which silently downgraded cookies to plain HTTP when an HTTPS reverse
    proxy was misconfigured.
    """
    override = os.getenv("TRADINGAGENTS_SECURE_COOKIES")
    if override is not None:
        return override.lower() in {"1", "true", "yes"}
    return os.getenv("TRADINGAGENTS_HTTPS", "0").lower() in {"1", "true", "yes"}


_COOKIE_SECURE = _cookie_secure_default()


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite="lax",
        max_age=60 * 60 * 24 * 14,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", samesite="lax", secure=_COOKIE_SECURE)


def current_user(session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE)) -> UserPublic:
    user = storage.get_user_for_session(session_token)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return user


def admin_user(user: UserPublic = Depends(current_user)) -> UserPublic:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required.")
    return user


def visible_config(config: WebConfig, user: UserPublic) -> WebConfig:
    if user.role == "admin":
        return config
    sanitized = config.model_copy(deep=True)
    sanitized.backend_url = None
    for route in sanitized.llm_routes.values():
        route.backend_url = None
    for settings in sanitized.custom_data_interfaces.values():
        settings.base_url = None
        settings.endpoints = {}
    for override in sanitized.market_data_overrides.values():
        for settings in override.custom_data_interfaces.values():
            settings.base_url = None
            settings.endpoints = {}
    return sanitized


def user_run_config(request: RunRequest, user: UserPublic) -> RunRequest:
    if user.role == "admin":
        return request
    # Sub-accounts must never receive admin-only fields (backend_url, custom_data
    # base URLs, internal LLM route endpoints, etc.). Strip them via
    # visible_config so the runner cannot leak them into runtime_config.
    defaults = visible_config(storage.load_config(), user)
    # Caller-supplied config is ignored for sub-accounts: we always start from
    # the (sanitized) admin defaults and overlay only the fields sub-accounts
    # are allowed to influence.
    user_fields: dict[str, Any] = {
        "ticker": request.ticker,
        "analysis_date": request.analysis_date,
    }
    if request.config is not None:
        user_fields["stock_market"] = request.config.stock_market
        user_fields["analysts"] = request.config.analysts
        user_fields["research_depth"] = request.config.research_depth
        user_fields["output_language"] = request.config.output_language
        # Sub-accounts may switch between providers, but only to ones already
        # configured for the admin (avoid letting users route to a different
        # endpoint than the admin set up).
        if (
            request.config.llm_provider
            and request.config.llm_provider in defaults.llm_provider
        ):
            user_fields["llm_provider"] = request.config.llm_provider
    return RunRequest(
        ticker=request.ticker,
        analysisDate=request.analysis_date,
        config=defaults.model_copy(update=user_fields),
    )


def user_batch_config(request: BatchRunRequest, user: UserPublic) -> BatchRunRequest:
    if user.role == "admin":
        return request
    defaults = visible_config(storage.load_config(), user)
    user_fields: dict[str, Any] = {
        "ticker": request.tickers[0],
        "analysis_date": request.analysis_date,
    }
    if request.config is not None:
        user_fields["stock_market"] = request.config.stock_market
        user_fields["analysts"] = request.config.analysts
        user_fields["research_depth"] = request.config.research_depth
        user_fields["output_language"] = request.config.output_language
        if (
            request.config.llm_provider
            and request.config.llm_provider in defaults.llm_provider
        ):
            user_fields["llm_provider"] = request.config.llm_provider
    return BatchRunRequest(
        tickers=request.tickers,
        analysisDate=request.analysis_date,
        config=defaults.model_copy(update=user_fields),
    )


def backtest_record_payload(record: BacktestRecord) -> dict:
    return record.model_dump(mode="json", by_alias=True, exclude={"price_bars"})


def backtest_records_payload(records: list[BacktestRecord], skipped_completed: int = 0) -> dict:
    return {
        "records": [backtest_record_payload(record) for record in records],
        "skippedCompleted": skipped_completed,
    }


@app.get("/api/health")
def health() -> dict:
    root = storage.root
    disk = shutil.disk_usage(root)
    users_ok = storage.users_path.exists()
    checks = {
        "storage": {"status": "ok" if root.exists() else "error", "path": str(root)},
        "users": {"status": "ok" if users_ok else "empty"},
        "queue": {"status": "ok", "pending": run_manager.pending.qsize()},
        "disk": {
            "status": "ok" if disk.free > 250 * 1024 * 1024 else "warn",
            "freeBytes": disk.free,
        },
        "apiKeys": {
            "status": "ok",
            "configuredCount": sum(1 for item in storage.secret_status().values() if item.configured),
        },
    }
    status = "ok" if all(check["status"] != "error" for check in checks.values()) else "error"
    return {"status": status, "checks": checks}


@app.get("/docs", include_in_schema=False)
@app.get("/redoc", include_in_schema=False)
@app.get("/openapi.json", include_in_schema=False)
def public_api_docs_disabled() -> None:
    raise HTTPException(status_code=404, detail="API documentation is not public.")


@app.get("/api/admin/openapi.json", include_in_schema=False)
def admin_openapi(_: UserPublic = Depends(admin_user)) -> dict:
    return app.openapi()


@app.get("/api/auth/bootstrap/status")
def bootstrap_status() -> dict:
    return BootstrapStatus(required=not storage.users_exist()).model_dump(mode="json", by_alias=True)


@app.post("/api/auth/bootstrap")
def bootstrap_admin(request: BootstrapRequest, response: Response) -> dict:
    try:
        user = storage.create_bootstrap_admin(
            request.username,
            request.password,
            request.display_name,
            request.initial_balance,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    set_session_cookie(response, storage.create_session(user.id))
    return SessionResponse(user=user).model_dump(mode="json", by_alias=True)


@app.post("/api/auth/login")
def login(request: LoginRequest, response: Response) -> dict:
    username_key = request.username.strip().lower()
    if not get_failed_login_tracker().allow(username_key):
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts. Try again later.",
        )
    user = storage.authenticate_user(request.username, request.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    set_session_cookie(response, storage.create_session(user.id))
    return SessionResponse(user=user).model_dump(mode="json", by_alias=True)


@app.post("/api/auth/logout")
def logout(response: Response, session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE)) -> dict[str, str]:
    storage.delete_session(session_token)
    clear_session_cookie(response)
    return {"status": "ok"}


@app.get("/api/auth/me")
def me(user: UserPublic = Depends(current_user)) -> dict:
    return SessionResponse(user=user).model_dump(mode="json", by_alias=True)


@app.get("/api/billing/pricing/public")
def public_pricing() -> dict:
    return storage.public_pricing().model_dump(mode="json", by_alias=True)


@app.get("/api/billing/orders")
def my_orders(user: UserPublic = Depends(current_user), limit: int = Query(default=100, ge=1, le=500)) -> dict:
    return storage.list_orders(user_id=user.id, limit=limit).model_dump(mode="json", by_alias=True)


@app.get("/api/admin/users")
def admin_list_users(_: UserPublic = Depends(admin_user)) -> dict:
    return UserListResponse(users=storage.list_users()).model_dump(mode="json", by_alias=True)


@app.post("/api/admin/users")
def admin_create_user(request: AdminUserCreate, _: UserPublic = Depends(admin_user)) -> dict:
    try:
        user = storage.create_user(request)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return user.model_dump(mode="json", by_alias=True)


@app.patch("/api/admin/users/{user_id}")
def admin_update_user(
    user_id: str,
    request: AdminUserUpdate,
    actor: UserPublic = Depends(admin_user),
) -> dict:
    try:
        user = storage.update_user(user_id, request, actor_id=actor.id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return user.model_dump(mode="json", by_alias=True)


@app.post("/api/admin/users/{user_id}/recharge")
def admin_recharge_user(user_id: str, request: RechargeRequest, actor: UserPublic = Depends(admin_user)) -> dict:
    try:
        order = storage.create_recharge_order(user_id, request, actor.id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return order.model_dump(mode="json", by_alias=True)


@app.get("/api/admin/billing/pricing")
def admin_get_pricing(_: UserPublic = Depends(admin_user)) -> dict:
    return storage.load_pricing().model_dump(mode="json", by_alias=True)


@app.put("/api/admin/billing/pricing")
def admin_put_pricing(pricing: PricingConfig, _: UserPublic = Depends(admin_user)) -> dict:
    return storage.save_pricing(pricing).model_dump(mode="json", by_alias=True)


@app.get("/api/admin/orders")
def admin_orders(_: UserPublic = Depends(admin_user), limit: int = Query(default=200, ge=1, le=500)) -> dict:
    return storage.list_orders(limit=limit).model_dump(mode="json", by_alias=True)


@app.get("/api/metadata")
def get_metadata() -> dict:
    return metadata_payload()


@app.get("/api/config")
def get_config(user: UserPublic = Depends(current_user)) -> dict:
    return visible_config(storage.load_config(), user).model_dump(mode="json", by_alias=True)


@app.put("/api/config")
def put_config(config: WebConfig, _: UserPublic = Depends(admin_user)) -> dict:
    saved = storage.save_config(config)
    return saved.model_dump(mode="json", by_alias=True)


@app.get("/api/secrets/status")
def get_secret_status(_: UserPublic = Depends(admin_user)) -> dict:
    return {
        key: value.model_dump(mode="json", by_alias=True)
        for key, value in storage.secret_status().items()
    }


@app.post("/api/billing/estimate")
def estimate_analysis(request: AnalysisEstimateRequest, user: UserPublic = Depends(current_user)) -> dict:
    config = request.config if user.role == "admin" else user_run_config(RunRequest(ticker=request.config.ticker, config=request.config), user).config
    pricing = storage.load_pricing()
    per_run_estimate = storage.estimate_analysis_amount(config, pricing)
    per_run_preauth = storage.estimate_preauthorization(config, pricing)
    return AnalysisEstimateResponse(
        currency=pricing.currency,
        runCount=request.run_count,
        estimatedAmount=per_run_estimate * request.run_count,
        preauthorizedAmount=per_run_preauth * request.run_count,
        modelProvider=config.llm_provider,
        quickModel=config.quick_think_llm,
        deepModel=config.deep_think_llm,
        maxParallelRuns=config.max_parallel_runs,
    ).model_dump(mode="json", by_alias=True)


@app.put("/api/secrets")
def put_secrets(update: SecretsUpdate, _: UserPublic = Depends(admin_user)) -> dict:
    return {
        key: value.model_dump(mode="json", by_alias=True)
        for key, value in storage.save_secrets(update.values).items()
    }


@app.post("/api/models/fetch")
def fetch_models(request: ModelFetchRequest, _: UserPublic = Depends(admin_user)) -> dict:
    try:
        return fetch_provider_models(request, storage.load_secrets()).model_dump(mode="json", by_alias=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Model provider request failed: {exc}") from exc


@app.post("/api/runs")
def create_run(request: RunRequest, user: UserPublic = Depends(current_user)) -> dict:
    try:
        run = run_manager.create_run(user_run_config(request, user), user=user)
    except ValueError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc
    return run.info().model_dump(mode="json", by_alias=True)


@app.post("/api/runs/batch")
def create_batch_runs(request: BatchRunRequest, user: UserPublic = Depends(current_user)) -> dict:
    try:
        runs = run_manager.create_batch_runs(user_batch_config(request, user), user=user)
    except ValueError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc
    return BatchRunResponse(runs=[run.info() for run in runs]).model_dump(mode="json", by_alias=True)


@app.get("/api/runs")
def list_runs(
    active_only: bool = Query(default=False, alias="activeOnly"),
    limit: int = Query(default=100, ge=1, le=200),
    user: UserPublic = Depends(current_user),
) -> dict:
    runs = run_manager.list_runs(active_only=active_only, limit=limit, user_id=None if user.role == "admin" else user.id)
    return RunListResponse(runs=[run.info() for run in runs]).model_dump(mode="json", by_alias=True)


@app.post("/api/runs/{run_id}/cancel")
def cancel_run(run_id: str, user: UserPublic = Depends(current_user)) -> dict:
    existing = run_manager.get_run(run_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    if user.role != "admin" and existing.user_id != user.id:
        raise HTTPException(status_code=403, detail="Run does not belong to this user.")
    run = run_manager.cancel_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    return run.info().model_dump(mode="json", by_alias=True)


@app.get("/api/runs/{run_id}")
def get_run(run_id: str, user: UserPublic = Depends(current_user)) -> dict:
    run = run_manager.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    if user.role != "admin" and run.user_id != user.id:
        raise HTTPException(status_code=403, detail="Run does not belong to this user.")
    return run.info().model_dump(mode="json", by_alias=True)


@app.get("/api/runs/{run_id}/reports")
def get_run_reports(run_id: str, user: UserPublic = Depends(current_user)) -> dict:
    run = run_manager.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    if user.role != "admin" and run.user_id != user.id:
        raise HTTPException(status_code=403, detail="Run does not belong to this user.")
    return run.report_payload().model_dump(mode="json", by_alias=True)


@app.get("/api/reports/history")
def list_report_history(limit: int = Query(default=50, ge=1, le=200), user: UserPublic = Depends(current_user)) -> dict:
    return storage.list_report_history(limit=limit, user_id=None if user.role == "admin" else user.id).model_dump(mode="json", by_alias=True)


@app.get("/api/reports/history/{run_id}")
def get_report_history(run_id: str, user: UserPublic = Depends(current_user)) -> dict:
    archive = storage.load_report_history(run_id)
    if archive is None:
        raise HTTPException(status_code=404, detail="Historical report not found.")
    if user.role != "admin" and archive.run.user_id != user.id:
        raise HTTPException(status_code=403, detail="Historical report does not belong to this user.")
    return archive.model_dump(mode="json", by_alias=True)


@app.get("/api/backtests/config")
def get_backtest_config(_: UserPublic = Depends(admin_user)) -> dict:
    return storage.load_backtest_config().model_dump(mode="json", by_alias=True)


@app.put("/api/backtests/config")
def put_backtest_config(config: BacktestScheduleConfig, _: UserPublic = Depends(admin_user)) -> dict:
    return storage.save_backtest_config(config).model_dump(mode="json", by_alias=True)


@app.get("/api/backtests/scheduler")
def get_backtest_scheduler_state(_: UserPublic = Depends(admin_user)) -> dict:
    return storage.load_backtest_scheduler_state()


@app.post("/api/backtests/run")
def run_backtests(request: BacktestRunRequest, user: UserPublic = Depends(current_user)) -> dict:
    engine = BacktestEngine(storage)
    if request.run_id:
        archive = storage.load_report_history(request.run_id)
        if archive is None:
            raise HTTPException(status_code=404, detail="Historical report not found.")
        if user.role != "admin" and archive.run.user_id != user.id:
            raise HTTPException(status_code=403, detail="Historical report does not belong to this user.")
        existing = storage.load_backtest_record(archive.run.id)
        record = engine.run_report(archive)
        return backtest_records_payload(
            [record],
            skipped_completed=1 if existing is not None and existing.status == "completed" else 0,
        )
    response = engine.run_due(limit=request.limit, ticker=request.ticker, user=user)
    return backtest_records_payload(response.records, response.skipped_completed)


@app.get("/api/backtests/records")
def list_backtest_records(
    ticker: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    user: UserPublic = Depends(current_user),
) -> dict:
    records = storage.list_backtest_records(
        ticker=ticker,
        user_id=None if user.role == "admin" else user.id,
        limit=limit,
    ).records
    return {"records": [backtest_record_payload(record) for record in records]}


@app.get("/api/backtests/records/{run_id}")
def get_backtest_record(run_id: str, user: UserPublic = Depends(current_user)) -> dict:
    record = storage.load_backtest_record(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Backtest record not found.")
    if user.role != "admin" and record.user_id != user.id:
        raise HTTPException(status_code=403, detail="Backtest record does not belong to this user.")
    return backtest_record_payload(record)


@app.post("/api/backtests/records/{run_id}/run")
def run_backtest_record(run_id: str, user: UserPublic = Depends(current_user)) -> dict:
    archive = storage.load_report_history(run_id)
    if archive is None:
        raise HTTPException(status_code=404, detail="Historical report not found.")
    if user.role != "admin" and archive.run.user_id != user.id:
        raise HTTPException(status_code=403, detail="Historical report does not belong to this user.")
    record = BacktestEngine(storage).run_report(archive)
    return backtest_record_payload(record)


@app.get("/api/backtests/summary/{ticker}")
def get_backtest_ticker_summary(ticker: str, user: UserPublic = Depends(current_user)) -> dict:
    return storage.backtest_ticker_summary(
        ticker=ticker.upper(),
        user_id=None if user.role == "admin" else user.id,
    ).model_dump(mode="json", by_alias=True)


@app.get("/api/runs/{run_id}/events")
async def get_run_events(
    run_id: str,
    request: Request,
    user: UserPublic = Depends(current_user),
) -> StreamingResponse:
    run = run_manager.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    if user.role != "admin" and run.user_id != user.id:
        raise HTTPException(status_code=403, detail="Run does not belong to this user.")

    # Honor Last-Event-ID so a reconnecting client can resume from where
    # it left off. The browser sends this header automatically when
    # EventSource is told to do so.
    cursor = 0
    last_event_id = request.headers.get("Last-Event-ID")
    if last_event_id:
        try:
            cursor = max(0, int(last_event_id))
        except ValueError:
            cursor = 0

    async def stream() -> AsyncIterator[str]:
        nonlocal cursor
        terminal = {"succeeded", "failed", "cancelled"}
        while True:
            # Drain the events list under the run's emit lock so we never
            # race the worker thread mid-append.
            with run._emit_lock:
                while cursor < len(run.events):
                    event = run.events[cursor]
                    cursor = event["id"] + 1 if "id" in event else cursor + 1
                    yield (
                        f"id: {event['id']}\n"
                        f"event: {event['type']}\n"
                        f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                    )
            if run.status in terminal:
                return
            if await request.is_disconnected():
                return
            try:
                event = await asyncio.to_thread(run.event_queue.get, True, 2)
            except queue.Empty:
                # Heartbeat. If the client vanished between the last
                # yield and now, bail out instead of looping forever.
                if await request.is_disconnected():
                    return
                yield ": heartbeat\n\n"
                continue
            if event["id"] < cursor:
                continue
            cursor = event["id"] + 1
            yield (
                f"id: {event['id']}\n"
                f"event: {event['type']}\n"
                f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            )

    response = StreamingResponse(stream(), media_type="text/event-stream")
    # Disable buffering in case there's a reverse proxy (nginx) in front.
    response.headers["Cache-Control"] = "no-cache"
    response.headers["X-Accel-Buffering"] = "no"
    return response


frontend_dist = Path(__file__).resolve().parents[1] / "frontend" / "dist"
if frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str) -> FileResponse:
        candidate = frontend_dist / full_path
        if full_path and candidate.exists() and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(frontend_dist / "index.html")
