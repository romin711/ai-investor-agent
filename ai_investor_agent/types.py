"""Shared data models used by the multi-agent workflow."""

from dataclasses import dataclass


@dataclass
class MarketData:
    symbol: str
    closing_prices: list[float]
    latest_price: float


@dataclass
class SignalAnalysis:
    trend: str
    momentum_percent: float
    confidence: float
    rationale: str


@dataclass
class TradeDecision:
    action: str
    confidence_score: float
    allocation_hint: str
    risk_note: str


@dataclass
class WorkflowResult:
    market_data: MarketData
    signal: dict[str, str | bool | float]
    decision: TradeDecision
    explanation: str
