from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError, as_completed
from pathlib import Path
from typing import Any, Mapping


logger = logging.getLogger(__name__)

_SKILLS_DIR = Path(__file__).resolve().parents[1] / "skills"

_REVIEWERS = {
    "buffett": {
        "label": "Buffett Reference Review",
        "agent": "Buffett Reviewer",
        "route": "buffett_reviewer",
        "skill": "buffett-perspective",
        "output": "buffett_review",
        "focus": (
            "Focus on business quality, durable moat, margin of safety, "
            "circle of competence, long-term cash economics, and price versus value."
        ),
    },
    "munger": {
        "label": "Munger Reference Review",
        "agent": "Munger Reviewer",
        "route": "munger_reviewer",
        "skill": "munger-perspective",
        "output": "munger_review",
        "focus": (
            "Focus on inversion, incentives, cognitive biases, lollapalooza risk, "
            "too-hard-pile discipline, and whether the thesis survives opposing arguments."
        ),
    },
}
REVIEWER_ROUTE_KEYS = {key: reviewer["route"] for key, reviewer in _REVIEWERS.items()}
REVIEWER_AGENT_NAMES = {key: reviewer["agent"] for key, reviewer in _REVIEWERS.items()}
REVIEWER_OUTPUT_KEYS = {key: reviewer["output"] for key, reviewer in _REVIEWERS.items()}
DEFAULT_REVIEW_TIMEOUT_SECONDS = 180


def _load_skill_text(skill_name: str) -> str:
    return (_SKILLS_DIR / skill_name / "SKILL.md").read_text(encoding="utf-8")


def _content_text(response: Any) -> str:
    content = getattr(response, "content", response)
    if isinstance(content, list):
        return "\n".join(
            item.get("text", "")
            if isinstance(item, dict) and item.get("type") == "text"
            else item
            if isinstance(item, str)
            else ""
            for item in content
        ).strip()
    return str(content).strip()


def _prompt(reviewer: dict[str, str], skill_text: str, state: dict[str, Any], output_language: str) -> str:
    risk_state = state.get("risk_debate_state", {})
    return f"""You are a post-run reference reviewer for a completed TradingAgents WebUI analysis.

Use the complete upstream skill instructions below as your thinking framework. Preserve the full analytical method,
checklists, heuristics, and expression style, but adapt them for a professional investment research report.

The upstream skill may include interactive-session rules such as roleplay, web research, or asking follow-up questions.
For this WebUI post-run review, you only have the completed pipeline context below. Treat research/follow-up steps as
"inspect the supplied reports and identify missing evidence." Do not claim to be the historical person.
Do not change final_trade_decision. Your output is advisory only.

Reviewer: {reviewer["label"]}
Reviewer focus: {reviewer["focus"]}
Output language: {output_language}

--- Skill Instructions ({reviewer["skill"]}) ---
{skill_text}

--- Completed Pipeline Context ---
Company / ticker: {state.get("company_of_interest", "")}
Trade date: {state.get("trade_date", "")}

Market report:
{state.get("market_report", "")}

Sentiment report:
{state.get("sentiment_report", "")}

News report:
{state.get("news_report", "")}

Fundamentals report:
{state.get("fundamentals_report", "")}

Research Manager investment plan:
{state.get("investment_plan", "")}

Trader transaction proposal:
{state.get("trader_investment_plan", "")}

Risk debate:
{risk_state.get("history", "")}

Portfolio Manager final decision:
{state.get("final_trade_decision", "")}

--- Output Contract ---
Write a markdown reference review with:
- relationship to the Portfolio Manager decision
- the strongest supporting point
- the strongest objection or blind spot
- reviewer-specific checklist findings
- closing reference summary

Do not include a new trading command. Do not restate the full prior report."""


def _invoke(llm: Any, reviewer_key: str, state: dict[str, Any], output_language: str) -> tuple[str, str]:
    reviewer = _REVIEWERS[reviewer_key]
    try:
        prompt = _prompt(reviewer, _load_skill_text(reviewer["skill"]), state, output_language)
        content = _content_text(llm.invoke(prompt))
        return reviewer["output"], content or unavailable_review("empty reviewer response")
    except Exception as exc:
        logger.warning("%s failed: %s", reviewer["label"], exc)
        return reviewer["output"], unavailable_review("see server logs for details")


def unavailable_review(reason: str) -> str:
    return f"**Review unavailable**: {reason}."


def is_review_unavailable(content: str | None) -> bool:
    return bool(content and content.strip().startswith("**Review unavailable**"))


def _llm_for(llms: Any | Mapping[str, Any], reviewer_key: str) -> Any | None:
    if isinstance(llms, Mapping):
        return llms.get(reviewer_key)
    return llms


def run_reference_reviews(
    llms: Any | Mapping[str, Any] | None,
    state: dict[str, Any],
    output_language: str,
    timeout_seconds: int = DEFAULT_REVIEW_TIMEOUT_SECONDS,
) -> dict[str, str]:
    if llms is None:
        return {}
    executor = ThreadPoolExecutor(max_workers=len(_REVIEWERS))
    futures = {
        executor.submit(_invoke, llm, reviewer_key, state, output_language): reviewer_key
        for reviewer_key in _REVIEWERS
        if (llm := _llm_for(llms, reviewer_key)) is not None
    }
    if not futures:
        executor.shutdown(wait=False, cancel_futures=True)
        return {}

    results: dict[str, str] = {}
    try:
        for future in as_completed(futures, timeout=timeout_seconds):
            output_key, content = future.result()
            results[output_key] = content
    except TimeoutError:
        for future, reviewer_key in futures.items():
            if future.done():
                continue
            future.cancel()
            results[REVIEWER_OUTPUT_KEYS[reviewer_key]] = unavailable_review(f"timed out after {timeout_seconds}s")
    finally:
        executor.shutdown(wait=False, cancel_futures=True)
    return results
