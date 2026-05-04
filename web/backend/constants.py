from __future__ import annotations

from typing import Any

from cli.models import AnalystType
from cli.utils import ANALYST_ORDER as CLI_ANALYST_ORDER
from tradingagents.llm_clients.model_catalog import MODEL_OPTIONS


CUSTOM_OPENAI_PROVIDER = "custom_openai"
CUSTOM_DATA_VENDOR = "custom"
OPENAI_COMPATIBLE_ADAPTER_PROVIDERS = {
    "moonshot",
    "minimax",
    "baichuan",
    "hunyuan",
    "volcengine",
    "siliconflow",
    "groq",
    "mistral",
    "together",
    "fireworks",
    "perplexity",
}

OUTPUT_LANGUAGES = [
    {"label": "English (default)", "value": "English"},
    {"label": "Chinese (中文)", "value": "Chinese"},
    {"label": "Japanese (日本語)", "value": "Japanese"},
    {"label": "Korean (한국어)", "value": "Korean"},
    {"label": "Hindi (हिन्दी)", "value": "Hindi"},
    {"label": "Spanish (Español)", "value": "Spanish"},
    {"label": "Portuguese (Português)", "value": "Portuguese"},
    {"label": "French (Français)", "value": "French"},
    {"label": "German (Deutsch)", "value": "German"},
    {"label": "Arabic (العربية)", "value": "Arabic"},
    {"label": "Russian (Русский)", "value": "Russian"},
]

RESEARCH_DEPTHS = [
    {
        "label": "Shallow",
        "value": 1,
        "description": "Quick research with fewer debate and risk rounds.",
    },
    {
        "label": "Medium",
        "value": 3,
        "description": "Balanced research with moderate debate and risk rounds.",
    },
    {
        "label": "Deep",
        "value": 5,
        "description": "Comprehensive research with deeper debate and risk rounds.",
    },
]

STOCK_MARKETS = [
    {
        "key": "us",
        "label": "US stocks",
        "description": "US-listed equities and ETFs. Bare symbols are wrapped with the configured region suffix, defaulting to us.",
    },
    {
        "key": "hk",
        "label": "Hong Kong stocks",
        "description": "Hong Kong listed equities. Bare numeric tickers are wrapped with the configured region suffix.",
    },
    {
        "key": "sh",
        "label": "Shanghai A shares",
        "description": "Shanghai-listed A shares. Configure region as SS, SH, or any suffix required by your data source.",
    },
    {
        "key": "sz",
        "label": "Shenzhen A shares",
        "description": "Shenzhen-listed A shares. Configure region as SZ or any suffix required by your data source.",
    },
]

DEFAULT_MARKET_PROFILES = {
    "us": {
        "region": "us",
        "weight": "1",
        "marketProfile": "US equities / ETFs. Emphasize USD pricing, US exchange hours, SEC filings, Fed policy, sector rotation, and US macro context.",
    },
    "hk": {
        "region": "HK",
        "weight": "1.15",
        "marketProfile": "HK market profile. Emphasize HKD pricing, Hong Kong exchange calendar, mainland China linkage, southbound flow, H-share/ADR dual listings, and local regulatory context.",
    },
    "sh": {
        "region": "SS",
        "weight": "1.2",
        "marketProfile": "CN-A Shanghai market profile. Emphasize RMB pricing, SSE market structure, daily price limits, northbound/southbound flow, policy sensitivity, and mainland macro/liquidity context.",
    },
    "sz": {
        "region": "SZ",
        "weight": "1.2",
        "marketProfile": "CN-A Shenzhen market profile. Emphasize RMB pricing, SZSE/Growth Enterprise characteristics, daily price limits, policy sensitivity, and mainland liquidity/risk appetite.",
    },
}

