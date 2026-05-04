from __future__ import annotations

from typing import Any

from cli.models import AnalystType
from cli.utils import ANALYST_ORDER as CLI_ANALYST_ORDER
from tradingagents.llm_clients.model_catalog import MODEL_OPTIONS


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
]

DATA_VENDOR_CATEGORIES = [
    {
        "key": "core_stock_apis",
        "label": "Core Stock APIs",
        "options": ["yfinance", "alpha_vantage"],
    },
    {
        "key": "technical_indicators",
        "label": "Technical Indicators",
        "options": ["yfinance", "alpha_vantage"],
    },
    {
        "key": "fundamental_data",
        "label": "Fundamental Data",
        "options": ["yfinance", "alpha_vantage"],
    },
    {
        "key": "news_data",
        "label": "News Data",
        "options": ["yfinance", "alpha_vantage"],
    },
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
]


def analyst_options() -> list[dict[str, str]]:
    return [
        {"label": display, "value": analyst.value}
        for display, analyst in CLI_ANALYST_ORDER
        if isinstance(analyst, AnalystType)
    ]


def model_options() -> dict[str, dict[str, list[dict[str, str]]]]:
    return {
        provider: {
            mode: [{"label": label, "value": value} for label, value in options]
            for mode, options in modes.items()
        }
        for provider, modes in MODEL_OPTIONS.items()
    }


def metadata_payload() -> dict[str, Any]:
    return {
        "analysts": analyst_options(),
        "researchDepths": RESEARCH_DEPTHS,
        "providers": PROVIDERS,
        "models": model_options(),
        "languages": OUTPUT_LANGUAGES,
        "dataVendorCategories": DATA_VENDOR_CATEGORIES,
        "secretFields": SECRET_FIELDS,
    }
