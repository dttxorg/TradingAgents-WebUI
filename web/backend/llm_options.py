from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
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

# Module-attribute swap is atomic in CPython, but a tiny lock keeps nested
# patch contexts safe and serialises only the attribute-swap, not the
# downstream graph construction.
_PATCH_LOCK = Lock()
# Per-context override of TradingAgents' LLM-client factory. Exposed for
# callers that want to look up the active factory without traversing the
# with-block's bound ``wrapped_create_llm_client`` closure.
_PATCHED_FACTORY: ContextVar[Callable[..., Any] | None] = ContextVar(
    "tradingagents_patched_factory", default=None
)


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
    return next_kwargs


@contextmanager
def patched_tradingagents_llm_client_factory(config: dict[str, Any]) -> Iterator[None]:
    """Inject DeepSeek thinking options into upstream graph LLM construction.

    TradingAgents imports ``create_llm_client`` directly inside
    ``tradingagents.graph.trading_graph``. This runtime wrapper keeps the
    upstream dependency untouched while allowing WebUI config to pass
    OpenAI-compatible request options into the LLM clients it creates.

    The previous implementation held a process-wide lock for the entire
    ``with`` block, which serialised every concurrent graph build (so
    ``max_parallel_runs`` had no effect). This version only locks the
    brief instant of swapping the module attribute; the graph build
    itself runs lock-free.
    """

    from tradingagents.graph import trading_graph as trading_graph_module

    original = trading_graph_module.create_llm_client

    def wrapped_create_llm_client(provider: str, model: str, base_url: str | None = None, **kwargs: Any) -> Any:
        patched_kwargs = apply_deepseek_thinking_kwargs(config, provider, model, base_url, kwargs)
        return original(provider=provider, model=model, base_url=base_url, **patched_kwargs)

    # Module attribute swap is atomic in CPython, but a tiny lock keeps
    # nested patch contexts safe.
    with _PATCH_LOCK:
        trading_graph_module.create_llm_client = wrapped_create_llm_client
    try:
        yield
    finally:
        trading_graph_module.create_llm_client = original


def get_patched_create_llm_client() -> Callable[..., Any]:
    """Return the per-context patched factory, or None if not in a patch scope."""
    return _PATCHED_FACTORY.get()
