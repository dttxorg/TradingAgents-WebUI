from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import HumanMessage, RemoveMessage
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
JOIN_INITIAL_ANALYSTS_NODE = "Join Initial Analysts"
logger = logging.getLogger(__name__)


def has_enabled_llm_routes(config: dict[str, Any]) -> bool:
    return any(route.get("enabled") for route in config.get("llm_routes", {}).values())


def _analyst_node_name(analyst_type: str) -> str:
    return f"{analyst_type.capitalize()} Analyst"


def _msg_clear_node_name(analyst_type: str) -> str:
    return f"Msg Clear {analyst_type.capitalize()}"


def create_parallel_safe_msg_clear():
    def clear_messages(_state: AgentState) -> dict[str, Any]:
        return {}

    return clear_messages


def join_initial_analysts(state: AgentState) -> dict[str, Any]:
    report_status = {
        "market_report": bool(state.get("market_report")),
        "sentiment_report": bool(state.get("sentiment_report")),
        "news_report": bool(state.get("news_report")),
        "fundamentals_report": bool(state.get("fundamentals_report")),
    }
    logger.info(
        "parallel_initial_analysts_join ticker=%s reports=%s",
        state.get("company_of_interest"),
        report_status,
    )

    messages = state.get("messages") or []
    if not messages:
        return {}

    removals = [
        RemoveMessage(id=message_id)
        for message in messages
        if (message_id := getattr(message, "id", None)) is not None
    ]
    return {"messages": removals + [HumanMessage(content="Continue")]}


def _analyst_llm_key(analyst_type: str) -> str:
    return f"{analyst_type}_analyst"


def _analyst_node_factory(analyst_type: str):
    return {
        "market": create_market_analyst,
        "social": create_social_media_analyst,
        "news": create_news_analyst,
        "fundamentals": create_fundamentals_analyst,
    }[analyst_type]


def _analyst_nodes(
    graph: Any,
    router: "LLMRouter",
    selected_analysts: list[str],
    *,
    parallel_safe_clear: bool = False,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    analyst_nodes = {}
    delete_nodes = {}
    tool_nodes = {}

    for analyst_type in selected_analysts:
        analyst_nodes[analyst_type] = _analyst_node_factory(analyst_type)(router.llm(_analyst_llm_key(analyst_type)))
        delete_nodes[analyst_type] = create_parallel_safe_msg_clear() if parallel_safe_clear else create_msg_delete()
        tool_nodes[analyst_type] = graph.tool_nodes[analyst_type]

    return analyst_nodes, delete_nodes, tool_nodes


def _add_research_and_risk_nodes(workflow: StateGraph, router: "LLMRouter") -> None:
    workflow.add_node("Bull Researcher", create_bull_researcher(router.llm("bull_researcher")))
    workflow.add_node("Bear Researcher", create_bear_researcher(router.llm("bear_researcher")))
    workflow.add_node("Research Manager", create_research_manager(router.llm("research_manager")))
    workflow.add_node("Trader", create_trader(router.llm("trader")))
    workflow.add_node("Aggressive Analyst", create_aggressive_debator(router.llm("aggressive_analyst")))
    workflow.add_node("Neutral Analyst", create_neutral_debator(router.llm("neutral_analyst")))
    workflow.add_node("Conservative Analyst", create_conservative_debator(router.llm("conservative_analyst")))
    workflow.add_node("Portfolio Manager", create_portfolio_manager(router.llm("portfolio_manager")))


def _add_research_and_risk_edges(workflow: StateGraph, graph: Any, *, first_node: str) -> None:
    workflow.add_edge(first_node, "Bull Researcher")
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
    analyst_nodes, delete_nodes, tool_nodes = _analyst_nodes(graph, router, selected_analysts)

    workflow = StateGraph(AgentState)

    for analyst_type, node in analyst_nodes.items():
        workflow.add_node(_analyst_node_name(analyst_type), node)
        workflow.add_node(_msg_clear_node_name(analyst_type), delete_nodes[analyst_type])
        workflow.add_node(f"tools_{analyst_type}", tool_nodes[analyst_type])

    _add_research_and_risk_nodes(workflow, router)

    first_analyst = selected_analysts[0]
    workflow.add_edge(START, _analyst_node_name(first_analyst))

    for index, analyst_type in enumerate(selected_analysts):
        current_analyst = _analyst_node_name(analyst_type)
        current_tools = f"tools_{analyst_type}"
        current_clear = _msg_clear_node_name(analyst_type)
        workflow.add_conditional_edges(
            current_analyst,
            getattr(graph.conditional_logic, f"should_continue_{analyst_type}"),
            [current_tools, current_clear],
        )
        workflow.add_edge(current_tools, current_analyst)
        if index < len(selected_analysts) - 1:
            workflow.add_edge(current_clear, _analyst_node_name(selected_analysts[index + 1]))
        else:
            _add_research_and_risk_edges(workflow, graph, first_node=current_clear)

    return workflow


def parallel_initial_analyst_workflow(
    graph: Any,
    selected_analysts: list[str],
    config: dict[str, Any],
    secrets: dict[str, str],
    callbacks: list[Any],
):
    """Build a workflow that runs the initial analyst tool loops in parallel."""

    router = LLMRouter(config, secrets, callbacks, graph.quick_thinking_llm, graph.deep_thinking_llm)
    analyst_nodes, clear_nodes, tool_nodes = _analyst_nodes(graph, router, selected_analysts, parallel_safe_clear=True)
    workflow = StateGraph(AgentState)

    for analyst_type, node in analyst_nodes.items():
        workflow.add_node(_analyst_node_name(analyst_type), node)
        workflow.add_node(_msg_clear_node_name(analyst_type), clear_nodes[analyst_type])
        workflow.add_node(f"tools_{analyst_type}", tool_nodes[analyst_type])

    _add_research_and_risk_nodes(workflow, router)
    workflow.add_node(JOIN_INITIAL_ANALYSTS_NODE, join_initial_analysts)

    clear_node_names = []
    for analyst_type in selected_analysts:
        current_analyst = _analyst_node_name(analyst_type)
        current_tools = f"tools_{analyst_type}"
        current_clear = _msg_clear_node_name(analyst_type)
        clear_node_names.append(current_clear)
        workflow.add_edge(START, current_analyst)
        workflow.add_conditional_edges(
            current_analyst,
            getattr(graph.conditional_logic, f"should_continue_{analyst_type}"),
            [current_tools, current_clear],
        )
        workflow.add_edge(current_tools, current_analyst)

    workflow.add_edge(clear_node_names, JOIN_INITIAL_ANALYSTS_NODE)
    _add_research_and_risk_edges(workflow, graph, first_node=JOIN_INITIAL_ANALYSTS_NODE)
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
