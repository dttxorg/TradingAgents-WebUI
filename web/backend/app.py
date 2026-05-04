from __future__ import annotations

import asyncio
import json
import queue
from pathlib import Path
from typing import AsyncIterator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from requests import RequestException

from .constants import metadata_payload
from .model_discovery import fetch_provider_models
from .runner import RunManager
from .schemas import BatchRunRequest, BatchRunResponse, ModelFetchRequest, RunListResponse, RunRequest, SecretsUpdate, WebConfig
from .storage import WebStorage


load_dotenv()
load_dotenv(".env.enterprise", override=False)

storage = WebStorage()
storage.load_secrets_into_env()
run_manager = RunManager(storage)

app = FastAPI(title="TradingAgents Web API", version="0.1.0")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/metadata")
def get_metadata() -> dict:
    return metadata_payload()


@app.get("/api/config")
def get_config() -> dict:
    return storage.load_config().model_dump(mode="json", by_alias=True)


@app.put("/api/config")
def put_config(config: WebConfig) -> dict:
    saved = storage.save_config(config)
    return saved.model_dump(mode="json", by_alias=True)


@app.get("/api/secrets/status")
def get_secret_status() -> dict:
    return {
        key: value.model_dump(mode="json", by_alias=True)
        for key, value in storage.secret_status().items()
    }


@app.put("/api/secrets")
def put_secrets(update: SecretsUpdate) -> dict:
    return {
        key: value.model_dump(mode="json", by_alias=True)
        for key, value in storage.save_secrets(update.values).items()
    }


@app.post("/api/models/fetch")
def fetch_models(request: ModelFetchRequest) -> dict:
    try:
        return fetch_provider_models(request, storage.load_secrets()).model_dump(mode="json", by_alias=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Model provider request failed: {exc}") from exc


@app.post("/api/runs")
def create_run(request: RunRequest) -> dict:
    run = run_manager.create_run(request)
    return run.info().model_dump(mode="json", by_alias=True)


@app.post("/api/runs/batch")
def create_batch_runs(request: BatchRunRequest) -> dict:
    runs = run_manager.create_batch_runs(request)
    return BatchRunResponse(runs=[run.info() for run in runs]).model_dump(mode="json", by_alias=True)


@app.get("/api/runs")
def list_runs(active_only: bool = Query(default=False, alias="activeOnly"), limit: int = Query(default=100, ge=1, le=200)) -> dict:
    runs = run_manager.list_runs(active_only=active_only, limit=limit)
    return RunListResponse(runs=[run.info() for run in runs]).model_dump(mode="json", by_alias=True)


@app.post("/api/runs/{run_id}/cancel")
def cancel_run(run_id: str) -> dict:
    run = run_manager.cancel_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    return run.info().model_dump(mode="json", by_alias=True)


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> dict:
    run = run_manager.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    return run.info().model_dump(mode="json", by_alias=True)


@app.get("/api/runs/{run_id}/reports")
def get_run_reports(run_id: str) -> dict:
    run = run_manager.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    return run.report_payload().model_dump(mode="json", by_alias=True)


@app.get("/api/reports/history")
def list_report_history(limit: int = Query(default=50, ge=1, le=200)) -> dict:
    return storage.list_report_history(limit=limit).model_dump(mode="json", by_alias=True)


@app.get("/api/reports/history/{run_id}")
def get_report_history(run_id: str) -> dict:
    archive = storage.load_report_history(run_id)
    if archive is None:
        raise HTTPException(status_code=404, detail="Historical report not found.")
    return archive.model_dump(mode="json", by_alias=True)


@app.get("/api/runs/{run_id}/events")
async def get_run_events(run_id: str) -> StreamingResponse:
    run = run_manager.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")

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
