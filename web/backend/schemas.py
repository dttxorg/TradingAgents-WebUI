from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from cli.utils import normalize_ticker_symbol
from tradingagents.default_config import DEFAULT_CONFIG

from .constants import DATA_VENDOR_CATEGORIES, PROVIDERS, analyst_options


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class APIModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def _default_data_vendors() -> dict[str, str]:
    return dict(DEFAULT_CONFIG["data_vendors"])


def _allowed_values(items: list[dict[str, Any]], key: str = "value") -> set[Any]:
    return {item[key] for item in items}


ALLOWED_ANALYSTS = _allowed_values(analyst_options())
ALLOWED_PROVIDERS = _allowed_values(PROVIDERS)
ALLOWED_VENDOR_KEYS = {item["key"] for item in DATA_VENDOR_CATEGORIES}
ALLOWED_VENDOR_VALUES = {
    option for item in DATA_VENDOR_CATEGORIES for option in item["options"]
}


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
    data_vendors: dict[str, str] = Field(default_factory=_default_data_vendors)

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

    @field_validator("data_vendors")
    @classmethod
    def validate_data_vendors(cls, value: dict[str, str]) -> dict[str, str]:
        vendors = _default_data_vendors()
        for key, vendor in value.items():
            if key not in ALLOWED_VENDOR_KEYS:
                raise ValueError(f"Unsupported data vendor category: {key}")
            if vendor not in ALLOWED_VENDOR_VALUES:
                raise ValueError(f"Unsupported data vendor: {vendor}")
            vendors[key] = vendor
        return vendors


class SecretsUpdate(APIModel):
    values: dict[str, str | None] = Field(default_factory=dict)


class SecretFieldStatus(APIModel):
    configured: bool
    masked: str | None = None


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


RunState = Literal["queued", "running", "succeeded", "failed"]


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


class RunReports(APIModel):
    run_id: str
    reports: dict[str, Any] = Field(default_factory=dict)
    final_report: str | None = None
    decision: str | None = None
