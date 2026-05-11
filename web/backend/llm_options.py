from __future__ import annotations

from contextlib import contextmanager
from threading import Lock
from typing import Any, Callable, Iterator

from .constants import CUSTOM_OPENAI_PROVIDER, OPENAI_COMPATIBLE_ADAPTER_PROVIDERS


DEEPSEEK_THINKING_DEFAULT = "disabled"
DEEPSEEK_THINKING_MODES = {"default", "enabled", "disabled"}
OPENAI_COMPATIBLE_RUNTIME_PROVIDERS = {
    "openai",
    "xai",
    "deepseek",
    "qwen",
    "glm",
    "ollama",
    "openrouter",
    CUSTOM_OPENAI_PROVIDER,
    *OPENAI_COMPATIBLE_ADAPTER_PROVIDERS,
}

_PATCH_LOCK = Lock()


def is_deepseek_target(provider: str | None, model: str | None, base_url: str | None = None) -> bool:
    fields = [provider or "", model or "", base_url or ""]
    return any("deepseek" in value.lower() for value in fields)


def is_openai_compatible_runtime(provider: str | None) -> bool:
    return (provider or "").strip().lower() in OPENAI_COMPATIBLE_RUNTIME_PROVIDERS


def deepseek_thinking_mode(config: dict[str, Any]) -> str:
    mode = str(config.get("deepseek_thinking_mode") or DEEPSEEK_THINKING_DEFAULT).strip().lower()
    return mode if mode in DEEPSEEK_THINKING_MODES else DEEPSEEK_THINKING_DEFAULT


def apply_deepseek_thinking_kwargs(
    config: dict[str, Any],
    provider: str | None,
    model: str | None,
    base_url: str | None,
    kwargs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    next_kwargs = dict(kwargs or {})
    mode = deepseek_thinking_mode(config)
    if mode == "default":
        return next_kwargs
    if not is_openai_compatible_runtime(provider):
        return next_kwargs
    if not is_deepseek_target(provider, model, base_url):
        return next_kwargs

    extra_body = dict(next_kwargs.get("extra_body") or {})
    extra_body["thinking"] = {"type": mode}
    next_kwargs["extra_body"] = extra_body
    ensure_openai_client_accepts_extra_body()
    return next_kwargs


def ensure_openai_client_accepts_extra_body() -> None:
    try:
        from tradingagents.llm_clients import openai_client
    except Exception:
        return

    passthrough = tuple(getattr(openai_client, "_PASSTHROUGH_KWARGS", ()))
    if "extra_body" not in passthrough:
        openai_client._PASSTHROUGH_KWARGS = (*passthrough, "extra_body")


@contextmanager
def patched_tradingagents_llm_client_factory(config: dict[str, Any]) -> Iterator[None]:
    """Inject DeepSeek thinking options into upstream graph LLM construction.

    TradingAgents imports ``create_llm_client`` directly inside
    ``tradingagents.graph.trading_graph``. This runtime wrapper keeps the
    upstream dependency untouched while allowing WebUI config to pass
    OpenAI-compatible request options into the LLM clients it creates.
    """

    from tradingagents.graph import trading_graph as trading_graph_module

    with _PATCH_LOCK:
        original: Callable[..., Any] = trading_graph_module.create_llm_client

        def wrapped_create_llm_client(provider: str, model: str, base_url: str | None = None, **kwargs: Any) -> Any:
            patched_kwargs = apply_deepseek_thinking_kwargs(config, provider, model, base_url, kwargs)
            return original(provider=provider, model=model, base_url=base_url, **patched_kwargs)

        trading_graph_module.create_llm_client = wrapped_create_llm_client
        try:
            yield
        finally:
            trading_graph_module.create_llm_client = original
