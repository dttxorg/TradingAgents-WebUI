from __future__ import annotations

import json
from typing import Any, Callable

import requests

from .constants import CUSTOM_DATA_METHODS, CUSTOM_DATA_VENDOR
from .ssrf_guard import assert_safe_url, safe_request_kwargs


DEFAULT_ENDPOINTS = {item["method"]: item["defaultPath"] for item in CUSTOM_DATA_METHODS}
METHOD_CATEGORIES = {item["method"]: item["category"] for item in CUSTOM_DATA_METHODS}


def configure_custom_data_interfaces(config: dict[str, Any], api_key: str | None = None) -> None:
    """Register a generic HTTP custom data vendor into TradingAgents.

    The upstream project routes all data tools through
    ``tradingagents.dataflows.interface.VENDOR_METHODS``. Registering a
    ``custom`` vendor here keeps the WebUI independent from upstream source
    edits while still allowing users to point categories at their own service.
    """
    from tradingagents.dataflows import interface

    for method in DEFAULT_ENDPOINTS:
        if method in interface.VENDOR_METHODS:
            interface.VENDOR_METHODS[method][CUSTOM_DATA_VENDOR] = _custom_method(method, config, api_key)


def _custom_method(method: str, config: dict[str, Any], api_key: str | None) -> Callable[..., str]:
    def call(*args: Any, **kwargs: Any) -> str:
        category = METHOD_CATEGORIES[method]
        custom_interfaces = config.get("custom_data_interfaces", {})
        settings = custom_interfaces.get(category, {})
        base_url = (settings.get("baseUrl") or settings.get("base_url") or "").rstrip("/")
        if not base_url:
            raise RuntimeError(f"Custom data interface for '{category}' requires a base URL.")

        # Validate the base URL up front so we never make an outbound request
        # to a private network, link-local, or otherwise blocked host.
        base_url = assert_safe_url(base_url, context=f"custom data interface '{category}'")

        endpoint_map = settings.get("endpoints", {})
        path = endpoint_map.get(method) or DEFAULT_ENDPOINTS[method]
        # ``path`` is already constrained to start with "/" by the schema
        # validator; we re-check defensively in case it ever bypasses the API.
        if not path.startswith("/"):
            path = f"/{path}"
        url = f"{base_url}{path}"
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        response = requests.post(
            url,
            headers=headers,
            json={"method": method, "args": list(args), "kwargs": kwargs},
            **safe_request_kwargs(url, context=f"custom data interface '{category}'"),
        )
        response.raise_for_status()

        content_type = response.headers.get("content-type", "")
        if "application/json" in content_type:
            payload = response.json()
            if isinstance(payload, dict) and "data" in payload:
                payload = payload["data"]
            return payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)

        return response.text

    return call
