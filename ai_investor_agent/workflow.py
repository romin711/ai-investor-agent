"""Orchestrates the multi-agent stock analysis pipeline."""

from typing import Any

from ai_investor_agent.agents import (
    DataAgent,
    DecisionAgent,
    ExplanationAgent,
    PortfolioAgent,
    SignalAgent,
)
from ai_investor_agent.types import WorkflowResult


class MultiAgentStockAnalyzer:
    """Coordinator that runs all agents in sequence."""

    def __init__(
        self,
        data_agent: DataAgent | None = None,
        signal_agent: SignalAgent | None = None,
        portfolio_agent: PortfolioAgent | None = None,
        decision_agent: DecisionAgent | None = None,
        explanation_agent: ExplanationAgent | None = None,
    ) -> None:
        self.data_agent = data_agent or DataAgent()
        self.signal_agent = signal_agent or SignalAgent()
        self.portfolio_agent = portfolio_agent or PortfolioAgent()
        self.decision_agent = decision_agent or DecisionAgent()
        self.explanation_agent = explanation_agent or ExplanationAgent()

    def run(
        self,
        symbol: str,
        portfolio: list[dict[str, Any]] | None = None,
    ) -> WorkflowResult:
        normalized_symbol = symbol.strip().upper()
        portfolio = portfolio or []

        portfolio_context = self.portfolio_agent.analyze_portfolio(portfolio)
        live_data = self.data_agent.fetch_stock_data([normalized_symbol], portfolio=portfolio).get(
            normalized_symbol,
            {},
        )

        market_data = self.data_agent.fetch(normalized_symbol, portfolio=portfolio)
        signal = self.signal_agent.analyze(
            market_data=market_data,
            current_volume=live_data.get("volume"),
            avg_volume=live_data.get("avg_volume"),
            portfolio_context=portfolio_context,
        )
        decision = self.decision_agent.decide(
            signal=signal,
            portfolio_context=portfolio_context,
            symbol=normalized_symbol,
        )
        explanation = self.explanation_agent.explain(
            trend=str(signal.get("trend", "neutral")),
            breakout=bool(signal.get("breakout", False)),
            volume_strength=str(signal.get("volume_strength", "low")),
            momentum=float(signal.get("momentum_percent", 0.0)),
            decision=decision.action,
            symbol=normalized_symbol,
            portfolio_context=portfolio_context,
        )

        return WorkflowResult(
            market_data=market_data,
            signal=signal,
            decision=decision,
            explanation=explanation,
        )
