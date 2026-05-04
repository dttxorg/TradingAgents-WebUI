from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from cli.utils import normalize_ticker_symbol
from tradingagents.default_config import DEFAULT_CONFIG

from .constants import CUSTOM_DATA_METHODS, CUSTOM_DATA_VENDOR, CUSTOM_OPENAI_PROVIDER, DATA_VENDOR_CATEGORIES, LLM_ROUTE_TARGETS, PROVIDERS, analyst_options


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class APIModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def _default_data_vendors() -> dict[str, str]:
    return dict(DEFAULT_CONFIG["data_vendors"])


def _default_custom_data_interfaces() -> dict[str, dict[str, Any]]:
    return {
        item["key"]: {
            "baseUrl": None,
            "endpoints": {
                method["method"]: method["defaultPath"]
                for method in CUSTOM_DATA_METHODS
                if method["category"] == item["key"]
            },
        }
        for item in DATA_VENDOR_CATEGORIES
    }


def _allowed_values(items: list[dict[str, Any]], key: str = "value") -> set[Any]:
    return {item[key] for item in items}


ALLOWED_ANALYSTS = _allowed_values(analyst_options())
ALLOWED_PROVIDERS = _allowed_values(PROVIDERS)
ALLOWED_VENDOR_KEYS = {item["key"] for item in DATA_VENDOR_CATEGORIES}
ALLOWED_VENDOR_OPTIONS_BY_KEY = {
    item["key"]: set(item["options"]) for item in DATA_VENDOR_CATEGORIES
}
CUSTOM_METHODS_BY_CATEGORY = {
    category: {method["method"] for method in CUSTOM_DATA_METHODS if method["category"] == category}
    for category in ALLOWED_VENDOR_KEYS
}
CUSTOM_METHOD_CATEGORIES = {
    method["method"]: method["category"]
    for method in CUSTOM_DATA_METHODS
}
LLM_ROUTE_KEYS = {item["key"] for item in LLM_ROUTE_TARGETS}


class CustomDataInterfaceConfig(APIModel):
    base_url: str | None = None
    endpoints: dict[str, str] = Field(default_factory=dict)

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().rstrip("/")
        return cleaned or None

    @field_validator("endpoints")
    @classmethod
    def validate_endpoints(cls, value: dict[str, str]) -> dict[str, str]:
        allowed = {item["method"] for item in CUSTOM_DATA_METHODS}
        endpoints = {}
        for method, path in value.items():
            if method not in allowed:
                raise ValueError(f"Unsupported custom data method: {method}")
            cleaned = path.strip() if isinstance(path, str) else ""
            if cleaned:
                endpoints[method] = cleaned if cleaned.startswith("/") else f"/{cleaned}"
        return endpoints


