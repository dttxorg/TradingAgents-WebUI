from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from cli.utils import normalize_ticker_symbol
from tradingagents.default_config import DEFAULT_CONFIG

from .constants import CUSTOM_DATA_METHODS, CUSTOM_DATA_VENDOR, CUSTOM_OPENAI_PROVIDER, DATA_VENDOR_CATEGORIES, DEFAULT_MARKET_PROFILES, LLM_ROUTE_TARGETS, PROVIDERS, STOCK_MARKETS, analyst_options


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


def _default_market_profiles() -> dict[str, dict[str, Any]]:
    return {key: dict(value) for key, value in DEFAULT_MARKET_PROFILES.items()}


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
STOCK_MARKET_KEYS = {item["key"] for item in STOCK_MARKETS}


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


class MarketProfileConfig(APIModel):
    region: str = ""
    weight: Decimal = Decimal("1")
    market_profile: str = ""

    @field_validator("region")
    @classmethod
    def validate_region(cls, value: str) -> str:
        region = value.strip().lstrip(".")
        if "." in region:
            raise ValueError("Market region should not include dots.")
        if len(region) > 16:
            raise ValueError("Market region must be 16 characters or fewer.")
        return region

    @field_validator("weight")
    @classmethod
    def validate_weight(cls, value: Decimal) -> Decimal:
        if value < 0 or value > 10:
            raise ValueError("Market weight must be between 0 and 10.")
        return value

    @field_validator("market_profile")
    @classmethod
    def validate_market_profile(cls, value: str) -> str:
        return value.strip()[:2000]


class WebConfig(APIModel):
    ticker: str = "SPY"
    analysis_date: date = Field(default_factory=date.today)
    stock_market: str = "us"
    market_profiles: dict[str, MarketProfileConfig] = Field(
        default_factory=lambda: {
            key: MarketProfileConfig.model_validate(value)
            for key, value in _default_market_profiles().items()
        }
    )
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

    @field_validator("stock_market")
    @classmethod
    def validate_stock_market(cls, value: str) -> str:
        market = value.strip().lower()
        if market not in STOCK_MARKET_KEYS:
            raise ValueError(f"Unsupported stock market: {value}")
        return market

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

    @field_validator("market_profiles")
    @classmethod
    def validate_market_profiles(cls, value: dict[str, MarketProfileConfig]) -> dict[str, MarketProfileConfig]:
        profiles = {
            key: MarketProfileConfig.model_validate(payload)
            for key, payload in _default_market_profiles().items()
        }
        for key, profile in value.items():
            market = key.strip().lower()
            if market not in STOCK_MARKET_KEYS:
                raise ValueError(f"Unsupported market profile: {key}")
            profiles[market] = profile
        return profiles

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


UserRole = Literal["admin", "user"]


class BootstrapStatus(APIModel):
    required: bool


class BootstrapRequest(APIModel):
    username: str = "admin"
    password: str
    display_name: str | None = None
    initial_balance: Decimal = Decimal("100.00")

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        username = value.strip()
        if len(username) < 3:
            raise ValueError("Username must be at least 3 characters.")
        return username

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return value

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("initial_balance")
    @classmethod
    def validate_initial_balance(cls, value: Decimal) -> Decimal:
        if value < 0:
            raise ValueError("Initial balance cannot be negative.")
        return value


class LoginRequest(APIModel):
    username: str
    password: str


class UserPublic(APIModel):
    id: str
    username: str
    display_name: str | None = None
    role: UserRole
    balance: Decimal = Decimal("0")
    frozen_balance: Decimal = Decimal("0")
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class SessionResponse(APIModel):
    user: UserPublic


class AdminUserCreate(APIModel):
    username: str
    password: str
    display_name: str | None = None
    role: UserRole = "user"
    initial_balance: Decimal = Decimal("0")
    is_active: bool = True

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        username = value.strip()
        if len(username) < 3:
            raise ValueError("Username must be at least 3 characters.")
        return username

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return value

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("initial_balance")
    @classmethod
    def validate_initial_balance(cls, value: Decimal) -> Decimal:
        if value < 0:
            raise ValueError("Initial balance cannot be negative.")
        return value


class AdminUserUpdate(APIModel):
    display_name: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None
    password: str | None = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str | None) -> str | None:
        if value is not None and len(value) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return value


class UserListResponse(APIModel):
    users: list[UserPublic] = Field(default_factory=list)


class TokenUsage(APIModel):
    input_tokens: int = 0
    output_tokens: int = 0
    llm_calls: int = 0
    tool_calls: int = 0


class ModelPriceOverride(APIModel):
    input_token_price_per_1m: Decimal | None = None
    output_token_price_per_1m: Decimal | None = None
    multiplier: Decimal | None = None

    @field_validator("input_token_price_per_1m", "output_token_price_per_1m", "multiplier")
    @classmethod
    def validate_non_negative(cls, value: Decimal | None) -> Decimal | None:
        if value is not None and value < 0:
            raise ValueError("Price values cannot be negative.")
        return value


