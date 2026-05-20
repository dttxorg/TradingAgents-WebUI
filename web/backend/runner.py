from __future__ import annotations

import json
import logging
import os
import queue
import threading
import time
import traceback
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from langchain_core.callbacks import BaseCallbackHandler

from cli.main import (
    ANALYST_AGENT_NAMES,
    ANALYST_ORDER,
    ANALYST_REPORT_MAP,
    MessageBuffer,
    classify_message_type,
    update_analyst_statuses,
)
from cli.stats_handler import StatsCallbackHandler
from tradingagents.graph.checkpointer import clear_checkpoint, get_checkpointer, thread_id
from tradingagents.graph.trading_graph import TradingAgentsGraph

from .constants import (
    provider_default_base_url,
    provider_secret_field,
    uses_openai_compatible_adapter,
)
from .custom_data import configure_custom_data_interfaces
from .llm_options import patched_tradingagents_llm_client_factory
from .llm_routing import LLMRouter, parallel_initial_analyst_workflow, has_enabled_llm_routes, routed_workflow
from .markets import apply_market_profile, format_market_ticker, market_profile_prompt
from .reference_reviewers import (
    REVIEWER_AGENT_NAMES,
    REVIEWER_OUTPUT_KEYS,
    REVIEWER_ROUTE_KEYS,
    is_review_unavailable,
    run_reference_reviews,
    unavailable_review,
)
from .schemas import BatchRunRequest, RunBilling, RunInfo, RunReports, RunRequest, UserPublic, WebConfig
from .storage import WebStorage


logger = logging.getLogger(__name__)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


EVENT_MESSAGES = {
    "English": {
        "run_queued": "Run queued.",
        "analysis_started": "Analysis started.",
        "resolving_memory": "Resolving memory log context.",
        "analysis_completed": "Analysis completed.",
        "cancellation_requested": "Cancellation requested.",
        "analysis_cancelled": "Analysis cancelled.",
    },
    "Chinese": {
        "run_queued": "任务已进入队列。",
        "analysis_started": "分析已开始。",
        "resolving_memory": "正在读取历史记忆上下文。",
        "analysis_completed": "分析已完成。",
        "cancellation_requested": "已请求停止分析。",
        "analysis_cancelled": "分析已停止。",
    },
}

REPORT_TITLES = {
    "English": {
        "main": "Trading Analysis Report",
        "market_report": "Market Analysis",
        "sentiment_report": "Social Sentiment",
        "news_report": "News Analysis",
        "fundamentals_report": "Fundamentals Analysis",
        "investment_plan": "Research Team Decision",
        "trader_investment_plan": "Trading Team Plan",
        "final_trade_decision": "Portfolio Manager Decision",
        "buffett_review": "Buffett Reference Review",
        "munger_review": "Munger Reference Review",
        "investment_debate_state": "Investment Debate",
        "risk_debate_state": "Risk Debate",
    },
    "Chinese": {
        "main": "交易分析报告",
        "market_report": "市场分析",
        "sentiment_report": "社交情绪",
        "news_report": "新闻分析",
        "fundamentals_report": "基本面分析",
        "investment_plan": "研究团队结论",
        "trader_investment_plan": "交易团队计划",
        "final_trade_decision": "组合经理决策",
        "buffett_review": "巴菲特视角参考",
        "munger_review": "芒格视角参考",
        "investment_debate_state": "投资辩论",
        "risk_debate_state": "风险辩论",
    },
}


def language_key(language: str) -> str:
    normalized = language.strip().lower()
    if normalized.startswith("chinese") or normalized in {"中文", "zh", "zh-cn"}:
        return "Chinese"
    return "English"


def localized_event_message(language: str, key: str) -> str:
    language_messages = EVENT_MESSAGES.get(language_key(language), EVENT_MESSAGES["English"])
    return language_messages.get(key, EVENT_MESSAGES["English"][key])


def localized_report_titles(language: str) -> dict[str, str]:
    titles = dict(REPORT_TITLES["English"])
    titles.update(REPORT_TITLES.get(language_key(language), {}))
    return titles


