"""Portfolio agent for simple diversification and concentration checks."""

from __future__ import annotations

from typing import Any


class PortfolioAgent:
    """Analyzes sector concentration and flags overexposure risks."""

    # Simple hardcoded sector mapping (can be expanded anytime).
    SECTOR_MAP = {
        "RELIANCE.NS": "Energy",
        "ONGC.NS": "Energy",
        "TCS.NS": "IT",
        "INFY.NS": "IT",
        "WIPRO.NS": "IT",
        "HDFCBANK.NS": "Financials",
        "ICICIBANK.NS": "Financials",
        "SBIN.NS": "Financials",
        "SUNPHARMA.NS": "Healthcare",
        "DRREDDY.NS": "Healthcare",
        "HINDUNILVR.NS": "Consumer",
        "ITC.NS": "Consumer",
        "AAPL": "Technology",
        "MSFT": "Technology",
        "GOOGL": "Technology",
        "NVDA": "Technology",
        "JPM": "Financials",
        "XOM": "Energy",
        "JNJ": "Healthcare",
    }

    def analyze_portfolio(self, portfolio: list[dict[str, Any]]) -> dict[str, Any]:
        """Analyze a portfolio.

        Expected input format:
        [
            {"symbol": "RELIANCE.NS", "weight": 35},
            {"symbol": "TCS.NS", "weight": 20},
        ]
        """
        sector_totals: dict[str, float] = {}
        risk_notes: list[str] = []

        normalized_positions = self._normalize_positions(portfolio, risk_notes)
        total_weight = sum(position["weight"] for position in normalized_positions)

        if total_weight <= 0:
            return {
                "sector_exposure": {},
                "sector_concentration": {},
                "overexposure": False,
                "overexposed_sectors": [],
                "symbol_sector_map": {},
                "diversification_suggestions": ["Add valid portfolio positions with positive weights."],
                "risk_notes": risk_notes or ["Portfolio has no valid weights to analyze."],
            }

        for position in normalized_positions:
            symbol = position["symbol"]
            weight = position["weight"]
            sector = self.SECTOR_MAP.get(symbol, "Other")
            sector_totals[sector] = sector_totals.get(sector, 0.0) + weight

            if sector == "Other":
                risk_notes.append(f"{symbol} is mapped to 'Other'; sector mapping may need an update.")

        sector_exposure = {
            sector: round((weight / total_weight) * 100, 2)
            for sector, weight in sorted(sector_totals.items(), key=lambda item: item[1], reverse=True)
        }

        overexposed_sectors = [
            sector for sector, concentration in sector_exposure.items() if concentration > 50
        ]
        overexposure = len(overexposed_sectors) > 0

        suggestions = self._build_suggestions(sector_exposure, overexposed_sectors)
        if overexposure:
            risk_notes.append(
                "Portfolio has more than 50% in one sector, which can increase drawdown risk."
            )
        elif not risk_notes:
            risk_notes.append("No major concentration risk detected from sector distribution.")

        return {
            "sector_exposure": sector_exposure,
            "sector_concentration": sector_exposure,  # Alias kept for backward compatibility.
            "overexposure": overexposure,
            "overexposed_sectors": overexposed_sectors,
            "symbol_sector_map": {
                str(item["symbol"]).strip().upper(): self.SECTOR_MAP.get(str(item["symbol"]).strip().upper(), "Other")
                for item in normalized_positions
            },
            "diversification_suggestions": suggestions,
            "risk_notes": risk_notes,
        }

    @staticmethod
    def _normalize_positions(
        portfolio: list[dict[str, Any]],
        risk_notes: list[str],
    ) -> list[dict[str, float | str]]:
        positions: list[dict[str, float | str]] = []

        for index, item in enumerate(portfolio):
            symbol = str(item.get("symbol", "")).strip().upper()
            raw_weight = item.get("weight", 0)

            try:
                weight = float(raw_weight)
            except (TypeError, ValueError):
                risk_notes.append(f"Skipping row {index + 1}: invalid weight '{raw_weight}'.")
                continue

            if not symbol:
                risk_notes.append(f"Skipping row {index + 1}: missing symbol.")
                continue

            if weight <= 0:
                risk_notes.append(f"Skipping {symbol}: weight must be positive.")
                continue

            positions.append({"symbol": symbol, "weight": weight})

        return positions

    @staticmethod
    def _build_suggestions(
        sector_concentration: dict[str, float],
        overexposed_sectors: list[str],
    ) -> list[str]:
        suggestions: list[str] = []

        if overexposed_sectors:
            for sector in overexposed_sectors:
                suggestions.append(f"Trim exposure in {sector}; keep each sector closer to 20-35%.")

            low_weight_sectors = [
                sector for sector, concentration in sector_concentration.items() if concentration < 15
            ]
            if low_weight_sectors:
                suggestions.append(
                    "Increase allocation to underrepresented sectors like "
                    + ", ".join(low_weight_sectors[:3])
                    + "."
                )
            else:
                suggestions.append("Add stocks from at least one new sector to improve diversification.")
        else:
            suggestions.append("Sector split looks balanced. Rebalance quarterly to maintain diversification.")

        return suggestions
