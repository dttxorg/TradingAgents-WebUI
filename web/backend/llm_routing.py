from __future__ import annotations

from typing import Any

from langgraph.graph import END, START, StateGraph

from tradingagents.agents import (
    AgentState,
    create_aggressive_debator,
    create_bear_researcher,
    create_bull_researcher,
    create_conservative_debator,
    create_fundamentals_analyst,
    create_market_analyst,
    create_msg_delete,
    create_neutral_debator,
    create_news_analyst,
    create_portfolio_manager,
    create_research_manager,
    create_social_media_analyst,
    create_trader,
)
from tradingagents.llm_clients import create_llm_client

from .constants import (
    LLM_ROUTE_TARGETS,
    provider_default_base_url,
    provider_secret_field,
    uses_openai_compatible_adapter,
)
from .llm_options import apply_deepseek_thinking_kwargs
from .schemas import LLMRouteConfig


ROUTE_META = {item["key"]: item for item in LLM_ROUTE_TARGETS}


def has_enabled_llm_routes(config: dict[str, Any]) -> bool:
    return any(route.get("enabled") for route in config.get("llm_routes", {}).values())


def routed_workflow(
    graph: Any,
    selected_analysts: list[str],
    config: dict[str, Any],
    secrets: dict[str, str],
    callbacks: list[Any],
):
    """Build a TradingAgents workflow with optional per-node LLM clients.

    Upstream TradingAgents currently constructs one quick and one deep LLM for
    the whole graph. This adapter keeps the upstream graph topology intact while
    allowing selected nodes to use separate OpenAI-compatible/API credentials.
    """

    router = LLMRouter(config, secrets, callbacks, graph.quick_thinking_llm, graph.deep_thinking_llm)

    analyst_nodes = {}
    delete_nodes = {}
    tool_nodes = {}

    if "market" in selected_analysts:
        analyst_nodes["market"] = create_market_analyst(router.llm("market_analyst"))
        delete_nodes["market"] = create_msg_delete()
        tool_nodes["market"] = graph.tool_nodes["market"]

    if "social" in selected_analysts:
        analyst_nodes["social"] = create_social_media_analyst(router.llm("social_analyst"))
        delete_nodes["social"] = create_msg_delete()
        tool_nodes["social"] = graph.tool_nodes["social"]

    if "news" in selected_analysts:
        analyst_nodes["news"] = create_news_analyst(router.llm("news_analyst"))
        delete_nodes["news"] = create_msg_delete()
        tool_nodes["news"] = graph.tool_nodes["news"]

    if "fundamentals" in selected_analysts:
        analyst_nodes["fundamentals"] = create_fundamentals_analyst(router.llm("fundamentals_analyst"))
        delete_nodes["fundamentals"] = create_msg_delete()
        tool_nodes["fundamentals"] = graph.tool_nodes["fundamentals"]

    workflow = StateGraph(AgentState)

    for analyst_type, node in analyst_nodes.items():
        workflow.add_node(f"{analyst_type.capitalize()} Analyst", node)
        workflow.add_node(f"Msg Clear {analyst_type.capitalize()}", delete_nodes[analyst_type])
        workflow.add_node(f"tools_{analyst_type}", tool_nodes[analyst_type])

    workflow.add_node("Bull Researcher", create_bull_researcher(router.llm("bull_researcher")))
    workflow.add_node("Bear Researcher", create_bear_researcher(router.llm("bear_researcher")))
    workflow.add_node("Research Manager", create_research_manager(router.llm("research_manager")))
    workflow.add_node("Trader", create_trader(router.llm("trader")))
    workflow.add_node("Aggressive Analyst", create_aggressive_debator(router.llm("aggressive_analyst")))
    workflow.add_node("Neutral Analyst", create_neutral_debator(router.llm("neutral_analyst")))
    workflow.add_node("Conservative Analyst", create_conservative_debator(router.llm("conservative_analyst")))
    workflow.add_node("Portfolio Manager", create_portfolio_manager(router.llm("portfolio_manager")))

    first_analyst = selected_analysts[0]
    workflow.add_edge(START, f"{first_analyst.capitalize()} Analyst")

    for index, analyst_type in enumerate(selected_analysts):
        current_analyst = f"{analyst_type.capitalize()} Analyst"
        current_tools = f"tools_{analyst_type}"
        current_clear = f"Msg Clear {analyst_type.capitalize()}"
        workflow.add_conditional_edges(
            current_analyst,
            getattr(graph.conditional_logic, f"should_continue_{analyst_type}"),
            [current_tools, current_clear],
        )
        workflow.add_edge(current_tools, current_analyst)
        if index < len(selected_analysts) - 1:
            workflow.add_edge(current_clear, f"{selected_analysts[index + 1].capitalize()} Analyst")
        else:
            workflow.add_edge(current_clear, "Bull Researcher")

    workflow.add_conditional_edges(
        "Bull Researcher",
        graph.conditional_logic.should_continue_debate,
        {"Bear Researcher": "Bear Researcher", "Research Manager": "Research Manager"},
    )
    workflow.add_conditional_edges(
        "Bear Researcher",
        graph.conditional_logic.should_continue_debate,
        {"Bull Researcher": "Bull Researcher", "Research Manager": "Research Manager"},
    )
    workflow.add_edge("Research Manager", "Trader")
    workflow.add_edge("Trader", "Aggressive Analyst")
    workflow.add_conditional_edges(
        "Aggressive Analyst",
        graph.conditional_logic.should_continue_risk_analysis,
        {"Conservative Analyst": "Conservative Analyst", "Portfolio Manager": "Portfolio Manager"},
    )
    workflow.add_conditional_edges(
        "Conservative Analyst",
        graph.conditional_logic.should_continue_risk_analysis,
        {"Neutral Analyst": "Neutral Analyst", "Portfolio Manager": "Portfolio Manager"},
    )
    workflow.add_conditional_edges(
        "Neutral Analyst",
        graph.conditional_logic.should_continue_risk_analysis,
        {"Aggressive Analyst": "Aggressive Analyst", "Portfolio Manager": "Portfolio Manager"},
    )
    workflow.add_edge("Portfolio Manager", END)
    return workflow


