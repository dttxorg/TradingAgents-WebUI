from __future__ import annotations

from typing import Any

from cli.utils import normalize_ticker_symbol

from .constants import STOCK_MARKETS
from .schemas import WebConfig


MARKET_LABELS = {item["key"]: item["label"] for item in STOCK_MARKETS}


def format_market_ticker(ticker: str, config: WebConfig) -> str:
    symbol = normalize_ticker_symbol(ticker)
    profile = config.market_profiles.get(config.stock_market)
    region = profile.region.strip().lstrip(".") if profile else ""
    if not symbol or not region or "." in symbol:
        return symbol
    return f"{symbol}.{region}"


def market_profile_prompt(input_ticker: str, runtime_ticker: str, config: WebConfig) -> str:
    profile = config.market_profiles.get(config.stock_market)
    if profile is None:
        return ""
    market_label = MARKET_LABELS.get(config.stock_market, config.stock_market.upper())
    region = profile.region or "none"
    return "\n".join(
        [
            "Market profile wrapper:",
            "Apply this market profile before selecting tools, interpreting data, or writing recommendations.",
            f"- Market: {market_label} ({config.stock_market})",
            f"- User input symbol: {input_ticker}",
            f"- Runtime/data-source symbol: {runtime_ticker}",
            f"- Configured region suffix: {region}",
            f"- Regional analysis weight: {profile.weight}",
            f"- Market profile prompt: {profile.market_profile or market_label}",
            "Respect exchange currency, trading hours, listing conventions, local macro/regulatory context, and data-source suffix conventions for this market.",
        ]
    )


def apply_market_profile(state: dict[str, Any], prompt: str) -> dict[str, Any]:
    if not prompt:
        return state
    messages = list(state.get("messages", []))
    messages.insert(0, ("system", prompt))
    state["messages"] = messages
    state["market_profile"] = prompt
    return state