PROVIDERS = [
    {
        "label": "OpenAI",
        "value": "openai",
        "defaultBaseUrl": "https://api.openai.com/v1",
        "apiKeyField": "OPENAI_API_KEY",
        "modelFetch": "openai_compatible",
        "region": "global",
    },
    {
        "label": "Google Gemini",
        "value": "google",
        "defaultBaseUrl": "https://generativelanguage.googleapis.com",
        "apiKeyField": "GOOGLE_API_KEY",
        "modelFetch": "google",
        "region": "global",
    },
    {
        "label": "Anthropic",
        "value": "anthropic",
        "defaultBaseUrl": "https://api.anthropic.com",
        "apiKeyField": "ANTHROPIC_API_KEY",
        "modelFetch": "anthropic",
        "region": "global",
    },
    {
        "label": "xAI",
        "value": "xai",
        "defaultBaseUrl": "https://api.x.ai/v1",
        "apiKeyField": "XAI_API_KEY",
        "modelFetch": "openai_compatible",
        "region": "global",
    },
    {
        "label": "DeepSeek",
        "value": "deepseek",
        "defaultBaseUrl": "https://api.deepseek.com",
        "apiKeyField": "DEEPSEEK_API_KEY",
        "modelFetch": "openai_compatible",
        "region": "china",
    },
    {
        "label": "Qwen",
        "value": "qwen",
        "defaultBaseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "apiKeyField": "DASHSCOPE_API_KEY",
        "modelFetch": "openai_compatible",
        "region": "china",
    },
    {
        "label": "Moonshot Kimi",
        "value": "moonshot",
        "defaultBaseUrl": "https://api.moonshot.cn/v1",
        "apiKeyField": "MOONSHOT_API_KEY",
        "modelFetch": "openai_compatible",
        "region": "china",
    },
    {
        "label": "MiniMax",
        "value": "minimax",
        "defaultBaseUrl": "https://api.minimax.chat/v1",
        "apiKeyField": "MINIMAX_API_KEY",
        "modelFetch": "openai_compatible",
        "region": "china",
    },
    {
        "label": "Baichuan",
        "value": "baichuan",
        "defaultBaseUrl": "https://api.baichuan-ai.com/v1",
        "apiKeyField": "BAICHUAN_API_KEY",
        "modelFetch": "openai_compatible",
        "region": "china",
    },
    {
        "label": "Tencent Hunyuan",
        "value": "hunyuan",
        "defaultBaseUrl": "https://api.hunyuan.cloud.tencent.com/v1",
        "apiKeyField": "HUNYUAN_API_KEY",
        "modelFetch": "openai_compatible",
        "region": "china",
    },
    {
        "label": "Volcengine Ark",
        "value": "volcengine",
        "defaultBaseUrl": "https://ark.cn-beijing.volces.com/api/v3",
        "apiKeyField": "ARK_API_KEY",
        "modelFetch": "openai_compatible",
        "region": "china",
    },
    {
        "label": "SiliconFlow",
        "value": "siliconflow",
        "defaultBaseUrl": "https://api.siliconflow.cn/v1",
        "apiKeyField": "SILICONFLOW_API_KEY",
        "modelFetch": "openai_compatible",
        "region": "china",
    },
    {
        "label": "GLM",
        "value": "glm",
        "defaultBaseUrl": "https://open.bigmodel.cn/api/paas/v4/",
        "apiKeyField": "ZHIPU_API_KEY",
        "modelFetch": "openai_compatible",
        "region": "china",
    },
    {
        "label": "Groq",
        "value": "groq",
        "defaultBaseUrl": "https://api.groq.com/openai/v1",
        "apiKeyField": "GROQ_API_KEY",
        "modelFetch": "openai_compatible",
        "region": "global",
    },
    {
        "label": "Mistral AI",
        "value": "mistral",
        "defaultBaseUrl": "https://api.mistral.ai/v1",
        "apiKeyField": "MISTRAL_API_KEY",
        "modelFetch": "openai_compatible",
        "region": "global",
    },
    {
        "label": "Together AI",
        "value": "together",
        "defaultBaseUrl": "https://api.together.xyz/v1",
        "apiKeyField": "TOGETHER_API_KEY",
        "modelFetch": "openai_compatible",
        "region": "global",
    },
    {
        "label": "Fireworks AI",
        "value": "fireworks",
        "defaultBaseUrl": "https://api.fireworks.ai/inference/v1",
        "apiKeyField": "FIREWORKS_API_KEY",
        "modelFetch": "openai_compatible",
        "region": "global",
    },
    {
        "label": "Perplexity",
        "value": "perplexity",
        "defaultBaseUrl": "https://api.perplexity.ai",
        "apiKeyField": "PERPLEXITY_API_KEY",
        "modelFetch": "openai_compatible",
        "region": "global",
    },
    {
        "label": "OpenRouter",
        "value": "openrouter",
        "defaultBaseUrl": "https://openrouter.ai/api/v1",
        "apiKeyField": "OPENROUTER_API_KEY",
        "modelFetch": "openai_compatible",
        "region": "global",
    },
    {
        "label": "Azure OpenAI",
        "value": "azure",
        "defaultBaseUrl": None,
        "apiKeyField": "AZURE_OPENAI_API_KEY",
        "modelFetch": "none",
        "region": "global",
    },
    {
        "label": "Ollama",
        "value": "ollama",
        "defaultBaseUrl": "http://localhost:11434/v1",
        "apiKeyField": None,
        "modelFetch": "openai_compatible",
        "region": "local",
    },
    {
        "label": "Custom OpenAI-compatible",
        "value": CUSTOM_OPENAI_PROVIDER,
        "defaultBaseUrl": None,
        "apiKeyField": "CUSTOM_OPENAI_API_KEY",
        "modelFetch": "openai_compatible",
        "region": "custom",
    },
]

