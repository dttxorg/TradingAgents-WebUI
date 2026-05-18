from __future__ import annotations

import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
import requests
from fastapi.testclient import TestClient
from pydantic import ValidationError

import web.backend.app as app_module
from web.backend.app import app
from web.backend.backtesting import BacktestEngine
from web.backend.constants import CUSTOM_DATA_VENDOR, CUSTOM_OPENAI_PROVIDER, metadata_payload
from web.backend.custom_data import configure_custom_data_interfaces
from web.backend.llm_options import apply_deepseek_thinking_kwargs, patched_tradingagents_llm_client_factory
from web.backend.llm_routing import JOIN_INITIAL_ANALYSTS_NODE, join_initial_analysts, parallel_initial_analyst_workflow
from web.backend.markets import format_market_ticker, market_profile_prompt
from web.backend.model_discovery import fetch_provider_models
from web.backend.runner import RunManager, configure_runtime_workflow
from web.backend.schemas import BatchRunRequest, BacktestPriceBar, BacktestScheduleConfig, ModelFetchRequest, PricingConfig, RechargeRequest, RunInfo, RunReports, RunRequest, WebConfig
from web.backend.storage import WebStorage, calculate_analysis_cost, mask_secret, usage_from_stats


def login_test_admin(client: TestClient, storage: WebStorage, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(app_module, "storage", storage)
    response = client.post(
        "/api/auth/bootstrap",
        json={"username": "admin", "password": "password123", "initialBalance": "100.00"},
    )
    assert response.status_code == 200


def test_metadata_exposes_configurable_catalogs():
    payload = metadata_payload()

    assert any(provider["value"] == "openai" for provider in payload["providers"])
    assert any(provider["value"] == CUSTOM_OPENAI_PROVIDER for provider in payload["providers"])
    assert any(provider["value"] == "moonshot" and provider["apiKeyField"] == "MOONSHOT_API_KEY" for provider in payload["providers"])
    assert any(language["value"] == "Chinese" for language in payload["languages"])
    assert any(option["value"] == "disabled" for option in payload["deepseekThinkingModes"])
    assert any(market["key"] == "hk" for market in payload["stockMarkets"])
    assert "openai" in payload["models"]
    assert CUSTOM_OPENAI_PROVIDER in payload["models"]
    assert "moonshot" in payload["models"]
    assert payload["dataVendorCategories"]
    assert all(CUSTOM_DATA_VENDOR in category["options"] for category in payload["dataVendorCategories"])
    assert all(set(category["options"]) == {"yfinance", "alpha_vantage", CUSTOM_DATA_VENDOR} for category in payload["dataVendorCategories"])
    assert any(method["method"] == "get_news" for method in payload["customDataMethods"])
    assert "CUSTOM_OPENAI_API_KEY" in payload["secretFields"]
    assert "CUSTOM_DATA_API_KEY" in payload["secretFields"]
    assert "BACKTEST_DATA_API_KEY" in payload["secretFields"]
    assert "MOONSHOT_API_KEY" in payload["secretFields"]


def test_backend_keeps_longbridge_as_frontend_only_data_preset():
    config = WebConfig()

    assert config.data_vendors == {
        "core_stock_apis": "yfinance",
        "technical_indicators": "yfinance",
        "fundamental_data": "yfinance",
        "news_data": "yfinance",
    }

    with pytest.raises(ValidationError):
        WebConfig(dataVendors={"core_stock_apis": "longbridge_proxy"})

    with pytest.raises(ValidationError):
        WebConfig(toolVendors={"get_stock_data": "longbridge_proxy"})

    with pytest.raises(ValidationError):
        WebConfig(dataVendors={"fundamental_data": "a_share_fundamentals"})

    with pytest.raises(ValidationError):
        WebConfig(marketDataOverrides={"sh": {"dataVendors": {"fundamental_data": "a_share_fundamentals"}}})


def test_market_data_overrides_apply_only_to_selected_market(tmp_path):
    market_overrides = {
        "us": {
            "dataVendors": {"fundamental_data": CUSTOM_DATA_VENDOR},
            "customDataInterfaces": {
                "fundamental_data": {
                    "baseUrl": "https://us-fundamentals.example.com/api",
                    "endpoints": {"get_fundamentals": "/fundamentals"},
                }
            },
        },
        "hk": {
            "toolVendors": {"get_news": CUSTOM_DATA_VENDOR},
            "customDataInterfaces": {
                "news_data": {
                    "baseUrl": "https://hk-news.example.com/api",
                    "endpoints": {"get_news": "/news"},
                }
            },
        },
        "sh": {
            "dataVendors": {"fundamental_data": CUSTOM_DATA_VENDOR},
            "toolVendors": {
                "get_fundamentals": CUSTOM_DATA_VENDOR,
                "get_balance_sheet": CUSTOM_DATA_VENDOR,
                "get_cashflow": CUSTOM_DATA_VENDOR,
                "get_income_statement": CUSTOM_DATA_VENDOR,
            },
            "customDataInterfaces": {
                "fundamental_data": {
                    "baseUrl": "https://ashare.example.com/api",
                    "endpoints": {
                        "get_fundamentals": "/fundamentals",
                        "get_balance_sheet": "/balance-sheet",
                        "get_cashflow": "/cashflow",
                        "get_income_statement": "/income-statement",
                    },
                }
            },
        }
    }
    us_config = WebConfig(stockMarket="us", marketDataOverrides=market_overrides)
    hk_config = WebConfig(stockMarket="hk", marketDataOverrides=market_overrides)
    sh_config = WebConfig(stockMarket="sh", marketDataOverrides=market_overrides)
    storage = WebStorage(tmp_path)

    assert us_config.data_vendors["fundamental_data"] == "yfinance"
    assert us_config.market_data_overrides["sh"].data_vendors["fundamental_data"] == CUSTOM_DATA_VENDOR

    us_runtime = storage.runtime_config(us_config)
    hk_runtime = storage.runtime_config(hk_config)
    sh_runtime = storage.runtime_config(sh_config)

    assert us_runtime["data_vendors"]["fundamental_data"] == CUSTOM_DATA_VENDOR
    assert us_runtime["custom_data_interfaces"]["fundamental_data"]["baseUrl"] == "https://us-fundamentals.example.com/api"
    assert "get_news" not in us_runtime["tool_vendors"]
    assert hk_runtime["data_vendors"]["fundamental_data"] == "yfinance"
    assert hk_runtime["tool_vendors"]["get_news"] == CUSTOM_DATA_VENDOR
    assert hk_runtime["custom_data_interfaces"]["news_data"]["baseUrl"] == "https://hk-news.example.com/api"
    assert sh_runtime["data_vendors"]["fundamental_data"] == CUSTOM_DATA_VENDOR
    assert sh_runtime["tool_vendors"]["get_income_statement"] == CUSTOM_DATA_VENDOR
    assert sh_runtime["custom_data_interfaces"]["fundamental_data"]["baseUrl"] == "https://ashare.example.com/api"
    assert sh_runtime["custom_data_interfaces"]["fundamental_data"]["endpoints"]["get_cashflow"] == "/cashflow"


def test_web_config_normalizes_ticker_and_rejects_future_date():
    config = WebConfig(ticker=" 0700.hk ", analysisDate=date.today())
    assert config.ticker == "0700.HK"

    with pytest.raises(ValidationError):
        WebConfig(ticker="SPY", analysisDate=date.today() + timedelta(days=1))


def test_market_profiles_format_bare_tickers_and_prompt_context():
    us_config = WebConfig(ticker="SPY")
    assert us_config.market_profiles["us"].region == ""
    assert us_config.market_profiles["us"].append_region_suffix is False
    assert format_market_ticker("SPY", us_config) == "SPY"
    assert format_market_ticker("SPY.US", us_config) == "SPY.US"

    no_suffix_config = WebConfig(
        ticker="SPY",
        marketProfiles={"us": {"region": "us", "appendRegionSuffix": False, "weight": "1", "marketProfile": "No-suffix US profile."}},
    )
    assert no_suffix_config.market_profiles["us"].region == "us"
    assert no_suffix_config.market_profiles["us"].append_region_suffix is False
    assert format_market_ticker("SPY", no_suffix_config) == "SPY"
    assert "Region suffix append mode: disabled" in market_profile_prompt("SPY", "SPY", no_suffix_config)

    blank_region_config = WebConfig(
        ticker="SPY",
        marketProfiles={"us": {"region": "", "weight": "1", "marketProfile": "Blank suffix US profile."}},
    )
    assert blank_region_config.market_profiles["us"].region == ""
    assert format_market_ticker("SPY", blank_region_config) == "SPY"

    stale_us_config = WebConfig(
        ticker="SPY",
        marketProfiles={"us": {"region": "us", "appendRegionSuffix": True, "weight": "1", "marketProfile": "Old saved US profile."}},
    )
    assert stale_us_config.market_profiles["us"].append_region_suffix is True
    assert format_market_ticker("SPY", stale_us_config) == "SPY"

    config = WebConfig(
        ticker="0700",
        stockMarket="hk",
        marketProfiles={
            "hk": {
                "region": "hk",
                "weight": "1.35",
                "marketProfile": "HK profile with southbound flow.",
            }
        },
    )

    assert format_market_ticker("0700", config) == "0700.hk"
    assert format_market_ticker("0700.HK", config) == "0700.HK"
    prompt = market_profile_prompt("0700", "0700.hk", config)
    assert "Hong Kong" in prompt
    assert "0700.hk" in prompt
    assert "1.35" in prompt

    with pytest.raises(ValidationError):
        WebConfig(stockMarket="hk", marketProfiles={"hk": {"region": "h.k"}})


def test_storage_masks_and_never_returns_plain_secret(tmp_path):
    storage = WebStorage(tmp_path)
    status = storage.save_secrets({"OPENAI_API_KEY": "sk-test-123456789"})

    assert status["OPENAI_API_KEY"].configured is True
    assert status["OPENAI_API_KEY"].masked == "sk-t...6789"
    assert mask_secret("short") == "sh...t"


def test_storage_reports_environment_secret_status(monkeypatch, tmp_path):
    monkeypatch.setenv("MOONSHOT_API_KEY", "env-moonshot-secret")
    storage = WebStorage(tmp_path)

    status = storage.secret_status()

    assert storage.load_secrets()["MOONSHOT_API_KEY"] == "env-moonshot-secret"
    assert status["MOONSHOT_API_KEY"].configured is True
    assert status["MOONSHOT_API_KEY"].masked == "env-...cret"


def test_auth_bootstrap_login_and_role_permissions(monkeypatch, tmp_path):
    storage = WebStorage(tmp_path)
    monkeypatch.setattr(app_module, "storage", storage)
    client = TestClient(app)

    assert client.get("/api/auth/bootstrap/status").json() == {"required": True}
    bootstrap = client.post(
        "/api/auth/bootstrap",
        json={"username": "admin", "password": "password123", "initialBalance": "25.00"},
    )
    assert bootstrap.status_code == 200
    assert bootstrap.json()["user"]["role"] == "admin"
    assert client.get("/api/auth/me").json()["user"]["balance"] == "25.000000"

    created = client.post(
        "/api/admin/users",
        json={"username": "alice", "password": "password123", "initialBalance": "3.50"},
    )
    assert created.status_code == 200
    assert created.json()["role"] == "user"

    client.post("/api/auth/logout")
    login = client.post("/api/auth/login", json={"username": "alice", "password": "password123"})
    assert login.status_code == 200
    assert client.get("/api/config").status_code == 200
    assert client.get("/api/secrets/status").status_code == 403


def test_billing_preauthorizes_settles_and_recharges(tmp_path):
    storage = WebStorage(tmp_path)
    user = storage.create_bootstrap_admin("admin", "password123", None, Decimal("10.00"))
    config = WebConfig(ticker="SPY", analysisDate=date.today(), analysts=["market"], researchDepth=1)

    billing = storage.preauthorize_analysis(user.id, "11111111-1111-4111-8111-111111111111", config)
    after_hold = storage.get_user(user.id)
    assert billing.status == "preauthorized"
    assert billing.preauthorized_amount == Decimal("0.375000")
    assert after_hold is not None
    assert after_hold.balance == Decimal("9.625000")
    assert after_hold.frozen_balance == Decimal("0.375000")

    settled = storage.settle_analysis_order(
        billing.order_id,
        config,
        {"tokens_in": 1000, "tokens_out": 1000, "llm_calls": 2, "tool_calls": 1},
        "succeeded",
    )
    assert settled is not None
    assert settled.status == "settled"
    assert settled.actual_amount == Decimal("0.006000")
    assert settled.refunded_amount == Decimal("0.369000")
    assert settled.usage.input_tokens == 1000

    after_settle = storage.get_user(user.id)
    assert after_settle is not None
    assert after_settle.balance == Decimal("9.994000")
    assert after_settle.frozen_balance == Decimal("0.000000")

    recharge = storage.create_recharge_order(user.id, RechargeRequest(amount=Decimal("5.00")))
    assert recharge.status == "completed"
    assert storage.get_user(user.id).balance == Decimal("14.994000")  # type: ignore[union-attr]


def test_pricing_supports_per_run_depth_prices():
    pricing = PricingConfig(
        billingMode="per_run",
        fixedRunPrice=Decimal("0.20"),
        fixedPricesByDepth={"1": Decimal("0.10"), "3": Decimal("1.00"), "5": Decimal("2.00")},
    )
    config = WebConfig(ticker="SPY", analysisDate=date.today(), researchDepth=3)
    usage = usage_from_stats({"tokens_in": 500000, "tokens_out": 250000})

    assert calculate_analysis_cost(pricing, config, usage) == Decimal("1.200000")


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


def test_backtest_record_is_one_per_report_and_summarizes_hits(monkeypatch, tmp_path):
    storage = WebStorage(tmp_path)
    config = WebConfig(ticker="SPY", analysisDate=date(2026, 5, 1), analysts=["market"], outputLanguage="Chinese")
    run = RunInfo(
        id="77777777-7777-4777-8777-777777777777",
        status="succeeded",
        ticker="SPY",
        analysisDate=date(2026, 5, 1),
        submittedAt=datetime(2026, 5, 1, 8, 0, tzinfo=timezone.utc),
        endedAt=datetime(2026, 5, 1, 8, 5, tzinfo=timezone.utc),
        decision="BUY",
    )
    storage.save_report_history(
        run,
        config,
        RunReports(
            runId=run.id,
            reports={},
            finalReport=(
                "**最终交易建议：BUY (逢低做多)**\n\n"
                "- **策略**：等待价格回调至 10 日 EMA (约 711) 或 50 日 SMA (约 679) 附近时入场\n"
                "- **止损**：设置在入场价下方 2 倍 ATR (约 18 美元) 或关键支撑位下方\n"
                "- **目标**：第一目标 736 (布林带上轨)，第二目标 745-750\n"
            ),
            decision="BUY",
        ),
    )

    monkeypatch.setattr(
        "web.backend.backtesting.fetch_price_bars",
        lambda ticker, start, end: [
            BacktestPriceBar(date=date(2026, 5, 2), open=720, high=722, low=710, close=715),
            BacktestPriceBar(date=date(2026, 5, 3), open=716, high=738, low=714, close=736),
        ],
    )

    archive = storage.load_report_history(run.id)
    record = BacktestEngine(storage).run_report(archive)  # type: ignore[arg-type]
    second = BacktestEngine(storage).run_report(archive)  # type: ignore[arg-type]
    summary = storage.backtest_ticker_summary("SPY")

    assert record.status == "completed"
    assert record.result.outcome == "target_hit"
    assert record.result.entry_hit is True
    assert record.result.target_hit is True
    assert second.id == record.id
    assert second.resume_count == record.resume_count
    assert summary.total_reports == 1
    assert summary.completed_records == 1
    assert summary.target_hits == 1


def test_backtest_waiting_data_can_resume(monkeypatch, tmp_path):
    storage = WebStorage(tmp_path)
    config = WebConfig(ticker="SPY", analysisDate=date(2026, 5, 1), analysts=["market"])
    run = RunInfo(
        id="88888888-8888-4888-8888-888888888888",
        status="succeeded",
        ticker="SPY",
        analysisDate=date(2026, 5, 1),
        submittedAt=datetime(2026, 5, 1, 8, 0, tzinfo=timezone.utc),
    )
    storage.save_report_history(
        run,
        config,
        RunReports(
            runId=run.id,
            reports={},
            finalReport="Final recommendation: BUY\nEntry: wait for 100\nStop loss: 95\nTargets: 110",
            decision="BUY",
        ),
    )
    archive = storage.load_report_history(run.id)

    monkeypatch.setattr("web.backend.backtesting.fetch_price_bars", lambda ticker, start, end: [])
    waiting = BacktestEngine(storage).run_report(archive)  # type: ignore[arg-type]

    monkeypatch.setattr(
        "web.backend.backtesting.fetch_price_bars",
        lambda ticker, start, end: [BacktestPriceBar(date=date(2026, 5, 2), open=105, high=111, low=99, close=110)],
    )
    resumed = BacktestEngine(storage).run_report(archive)  # type: ignore[arg-type]

    assert waiting.status == "waiting_data"
    assert resumed.status == "completed"
    assert resumed.resume_count == 1
    assert [checkpoint.key for checkpoint in resumed.checkpoints] == [
        "parse_report",
        "fetch_market_data",
        "evaluate_report",
        "finalize_record",
    ]


def test_backtest_custom_price_api_is_dedicated_and_checkpointed(monkeypatch, tmp_path):
    storage = WebStorage(tmp_path)
    storage.save_secrets({"BACKTEST_DATA_API_KEY": "backtest-secret"})
    config = BacktestScheduleConfig(
        priceDataSource="custom",
        customBaseUrl="https://prices.example.com/api",
        customEndpoint="daily",
        reviewWindowDays=10,
    )
    storage.save_backtest_config(config)
    run = RunInfo(
        id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        status="succeeded",
        ticker="SPY",
        analysisDate=date(2026, 5, 1),
        submittedAt=datetime(2026, 5, 1, 8, 0, tzinfo=timezone.utc),
        decision="BUY",
    )
    storage.save_report_history(
        run,
        WebConfig(ticker="SPY", analysisDate=date(2026, 5, 1), analysts=["market"]),
        RunReports(
            runId=run.id,
            reports={},
            finalReport="Final recommendation: BUY\nEntry: wait for 100\nStop loss: 95\nTargets: 110",
            decision="BUY",
        ),
    )
    calls = []

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "bars": [
                    {"date": "2026-05-02", "open": 105, "high": 111, "low": 99, "close": 110},
                ]
            }

    def fake_post(url, headers, json, timeout):
        calls.append({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return FakeResponse()

    monkeypatch.setattr(requests, "post", fake_post)

    record = BacktestEngine(storage).run_report(storage.load_report_history(run.id))  # type: ignore[arg-type]
    expected_end = min(date.today(), date(2026, 5, 1) + timedelta(days=config.review_window_days))

    assert record.status == "completed"
    assert record.result.outcome == "target_hit"
    assert record.result.price_source == "custom"
    assert record.last_checkpoint == "finalize_record"
    assert calls == [
        {
            "url": "https://prices.example.com/api/daily",
            "headers": {"Content-Type": "application/json", "Authorization": "Bearer backtest-secret"},
            "json": {
                "ticker": "SPY",
                "start": "2026-05-01",
                "end": str(expected_end),
                "interval": "1d",
                "purpose": "backtest_observation",
            },
            "timeout": 30,
        }
    ]


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


def test_deepseek_thinking_mode_defaults_persists_and_runtime_config(tmp_path):
    legacy = WebConfig.model_validate({"ticker": "SPY", "analysisDate": str(date.today())})
    assert legacy.deepseek_thinking_mode == "disabled"

    config = WebConfig(
        llmProvider=CUSTOM_OPENAI_PROVIDER,
        backendUrl="https://llm.example.com/v1",
        quickThinkLlm="deepseek-v4-flash",
        deepThinkLlm="deepseek-v4-pro",
        deepseekThinkingMode="disabled",
    )
    storage = WebStorage(tmp_path)
    storage.save_config(config)
    loaded = storage.load_config()
    runtime_config = storage.runtime_config(loaded)

    assert loaded.deepseek_thinking_mode == "disabled"
    assert runtime_config["deepseek_thinking_mode"] == "disabled"
    assert loaded.model_dump(mode="json", by_alias=True)["deepseekThinkingMode"] == "disabled"


def test_deepseek_thinking_kwargs_are_only_added_for_deepseek_targets():
    from tradingagents.llm_clients import openai_client

    config = {"deepseek_thinking_mode": "disabled"}

    patched = apply_deepseek_thinking_kwargs(
        config,
        provider="openrouter",
        model="deepseek-v4-flash",
        base_url="https://gateway.example.com/v1",
        kwargs={"timeout": 30},
    )
    assert patched["extra_body"] == {"thinking": {"type": "disabled"}}
    assert patched["timeout"] == 30
    assert "extra_body" in openai_client._PASSTHROUGH_KWARGS

    regular = apply_deepseek_thinking_kwargs(
        config,
        provider="openrouter",
        model="qwen-max",
        base_url="https://gateway.example.com/v1",
        kwargs={},
    )
    assert "extra_body" not in regular

    default_mode = apply_deepseek_thinking_kwargs(
        {"deepseek_thinking_mode": "default"},
        provider="deepseek",
        model="deepseek-chat",
        base_url="https://api.deepseek.com",
        kwargs={},
    )
    assert "extra_body" not in default_mode


def test_tradingagents_factory_wrapper_injects_deepseek_thinking(monkeypatch):
    from tradingagents.graph import trading_graph as trading_graph_module

    captured = {}

    def fake_create_llm_client(provider, model, base_url=None, **kwargs):
        captured.update({"provider": provider, "model": model, "base_url": base_url, "kwargs": kwargs})
        return object()

    monkeypatch.setattr(trading_graph_module, "create_llm_client", fake_create_llm_client)
    with patched_tradingagents_llm_client_factory({"deepseek_thinking_mode": "disabled"}):
        trading_graph_module.create_llm_client(
            provider="openrouter",
            model="deepseek-v4-pro",
            base_url="https://gateway.example.com/v1",
        )

    assert captured["kwargs"]["extra_body"] == {"thinking": {"type": "disabled"}}


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


def test_tool_vendors_validate_method_level_data_routes(tmp_path):
    config = WebConfig(toolVendors={"get_news": "alpha_vantage"})

    assert config.tool_vendors == {"get_news": "alpha_vantage"}

    storage = WebStorage(tmp_path)
    runtime_config = storage.runtime_config(config)
    assert runtime_config["tool_vendors"] == {"get_news": "alpha_vantage"}

    with pytest.raises(ValidationError):
        WebConfig(toolVendors={"get_unknown": "alpha_vantage"})

    with pytest.raises(ValidationError):
        WebConfig(toolVendors={"get_news": "unsupported_vendor"})


def test_tool_vendor_custom_requires_category_base_url():
    with pytest.raises(ValidationError):
        WebConfig(toolVendors={"get_global_news": CUSTOM_DATA_VENDOR})

    config = WebConfig(
        toolVendors={"get_global_news": CUSTOM_DATA_VENDOR},
        customDataInterfaces={
            "news_data": {
                "baseUrl": "https://data.example.com",
                "endpoints": {"get_global_news": "/global"},
            }
        },
    )

    assert config.tool_vendors["get_global_news"] == CUSTOM_DATA_VENDOR
    assert config.custom_data_interfaces["news_data"].base_url == "https://data.example.com"


def test_a_share_fundamentals_routes_use_custom_contract_only():
    with pytest.raises(ValidationError):
        WebConfig(toolVendors={"get_fundamentals": "a_share_fundamentals"})

    config = WebConfig(
        toolVendors={
            "get_fundamentals": CUSTOM_DATA_VENDOR,
            "get_balance_sheet": CUSTOM_DATA_VENDOR,
            "get_cashflow": CUSTOM_DATA_VENDOR,
            "get_income_statement": CUSTOM_DATA_VENDOR,
        },
        customDataInterfaces={
            "fundamental_data": {
                "baseUrl": "https://ashare.example.com/api",
                "endpoints": {
                    "get_fundamentals": "/fundamentals",
                    "get_balance_sheet": "/balance-sheet",
                    "get_cashflow": "/cashflow",
                    "get_income_statement": "/income-statement",
                },
            }
        },
    )

    assert config.data_vendors["fundamental_data"] == "yfinance"
    assert config.tool_vendors == {
        "get_fundamentals": CUSTOM_DATA_VENDOR,
        "get_balance_sheet": CUSTOM_DATA_VENDOR,
        "get_cashflow": CUSTOM_DATA_VENDOR,
        "get_income_statement": CUSTOM_DATA_VENDOR,
    }
    assert config.custom_data_interfaces["fundamental_data"].base_url == "https://ashare.example.com/api"
    assert config.custom_data_interfaces["fundamental_data"].endpoints["get_fundamentals"] == "/fundamentals"
    assert config.custom_data_interfaces["fundamental_data"].endpoints["get_balance_sheet"] == "/balance-sheet"
    assert config.custom_data_interfaces["fundamental_data"].endpoints["get_cashflow"] == "/cashflow"
    assert config.custom_data_interfaces["fundamental_data"].endpoints["get_income_statement"] == "/income-statement"


def test_llm_routes_validate_and_persist_runtime_config(tmp_path):
    config = WebConfig(
        maxParallelRuns=3,
        parallelInitialAnalysts=True,
        llmRoutes={
            "market_analyst": {
                "enabled": True,
                "provider": "moonshot",
                "backendUrl": "https://api.moonshot.cn/v1",
                "modelId": "moonshot-v1-8k",
            }
        }
    )

    storage = WebStorage(tmp_path)
    storage.save_config(config)
    loaded_config = storage.load_config()
    runtime_config = storage.runtime_config(config)

    assert loaded_config.parallel_initial_analysts is True
    assert runtime_config["llm_routes"]["market_analyst"]["enabled"] is True
    assert runtime_config["llm_routes"]["market_analyst"]["provider"] == "moonshot"
    assert runtime_config["llm_routes"]["market_analyst"]["modelId"] == "moonshot-v1-8k"
    assert runtime_config["max_parallel_runs"] == 3
    assert runtime_config["parallel_initial_analysts"] is True
    assert config.model_dump(mode="json", by_alias=True)["parallelInitialAnalysts"] is True
    assert WebConfig().parallel_initial_analysts is False

    with pytest.raises(ValidationError):
        WebConfig(llmRoutes={"unknown_agent": {"enabled": True}})

    with pytest.raises(ValidationError):
        WebConfig(llmRoutes={"market_analyst": {"enabled": True, "provider": "not-a-provider"}})

    with pytest.raises(ValidationError):
        WebConfig(maxParallelRuns=0)


def test_parallel_initial_analyst_join_preserves_reports():
    state = {
        "company_of_interest": "SPY",
        "market_report": "m",
        "sentiment_report": "s",
        "news_report": "n",
        "fundamentals_report": "f",
    }

    assert join_initial_analysts(state) == {}
    assert state["market_report"] == "m"
    assert state["sentiment_report"] == "s"
    assert state["news_report"] == "n"
    assert state["fundamentals_report"] == "f"


def test_parallel_initial_analyst_workflow_topology(monkeypatch):
    created = {}

    class FakeWorkflow:
        def __init__(self, state_type):
            self.state_type = state_type
            self.nodes = {}
            self.edges = []
            self.waiting_edges = []
            self.conditional_edges = []
            created["workflow"] = self

        def add_node(self, name, node):
            self.nodes[name] = node
            return self

        def add_edge(self, start, end):
            if isinstance(start, list):
                self.waiting_edges.append((tuple(start), end))
            else:
                self.edges.append((start, end))
            return self

        def add_conditional_edges(self, start, condition, path_map):
            self.conditional_edges.append((start, condition, path_map))
            return self

    def fake_factory(name):
        def factory(_llm):
            return lambda state: state
        factory.__name__ = name
        return factory

    for name in (
        "create_market_analyst",
        "create_social_media_analyst",
        "create_news_analyst",
        "create_fundamentals_analyst",
        "create_bull_researcher",
        "create_bear_researcher",
        "create_research_manager",
        "create_trader",
        "create_aggressive_debator",
        "create_neutral_debator",
        "create_conservative_debator",
        "create_portfolio_manager",
    ):
        monkeypatch.setattr(f"web.backend.llm_routing.{name}", fake_factory(name))
    monkeypatch.setattr("web.backend.llm_routing.StateGraph", FakeWorkflow)

    class FakeConditionalLogic:
        def __getattr__(self, _name):
            return lambda state: "next"

    class FakeGraph:
        quick_thinking_llm = object()
        deep_thinking_llm = object()
        tool_nodes = {
            "market": "tools_market_node",
            "social": "tools_social_node",
            "news": "tools_news_node",
            "fundamentals": "tools_fundamentals_node",
        }
        conditional_logic = FakeConditionalLogic()

    workflow = parallel_initial_analyst_workflow(
        FakeGraph(),
        ["market", "social", "news", "fundamentals"],
        {},
        {},
        [],
    )

    assert workflow is created["workflow"]
    assert JOIN_INITIAL_ANALYSTS_NODE in workflow.nodes
    assert ("__start__", "Market Analyst") in workflow.edges
    assert ("__start__", "Social Analyst") in workflow.edges
    assert ("__start__", "News Analyst") in workflow.edges
    assert ("__start__", "Fundamentals Analyst") in workflow.edges
    assert (
        ("Msg Clear Market", "Msg Clear Social", "Msg Clear News", "Msg Clear Fundamentals"),
        JOIN_INITIAL_ANALYSTS_NODE,
    ) in workflow.waiting_edges
    assert (JOIN_INITIAL_ANALYSTS_NODE, "Bull Researcher") in workflow.edges


def test_runner_workflow_selection_defaults_to_serial_and_uses_parallel_when_enabled(monkeypatch):
    calls = []

    class FakeWorkflow:
        def __init__(self, name):
            self.name = name

        def compile(self):
            calls.append((self.name, "compile"))
            return f"{self.name}-compiled"

    class FakeGraph:
        workflow = "upstream-workflow"
        graph = "upstream-compiled"

    monkeypatch.setattr("web.backend.runner.routed_workflow", lambda *args: calls.append(("routed", args)) or FakeWorkflow("routed"))
    monkeypatch.setattr("web.backend.runner.parallel_initial_analyst_workflow", lambda *args: calls.append(("parallel", args)) or FakeWorkflow("parallel"))

    graph = FakeGraph()
    assert configure_runtime_workflow(graph, ["market"], {"parallel_initial_analysts": False, "llm_routes": {}}, {}, []) is False
    assert graph.workflow == "upstream-workflow"
    assert graph.graph == "upstream-compiled"

    graph = FakeGraph()
    assert configure_runtime_workflow(
        graph,
        ["market"],
        {"parallel_initial_analysts": False, "llm_routes": {"market_analyst": {"enabled": True}}},
        {},
        [],
    ) is True
    assert graph.workflow.name == "routed"
    assert graph.graph == "routed-compiled"

    graph = FakeGraph()
    assert configure_runtime_workflow(graph, ["market"], {"parallel_initial_analysts": True, "llm_routes": {}}, {}, []) is True
    assert graph.workflow.name == "parallel"
    assert graph.graph == "parallel-compiled"
    assert calls[-2][0] == "parallel"


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

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"id": "moonshot-v1-8k"}]}

    monkeypatch.setattr("web.backend.model_discovery.requests.get", lambda *args, **kwargs: FakeResponse())
    client = TestClient(app)
    login_test_admin(client, storage, monkeypatch)

    payload = client.post(
        "/api/models/fetch",
        json={"provider": "moonshot", "baseUrl": "https://api.moonshot.cn/v1"},
    ).json()

    assert payload["provider"] == "moonshot"
    assert payload["models"] == [{"label": "moonshot-v1-8k", "value": "moonshot-v1-8k"}]