BillingMode = Literal["token", "per_run", "hybrid"]


class PricingConfig(APIModel):
    currency: str = "USD"
    billing_mode: BillingMode = "token"
    token_multiplier: Decimal = Decimal("1")
    input_token_price_per_1m: Decimal = Decimal("1.00")
    output_token_price_per_1m: Decimal = Decimal("5.00")
    fixed_run_price: Decimal = Decimal("0")
    minimum_run_charge: Decimal = Decimal("0")
    preauth_multiplier: Decimal = Decimal("1.5")
    preauth_floor: Decimal = Decimal("0.01")
    depth_multipliers: dict[str, Decimal] = Field(default_factory=lambda: {"1": Decimal("1"), "3": Decimal("1.5"), "5": Decimal("2.5")})
    fixed_prices_by_depth: dict[str, Decimal] = Field(default_factory=lambda: {"1": Decimal("0"), "3": Decimal("0"), "5": Decimal("0")})
    estimated_input_tokens_by_depth: dict[str, int] = Field(default_factory=lambda: {"1": 100000, "3": 250000, "5": 500000})
    estimated_output_tokens_by_depth: dict[str, int] = Field(default_factory=lambda: {"1": 30000, "3": 80000, "5": 160000})
    model_price_overrides: dict[str, ModelPriceOverride] = Field(default_factory=dict)

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, value: str) -> str:
        currency = value.strip().upper()
        if not currency:
            raise ValueError("Currency is required.")
        return currency[:12]

    @field_validator(
        "token_multiplier",
        "input_token_price_per_1m",
        "output_token_price_per_1m",
        "fixed_run_price",
        "minimum_run_charge",
        "preauth_multiplier",
        "preauth_floor",
    )
    @classmethod
    def validate_decimal_non_negative(cls, value: Decimal) -> Decimal:
        if value < 0:
            raise ValueError("Price values cannot be negative.")
        return value

    @field_validator("depth_multipliers", "fixed_prices_by_depth")
    @classmethod
    def validate_depth_prices(cls, value: dict[str, Decimal]) -> dict[str, Decimal]:
        normalized = {str(key): amount for key, amount in value.items()}
        for key, amount in normalized.items():
            if key not in {"1", "3", "5"}:
                raise ValueError(f"Unsupported research depth: {key}")
            if amount < 0:
                raise ValueError("Depth price values cannot be negative.")
        return normalized

    @field_validator("estimated_input_tokens_by_depth", "estimated_output_tokens_by_depth")
    @classmethod
    def validate_estimates(cls, value: dict[str, int]) -> dict[str, int]:
        normalized = {str(key): amount for key, amount in value.items()}
        for key, amount in normalized.items():
            if key not in {"1", "3", "5"}:
                raise ValueError(f"Unsupported research depth: {key}")
            if amount < 0:
                raise ValueError("Estimated tokens cannot be negative.")
        return normalized


class PublicPricing(APIModel):
    currency: str
    billing_mode: BillingMode
    token_multiplier: Decimal
    input_token_price_per_1m: Decimal
    output_token_price_per_1m: Decimal
    fixed_run_price: Decimal
    minimum_run_charge: Decimal
    depth_multipliers: dict[str, Decimal]
    fixed_prices_by_depth: dict[str, Decimal]


OrderType = Literal["analysis", "recharge", "adjustment"]
OrderStatus = Literal["preauthorized", "settled", "failed_settled", "cancelled", "completed", "pending", "voided"]


class OrderRecord(APIModel):
    id: str
    user_id: str
    type: OrderType
    status: OrderStatus
    currency: str
    amount: Decimal = Decimal("0")
    frozen_amount: Decimal = Decimal("0")
    actual_amount: Decimal = Decimal("0")
    refunded_amount: Decimal = Decimal("0")
    overage_amount: Decimal = Decimal("0")
    balance_after: Decimal | None = None
    run_id: str | None = None
    external_order_id: str | None = None
    description: str | None = None
    usage: TokenUsage = Field(default_factory=TokenUsage)
    pricing_snapshot: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class OrderListResponse(APIModel):
    orders: list[OrderRecord] = Field(default_factory=list)


class RechargeRequest(APIModel):
    amount: Decimal
    external_order_id: str | None = None
    note: str | None = None

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: Decimal) -> Decimal:
        if value <= 0:
            raise ValueError("Recharge amount must be greater than zero.")
        return value


class RunBilling(APIModel):
    order_id: str
    status: OrderStatus
    currency: str
    preauthorized_amount: Decimal
    actual_amount: Decimal = Decimal("0")
    refunded_amount: Decimal = Decimal("0")
    overage_amount: Decimal = Decimal("0")
    balance_after: Decimal | None = None
    usage: TokenUsage = Field(default_factory=TokenUsage)


BacktestRecordStatus = Literal["pending", "running", "waiting_data", "completed", "failed"]
BacktestCheckpointStatus = Literal["pending", "running", "completed", "failed", "skipped"]
BacktestOutcome = Literal["target_hit", "stop_hit", "entry_not_hit", "ambiguous", "manual_review", "waiting_data", "not_actionable"]
BacktestPriceDataSource = Literal["yfinance", "custom"]