class LLMRouteConfig(APIModel):
    enabled: bool = False
    provider: str | None = None
    backend_url: str | None = None
    model_id: str | None = None

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, value: str | None) -> str | None:
        if value is None:
            return None
        provider = value.strip().lower()
        if not provider:
            return None
        if provider not in ALLOWED_PROVIDERS:
            raise ValueError(f"Unsupported LLM provider: {value}")
        return provider

    @field_validator("backend_url")
    @classmethod
    def validate_backend_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().rstrip("/")
        return cleaned or None

    @field_validator("model_id")
    @classmethod
    def validate_model_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class WebConfig(APIModel):
    ticker: str = "SPY"
    analysis_date: date = Field(default_factory=date.today)
    output_language: str = "English"
    analysts: list[str] = Field(default_factory=lambda: ["market", "social", "news", "fundamentals"])
    research_depth: Literal[1, 3, 5] = 1
    llm_provider: str = DEFAULT_CONFIG["llm_provider"]
    backend_url: str | None = DEFAULT_CONFIG.get("backend_url")
    quick_think_llm: str = DEFAULT_CONFIG["quick_think_llm"]
    deep_think_llm: str = DEFAULT_CONFIG["deep_think_llm"]
    google_thinking_level: str | None = DEFAULT_CONFIG.get("google_thinking_level")
    openai_reasoning_effort: str | None = DEFAULT_CONFIG.get("openai_reasoning_effort")
    anthropic_effort: str | None = DEFAULT_CONFIG.get("anthropic_effort")
    checkpoint_enabled: bool = DEFAULT_CONFIG["checkpoint_enabled"]
    max_recur_limit: int = DEFAULT_CONFIG["max_recur_limit"]
    max_parallel_runs: int = 1
    data_vendors: dict[str, str] = Field(default_factory=_default_data_vendors)
    tool_vendors: dict[str, str] = Field(default_factory=dict)
    llm_routes: dict[str, LLMRouteConfig] = Field(default_factory=dict)
    custom_data_interfaces: dict[str, CustomDataInterfaceConfig] = Field(
        default_factory=lambda: {
            key: CustomDataInterfaceConfig.model_validate(value)
            for key, value in _default_custom_data_interfaces().items()
        }
    )

    @field_validator("ticker")
    @classmethod
    def validate_ticker(cls, value: str) -> str:
        ticker = normalize_ticker_symbol(value)
        if not ticker:
            raise ValueError("Ticker is required.")
        return ticker

    @field_validator("analysis_date")
    @classmethod
    def validate_analysis_date(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("Analysis date cannot be in the future.")
        return value

    @field_validator("output_language")
    @classmethod
    def validate_language(cls, value: str) -> str:
        language = value.strip()
        if not language:
            raise ValueError("Output language is required.")
        return language

    @field_validator("backend_url")
    @classmethod
    def validate_backend_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().rstrip("/")
        return cleaned or None

    @field_validator("quick_think_llm", "deep_think_llm")
    @classmethod
    def validate_model_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Model ID is required.")
        return cleaned

    @field_validator("analysts")
    @classmethod
    def validate_analysts(cls, value: list[str]) -> list[str]:
        normalized = []
        for analyst in value:
            item = analyst.strip().lower()
            if item not in ALLOWED_ANALYSTS:
                raise ValueError(f"Unsupported analyst: {analyst}")
            if item not in normalized:
                normalized.append(item)
        if not normalized:
            raise ValueError("Select at least one analyst.")
        return [item for item in ["market", "social", "news", "fundamentals"] if item in normalized]

    @field_validator("llm_provider")
    @classmethod
    def validate_provider(cls, value: str) -> str:
        provider = value.strip().lower()
        if provider not in ALLOWED_PROVIDERS:
            raise ValueError(f"Unsupported LLM provider: {value}")
        return provider

    @field_validator("max_parallel_runs")
    @classmethod
    def validate_max_parallel_runs(cls, value: int) -> int:
        if value < 1 or value > 8:
            raise ValueError("Parallel runs must be between 1 and 8.")
        return value

    @field_validator("data_vendors")
    @classmethod
    def validate_data_vendors(cls, value: dict[str, str]) -> dict[str, str]:
        vendors = _default_data_vendors()
        for key, vendor in value.items():
            if key not in ALLOWED_VENDOR_KEYS:
                raise ValueError(f"Unsupported data vendor category: {key}")
            if vendor not in ALLOWED_VENDOR_OPTIONS_BY_KEY[key]:
                raise ValueError(f"Unsupported data vendor: {vendor}")
            vendors[key] = vendor
        return vendors

    @field_validator("tool_vendors")
    @classmethod
    def validate_tool_vendors(cls, value: dict[str, str]) -> dict[str, str]:
        vendors = {}
        for method, vendor in value.items():
            if method not in CUSTOM_METHOD_CATEGORIES:
                raise ValueError(f"Unsupported data tool method: {method}")
            category = CUSTOM_METHOD_CATEGORIES[method]
            if vendor == "":
                continue
            if vendor not in ALLOWED_VENDOR_OPTIONS_BY_KEY[category]:
                raise ValueError(f"Unsupported data vendor for {method}: {vendor}")
            vendors[method] = vendor
        return vendors

    @field_validator("llm_routes")
    @classmethod
    def validate_llm_routes(cls, value: dict[str, LLMRouteConfig]) -> dict[str, LLMRouteConfig]:
        routes = {}
        for key, route in value.items():
            if key not in LLM_ROUTE_KEYS:
                raise ValueError(f"Unsupported LLM route target: {key}")
            routes[key] = route
        return routes

    @model_validator(mode="after")
    def validate_custom_interfaces(self) -> "WebConfig":
        if self.llm_provider == CUSTOM_OPENAI_PROVIDER and not self.backend_url:
            raise ValueError("Custom OpenAI-compatible provider requires a Base URL.")
        for key, route in self.llm_routes.items():
            provider = route.provider or self.llm_provider
            if route.enabled and provider == CUSTOM_OPENAI_PROVIDER and not (route.backend_url or self.backend_url):
                raise ValueError(f"Custom OpenAI-compatible LLM route for {key} requires a Base URL.")

        merged = {
            key: CustomDataInterfaceConfig.model_validate(value)
            for key, value in _default_custom_data_interfaces().items()
        }
        for key, value in self.custom_data_interfaces.items():
            if key not in ALLOWED_VENDOR_KEYS:
                raise ValueError(f"Unsupported custom data interface category: {key}")
            unsupported = set(value.endpoints) - CUSTOM_METHODS_BY_CATEGORY[key]
            if unsupported:
                methods = ", ".join(sorted(unsupported))
                raise ValueError(f"Unsupported custom data method for {key}: {methods}")
            merged[key] = CustomDataInterfaceConfig(
                base_url=value.base_url,
                endpoints={**merged[key].endpoints, **value.endpoints},
            )

        for key, vendor in self.data_vendors.items():
            if vendor == CUSTOM_DATA_VENDOR and not merged[key].base_url:
                raise ValueError(f"Custom data interface for {key} requires a Base URL.")
        for method, vendor in self.tool_vendors.items():
            category = CUSTOM_METHOD_CATEGORIES[method]
            if vendor == CUSTOM_DATA_VENDOR and not merged[category].base_url:
                raise ValueError(f"Custom data interface for {method} requires a Base URL.")

        self.custom_data_interfaces = merged
        return self


class SecretsUpdate(APIModel):
    values: dict[str, str | None] = Field(default_factory=dict)


class SecretFieldStatus(APIModel):
    configured: bool
    masked: str | None = None


class ModelFetchRequest(APIModel):
    provider: str
    base_url: str | None = None

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, value: str) -> str:
        provider = value.strip().lower()
        if provider not in ALLOWED_PROVIDERS:
            raise ValueError(f"Unsupported LLM provider: {value}")
        return provider

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().rstrip("/")
        return cleaned or None


