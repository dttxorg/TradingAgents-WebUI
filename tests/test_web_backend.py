from __future__ import annotations

import time
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from web.backend.app import app
from web.backend.constants import metadata_payload
from web.backend.runner import RunManager
from web.backend.schemas import RunRequest, WebConfig
from web.backend.storage import WebStorage, mask_secret


def test_metadata_exposes_configurable_catalogs():
    payload = metadata_payload()

    assert any(provider["value"] == "openai" for provider in payload["providers"])
    assert any(language["value"] == "Chinese" for language in payload["languages"])
    assert "openai" in payload["models"]
    assert payload["dataVendorCategories"]


def test_web_config_normalizes_ticker_and_rejects_future_date():
    config = WebConfig(ticker=" 0700.hk ", analysisDate=date.today())
    assert config.ticker == "0700.HK"

    with pytest.raises(ValidationError):
        WebConfig(ticker="SPY", analysisDate=date.today() + timedelta(days=1))


def test_storage_masks_and_never_returns_plain_secret(tmp_path):
    storage = WebStorage(tmp_path)
    status = storage.save_secrets({"OPENAI_API_KEY": "sk-test-123456789"})

    assert status["OPENAI_API_KEY"].configured is True
    assert status["OPENAI_API_KEY"].masked == "sk-t...6789"
    assert mask_secret("short") == "sh...t"


def test_health_and_metadata_endpoints():
    client = TestClient(app)

    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/metadata").status_code == 200


def test_run_manager_completes_with_mock_graph(monkeypatch, tmp_path):
    class FakePropagator:
        def create_initial_state(self, ticker, trade_date):
            return {"ticker": ticker, "trade_date": trade_date}

        def get_graph_args(self, callbacks=None):
            return {}

    class FakeCompiledGraph:
        def stream(self, state, **kwargs):
            yield {
                "messages": [],
                "company_of_interest": state["ticker"],
                "trade_date": state["trade_date"],
                "market_report": "Market report",
                "sentiment_report": "",
                "news_report": "",
                "fundamentals_report": "",
                "investment_debate_state": {
                    "bull_history": "",
                    "bear_history": "",
                    "history": "",
                    "current_response": "",
                    "judge_decision": "Research manager decision",
                },
                "trader_investment_plan": "Trading plan",
                "risk_debate_state": {
                    "aggressive_history": "",
                    "conservative_history": "",
                    "neutral_history": "",
                    "history": "",
                    "judge_decision": "Buy",
                },
                "investment_plan": "Investment plan",
                "final_trade_decision": "Buy",
            }

    class FakeMemoryLog:
        def store_decision(self, **kwargs):
            return None

    class FakeTradingAgentsGraph:
        def __init__(self, selected_analysts, config, debug, callbacks):
            self.propagator = FakePropagator()
            self.graph = FakeCompiledGraph()
            self.memory_log = FakeMemoryLog()

        def process_signal(self, value):
            return "BUY"

        def _log_state(self, trade_date, final_state):
            return None

        def _resolve_pending_entries(self, ticker):
            return None

    monkeypatch.setattr("web.backend.runner.TradingAgentsGraph", FakeTradingAgentsGraph)

    storage = WebStorage(tmp_path)
    manager = RunManager(storage)
    request = RunRequest(
        ticker="SPY",
        analysisDate=date.today(),
        config=WebConfig(ticker="SPY", analysisDate=date.today(), analysts=["market"]),
    )
    run = manager.create_run(request)

    deadline = time.time() + 2
    while run.status not in {"succeeded", "failed"} and time.time() < deadline:
        time.sleep(0.02)

    assert run.status == "succeeded"
    assert run.decision == "BUY"
    assert run.reports["market_report"] == "Market report"
    assert run.final_report and "Trading Analysis Report" in run.final_report
