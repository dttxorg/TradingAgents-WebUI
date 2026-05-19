from unittest.mock import MagicMock

from web.backend.reference_reviewers import run_reference_reviews


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
