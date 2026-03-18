"""Simple entry point that directly calls each agent."""

import argparse

from ai_investor_agent.agents.data_agent import DataAgent
from ai_investor_agent.agents.decision_agent import DecisionAgent
from ai_investor_agent.agents.explanation_agent import ExplanationAgent
from ai_investor_agent.agents.portfolio_agent import PortfolioAgent
from ai_investor_agent.agents.signal_agent import SignalAgent

SAMPLE_PORTFOLIO = [
    {"symbol": "AAPL", "weight": 30},
    {"symbol": "MSFT", "weight": 25},
    {"symbol": "NVDA", "weight": 15},
    {"symbol": "JPM", "weight": 20},
    {"symbol": "XOM", "weight": 10},
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Simple multi-agent stock analysis")
    parser.add_argument(
        "--symbols",
        default="AAPL",
        help="Comma-separated symbols (example: AAPL,MSFT,RELIANCE.NS)",
    )
    return parser.parse_args()


def analyze_symbol(
    symbol: str,
    portfolio: list[dict[str, int | str]],
    portfolio_context: dict[str, object],
    data_agent: DataAgent,
    signal_agent: SignalAgent,
    portfolio_agent: PortfolioAgent,
    decision_agent: DecisionAgent,
    explanation_agent: ExplanationAgent,
) -> None:
    normalized_symbol = symbol.strip().upper()
    if not normalized_symbol:
        return

    print(f"\n=== Analysis For {normalized_symbol} ===")

    live_data = data_agent.fetch_stock_data([normalized_symbol], portfolio=portfolio).get(normalized_symbol, {})
    price = live_data.get("price")
    volume = live_data.get("volume")
    avg_volume = live_data.get("avg_volume")
    data_error = live_data.get("error")

    market_data = data_agent.fetch(normalized_symbol, portfolio=portfolio)
    signal = signal_agent.analyze(
        market_data=market_data,
        current_volume=volume,
        avg_volume=avg_volume,
        portfolio_context=portfolio_context,
    )
    decision = decision_agent.decide(
        signal=signal,
        portfolio_context=portfolio_context,
        symbol=normalized_symbol,
    )
    explanation = explanation_agent.explain(
        trend=str(signal["trend"]),
        breakout=bool(signal["breakout"]),
        volume_strength=str(signal["volume_strength"]),
        momentum=float(signal["momentum_percent"]),
        decision=decision.action,
        symbol=normalized_symbol,
        portfolio_context=portfolio_context,
    )
    symbol_sector = portfolio_agent.SECTOR_MAP.get(normalized_symbol, "Other")
    sector_exposure = float(portfolio_context.get("sector_exposure", {}).get(symbol_sector, 0.0))
    overexposure = bool(portfolio_context.get("overexposure", False))

    if price is None:
        print(f"Current Price: {market_data.latest_price:.2f} (fallback)")
    else:
        print(f"Current Price: {price:.2f}")

    print(f"Current Volume: {volume if volume is not None else 'N/A'}")
    print(f"5-Day Avg Volume: {avg_volume if avg_volume is not None else 'N/A'}")
    if data_error:
        print(f"Data Warning: {data_error}")

    print(f"Trend Signal: {signal['trend']}")
    print(f"Breakout: {signal['breakout']}")
    print(f"Volume Strength: {signal['volume_strength']}")
    print(f"Momentum: {signal['momentum_percent']:.2f}%")
    print(f"Decision: {decision.action}")
    print(f"Decision Confidence: {decision.confidence_score:.2f}")
    print(f"Allocation Hint: {decision.allocation_hint}")
    print(f"Risk Note: {decision.risk_note}")
    print(f"Portfolio Impact: {symbol_sector} exposure is {sector_exposure:.2f}%")
    print(f"Portfolio Overexposed (>50% in one sector): {overexposure}")
    print("Explanation:")
    print(explanation)


def main() -> None:
    args = parse_args()
    symbols = [value.strip() for value in args.symbols.split(",")]

    portfolio = SAMPLE_PORTFOLIO
    data_agent = DataAgent()
    signal_agent = SignalAgent()
    portfolio_agent = PortfolioAgent()
    decision_agent = DecisionAgent()
    explanation_agent = ExplanationAgent()
    portfolio_context = portfolio_agent.analyze_portfolio(portfolio)

    print("=== Portfolio Context ===")
    print(f"Sample Portfolio: {portfolio}")
    print(f"Sector Exposure: {portfolio_context.get('sector_exposure', {})}")
    print(f"Overexposure Flag: {portfolio_context.get('overexposure', False)}")

    for symbol in symbols:
        analyze_symbol(
            symbol=symbol,
            portfolio=portfolio,
            portfolio_context=portfolio_context,
            data_agent=data_agent,
            signal_agent=signal_agent,
            portfolio_agent=portfolio_agent,
            decision_agent=decision_agent,
            explanation_agent=explanation_agent,
        )


if __name__ == "__main__":
    main()