def configure_runtime_workflow(
    graph: Any,
    selected_analysts: list[str],
    runtime_config: dict[str, Any],
    secrets: dict[str, str],
    callbacks: list[Any],
) -> bool:
    if runtime_config.get("parallel_initial_analysts"):
        graph.workflow = parallel_initial_analyst_workflow(
            graph,
            selected_analysts,
            runtime_config,
            secrets,
            callbacks,
        )
        graph.graph = graph.workflow.compile()
        return True
    if has_enabled_llm_routes(runtime_config):
        graph.workflow = routed_workflow(
            graph,
            selected_analysts,
            runtime_config,
            secrets,
            callbacks,
        )
        graph.graph = graph.workflow.compile()
        return True
    return False


class WebEventCallbackHandler(BaseCallbackHandler):
    def __init__(self, run: "RunRecord") -> None:
        super().__init__()
        self.run = run

    def on_llm_start(self, serialized: dict[str, Any], prompts: list[str], **kwargs: Any) -> None:
        name = serialized.get("name") or serialized.get("id", ["LLM"])[-1]
        self.run.emit("llm", {"phase": "start", "name": name})

    def on_tool_start(self, serialized: dict[str, Any], input_str: str, **kwargs: Any) -> None:
        name = serialized.get("name") or serialized.get("id", ["Tool"])[-1]
        self.run.emit("tool", {"phase": "start", "name": name, "input": input_str[:400]})


@dataclass
class RunRecord:
    id: str
    request: RunRequest
    config: WebConfig
    raw_ticker: str | None = None
    user_id: str | None = None
    order_id: str | None = None
    billing: RunBilling | None = None
    submitted_at: datetime = field(default_factory=utc_now)
    started_at: datetime | None = None
    ended_at: datetime | None = None
    status: str = "queued"
    error: str | None = None
    decision: str | None = None
    stats: dict[str, Any] = field(default_factory=dict)
    reports: dict[str, Any] = field(default_factory=dict)
    final_report: str | None = None
    cancel_requested: bool = False
    next_run_id: str | None = None
    events: list[dict[str, Any]] = field(default_factory=list)
    event_queue: "queue.Queue[dict[str, Any]]" = field(default_factory=queue.Queue)
    billing_settled: bool = False

    def emit(self, event_type: str, payload: dict[str, Any]) -> None:
        event = {
            "id": len(self.events) + 1,
            "type": event_type,
            "timestamp": utc_now().isoformat(),
            "payload": payload,
        }
        self.events.append(event)
        self.event_queue.put(event)

    def info(self) -> RunInfo:
        return RunInfo(
            id=self.id,
            status=self.status,
            ticker=self.request.ticker,
            analysis_date=self.request.analysis_date,
            user_id=self.user_id,
            order_id=self.order_id,
            submitted_at=self.submitted_at,
            started_at=self.started_at,
            ended_at=self.ended_at,
            error=self.error,
            decision=self.decision,
            stats=self.stats,
            billing=self.billing,
        )

    def report_payload(self) -> RunReports:
        return RunReports(
            run_id=self.id,
            reports=self.reports,
            final_report=self.final_report,
            decision=self.decision,
        )