def test_model_fetch_endpoint_uses_environment_secret(monkeypatch, tmp_path):
    storage = WebStorage(tmp_path)
    monkeypatch.setenv("MOONSHOT_API_KEY", "env-moonshot-key")

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"id": "moonshot-v1-32k"}]}

    monkeypatch.setattr("web.backend.model_discovery.requests.get", lambda *args, **kwargs: FakeResponse())
    client = TestClient(app)
    login_test_admin(client, storage, monkeypatch)

    payload = client.post(
        "/api/models/fetch",
        json={"provider": "moonshot", "baseUrl": "https://api.moonshot.cn/v1"},
    ).json()

    assert payload["models"] == [{"label": "moonshot-v1-32k", "value": "moonshot-v1-32k"}]


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


def test_openai_custom_base_url_uses_compatible_runtime(monkeypatch, tmp_path):
    captured = {}

    class FakePropagator:
        def create_initial_state(self, ticker, trade_date):
            return {"messages": [("human", ticker)], "company_of_interest": ticker, "trade_date": trade_date}

        def get_graph_args(self, callbacks=None):
            return {}

    class FakeCompiledGraph:
        def stream(self, state, **kwargs):
            yield {
                "messages": [],
                "company_of_interest": state["company_of_interest"],
                "trade_date": state["trade_date"],
                "market_report": "Market report",
                "investment_debate_state": {"judge_decision": "Research manager decision"},
                "trader_investment_plan": "Trading plan",
                "risk_debate_state": {"judge_decision": "Buy"},
                "final_trade_decision": "Buy",
            }

    class FakeMemoryLog:
        def store_decision(self, **kwargs):
            return None

    class FakeTradingAgentsGraph:
        def __init__(self, selected_analysts, config, debug, callbacks):
            captured["runtime_config"] = dict(config)
            self.propagator = FakePropagator()
            self.graph = FakeCompiledGraph()
            self.workflow = self
            self.memory_log = FakeMemoryLog()

        def compile(self, checkpointer=None):
            return self.graph

        def process_signal(self, value):
            return "BUY"

        def _log_state(self, trade_date, final_state):
            return None

        def _resolve_pending_entries(self, ticker):
            return None

    monkeypatch.setattr("web.backend.runner.TradingAgentsGraph", FakeTradingAgentsGraph)

    storage = WebStorage(tmp_path)
    storage.save_secrets({"OPENAI_API_KEY": "test-openai-gateway-key"})
    manager = RunManager(storage)
    config = WebConfig(
        ticker="AAPL",
        analysisDate=date.today(),
        analysts=["market"],
        llmProvider="openai",
        backendUrl="http://158.101.23.132:8317/v1",
        quickThinkLlm="gateway-fast",
        deepThinkLlm="gateway-deep",
    )
    run = manager.create_run(RunRequest(ticker="AAPL", analysisDate=date.today(), config=config))

    deadline = time.time() + 2
    while run.status not in {"succeeded", "failed"} and time.time() < deadline:
        time.sleep(0.02)

    config_event = next(event for event in run.events if event["type"] == "configuration")
    assert run.status == "succeeded"
    assert captured["runtime_config"]["llm_provider"] == "openrouter"
    assert captured["runtime_config"]["backend_url"] == "http://158.101.23.132:8317/v1"
    assert config_event["payload"]["provider"] == "openai"
    assert config_event["payload"]["runtimeProvider"] == "openrouter"
    assert config_event["payload"]["backendUrl"] == "http://158.101.23.132:8317/v1"