class BacktestScheduleConfig(APIModel):
    enabled: bool = False
    interval_minutes: int = 1440
    review_window_days: int = 30
    max_reports_per_cycle: int = 20
    checkpoint_enabled: bool = True
    price_data_source: BacktestPriceDataSource = "yfinance"
    custom_base_url: str | None = None
    custom_endpoint: str = "/backtest/prices"

    @field_validator("interval_minutes")
    @classmethod
    def validate_interval(cls, value: int) -> int:
        if value < 5 or value > 43200:
            raise ValueError("Backtest interval must be between 5 minutes and 30 days.")
        return value

    @field_validator("review_window_days")
    @classmethod
    def validate_window(cls, value: int) -> int:
        if value < 1 or value > 3650:
            raise ValueError("Review window must be between 1 and 3650 days.")
        return value

    @field_validator("max_reports_per_cycle")
    @classmethod
    def validate_cycle_limit(cls, value: int) -> int:
        if value < 1 or value > 500:
            raise ValueError("Backtest cycle limit must be between 1 and 500 reports.")
        return value

    @field_validator("custom_base_url")
    @classmethod
    def validate_custom_base_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().rstrip("/")
        return cleaned or None

    @field_validator("custom_endpoint")
    @classmethod
    def validate_custom_endpoint(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Backtest custom endpoint is required.")
        return cleaned if cleaned.startswith("/") else f"/{cleaned}"

    @model_validator(mode="after")
    def validate_custom_source(self) -> "BacktestScheduleConfig":
        if self.price_data_source == "custom" and not self.custom_base_url:
            raise ValueError("Custom backtest price data source requires a Base URL.")
        return self


class BacktestCheckpoint(APIModel):
    key: str
    status: BacktestCheckpointStatus
    updated_at: datetime
    message: str | None = None


class BacktestPriceBar(APIModel):
    date: date
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None


class BacktestParsedPlan(APIModel):
    decision: str | None = None
    entry_plan: str | None = None
    stop_plan: str | None = None
    target_plan: str | None = None
    position_plan: str | None = None
    risk_plan: str | None = None
    observation_order: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    entry_levels: list[float] = Field(default_factory=list)
    stop_levels: list[float] = Field(default_factory=list)
    target_levels: list[float] = Field(default_factory=list)
    stop_offset: float | None = None
    action: Literal["buy", "sell", "hold", "unknown"] = "unknown"
    needs_manual_review: bool = False


class BacktestResult(APIModel):
    outcome: BacktestOutcome = "waiting_data"
    entry_hit: bool | None = None
    entry_hit_date: date | None = None
    entry_hit_price: float | None = None
    target_hit: bool | None = None
    target_hit_date: date | None = None
    target_hit_price: float | None = None
    stop_hit: bool | None = None
    stop_hit_date: date | None = None
    stop_hit_price: float | None = None
    bars_checked: int = 0
    price_source: str | None = None
    notes: list[str] = Field(default_factory=list)


class BacktestRecord(APIModel):
    id: str
    run_id: str
    user_id: str | None = None
    ticker: str
    analysis_date: date
    status: BacktestRecordStatus = "pending"
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    last_checkpoint: str | None = None
    resume_count: int = 0
    error: str | None = None
    plan: BacktestParsedPlan = Field(default_factory=BacktestParsedPlan)
    result: BacktestResult = Field(default_factory=BacktestResult)
    checkpoints: list[BacktestCheckpoint] = Field(default_factory=list)
    price_bars: list[BacktestPriceBar] = Field(default_factory=list)


class BacktestRunRequest(APIModel):
    run_id: str | None = None
    ticker: str | None = None
    limit: int = 20

    @field_validator("ticker")
    @classmethod
    def validate_ticker(cls, value: str | None) -> str | None:
        if value is None:
            return None
        ticker = normalize_ticker_symbol(value)
        return ticker or None

    @field_validator("limit")
    @classmethod
    def validate_limit(cls, value: int) -> int:
        if value < 1 or value > 500:
            raise ValueError("Backtest run limit must be between 1 and 500.")
        return value


class BacktestRunResponse(APIModel):
    records: list[BacktestRecord] = Field(default_factory=list)
    skipped_completed: int = 0


class BacktestRecordList(APIModel):
    records: list[BacktestRecord] = Field(default_factory=list)


class BacktestTickerSummary(APIModel):
    ticker: str
    total_reports: int = 0
    records_total: int = 0
    completed_records: int = 0
    pending_records: int = 0
    actionable_records: int = 0
    entry_hits: int = 0
    target_hits: int = 0
    stop_hits: int = 0
    ambiguous: int = 0
    manual_review: int = 0
    waiting_data: int = 0


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
    user_id: str | None = None
    order_id: str | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    error: str | None = None
    decision: str | None = None
    stats: dict[str, Any] = Field(default_factory=dict)
    billing: RunBilling | None = None


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
    user_id: str | None = None
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
