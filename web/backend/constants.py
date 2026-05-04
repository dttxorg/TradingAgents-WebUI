from __future__ import annotations

from typing import Any

from cli.models import AnalystType
from cli.utils import ANALYST_ORDER as CLI_ANALYST_ORDER
from tradingagents.llm_clients.model_catalog import MODEL_OPTIONS


CUSTOM_OPENAI_PROVIDER = "custom_openai"
CUSTOM_DATA_VENDOR = "custom"

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

PROVIDERS = [
    {"label": "OpenAI", "value": "openai", "defaultBaseUrl": "https://api.openai.com/v1"},
    {"label": "Google", "value": "google", "defaultBaseUrl": None},
    {"label": "Anthropic", "value": "anthropic", "defaultBaseUrl": "https://api.anthropic.com/"},
    {"label": "xAI", "value": "xai", "defaultBaseUrl": "https://api.x.ai/v1"},
    {"label": "DeepSeek", "value": "deepseek", "defaultBaseUrl": "https://api.deepseek.com"},
    {
        "label": "Qwen",
        "value": "qwen",
        "defaultBaseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
    {"label": "GLM", "value": "glm", "defaultBaseUrl": "https://open.bigmodel.cn/api/paas/v4/"},
    {"label": "OpenRouter", "value": "openrouter", "defaultBaseUrl": "https://openrouter.ai/api/v1"},
    {"label": "Azure OpenAI", "value": "azure", "defaultBaseUrl": None},
    {"label": "Ollama", "value": "ollama", "defaultBaseUrl": "http://localhost:11434/v1"},
    {"label": "Custom OpenAI-compatible", "value": CUSTOM_OPENAI_PROVIDER, "defaultBaseUrl": None},
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
]


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
    return options


def metadata_payload() -> dict[str, Any]:
    return {
        "analysts": analyst_options(),
        "researchDepths": RESEARCH_DEPTHS,
        "providers": PROVIDERS,
        "models": model_options(),
        "languages": OUTPUT_LANGUAGES,
        "dataVendorCategories": DATA_VENDOR_CATEGORIES,
        "customDataMethods": CUSTOM_DATA_METHODS,
        "secretFields": SECRET_FIELDS,
    }