def test_health_and_metadata_endpoints():
    client = TestClient(app)

    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/metadata").status_code == 200


def test_batch_run_endpoint_queues_runs_in_order(monkeypatch, tmp_path):
    class FakeRun:
        def __init__(self, run_id, ticker, analysis_date):
            self.run_id = run_id
            self.ticker = ticker
            self.analysis_date = analysis_date

        def info(self):
            return RunInfo(
                id=self.run_id,
                status="queued",
                ticker=self.ticker,
                analysisDate=self.analysis_date,
                submittedAt=datetime(2026, 5, 1, 8, 0, tzinfo=timezone.utc),
            )

    class FakeRunManager:
        def create_batch_runs(self, request, user=None):
            return [
                FakeRun(f"33333333-3333-4333-8333-33333333333{index}", ticker, request.analysis_date)
                for index, ticker in enumerate(request.tickers)
            ]

    storage = WebStorage(tmp_path)
    monkeypatch.setattr(app_module, "run_manager", FakeRunManager())
    client = TestClient(app)
    login_test_admin(client, storage, monkeypatch)

    response = client.post(
        "/api/runs/batch",
        json={
            "tickers": ["SPY", " 0700.hk ", "SPY"],
            "analysisDate": str(date.today()),
            "config": WebConfig(ticker="SPY", analysisDate=date.today(), analysts=["market"]).model_dump(mode="json", by_alias=True),
        },
    )
    payload = response.json()

    assert response.status_code == 200
    assert [item["ticker"] for item in payload["runs"]] == ["SPY", "0700.HK"]