DATA_VENDOR_CATEGORIES = [
    {
        "key": "core_stock_apis",
        "label": "Core Stock APIs",
        "options": ["yfinance", "alpha_vantage", CUSTOM_DATA_VENDOR],
    },
    {
        "key": "technical_indicators",
        "label": "Technical Indicators",
        "options": ["yfinance", "alpha_vantage", CUSTOM_DATA_VENDOR],
    },
    {
        "key": "fundamental_data",
        "label": "Fundamental Data",
        "options": ["yfinance", "alpha_vantage", CUSTOM_DATA_VENDOR],
    },
    {
        "key": "news_data",
        "label": "News Data",
        "options": ["yfinance", "alpha_vantage", CUSTOM_DATA_VENDOR],
    },
]

CUSTOM_DATA_METHODS = [
    {"method": "get_stock_data", "category": "core_stock_apis", "label": "Stock prices", "defaultPath": "/stock"},
    {"method": "get_indicators", "category": "technical_indicators", "label": "Technical indicators", "defaultPath": "/indicators"},
    {"method": "get_fundamentals", "category": "fundamental_data", "label": "Fundamentals", "defaultPath": "/fundamentals"},
    {"method": "get_balance_sheet", "category": "fundamental_data", "label": "Balance sheet", "defaultPath": "/balance-sheet"},
    {"method": "get_cashflow", "category": "fundamental_data", "label": "Cash flow", "defaultPath": "/cashflow"},
    {"method": "get_income_statement", "category": "fundamental_data", "label": "Income statement", "defaultPath": "/income-statement"},
    {"method": "get_news", "category": "news_data", "label": "Ticker news", "defaultPath": "/news"},
    {"method": "get_global_news", "category": "news_data", "label": "Global news", "defaultPath": "/global-news"},
    {"method": "get_insider_transactions", "category": "news_data", "label": "Insider transactions", "defaultPath": "/insider-transactions"},
]

