from pathlib import Path
from unittest.mock import MagicMock

from web.backend.reference_reviewers import REVIEWER_ROUTE_KEYS, run_reference_reviews


SKILLS_DIR = Path(__file__).resolve().parents[1] / "web" / "skills"


class FakeReviewerLLM:
    def __init__(self):
        self.prompts = []

    def invoke(self, prompt):
        self.prompts.append(prompt)
        if "buffett-perspective" in prompt:
            return MagicMock(content="Buffett reference review.")
        if "munger-perspective" in prompt:
            return MagicMock(content="Munger reference review.")
        return MagicMock(content="Unexpected reviewer.")


def _state():
    return {
        "company_of_interest": "NVDA",
        "trade_date": "2026-05-19",
        "market_report": "Market report.",
        "fundamentals_report": "Fundamentals report.",
        "investment_plan": "Research plan.",
        "trader_investment_plan": "Trader plan.",
        "risk_debate_state": {"history": "Risk debate."},
        "final_trade_decision": "**Rating**: Buy",
    }


def test_reference_reviewers_run_after_final_decision_without_rewriting_it():
    llm = FakeReviewerLLM()
    state = _state()

    result = run_reference_reviews(llm, state, "Chinese")

    assert result["buffett_review"] == "Buffett reference review."
    assert result["munger_review"] == "Munger reference review."
    assert state["final_trade_decision"] == "**Rating**: Buy"
    joined = "\n\n".join(llm.prompts)
    assert "Do not change final_trade_decision" in joined
    assert "Portfolio Manager final decision" in joined
    assert "Research plan." in joined


def test_reference_reviewers_accept_independent_llm_routes():
    buffett_llm = FakeReviewerLLM()
    munger_llm = FakeReviewerLLM()

    result = run_reference_reviews(
        {"buffett": buffett_llm, "munger": munger_llm},
        _state(),
        "Chinese",
    )

    assert result["buffett_review"] == "Buffett reference review."
    assert result["munger_review"] == "Munger reference review."
    assert len(buffett_llm.prompts) == 1
    assert len(munger_llm.prompts) == 1


def test_reference_reviewer_route_keys_are_public_contract():
    assert REVIEWER_ROUTE_KEYS == {
        "buffett": "buffett_reviewer",
        "munger": "munger_reviewer",
    }


def test_reference_reviewer_skills_keep_full_upstream_assets():
    buffett_skill = (SKILLS_DIR / "buffett-perspective" / "SKILL.md").read_text(encoding="utf-8")
    munger_skill = (SKILLS_DIR / "munger-perspective" / "SKILL.md").read_text(encoding="utf-8")

    assert "巴菲特 · 思维操作系统" in buffett_skill
    assert "查理·芒格 · 思维操作系统" in munger_skill
    assert len(buffett_skill.splitlines()) > 400
    assert len(munger_skill.splitlines()) > 400
