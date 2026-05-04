from __future__ import annotations

import time
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import web.backend.app as app_module
from web.backend.app import app
from web.backend.constants import CUSTOM_DATA_VENDOR, CUSTOM_OPENAI_PROVIDER, metadata_payload
from web.backend.custom_data import configure_custom_data_interfaces
from web.backend.model_discovery import fetch_provider_models
from web.backend.runner import RunManager
from web.backend.schemas import ModelFetchRequest, RunInfo, RunReports, RunRequest, WebConfig
from web.backend.storage import WebStorage, mask_secret


def test_metadata_exposes_configurable_catalogs():
    payload = metadata_payload()

    assert any(provider["value"] == "openai" for provider in payload["providers"])
    assert any(provider["value"] == CUSTOM_OPENAI_PROVIDER for provider in payload["providers"])
    assert any(provider["value"] == "moonshot" and provider["apiKeyField"] == "MOONSHOT_API_KEY" for provider in payload["providers"])
    assert any(language["value"] == "Chinese" for language in payload["languages"])
    assert "openai" in payload["models"]
    assert CUSTOM_OPENAI_PROVIDER in payload["models"]
    assert "moonshot" in payload["models"]
    assert payload["dataVendorCategories"]
    assert all(CUSTOM_DATA_VENDOR in category["options"] for category in payload["dataVendorCategories"])
    assert any(method["method"] == "get_news" for method in payload["customDataMethods"])
    assert "CUSTOM_OPENAI_API_KEY" in payload["secretFields"]
    assert "CUSTOM_DATA_API_KEY" in payload["secretFields"]
    assert "MOONSHOT_API_KEY" in payload["secretFields"]


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


def test_storage_persists_report_history(tmp_path):
    storage = WebStorage(tmp_path)
    config = WebConfig(ticker="SPY", analysisDate=date.today(), analysts=["market"], outputLanguage="Chinese")
    run = RunInfo(
        id="11111111-1111-4111-8111-111111111111",
        status="succeeded",
        ticker="SPY",
        analysisDate=date.today(),
        submittedAt=datetime(2026, 5, 1, 8, 0, tzinfo=timezone.utc),
        endedAt=datetime(2026, 5, 1, 8, 5, tzinfo=timezone.utc),
        decision="BUY",
        stats={"llm_calls": 3},
    )
    reports = RunReports(
        runId=run.id,
        reports={"market_report": "Market report"},
        finalReport="# Trading Analysis Report: SPY",
        decision="BUY",
    )

    archive = storage.save_report_history(run, config, reports)
    loaded = storage.load_report_history(run.id)
    history = storage.list_report_history()

    assert archive.schema_version == 1
    assert loaded is not None
    assert loaded.final_report == "# Trading Analysis Report: SPY"
    assert loaded.config.output_language == "Chinese"
    assert history.items[0].run_id == run.id
    assert history.items[0].provider == config.llm_provider
    assert history.items[0].decision == "BUY"
    assert storage.load_report_history("../not-a-run") is None


def test_custom_openai_requires_base_url_and_accepts_model_ids():
    with pytest.raises(ValidationError):
        WebConfig(llmProvider=CUSTOM_OPENAI_PROVIDER, backendUrl=None)

    config = WebConfig(
        llmProvider=CUSTOM_OPENAI_PROVIDER,
        backendUrl=" https://llm.example.com/v1/ ",
        quickThinkLlm=" custom-fast ",
        deepThinkLlm=" custom-deep ",
    )

    assert config.backend_url == "https://llm.example.com/v1"
    assert config.quick_think_llm == "custom-fast"
    assert config.deep_think_llm == "custom-deep"


def test_custom_data_interfaces_validate_selected_categories():
    with pytest.raises(ValidationError):
        WebConfig(dataVendors={"news_data": CUSTOM_DATA_VENDOR})

    config = WebConfig(
        dataVendors={"news_data": CUSTOM_DATA_VENDOR},
        customDataInterfaces={
            "news_data": {
                "baseUrl": " https://data.example.com/api/ ",
                "endpoints": {"get_news": "ticker-news"},
            }
        },
    )

    assert config.data_vendors["news_data"] == CUSTOM_DATA_VENDOR
    assert config.custom_data_interfaces["news_data"].base_url == "https://data.example.com/api"
    assert config.custom_data_interfaces["news_data"].endpoints["get_news"] == "/ticker-news"
    assert config.custom_data_interfaces["news_data"].endpoints["get_global_news"] == "/global-news"

    with pytest.raises(ValidationError):
        WebConfig(
            customDataInterfaces={
                "news_data": {
                    "baseUrl": "https://data.example.com",
                    "endpoints": {"get_stock_data": "/stock"},
                }
            }
        )