LLM_ROUTE_TARGETS = [
    {
        "key": "market_analyst",
        "label": "Market Analyst",
        "stage": "analyst",
        "defaultModelRole": "quick",
        "parallelizable": True,
        "apiKeyField": "TRADINGAGENTS_MARKET_LLM_API_KEY",
        "description": "Independent initial market analysis; safe candidate for future fan-out execution.",
    },
    {
        "key": "social_analyst",
        "label": "Social Analyst",
        "stage": "analyst",
        "defaultModelRole": "quick",
        "parallelizable": True,
        "apiKeyField": "TRADINGAGENTS_SOCIAL_LLM_API_KEY",
        "description": "Independent initial sentiment analysis; safe candidate for future fan-out execution.",
    },
    {
        "key": "news_analyst",
        "label": "News Analyst",
        "stage": "analyst",
        "defaultModelRole": "quick",
        "parallelizable": True,
        "apiKeyField": "TRADINGAGENTS_NEWS_LLM_API_KEY",
        "description": "Independent initial news analysis; safe candidate for future fan-out execution.",
    },
    {
        "key": "fundamentals_analyst",
        "label": "Fundamentals Analyst",
        "stage": "analyst",
        "defaultModelRole": "quick",
        "parallelizable": True,
        "apiKeyField": "TRADINGAGENTS_FUNDAMENTALS_LLM_API_KEY",
        "description": "Independent initial fundamentals analysis; safe candidate for future fan-out execution.",
    },
    {
        "key": "bull_researcher",
        "label": "Bull Researcher",
        "stage": "research",
        "defaultModelRole": "quick",
        "parallelizable": False,
        "apiKeyField": "TRADINGAGENTS_BULL_LLM_API_KEY",
        "description": "Debate turn depends on prior context; route only for rate-limit isolation.",
    },
    {
        "key": "bear_researcher",
        "label": "Bear Researcher",
        "stage": "research",
        "defaultModelRole": "quick",
        "parallelizable": False,
        "apiKeyField": "TRADINGAGENTS_BEAR_LLM_API_KEY",
        "description": "Debate turn depends on prior context; route only for rate-limit isolation.",
    },
    {
        "key": "research_manager",
        "label": "Research Manager",
        "stage": "research",
        "defaultModelRole": "deep",
        "parallelizable": False,
        "apiKeyField": "TRADINGAGENTS_RESEARCH_MANAGER_LLM_API_KEY",
        "description": "Summarizes debate output and should remain after bull/bear turns.",
    },
    {
        "key": "trader",
        "label": "Trader",
        "stage": "trading",
        "defaultModelRole": "quick",
        "parallelizable": False,
        "apiKeyField": "TRADINGAGENTS_TRADER_LLM_API_KEY",
        "description": "Depends on the research manager plan.",
    },
    {
        "key": "aggressive_analyst",
        "label": "Aggressive Risk Analyst",
        "stage": "risk",
        "defaultModelRole": "quick",
        "parallelizable": False,
        "apiKeyField": "TRADINGAGENTS_AGGRESSIVE_LLM_API_KEY",
        "description": "Risk debate is sequential; route only for rate-limit isolation.",
    },
    {
        "key": "conservative_analyst",
        "label": "Conservative Risk Analyst",
        "stage": "risk",
        "defaultModelRole": "quick",
        "parallelizable": False,
        "apiKeyField": "TRADINGAGENTS_CONSERVATIVE_LLM_API_KEY",
        "description": "Risk debate is sequential; route only for rate-limit isolation.",
    },
    {
        "key": "neutral_analyst",
        "label": "Neutral Risk Analyst",
        "stage": "risk",
        "defaultModelRole": "quick",
        "parallelizable": False,
        "apiKeyField": "TRADINGAGENTS_NEUTRAL_LLM_API_KEY",
        "description": "Risk debate is sequential; route only for rate-limit isolation.",
    },
    {
        "key": "portfolio_manager",
        "label": "Portfolio Manager",
        "stage": "risk",
        "defaultModelRole": "deep",
        "parallelizable": False,
        "apiKeyField": "TRADINGAGENTS_PORTFOLIO_MANAGER_LLM_API_KEY",
        "description": "Final decision depends on the completed risk debate.",
    },
]

LLM_ROUTE_SECRET_FIELDS = [item["apiKeyField"] for item in LLM_ROUTE_TARGETS]

SECRET_FIELDS = [
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "ANTHROPIC_API_KEY",
    "XAI_API_KEY",
    "DEEPSEEK_API_KEY",
    "DASHSCOPE_API_KEY",
    "ZHIPU_API_KEY",
    "OPENROUTER_API_KEY",
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_DEPLOYMENT_NAME",
    "OPENAI_API_VERSION",
    "ALPHA_VANTAGE_API_KEY",
    "CUSTOM_OPENAI_API_KEY",
    "CUSTOM_DATA_API_KEY",
    "BACKTEST_DATA_API_KEY",
    "MOONSHOT_API_KEY",
    "MINIMAX_API_KEY",
    "BAICHUAN_API_KEY",
    "HUNYUAN_API_KEY",
    "ARK_API_KEY",
    "SILICONFLOW_API_KEY",
    "GROQ_API_KEY",
    "MISTRAL_API_KEY",
    "TOGETHER_API_KEY",
    "FIREWORKS_API_KEY",
    "PERPLEXITY_API_KEY",
] + LLM_ROUTE_SECRET_FIELDS