class LLMRouter:
    def __init__(
        self,
        config: dict[str, Any],
        secrets: dict[str, str],
        callbacks: list[Any],
        default_quick_llm: Any,
        default_deep_llm: Any,
    ) -> None:
        self.config = config
        self.secrets = secrets
        self.callbacks = callbacks
        self.default_quick_llm = default_quick_llm
        self.default_deep_llm = default_deep_llm

    def llm(self, route_key: str) -> Any:
        route_payload = self.config.get("llm_routes", {}).get(route_key, {})
        route = LLMRouteConfig.model_validate(route_payload)
        role = ROUTE_META[route_key]["defaultModelRole"]
        if not route.enabled:
            return self.default_deep_llm if role == "deep" else self.default_quick_llm

        provider = route.provider or self.config["llm_provider"]
        model = route.model_id or self.config["deep_think_llm" if role == "deep" else "quick_think_llm"]
        base_url = route.backend_url or self.config.get("backend_url") or provider_default_base_url(provider)
        client_provider = provider
        kwargs = self._provider_kwargs(provider)

        route_secret = self.secrets.get(ROUTE_META[route_key]["apiKeyField"])
        provider_secret = self.secrets.get(provider_secret_field(provider) or "")
        api_key = route_secret or provider_secret

        if uses_openai_compatible_adapter(provider, base_url):
            client_provider = "openrouter"
            if not base_url:
                raise RuntimeError(f"Base URL is required for {ROUTE_META[route_key]['label']} LLM route.")

        if provider != "ollama" and api_key:
            kwargs["api_key"] = api_key
        elif provider != "ollama" and uses_openai_compatible_adapter(provider, base_url):
            raise RuntimeError(
                f"{ROUTE_META[route_key]['apiKeyField']} or {provider_secret_field(provider)} is required for "
                f"{ROUTE_META[route_key]['label']} LLM route."
            )

        kwargs = apply_deepseek_thinking_kwargs(self.config, client_provider, model, base_url, kwargs)
        client = create_llm_client(provider=client_provider, model=model, base_url=base_url, **kwargs)
        return client.get_llm()

    def _provider_kwargs(self, provider: str) -> dict[str, Any]:
        kwargs: dict[str, Any] = {}
        if self.callbacks:
            kwargs["callbacks"] = self.callbacks

        normalized = provider.lower()
        if normalized == "google" and self.config.get("google_thinking_level"):
            kwargs["thinking_level"] = self.config["google_thinking_level"]
        elif normalized == "openai" and self.config.get("openai_reasoning_effort"):
            kwargs["reasoning_effort"] = self.config["openai_reasoning_effort"]
        elif normalized == "anthropic" and self.config.get("anthropic_effort"):
            kwargs["effort"] = self.config["anthropic_effort"]
        return kwargs