def test_custom_data_vendor_posts_to_configured_endpoint(monkeypatch):
    calls = []

    class FakeResponse:
        headers = {"content-type": "application/json"}

        def raise_for_status(self):
            return None

        def json(self):
            return {"data": "custom news payload"}

    def fake_post(url, headers, json, timeout):
        calls.append({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return FakeResponse()

    monkeypatch.setattr("web.backend.custom_data.requests.post", fake_post)

    config = {
        "custom_data_interfaces": {
            "news_data": {
                "baseUrl": "https://data.example.com/api",
                "endpoints": {"get_news": "/ticker-news"},
            }
        }
    }
    configure_custom_data_interfaces(config, "data-secret")

    from tradingagents.dataflows import interface

    result = interface.VENDOR_METHODS["get_news"][CUSTOM_DATA_VENDOR]("SPY", curr_date="2026-05-01")

    assert result == "custom news payload"
    assert calls == [
        {
            "url": "https://data.example.com/api/ticker-news",
            "headers": {"Content-Type": "application/json", "Authorization": "Bearer data-secret"},
            "json": {
                "method": "get_news",
                "args": ["SPY"],
                "kwargs": {"curr_date": "2026-05-01"},
            },
            "timeout": 30,
        }
    ]


def test_model_discovery_fetches_openai_compatible_models(monkeypatch):
    calls = []

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"id": "moonshot-v1-8k"}, {"id": "moonshot-v1-32k"}]}

    def fake_get(url, headers=None, params=None, timeout=None):
        calls.append({"url": url, "headers": headers, "params": params, "timeout": timeout})
        return FakeResponse()

    monkeypatch.setattr("web.backend.model_discovery.requests.get", fake_get)

    response = fetch_provider_models(
        ModelFetchRequest(provider="moonshot", baseUrl="https://api.moonshot.cn/v1"),
        {"MOONSHOT_API_KEY": "moonshot-key"},
    )

    assert [model.value for model in response.models] == ["moonshot-v1-32k", "moonshot-v1-8k"]
    assert calls == [
        {
            "url": "https://api.moonshot.cn/v1/models",
            "headers": {"Authorization": "Bearer moonshot-key"},
            "params": None,
            "timeout": 20,
        }
    ]


def test_model_discovery_requires_saved_secret():
    with pytest.raises(ValueError):
        fetch_provider_models(ModelFetchRequest(provider="moonshot"), {})


def test_model_fetch_endpoint_uses_saved_secret(monkeypatch, tmp_path):
    storage = WebStorage(tmp_path)
    storage.save_secrets({"MOONSHOT_API_KEY": "moonshot-key"})
    monkeypatch.setattr(app_module, "storage", storage)

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"id": "moonshot-v1-8k"}]}

    monkeypatch.setattr("web.backend.model_discovery.requests.get", lambda *args, **kwargs: FakeResponse())
    client = TestClient(app)

    payload = client.post(
        "/api/models/fetch",
        json={"provider": "moonshot", "baseUrl": "https://api.moonshot.cn/v1"},
    ).json()

    assert payload["provider"] == "moonshot"
    assert payload["models"] == [{"label": "moonshot-v1-8k", "value": "moonshot-v1-8k"}]


def test_run_manager_rejects_custom_openai_without_secret(tmp_path):
    storage = WebStorage(tmp_path)
    manager = RunManager(storage)
    request = RunRequest(
        ticker="SPY",
        analysisDate=date.today(),
        config=WebConfig(
            ticker="SPY",
            analysisDate=date.today(),
            analysts=["market"],
            llmProvider=CUSTOM_OPENAI_PROVIDER,
            backendUrl="https://llm.example.com/v1",
            quickThinkLlm="custom-fast",
            deepThinkLlm="custom-deep",
        ),
    )

    run = manager.create_run(request)

    deadline = time.time() + 2
    while run.status not in {"succeeded", "failed"} and time.time() < deadline:
        time.sleep(0.02)

    assert run.status == "failed"
    assert run.error == "CUSTOM_OPENAI_API_KEY is required for custom_openai provider."


def test_health_and_metadata_endpoints():
    client = TestClient(app)

    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/metadata").status_code == 200


def test_report_history_endpoints(monkeypatch, tmp_path):
    storage = WebStorage(tmp_path)
    config = WebConfig(ticker="SPY", analysisDate=date.today(), analysts=["market"])
    run = RunInfo(
        id="22222222-2222-4222-8222-222222222222",
        status="succeeded",
        ticker="SPY",
        analysisDate=date.today(),
        submittedAt=datetime(2026, 5, 1, 8, 0, tzinfo=timezone.utc),
        endedAt=datetime(2026, 5, 1, 8, 5, tzinfo=timezone.utc),
        decision="BUY",
    )
    storage.save_report_history(
        run,
        config,
        RunReports(runId=run.id, reports={"market_report": "Market report"}, finalReport="Final", decision="BUY"),
    )
    monkeypatch.setattr(app_module, "storage", storage)
    client = TestClient(app)

    list_payload = client.get("/api/reports/history").json()
    detail_payload = client.get(f"/api/reports/history/{run.id}").json()

    assert list_payload["items"][0]["runId"] == run.id
    assert detail_payload["finalReport"] == "Final"
    assert client.get("/api/reports/history/not-a-uuid").status_code == 404


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

    history = storage.list_report_history()
    assert history.items[0].run_id == run.id
    assert storage.load_report_history(run.id) is not None