class RunManager:
    def __init__(self, storage: WebStorage | None = None) -> None:
        self.storage = storage or WebStorage()
        self.runs: dict[str, RunRecord] = {}
        self.pending: "queue.Queue[str]" = queue.Queue()
        self._lock = threading.Lock()
        self._worker_lock = threading.Lock()
        self._workers: list[threading.Thread] = []
        self._ensure_worker_count(self.storage.load_config().max_parallel_runs)

    def create_run(self, request: RunRequest, user: UserPublic | None = None) -> RunRecord:
        return self._create_run(request, user=user, enqueue=True)

    def _create_run(self, request: RunRequest, user: UserPublic | None = None, enqueue: bool = True) -> RunRecord:
        config = request.config or self.storage.load_config()
        self._ensure_worker_count(config.max_parallel_runs)
        raw_ticker = request.ticker
        runtime_ticker = format_market_ticker(raw_ticker, config)
        config = config.model_copy(
            update={
                "ticker": runtime_ticker,
                "analysis_date": request.analysis_date,
            }
        )
        request = request.model_copy(update={"ticker": runtime_ticker})
        run_id = str(uuid.uuid4())
        billing = None
        order_id = None
        if user is not None:
            billing = self.storage.preauthorize_analysis(user.id, run_id, config)
            order_id = billing.order_id
        run = RunRecord(id=run_id, request=request, config=config, raw_ticker=raw_ticker, user_id=user.id if user else None, order_id=order_id, billing=billing)
        with self._lock:
            self.runs[run.id] = run
        run.emit(
            "status",
            {
                "status": "queued",
                "message": localized_event_message(run.config.output_language, "run_queued"),
                "billing": run.billing.model_dump(mode="json", by_alias=True) if run.billing else None,
            },
        )
        if enqueue:
            self.pending.put(run.id)
        return run

    def create_batch_runs(self, request: BatchRunRequest, user: UserPublic | None = None) -> list[RunRecord]:
        runs: list[RunRecord] = []
        if user is not None:
            config = request.config or self.storage.load_config()
            self.storage.ensure_batch_balance(user.id, config, len(request.tickers))
        for index, ticker in enumerate(request.tickers):
            runs.append(
                self._create_run(
                    RunRequest(ticker=ticker, analysis_date=request.analysis_date, config=request.config),
                    user=user,
                    enqueue=index == 0,
                )
            )
        for current, next_run in zip(runs, runs[1:]):
            current.next_run_id = next_run.id
        return runs

    def get_run(self, run_id: str) -> RunRecord | None:
        with self._lock:
            return self.runs.get(run_id)

    def cancel_run(self, run_id: str) -> RunRecord | None:
        run = self.get_run(run_id)
        if run is None:
            return None
        if run.status in {"succeeded", "failed", "cancelled"}:
            return run
        run.cancel_requested = True
        if run.status == "queued":
            run.status = "cancelled"
            run.ended_at = utc_now()
            run.emit(
                "status",
                {
                    "status": "cancelled",
                    "message": localized_event_message(run.config.output_language, "analysis_cancelled"),
                    "billing": run.billing.model_dump(mode="json", by_alias=True) if run.billing else None,
                },
            )
            return run
        run.emit(
            "status",
            {
                "status": "running",
                "message": localized_event_message(run.config.output_language, "cancellation_requested"),
            },
        )
        return run

    def list_runs(self, active_only: bool = False, limit: int = 100, user_id: str | None = None) -> list[RunRecord]:
        limit = max(1, min(limit, 200))
        with self._lock:
            runs = list(self.runs.values())
        if user_id is not None:
            runs = [run for run in runs if run.user_id == user_id]
        if active_only:
            runs = [run for run in runs if run.status in {"queued", "running"}]
        runs.sort(key=lambda run: run.submitted_at, reverse=True)
        return runs[:limit]

    def _ensure_worker_count(self, count: int) -> None:
        with self._worker_lock:
            target = max(1, min(count, 8))
            while len(self._workers) < target:
                worker = threading.Thread(target=self._work_loop, daemon=True)
                worker.start()
                self._workers.append(worker)

    def _work_loop(self) -> None:
        while True:
            run_id = self.pending.get()
            try:
                run = self.get_run(run_id)
                if run is not None and run.status != "cancelled":
                    self._execute(run)
                elif run is not None:
                    self._enqueue_next_run(run)
            finally:
                self.pending.task_done()

    def _execute(self, run: RunRecord) -> None:
        if run.cancel_requested:
            self._mark_cancelled(run)
            return
        run.status = "running"
        run.started_at = utc_now()
        run.emit(
            "status",
            {
                "status": "running",
                "message": localized_event_message(run.config.output_language, "analysis_started"),
                "billing": run.billing.model_dump(mode="json", by_alias=True) if run.billing else None,
            },
        )
        checkpointer_ctx = None
        original_openrouter_key = os.environ.get("OPENROUTER_API_KEY")

        try:
            secrets = self.storage.load_secrets()
            self.storage.load_secrets_into_env()
            runtime_config = self.storage.runtime_config(run.config)
            if uses_openai_compatible_adapter(run.config.llm_provider, run.config.backend_url):
                api_key_field = provider_secret_field(run.config.llm_provider)
                custom_key = secrets.get(api_key_field) if api_key_field else None
                if not custom_key:
                    raise RuntimeError(f"{api_key_field} is required for {run.config.llm_provider} provider.")
                backend_url = run.config.backend_url or provider_default_base_url(run.config.llm_provider)
                if not backend_url:
                    raise RuntimeError(f"Base URL is required for {run.config.llm_provider} provider.")
                runtime_config["llm_provider"] = "openrouter"
                runtime_config["backend_url"] = backend_url
                os.environ["OPENROUTER_API_KEY"] = custom_key
            configure_custom_data_interfaces(runtime_config, secrets.get("CUSTOM_DATA_API_KEY"))
            stats_handler = StatsCallbackHandler()
            event_handler = WebEventCallbackHandler(run)

            selected_set = set(run.config.analysts)
            selected_analysts = [analyst for analyst in ANALYST_ORDER if analyst in selected_set]

            message_buffer = MessageBuffer()
            message_buffer.init_for_analysis(selected_analysts)

            with patched_tradingagents_llm_client_factory(runtime_config):
                graph = TradingAgentsGraph(
                    selected_analysts,
                    config=runtime_config,
                    debug=False,
                    callbacks=[stats_handler, event_handler],
                )
                configure_runtime_workflow(
                    graph,
                    selected_analysts,
                    runtime_config,
                    secrets,
                    [stats_handler, event_handler],
                )
            run.emit("status", {"status": "running", "message": localized_event_message(run.config.output_language, "resolving_memory")})
            graph._resolve_pending_entries(run.request.ticker)

            init_agent_state = graph.propagator.create_initial_state(
                run.request.ticker,
                str(run.request.analysis_date),
            )
            init_agent_state = apply_market_profile(
                init_agent_state,
                market_profile_prompt(run.raw_ticker or run.config.ticker, run.request.ticker, run.config),
            )
            args = graph.propagator.get_graph_args(callbacks=[stats_handler, event_handler])
            if runtime_config.get("checkpoint_enabled"):
                checkpointer_ctx = get_checkpointer(runtime_config["data_cache_dir"], run.request.ticker)
                saver = checkpointer_ctx.__enter__()
                graph.graph = graph.workflow.compile(checkpointer=saver)
                args.setdefault("config", {}).setdefault("configurable", {})["thread_id"] = thread_id(
                    run.request.ticker,
                    str(run.request.analysis_date),
                )

            trace: list[dict[str, Any]] = []
            start = time.time()
            run.emit(
                "configuration",
                {
                    "ticker": run.request.ticker,
                    "analysisDate": str(run.request.analysis_date),
                    "provider": run.config.llm_provider,
                    "runtimeProvider": runtime_config.get("llm_provider"),
                    "backendUrl": runtime_config.get("backend_url"),
                    "deepseekThinkingMode": runtime_config.get("deepseek_thinking_mode"),
                    "parallelInitialAnalysts": runtime_config.get("parallel_initial_analysts"),
                    "stockMarket": run.config.stock_market,
                    "inputTicker": run.raw_ticker or run.config.ticker,
                    "marketProfile": runtime_config.get("market_profiles", {}).get(run.config.stock_market, {}),
                    "outputLanguage": run.config.output_language,
                    "analysts": selected_analysts,
                    "llmRoutes": {
                        key: value.model_dump(mode="json", by_alias=True)
                        for key, value in run.config.llm_routes.items()
                        if value.enabled
                    },
                },
            )

            if selected_analysts:
                if run.config.parallel_initial_analysts:
                    for analyst in selected_analysts:
                        message_buffer.update_agent_status(f"{analyst.capitalize()} Analyst", "in_progress")
                else:
                    first = selected_analysts[0]
                    message_buffer.update_agent_status(f"{first.capitalize()} Analyst", "in_progress")

            for chunk in graph.graph.stream(init_agent_state, **args):
                if run.cancel_requested:
                    self._mark_cancelled(run)
                    return
                self._process_chunk(run, chunk, message_buffer, stats_handler, start)
                trace.append(chunk)
                if run.cancel_requested:
                    self._mark_cancelled(run)
                    return

            if not trace:
                raise RuntimeError("Analysis completed without returning graph state.")

            final_state = trace[-1]
            decision_text = final_state.get("final_trade_decision", "")
            run.decision = graph.process_signal(decision_text) if decision_text else None
            if run.cancel_requested:
                self._mark_cancelled(run)
                return
            reference_reviews = self._run_reference_reviewers(
                run,
                graph,
                runtime_config,
                secrets,
                [stats_handler, event_handler],
                message_buffer,
                stats_handler,
                start,
                final_state,
            )
            final_state = {**final_state, **reference_reviews}

            graph.curr_state = final_state
            graph.ticker = run.request.ticker
            graph._log_state(str(run.request.analysis_date), final_state)
            if decision_text:
                graph.memory_log.store_decision(
                    ticker=run.request.ticker,
                    trade_date=str(run.request.analysis_date),
                    final_trade_decision=decision_text,
                )
            if runtime_config.get("checkpoint_enabled"):
                clear_checkpoint(
                    runtime_config["data_cache_dir"],
                    run.request.ticker,
                    str(run.request.analysis_date),
                )

            run.reports = self._reports_from_state(final_state)
            run.final_report = self._complete_report(run.request.ticker, run.reports, run.config.output_language)
            run.stats = stats_handler.get_stats()
            run.status = "succeeded"
            run.ended_at = utc_now()
            self._settle_billing(run, "succeeded")
            self.storage.save_report_history(run.info(), run.config, run.report_payload())
            run.emit(
                "status",
                {
                    "status": "succeeded",
                    "message": localized_event_message(run.config.output_language, "analysis_completed"),
                    "decision": run.decision,
                    "stats": run.stats,
                    "billing": run.billing.model_dump(mode="json", by_alias=True) if run.billing else None,
                },
            )
            run.emit("reports", run.report_payload().model_dump(mode="json", by_alias=True))
        except Exception as exc:
            run.status = "failed"
            run.error = str(exc)
            run.ended_at = utc_now()
            self._settle_billing(run, "failed")
            run.emit(
                "status",
                {
                    "status": "failed",
                    "message": str(exc),
                    "traceback": traceback.format_exc(),
                    "billing": run.billing.model_dump(mode="json", by_alias=True) if run.billing else None,
                },
            )
        finally:
            if checkpointer_ctx is not None:
                checkpointer_ctx.__exit__(None, None, None)
            if uses_openai_compatible_adapter(run.config.llm_provider, run.config.backend_url):
                if original_openrouter_key is None:
                    os.environ.pop("OPENROUTER_API_KEY", None)
                else:
                    os.environ["OPENROUTER_API_KEY"] = original_openrouter_key
            self._enqueue_next_run(run)

    def _mark_cancelled(self, run: RunRecord) -> None:
        run.status = "cancelled"
        run.ended_at = utc_now()
        self._settle_billing(run, "cancelled")
        run.emit(
            "status",
            {
                "status": "cancelled",
                "message": localized_event_message(run.config.output_language, "analysis_cancelled"),
                "billing": run.billing.model_dump(mode="json", by_alias=True) if run.billing else None,
            },
        )

    def _run_reference_reviewers(
        self,
        run: RunRecord,
        graph: Any,
        runtime_config: dict[str, Any],
        secrets: dict[str, str],
        callbacks: list[Any],
        message_buffer: MessageBuffer,
        stats_handler: StatsCallbackHandler,
        start: float,
        final_state: dict[str, Any],
    ) -> dict[str, str]:
        default_deep_llm = getattr(graph, "deep_thinking_llm", None)
        router = LLMRouter(
            runtime_config,
            secrets,
            callbacks,
            getattr(graph, "quick_thinking_llm", None),
            default_deep_llm,
        )
        route_payloads = runtime_config.get("llm_routes", {})
        reviewer_llms: dict[str, Any] = {}
        reference_reviews: dict[str, str] = {}

        for reviewer_key, route_key in REVIEWER_ROUTE_KEYS.items():
            agent = REVIEWER_AGENT_NAMES[reviewer_key]
            output_key = REVIEWER_OUTPUT_KEYS[reviewer_key]
            route_enabled = bool(route_payloads.get(route_key, {}).get("enabled"))
            try:
                if route_enabled:
                    reviewer_llms[reviewer_key] = router.llm(route_key)
                elif default_deep_llm is not None:
                    reviewer_llms[reviewer_key] = default_deep_llm
                else:
                    reference_reviews[output_key] = unavailable_review("no deep thinking LLM is available")
                    message_buffer.update_agent_status(agent, "skipped")
            except Exception as exc:
                logger.warning("%s route failed: %s", agent, exc)
                reference_reviews[output_key] = unavailable_review("reviewer model route is not configured")
                message_buffer.update_agent_status(agent, "failed")

        for reviewer_key in reviewer_llms:
            message_buffer.update_agent_status(REVIEWER_AGENT_NAMES[reviewer_key], "in_progress")
        if reviewer_llms or reference_reviews:
            self._emit_progress(run, message_buffer, stats_handler, start)

        if reviewer_llms:
            reference_reviews.update(
                run_reference_reviews(
                    reviewer_llms,
                    final_state,
                    run.config.output_language,
                )
            )

        for reviewer_key in REVIEWER_ROUTE_KEYS:
            agent = REVIEWER_AGENT_NAMES[reviewer_key]
            output_key = REVIEWER_OUTPUT_KEYS[reviewer_key]
            content = reference_reviews.get(output_key)
            if content:
                message_buffer.update_report_section(output_key, content)
            if reviewer_key not in reviewer_llms:
                continue
            message_buffer.update_agent_status(
                agent,
                "failed" if is_review_unavailable(content) else "completed",
            )

        if reviewer_llms or reference_reviews:
            self._emit_progress(run, message_buffer, stats_handler, start)
        return reference_reviews

    def _settle_billing(self, run: RunRecord, status: str) -> None:
        if run.billing_settled:
            return
        run.billing = self.storage.settle_analysis_order(
            run.order_id,
            run.config,
            run.stats,
            status,
            error_summary=run.error,
            error_stage="analysis",
        ) or run.billing
        run.billing_settled = True

    def _enqueue_next_run(self, run: RunRecord) -> None:
        next_run_id = run.next_run_id
        run.next_run_id = None
        while next_run_id:
            next_run = self.get_run(next_run_id)
            if next_run is None:
                return
            if next_run.status == "queued":
                self.pending.put(next_run.id)
                return
            next_run_id = next_run.next_run_id
            next_run.next_run_id = None

    def _process_chunk(
        self,
        run: RunRecord,
        chunk: dict[str, Any],
        message_buffer: MessageBuffer,
        stats_handler: StatsCallbackHandler,
        start: float,
    ) -> None:
        for message in chunk.get("messages", []):
            msg_id = getattr(message, "id", None)
            if msg_id is not None:
                if msg_id in message_buffer._processed_message_ids:
                    continue
                message_buffer._processed_message_ids.add(msg_id)

            message_type, content = classify_message_type(message)
            if content and content.strip():
                message_buffer.add_message(message_type, content)
                run.emit("message", {"messageType": message_type, "content": content})

            for tool_call in getattr(message, "tool_calls", []) or []:
                if isinstance(tool_call, dict):
                    name = tool_call.get("name")
                    args = tool_call.get("args")
                else:
                    name = getattr(tool_call, "name", None)
                    args = getattr(tool_call, "args", None)
                message_buffer.add_tool_call(name, args)
                run.emit("tool", {"phase": "call", "name": name, "args": args})

        update_analyst_statuses(message_buffer, chunk)
        if run.config.parallel_initial_analysts:
            self._update_parallel_initial_analyst_statuses(message_buffer)

        if chunk.get("investment_debate_state"):
            debate = chunk["investment_debate_state"]
            bull = debate.get("bull_history", "").strip()
            bear = debate.get("bear_history", "").strip()
            judge = debate.get("judge_decision", "").strip()
            if bull or bear:
                self._update_research_team_status(message_buffer, "in_progress")
            if bull:
                message_buffer.update_report_section("investment_plan", f"### Bull Researcher Analysis\n{bull}")
            if bear:
                message_buffer.update_report_section("investment_plan", f"### Bear Researcher Analysis\n{bear}")
            if judge:
                message_buffer.update_report_section("investment_plan", f"### Research Manager Decision\n{judge}")
                self._update_research_team_status(message_buffer, "completed")
                message_buffer.update_agent_status("Trader", "in_progress")

        if chunk.get("trader_investment_plan"):
            message_buffer.update_report_section("trader_investment_plan", chunk["trader_investment_plan"])
            message_buffer.update_agent_status("Trader", "completed")
            message_buffer.update_agent_status("Aggressive Analyst", "in_progress")

        if chunk.get("risk_debate_state"):
            risk = chunk["risk_debate_state"]
            if risk.get("judge_decision", "").strip():
                message_buffer.update_report_section(
                    "final_trade_decision",
                    f"### Portfolio Manager Decision\n{risk['judge_decision'].strip()}",
                )
                message_buffer.update_agent_status("Aggressive Analyst", "completed")
                message_buffer.update_agent_status("Conservative Analyst", "completed")
                message_buffer.update_agent_status("Neutral Analyst", "completed")
                message_buffer.update_agent_status("Portfolio Manager", "completed")

        self._emit_progress(run, message_buffer, stats_handler, start)

    def _emit_progress(
        self,
        run: RunRecord,
        message_buffer: MessageBuffer,
        stats_handler: StatsCallbackHandler,
        start: float,
    ) -> None:
        run.reports = {key: value for key, value in message_buffer.report_sections.items() if value}
        run.stats = stats_handler.get_stats()
        run.emit(
            "progress",
            {
                "agents": message_buffer.agent_status,
                "reports": run.reports,
                "stats": run.stats,
                "billing": run.billing.model_dump(mode="json", by_alias=True) if run.billing else None,
                "elapsedSeconds": int(time.time() - start),
            },
        )

    def _update_research_team_status(self, message_buffer: MessageBuffer, status: str) -> None:
        for agent in ("Bull Researcher", "Bear Researcher", "Research Manager"):
            message_buffer.update_agent_status(agent, status)

    def _update_parallel_initial_analyst_statuses(self, message_buffer: MessageBuffer) -> None:
        all_done = bool(message_buffer.selected_analysts)
        for analyst_key in ANALYST_ORDER:
            if analyst_key not in message_buffer.selected_analysts:
                continue
            report_key = ANALYST_REPORT_MAP[analyst_key]
            agent_name = ANALYST_AGENT_NAMES[analyst_key]
            if message_buffer.report_sections.get(report_key):
                message_buffer.update_agent_status(agent_name, "completed")
            else:
                all_done = False
                message_buffer.update_agent_status(agent_name, "in_progress")
        if all_done and message_buffer.agent_status.get("Bull Researcher") == "pending":
            message_buffer.update_agent_status("Bull Researcher", "in_progress")

    def _reports_from_state(self, state: dict[str, Any]) -> dict[str, Any]:
        reports: dict[str, Any] = {}
        for key in ("market_report", "sentiment_report", "news_report", "fundamentals_report"):
            if state.get(key):
                reports[key] = state[key]
        if state.get("investment_debate_state"):
            reports["investment_debate_state"] = state["investment_debate_state"]
        if state.get("investment_plan"):
            reports["investment_plan"] = state["investment_plan"]
        if state.get("trader_investment_plan"):
            reports["trader_investment_plan"] = state["trader_investment_plan"]
        if state.get("risk_debate_state"):
            reports["risk_debate_state"] = state["risk_debate_state"]
        if state.get("final_trade_decision"):
            reports["final_trade_decision"] = state["final_trade_decision"]
        if state.get("buffett_review"):
            reports["buffett_review"] = state["buffett_review"]
        if state.get("munger_review"):
            reports["munger_review"] = state["munger_review"]
        return reports

    def _complete_report(self, ticker: str, reports: dict[str, Any], output_language: str) -> str:
        section_titles = localized_report_titles(output_language)
        parts = [f"# {section_titles['main']}: {ticker}"]
        for key, title in section_titles.items():
            if key != "main" and key not in {"investment_debate_state", "risk_debate_state"} and reports.get(key):
                parts.append(f"## {title}\n\n{reports[key]}")
        if reports.get("investment_debate_state"):
            parts.append(f"## {section_titles['investment_debate_state']}\n\n```json\n{json.dumps(reports['investment_debate_state'], indent=2, ensure_ascii=False)}\n```")
        if reports.get("risk_debate_state"):
            parts.append(f"## {section_titles['risk_debate_state']}\n\n```json\n{json.dumps(reports['risk_debate_state'], indent=2, ensure_ascii=False)}\n```")
        return "\n\n".join(parts)