def test_batch_runs_execute_one_ticker_at_a_time(monkeypatch, tmp_path):
    started: list[tuple[str, float]] = []
    ended: list[tuple[str, float]] = []

    class FakePropagator:
        def create_initial_state(self, ticker, trade_date):
            return {"messages": [("human", ticker)], "company_of_interest": ticker, "trade_date": trade_date}

        def get_graph_args(self, callbacks=None):
            return {}

    class FakeCompiledGraph:
        def stream(self, state, **kwargs):
            ticker = state["company_of_interest"]
            started.append((ticker, time.time()))
            time.sleep(0.15)
            ended.append((ticker, time.time()))
            yield {
                "messages": [],
                "company_of_interest": ticker,
                "trade_date": state["trade_date"],
                "market_report": f"Market report for {ticker}",
                "investment_debate_state": {"judge_decision": "Research manager decision"},
                "trader_investment_plan": "Trading plan",
                "risk_debate_state": {"judge_decision": "Buy"},
                "final_trade_decision": "Buy",
            }

    class FakeMemoryLog:
        def store_decision(self, **kwargs):
            return None

    class FakeTradingAgentsGraph:
        def __init__(self, selected_analysts, config, debug, callbacks):
            self.propagator = FakePropagator()
            self.graph = FakeCompiledGraph()
            self.workflow = self
            self.memory_log = FakeMemoryLog()

        def compile(self, checkpointer=None):
            return self.graph

        def process_signal(self, value):
            return "BUY"

        def _log_state(self, trade_date, final_state):
            return None

        def _resolve_pending_entries(self, ticker):
            return None

    monkeypatch.setattr("web.backend.runner.TradingAgentsGraph", FakeTradingAgentsGraph)

    storage = WebStorage(tmp_path)
    manager = RunManager(storage)
    config = WebConfig(ticker="AAPL", analysisDate=date.today(), analysts=["market"], maxParallelRuns=4)
    runs = manager.create_batch_runs(BatchRunRequest(tickers=["AAPL", "MSFT"], analysisDate=date.today(), config=config))

    deadline = time.time() + 2
    while len(started) < 1 and time.time() < deadline:
        time.sleep(0.01)
    time.sleep(0.05)

    assert len(started) == 1
    assert runs[0].status == "running"
    assert runs[1].status == "queued"

    while any(run.status not in {"succeeded", "failed", "cancelled"} for run in runs) and time.time() < deadline:
        time.sleep(0.02)

    assert [run.status for run in runs] == ["succeeded", "succeeded"]
    assert [item[0] for item in started] == [runs[0].request.ticker, runs[1].request.ticker]
    assert started[1][1] >= ended[0][1]