EXTRA_MODEL_OPTIONS = {
    "moonshot": ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
    "minimax": ["MiniMax-Text-01", "abab6.5s-chat", "abab6.5g-chat"],
    "baichuan": ["Baichuan4", "Baichuan3-Turbo", "Baichuan3-Turbo-128k"],
    "hunyuan": ["hunyuan-turbo", "hunyuan-large", "hunyuan-standard"],
    "volcengine": ["doubao-seed-1-6", "doubao-1-5-pro-32k", "doubao-1-5-lite-32k"],
    "siliconflow": ["Qwen/Qwen3-235B-A22B", "deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1"],
    "groq": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-120b"],
    "mistral": ["mistral-large-latest", "mistral-small-latest", "open-mixtral-8x22b"],
    "together": ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct-Turbo"],
    "fireworks": ["accounts/fireworks/models/llama-v3p3-70b-instruct", "accounts/fireworks/models/deepseek-v3"],
    "perplexity": ["sonar", "sonar-pro", "sonar-reasoning-pro"],
}


def provider_by_value(value: str) -> dict[str, Any] | None:
    provider = value.strip().lower()
    return next((item for item in PROVIDERS if item["value"] == provider), None)


def provider_default_base_url(value: str) -> str | None:
    provider = provider_by_value(value)
    return provider.get("defaultBaseUrl") if provider else None


def uses_openai_compatible_adapter(value: str, base_url: str | None = None) -> bool:
    provider = value.strip().lower()
    if provider == CUSTOM_OPENAI_PROVIDER or provider in OPENAI_COMPATIBLE_ADAPTER_PROVIDERS:
        return True
    if provider == "openai" and base_url:
        default_base_url = provider_default_base_url("openai")
        return base_url.rstrip("/") != (default_base_url or "").rstrip("/")
    return False


def provider_secret_field(value: str) -> str | None:
    provider = provider_by_value(value)
    return provider.get("apiKeyField") if provider else None


def provider_model_fetch(value: str) -> str:
    provider = provider_by_value(value)
    return provider.get("modelFetch", "none") if provider else "none"


def analyst_options() -> list[dict[str, str]]:
    return [
        {"label": display, "value": analyst.value}
        for display, analyst in CLI_ANALYST_ORDER
        if isinstance(analyst, AnalystType)
    ]


def model_options() -> dict[str, dict[str, list[dict[str, str]]]]:
    options = {
        provider: {
            mode: [{"label": label, "value": value} for label, value in options]
            for mode, options in modes.items()
        }
        for provider, modes in MODEL_OPTIONS.items()
    }
    options[CUSTOM_OPENAI_PROVIDER] = {
        "quick": [{"label": "Custom model ID", "value": "custom-model"}],
        "deep": [{"label": "Custom model ID", "value": "custom-model"}],
    }
    for provider, models in EXTRA_MODEL_OPTIONS.items():
        model_items = [{"label": model, "value": model} for model in models]
        options[provider] = {"quick": model_items, "deep": model_items}
    return options


def metadata_payload() -> dict[str, Any]:
    return {
        "analysts": analyst_options(),
        "researchDepths": RESEARCH_DEPTHS,
        "stockMarkets": STOCK_MARKETS,
        "providers": PROVIDERS,
        "models": model_options(),
        "languages": OUTPUT_LANGUAGES,
        "dataVendorCategories": DATA_VENDOR_CATEGORIES,
        "customDataMethods": CUSTOM_DATA_METHODS,
        "llmRouteTargets": LLM_ROUTE_TARGETS,
        "secretFields": SECRET_FIELDS,
    }
