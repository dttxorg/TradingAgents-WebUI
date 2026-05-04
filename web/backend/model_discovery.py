from __future__ import annotations

from typing import Any

import requests

from .constants import model_options, provider_default_base_url, provider_model_fetch, provider_secret_field
from .schemas import DiscoveredModel, ModelFetchRequest, ModelFetchResponse


def fetch_provider_models(request: ModelFetchRequest, secrets: dict[str, str]) -> ModelFetchResponse:
    strategy = provider_model_fetch(request.provider)
    if strategy == "none":
        return _static_models(request.provider, request.base_url, "static")

    base_url = request.base_url or provider_default_base_url(request.provider)
    if not base_url:
        raise ValueError("Base URL is required to fetch models for this provider.")

    secret_field = provider_secret_field(request.provider)
    api_key = secrets.get(secret_field) if secret_field else None
    if secret_field and not api_key:
        raise ValueError(f"{secret_field} is required before fetching models.")

    if strategy == "openai_compatible":
        models = _fetch_openai_compatible_models(base_url, api_key)
    elif strategy == "google":
        models = _fetch_google_models(base_url, api_key)
    elif strategy == "anthropic":
        models = _fetch_anthropic_models(base_url, api_key)
    else:
        raise ValueError(f"Unsupported model discovery strategy: {strategy}")

    if not models:
        return _static_models(request.provider, base_url, "empty_remote_fallback")
    return ModelFetchResponse(provider=request.provider, base_url=base_url, source=strategy, models=models)


def _fetch_openai_compatible_models(base_url: str, api_key: str | None) -> list[DiscoveredModel]:
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    response = requests.get(f"{base_url.rstrip('/')}/models", headers=headers, timeout=20)
    response.raise_for_status()
    payload = response.json()
    raw_models = payload.get("data", payload.get("models", [])) if isinstance(payload, dict) else payload
    return _models_from_items(raw_models)


def _fetch_google_models(base_url: str, api_key: str | None) -> list[DiscoveredModel]:
    url = f"{base_url.rstrip('/')}/models" if base_url.rstrip("/").endswith("/v1beta") else f"{base_url.rstrip('/')}/v1beta/models"
    response = requests.get(url, params={"key": api_key}, timeout=20)
    response.raise_for_status()
    payload = response.json()
    raw_models = payload.get("models", []) if isinstance(payload, dict) else []
    return _models_from_items(raw_models, strip_prefix="models/")


def _fetch_anthropic_models(base_url: str, api_key: str | None) -> list[DiscoveredModel]:
    response = requests.get(
        f"{base_url.rstrip('/')}/v1/models",
        headers={"x-api-key": api_key or "", "anthropic-version": "2023-06-01"},
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()
    raw_models = payload.get("data", []) if isinstance(payload, dict) else []
    return _models_from_items(raw_models, label_key="display_name")


def _models_from_items(items: Any, label_key: str = "id", strip_prefix: str | None = None) -> list[DiscoveredModel]:
    models: list[DiscoveredModel] = []
    seen: set[str] = set()
    if not isinstance(items, list):
        return models
    for item in items:
        if isinstance(item, str):
            model_id = item
            label = item
        elif isinstance(item, dict):
            model_id = item.get("id") or item.get("name")
            label = item.get(label_key) or item.get("displayName") or item.get("name") or model_id
        else:
            continue
        if not isinstance(model_id, str) or not model_id:
            continue
        if strip_prefix and model_id.startswith(strip_prefix):
            model_id = model_id[len(strip_prefix):]
        label = label if isinstance(label, str) and label else model_id
        if strip_prefix and label.startswith(strip_prefix):
            label = label[len(strip_prefix):]
        if model_id in seen:
            continue
        seen.add(model_id)
        models.append(DiscoveredModel(label=label, value=model_id))
    return sorted(models, key=lambda model: model.value)


def _static_models(provider: str, base_url: str | None, source: str) -> ModelFetchResponse:
    static_models = model_options().get(provider, {})
    merged = {
        option["value"]: DiscoveredModel(label=option["label"], value=option["value"])
        for options in static_models.values()
        for option in options
    }
    return ModelFetchResponse(provider=provider, base_url=base_url, source=source, models=list(merged.values()))