def test_run_list_endpoint_returns_active_runs(monkeypatch, tmp_path):
    run = RunInfo(
        id="44444444-4444-4444-8444-444444444444",
        status="running",
        ticker="SPY",
        analysisDate=date.today(),
        submittedAt=datetime(2026, 5, 1, 8, 0, tzinfo=timezone.utc),
    )

    class FakeRun:
        def info(self):
            return run

    class FakeRunManager:
        def list_runs(self, active_only=False, limit=100, user_id=None):
            assert active_only is True
            assert limit == 100
            assert user_id is None
            return [FakeRun()]

    storage = WebStorage(tmp_path)
    monkeypatch.setattr(app_module, "run_manager", FakeRunManager())
    client = TestClient(app)
    login_test_admin(client, storage, monkeypatch)

    payload = client.get("/api/runs?activeOnly=true").json()

    assert payload["runs"][0]["id"] == run.id
    assert payload["runs"][0]["status"] == "running"


def test_cancel_run_endpoint_returns_cancelled_run(monkeypatch, tmp_path):
    run = RunInfo(
        id="55555555-5555-4555-8555-555555555555",
        status="cancelled",
        ticker="SPY",
        analysisDate=date.today(),
        submittedAt=datetime(2026, 5, 1, 8, 0, tzinfo=timezone.utc),
        endedAt=datetime(2026, 5, 1, 8, 1, tzinfo=timezone.utc),
    )

    class FakeRun:
        user_id = None

        def info(self):
            return run

    class FakeRunManager:
        def get_run(self, run_id):
            assert run_id == run.id
            return FakeRun()

        def cancel_run(self, run_id):
            assert run_id == run.id
            return FakeRun()

    storage = WebStorage(tmp_path)
    monkeypatch.setattr(app_module, "run_manager", FakeRunManager())
    client = TestClient(app)
    login_test_admin(client, storage, monkeypatch)

    payload = client.post(f"/api/runs/{run.id}/cancel").json()

    assert payload["id"] == run.id
    assert payload["status"] == "cancelled"


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
    client = TestClient(app)
    login_test_admin(client, storage, monkeypatch)

    list_payload = client.get("/api/reports/history").json()
    detail_payload = client.get(f"/api/reports/history/{run.id}").json()

    assert list_payload["items"][0]["runId"] == run.id
    assert detail_payload["finalReport"] == "Final"
    assert client.get("/api/reports/history/not-a-uuid").status_code == 404