class DiscoveredModel(APIModel):
    label: str
    value: str


class ModelFetchResponse(APIModel):
    provider: str
    base_url: str | None = None
    source: str
    models: list[DiscoveredModel] = Field(default_factory=list)


class RunRequest(APIModel):
    ticker: str
    analysis_date: date
    config: WebConfig | None = None

    @field_validator("ticker")
    @classmethod
    def validate_ticker(cls, value: str) -> str:
        ticker = normalize_ticker_symbol(value)
        if not ticker:
            raise ValueError("Ticker is required.")
        return ticker

    @field_validator("analysis_date")
    @classmethod
    def validate_analysis_date(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("Analysis date cannot be in the future.")
        return value


class BatchRunRequest(APIModel):
    tickers: list[str]
    analysis_date: date
    config: WebConfig | None = None

    @field_validator("tickers")
    @classmethod
    def validate_tickers(cls, value: list[str]) -> list[str]:
        normalized = []
        for ticker in value:
            item = normalize_ticker_symbol(ticker)
            if item and item not in normalized:
                normalized.append(item)
        if not normalized:
            raise ValueError("Select at least one ticker.")
        if len(normalized) > 50:
            raise ValueError("Batch analysis supports up to 50 tickers.")
        return normalized

    @field_validator("analysis_date")
    @classmethod
    def validate_analysis_date(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("Analysis date cannot be in the future.")
        return value


RunState = Literal["queued", "running", "succeeded", "failed", "cancelled"]


class RunInfo(APIModel):
    id: str
    status: RunState
    ticker: str
    analysis_date: date
    submitted_at: datetime
    started_at: datetime | None = None
    ended_at: datetime | None = None
    error: str | None = None
    decision: str | None = None
    stats: dict[str, Any] = Field(default_factory=dict)


class BatchRunResponse(APIModel):
    runs: list[RunInfo]


class RunListResponse(APIModel):
    runs: list[RunInfo]


class RunReports(APIModel):
    run_id: str
    reports: dict[str, Any] = Field(default_factory=dict)
    final_report: str | None = None
    decision: str | None = None


class HistoricalReport(APIModel):
    schema_version: int = 1
    archived_at: datetime
    run: RunInfo
    config: WebConfig
    reports: dict[str, Any] = Field(default_factory=dict)
    final_report: str | None = None
    decision: str | None = None


class ReportHistoryItem(APIModel):
    run_id: str
    ticker: str
    analysis_date: date
    status: RunState
    submitted_at: datetime
    ended_at: datetime | None = None
    decision: str | None = None
    provider: str
    output_language: str
    analysts: list[str] = Field(default_factory=list)
    research_depth: int
    stats: dict[str, Any] = Field(default_factory=dict)
    archived_at: datetime


class ReportHistoryList(APIModel):
    items: list[ReportHistoryItem] = Field(default_factory=list)
