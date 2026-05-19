from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any


logger = logging.getLogger(__name__)

_SKILLS_DIR = Path(__file__).resolve().parents[1] / "skills"

_REVIEWERS = {
    "buffett": {
        "label": "Buffett Reference Review",
        "skill": "buffett-perspective",
        "output": "buffett_review",
        "focus": (
            "Focus on business quality, durable moat, margin of safety, "
            "circle of competence, long-term cash economics, and price versus value."
        ),
    },
    "munger": {
        "label": "Munger Reference Review",
        "skill": "munger-perspective",
        "output": "munger_review",
        "focus": (
            "Focus on inversion, incentives, cognitive biases, lollapalooza risk, "
            "too-hard-pile discipline, and whether the thesis survives opposing arguments."
        ),
    },
}


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

Use the skill instructions below as your thinking framework, but adapt them for a professional investment research report.
Do not roleplay as the historical person. Do not claim to be that person.
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
Write a concise markdown reference review with:
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
        return reviewer["output"], _content_text(llm.invoke(prompt))
    except Exception as exc:
        logger.warning("%s failed: %s", reviewer["label"], exc)
        return reviewer["output"], "**Review unavailable**: see server logs for details."


def run_reference_reviews(llm: Any | None, state: dict[str, Any], output_language: str) -> dict[str, str]:
    if llm is None:
        return {}
    with ThreadPoolExecutor(max_workers=len(_REVIEWERS)) as executor:
        futures = [
            executor.submit(_invoke, llm, reviewer_key, state, output_language)
            for reviewer_key in _REVIEWERS
        ]
    return dict(future.result() for future in futures)