def test_backtest_endpoints_run_once_and_expose_summary(monkeypatch, tmp_path):
    storage = WebStorage(tmp_path)
    config = WebConfig(ticker="SPY", analysisDate=date(2026, 5, 1), analysts=["market"])
    run = RunInfo(
        id="99999999-9999-4999-8999-999999999999",
        status="succeeded",
        ticker="SPY",
        analysisDate=date(2026, 5, 1),
        submittedAt=datetime(2026, 5, 1, 8, 0, tzinfo=timezone.utc),
        decision="BUY",
    )
    storage.save_report_history(
        run,
        config,
        RunReports(
            runId=run.id,
            reports={},
            finalReport="Final recommendation: BUY\nEntry: wait for 100\nStop loss: 95\nTargets: 110",
            decision="BUY",
        ),
    )
    client = TestClient(app)
    login_test_admin(client, storage, monkeypatch)
    monkeypatch.setattr(
        "web.backend.backtesting.fetch_price_bars",
        lambda ticker, start, end: [BacktestPriceBar(date=date(2026, 5, 2), open=105, high=111, low=99, close=110)],
    )

    config_payload = client.put(
        "/api/backtests/config",
        json=BacktestScheduleConfig(enabled=True, intervalMinutes=60, reviewWindowDays=10).model_dump(mode="json", by_alias=True),
    ).json()
    first = client.post(f"/api/backtests/records/{run.id}/run").json()
    second = client.post("/api/backtests/run", json={"runId": run.id}).json()
    detail = client.get(f"/api/backtests/records/{run.id}").json()
    summary = client.get("/api/backtests/summary/SPY").json()

    assert config_payload["enabled"] is True
    assert first["status"] == "completed"
    assert first["result"]["outcome"] == "target_hit"
    assert "priceBars" not in first
    assert "priceBars" not in detail
    assert second["skippedCompleted"] == 1
    assert second["records"][0]["id"] == first["id"]
    assert summary["targetHits"] == 1


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


