from __future__ import annotations

import asyncio
import json
import queue
import os
from pathlib import Path
from typing import AsyncIterator

from dotenv import load_dotenv
from fastapi import Cookie, Depends, FastAPI, HTTPException, Query, Response
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from requests import RequestException

from .auth import SESSION_COOKIE
from .backtesting import BacktestEngine, BacktestScheduler
from .constants import metadata_payload
from .model_discovery import fetch_provider_models
from .runner import RunManager
from .schemas import (
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
run_manager = RunManager(storage)
backtest_scheduler = BacktestScheduler(storage)

app = FastAPI(title="TradingAgents Web API", version="0.1.0")
backtest_scheduler.start()


def _cookie_secure() -> bool:
    return os.getenv("TRADINGAGENTS_SECURE_COOKIES", "0").lower() in {"1", "true", "yes"}


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        secure=_cookie_secure(),
        samesite="lax",
        max_age=60 * 60 * 24 * 14,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", samesite="lax")


def current_user(session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE)) -> UserPublic:
    user = storage.get_user_for_session(session_token)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return user


def admin_user(user: UserPublic = Depends(current_user)) -> UserPublic:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required.")
    return user


def user_run_config(request: RunRequest, user: UserPublic) -> RunRequest:
    if user.role == "admin" or request.config is None:
        return request
    defaults = storage.load_config()
    allowed = {
        "ticker": request.ticker,
        "analysis_date": request.analysis_date,
        "stock_market": request.config.stock_market,
        "analysts": request.config.analysts,
        "research_depth": request.config.research_depth,
    }
    return RunRequest(
        ticker=request.ticker,
        analysisDate=request.analysis_date,
        config=defaults.model_copy(update=allowed),
    )


def user_batch_config(request: BatchRunRequest, user: UserPublic) -> BatchRunRequest:
    if user.role == "admin" or request.config is None:
        return request
    defaults = storage.load_config()
    return BatchRunRequest(
        tickers=request.tickers,
        analysisDate=request.analysis_date,
        config=defaults.model_copy(
            update={
                "ticker": request.tickers[0],
                "analysis_date": request.analysis_date,
                "stock_market": request.config.stock_market,
                "analysts": request.config.analysts,
                "research_depth": request.config.research_depth,
            }
        ),
    )


def backtest_record_payload(record: BacktestRecord) -> dict:
    return record.model_dump(mode="json", by_alias=True, exclude={"price_bars"})


def backtest_records_payload(records: list[BacktestRecord], skipped_completed: int = 0) -> dict:
    return {
        "records": [backtest_record_payload(record) for record in records],
        "skippedCompleted": skipped_completed,
    }


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


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
def admin_update_user(user_id: str, request: AdminUserUpdate, _: UserPublic = Depends(admin_user)) -> dict:
    user = storage.update_user(user_id, request)
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
def get_config(_: UserPublic = Depends(current_user)) -> dict:
    return storage.load_config().model_dump(mode="json", by_alias=True)


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
def get_backtest_config(_: UserPublic = Depends(current_user)) -> dict:
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
async def get_run_events(run_id: str, user: UserPublic = Depends(current_user)) -> StreamingResponse:
    run = run_manager.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    if user.role != "admin" and run.user_id != user.id:
        raise HTTPException(status_code=403, detail="Run does not belong to this user.")

    async def stream() -> AsyncIterator[str]:
        cursor = 0
        while True:
            while cursor < len(run.events):
                event = run.events[cursor]
                cursor += 1
                yield f"event: {event['type']}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"
            if run.status in {"succeeded", "failed", "cancelled"}:
                break
            try:
                event = await asyncio.to_thread(run.event_queue.get, True, 2)
            except queue.Empty:
                yield ": heartbeat\n\n"
                continue
            if event["id"] <= cursor:
                continue
            cursor = event["id"]
            yield f"event: {event['type']}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


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
