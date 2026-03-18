"""Explanation agent: turns signals into a concise human explanation."""

from typing import Any


class ExplanationAgent:
    """Creates a short, plain-language reason behind the decision."""

    def explain(
        self,
        trend: str,
        breakout: bool,
        volume_strength: str,
        momentum: float,
        decision: str,
        symbol: str | None = None,
        portfolio_context: dict[str, Any] | None = None,
    ) -> str:
        name = symbol or "This stock"

        trend_text = self._trend_text(trend)
        momentum_text = self._momentum_text(momentum)
        breakout_text = (
            "Price is above its recent 5-day range."
            if breakout
            else "Price is still inside its recent 5-day range."
        )
        volume_text = (
            "Volume is supporting the move."
            if volume_strength == "high"
            else "Volume is light, so the move looks less reliable."
        )
        portfolio_text = self._portfolio_reason(symbol, portfolio_context)

        return (
            f"{name} is in {trend_text} with {momentum_text}. {breakout_text}\n"
            f"{volume_text} {portfolio_text}\n"
            f"So the current action is {decision}."
        )

    @staticmethod
    def _trend_text(trend: str) -> str:
        if trend == "uptrend":
            return "an uptrend"
        if trend == "downtrend":
            return "a downtrend"
        return "a neutral phase"

    @staticmethod
    def _momentum_text(momentum: float) -> str:
        strength = abs(momentum)
        if strength < 1:
            level = "very mild"
        elif strength < 3:
            level = "moderate"
        else:
            level = "strong"

        if momentum > 0:
            direction = "upward momentum"
        elif momentum < 0:
            direction = "downward momentum"
        else:
            direction = "flat momentum"

        return f"{level} {direction}"

    @staticmethod
    def _portfolio_reason(
        symbol: str | None,
        portfolio_context: dict[str, Any] | None,
    ) -> str:
        if not symbol or not portfolio_context:
            return "Portfolio context is neutral for this call."

        normalized_symbol = symbol.strip().upper()
        symbol_sector_map = portfolio_context.get("symbol_sector_map", {})
        sector_exposure = portfolio_context.get("sector_exposure", {})

        if not isinstance(symbol_sector_map, dict) or not isinstance(sector_exposure, dict):
            return "Portfolio context is neutral for this call."

        sector = str(symbol_sector_map.get(normalized_symbol, "Other"))
        exposure = float(sector_exposure.get(sector, 0.0))
        overexposure = bool(portfolio_context.get("overexposure", False))

        if overexposure and exposure > 50:
            return (
                f"Your portfolio is already concentrated in {sector} ({exposure:.1f}%), "
                "so risk control matters more than chasing this move."
            )

        if exposure >= 35:
            return (
                f"Your existing {sector} exposure is already meaningful ({exposure:.1f}%), "
                "so we keep position sizing cautious."
            )

        return (
            f"Sector exposure to {sector} is moderate ({exposure:.1f}%), "
            "so portfolio concentration is not a major constraint."
        )