def test_run_manager_wraps_market_profile_before_graph_call(monkeypatch, tmp_path):
    captured = {}

    class FakePropagator:
        def create_initial_state(self, ticker, trade_date):
            return {"messages": [("human", ticker)], "company_of_interest": ticker, "trade_date": trade_date}

        def get_graph_args(self, callbacks=None):
            return {}

    class FakeCompiledGraph:
        def stream(self, state, **kwargs):
            captured.update(state)
            yield {
                "messages": [],
                "company_of_interest": state["company_of_interest"],
                "trade_date": state["trade_date"],
                "market_report": "Market report",
                "investment_debate_state": {"judge_decision": "Research manager decision"},
                "trader_investment_plan": "Trading plan",
                "risk_debate_state": {"judge_decision": "Buy"},
                "final_trade_decision": "Buy",
            }

    class FakeMemoryLog:
        def store_decision(self, **kwargs):
            return None

    class FakeTradingAgentsGraph:
        def __init__(self, selected_analysts, config, debug, callbacks):
            self.propagator = FakePropagator()
            self.graph = FakeCompiledGraph()
            self.workflow = self
            self.memory_log = FakeMemoryLog()

        def compile(self, checkpointer=None):
            return self.graph

        def process_signal(self, value):
            return "BUY"

        def _log_state(self, trade_date, final_state):
            return None

        def _resolve_pending_entries(self, ticker):
            captured["resolved_ticker"] = ticker

    monkeypatch.setattr("web.backend.runner.TradingAgentsGraph", FakeTradingAgentsGraph)

    storage = WebStorage(tmp_path)
    manager = RunManager(storage)
    config = WebConfig(
        ticker="0700",
        analysisDate=date.today(),
        analysts=["market"],
        stockMarket="hk",
        marketProfiles={"hk": {"region": "hk", "weight": "1.35", "marketProfile": "HK / China linkage."}},
    )
    run = manager.create_run(RunRequest(ticker="0700", analysisDate=date.today(), config=config))

    deadline = time.time() + 2
    while run.status not in {"succeeded", "failed"} and time.time() < deadline:
        time.sleep(0.02)

    assert run.status == "succeeded"
    assert run.request.ticker == "0700.hk"
    assert captured["resolved_ticker"] == "0700.hk"
    assert captured["messages"][0][0] == "system"
    assert "Hong Kong" in captured["messages"][0][1]
    assert "1.35" in captured["messages"][0][1]
