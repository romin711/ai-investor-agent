"""Decision agent: maps signal quality into an action recommendation."""

from typing import Any

from ai_investor_agent.types import TradeDecision


class DecisionAgent:
    """Uses a lightweight scoring model for practical hackathon decisions."""

    def decide(
        self,
        signal: dict[str, str | bool | float],
        portfolio_context: dict[str, Any] | None = None,
        symbol: str | None = None,
    ) -> TradeDecision:
        trend = str(signal.get("trend", "neutral"))
        breakout = bool(signal.get("breakout", False))
        volume_strength = str(signal.get("volume_strength", "low"))
        momentum = float(signal.get("momentum_percent", 0.0))

        # 1) Build a combined score from multiple signals.
        score = 0.0

        if trend == "uptrend":
            score += 0.35
        elif trend == "downtrend":
            score -= 0.35

        if breakout:
            score += 0.25

        # Momentum contribution is capped to avoid extreme swings.
        momentum_component = max(-0.25, min(0.25, momentum / 12))
        score += momentum_component

        # 2) Low volume weakens both bullish and bearish conviction.
        if volume_strength == "low":
            score *= 0.55

        # 3) Portfolio concentration penalty (reduces overreaction).
        portfolio_note = ""
        sector_name, sector_weight = self._sector_context(symbol, portfolio_context)
        if sector_weight > 50:
            score -= 0.25
            portfolio_note = (
                f"Portfolio already has high exposure to {sector_name} ({sector_weight:.1f}%)."
            )
        elif sector_weight >= 35:
            score -= 0.10
            portfolio_note = (
                f"Portfolio already has meaningful exposure to {sector_name} ({sector_weight:.1f}%)."
            )

        # 4) Avoid hard sell behavior; use Reduce/Avoid instead.
        if score >= 0.45:
            action = "Buy"
            allocation_hint = "medium"
        elif score >= 0.10:
            action = "Hold"
            allocation_hint = "small"
        elif score > -0.40:
            action = "Reduce"
            allocation_hint = "reduce"
        else:
            action = "Avoid"
            allocation_hint = "minimal"

        # 5) Confidence (0-1) from signal agreement and score strength.
        bullish_votes = int(trend == "uptrend") + int(breakout) + int(momentum > 0)
        bearish_votes = int(trend == "downtrend") + int(momentum < 0)
        agreement = max(bullish_votes, bearish_votes) / 3
        confidence_score = 0.45 + 0.35 * abs(score) + 0.20 * agreement
        if volume_strength == "low":
            confidence_score *= 0.85
        if sector_weight >= 35:
            confidence_score *= 0.90
        confidence_score = min(1.0, round(confidence_score, 2))

        risk_note = (
            "Rule-based prototype only; validate with broader indicators and risk limits before trading."
        )
        if portfolio_note:
            risk_note = f"{risk_note} {portfolio_note}"

        return TradeDecision(
            action=action,
            confidence_score=confidence_score,
            allocation_hint=allocation_hint,
            risk_note=risk_note,
        )

    @staticmethod
    def _sector_context(
        symbol: str | None,
        portfolio_context: dict[str, Any] | None,
    ) -> tuple[str, float]:
        if not symbol or not portfolio_context:
            return "Unknown", 0.0

        normalized_symbol = symbol.strip().upper()
        symbol_sector_map = portfolio_context.get("symbol_sector_map", {})
        sector_exposure = portfolio_context.get("sector_exposure", {})

        if not isinstance(symbol_sector_map, dict) or not isinstance(sector_exposure, dict):
            return "Unknown", 0.0

        sector_name = str(symbol_sector_map.get(normalized_symbol, "Other"))
        sector_weight = float(sector_exposure.get(sector_name, 0.0))
        return sector_name, sector_weight
