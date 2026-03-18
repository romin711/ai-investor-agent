# AI Investor Agent

A lightweight multi-agent stock analysis prototype built for hackathon-style workflows.

The project analyzes a symbol with five focused agents:

- `DataAgent`: fetches recent market price and volume data from Yahoo Finance
- `SignalAgent`: computes trend, breakout, volume strength, and momentum
- `PortfolioAgent`: evaluates sector concentration and overexposure risk
- `DecisionAgent`: maps signals + portfolio context into `Buy` / `Hold` / `Reduce` / `Avoid`
- `ExplanationAgent`: converts model outputs into plain-language reasoning

## Features

- Live market data fetch using `yfinance`
- Rule-based signal and decision logic
- Portfolio-aware risk adjustment
- Human-readable decision explanations
- CLI support for one or many symbols

## Project Structure

```text
ai-investor-agent/
├── main.py
├── ai_investor_agent/
│   ├── __init__.py
│   ├── types.py
│   ├── workflow.py
│   └── agents/
│       ├── data_agent.py
│       ├── signal_agent.py
│       ├── portfolio_agent.py
│       ├── decision_agent.py
│       └── explanation_agent.py
└── README.md
```

## Requirements

- Python 3.10+
- Internet connection (for Yahoo Finance data)

Install dependencies:

```bash
pip install yfinance
```

## Run

Analyze one symbol:

```bash
python main.py --symbols AAPL
```

Analyze multiple symbols:

```bash
python main.py --symbols AAPL,MSFT,NVDA
```

## Sample Output (abridged)

```text
=== Portfolio Context ===
Sector Exposure: {'Technology': 70.0, 'Financials': 20.0, 'Energy': 10.0}
Overexposure Flag: True

=== Analysis For AAPL ===
Trend Signal: downtrend
Breakout: False
Volume Strength: low
Momentum: -1.93%
Decision: Avoid
```

## How the Decision Is Made

The `DecisionAgent` creates a score from:

- trend direction (`uptrend` / `neutral` / `downtrend`)
- breakout status
- momentum (capped so extreme values do not dominate)
- volume strength
- portfolio sector concentration penalty

Then it maps score ranges to actions:

- high score -> `Buy`
- mildly positive -> `Hold`
- mildly negative -> `Reduce`
- strongly negative -> `Avoid`

## Notes

- This is a rule-based prototype, not financial advice.
- Always validate with additional indicators, risk controls, and position sizing rules.
- Sector mappings are currently hardcoded in `ai_investor_agent/agents/portfolio_agent.py`.
