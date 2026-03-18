"""Signal agent: creates simple, meaningful trading signals."""

from typing import Any

from ai_investor_agent.types import MarketData


class SignalAgent:
    """Computes trend, breakout, volume strength, and momentum."""

    def analyze(
        self,
        market_data: MarketData,
        current_volume: int | None = None,
        avg_volume: float | None = None,
        portfolio_context: dict[str, Any] | None = None,
    ) -> dict[str, str | bool | float]:
        prices = market_data.closing_prices
        if len(prices) < 2:
            return {
                "trend": "neutral",
                "breakout": False,
                "volume_strength": "low",
                "momentum_percent": 0.0,
            }

        # Momentum: use the available window; prioritize last 5 days when possible.
        momentum_window = prices[-5:] if len(prices) >= 5 else prices
        start_price = momentum_window[0]
        end_price = momentum_window[-1]
        momentum_percent = 0.0
        if start_price != 0:
            momentum_percent = ((end_price - start_price) / start_price) * 100

        # Trend: based on the last 5-day movement.
        if momentum_percent > 1.0:
            trend = "uptrend"
        elif momentum_percent < -1.0:
            trend = "downtrend"
        else:
            trend = "neutral"

        # Breakout: current price above the high of previous 5 days.
        lookback_prices = prices[-6:-1] if len(prices) >= 6 else prices[:-1]
        five_day_high = max(lookback_prices) if lookback_prices else end_price
        breakout = end_price > five_day_high

        # Volume strength: compare current volume to average volume.
        if current_volume is None or avg_volume is None or avg_volume <= 0:
            volume_strength = "low"
        elif current_volume >= avg_volume:
            volume_strength = "high"
        else:
            volume_strength = "low"

        return {
            "trend": trend,
            "breakout": breakout,
            "volume_strength": volume_strength,
            "momentum_percent": round(momentum_percent, 2),
        }
