<div align="center">

# AI Investor Agent

### Portfolio-aware stock analysis dashboard

![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-Frontend-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Yahoo Finance](https://img.shields.io/badge/Yahoo-Market%20Data-6001D2?style=for-the-badge&logo=yahoo&logoColor=white)
![Lightweight Charts](https://img.shields.io/badge/TradingView-Lightweight--Charts-0F172A?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Prototype-F59E0B?style=for-the-badge)

</div>

---

## Overview

AI Investor Agent is a rule-based stock intelligence app with:

- a Node.js backend that fetches Yahoo Finance market data
- a React dashboard for portfolio input and visualization
- portfolio-aware scoring based on trend, RSI, momentum, breakout, and sector exposure
- safe fallbacks for missing data so the app does not invent fake zeros

The current live app uses the `backend/` Node service and the `frontend/` React app.

---

## What The App Does

Given user portfolio rows like:

```json
[
  { "symbol": "RELIANCE", "weight": 40 },
  { "symbol": "TCS", "weight": 30 },
  { "symbol": "INFY", "weight": 30 }
]
```

the system:

1. normalizes the input symbols and weights
2. resolves each symbol to a Yahoo Finance ticker
3. fetches historical market data
4. cleans invalid price points
5. calculates indicators such as MA20, MA50, RSI, momentum, and breakout
6. adds portfolio context like sector concentration
7. produces a final decision such as `BUY`, `SELL`, or `HOLD`
8. renders the output in the dashboard as cards, chart, confidence, and reasoning

---

## System Flow

```mermaid
flowchart LR
    A[User Input: symbols + weights] --> B[React Portfolio Page]
    B --> C[PortfolioContext]
    C --> D[POST /api/portfolio/analyze]
    D --> E[Node Backend]
    E --> F[Symbol Resolver]
    E --> G[Yahoo Data Fetch]
    G --> H[Data Cleanup]
    H --> I[Indicator Pipeline]
    E --> J[Portfolio Exposure]
    I --> K[Decision Engine]
    J --> K
    K --> L[Response JSON]
    L --> M[React Dashboard]
```

---

## Theory: How Input Becomes Output

This is the core idea of the project.

### 1) User input becomes normalized portfolio rows

The user enters data in the frontend, either by:

- uploading JSON
- typing rows manually

The frontend converts that into a clean internal array:

```json
[
  { "symbol": "RELIANCE", "weight": 40 },
  { "symbol": "TCS", "weight": 30 }
]
```

At this stage:

- symbols are uppercased
- weights are converted to numbers
- empty rows are ignored
- invalid weights are rejected

### 2) The frontend sends the portfolio to the backend

When the user clicks analyze, the frontend sends a `POST` request to:

```text
/api/portfolio/analyze
```

The backend accepts multiple request styles:

- array of rows
- `portfolio` object map
- raw text input

but internally converts all of them into the same row structure.

### 3) Symbols are resolved to Yahoo-compatible tickers

User input is often human-friendly, for example:

- `RELIANCE`
- `TCS`
- `INFY`

The backend resolves these into Yahoo Finance symbols such as:

- `RELIANCE.NS`
- `TCS.NS`
- `INFY.NS`

Resolution uses:

- a local symbol map from `backend/engine/stocks.json`
- fuzzy matching for near-miss tickers
- optional Gemini fallback if mapping fails

### 4) Yahoo market data is fetched and cleaned

For each resolved symbol, the backend requests chart data from Yahoo Finance.

Then it cleans the data before calculations:

- removes `null`, `NaN`, and invalid OHLC values
- keeps valid historical points only
- sorts data oldest to latest
- keeps OHLC price history for candlestick charting and indicators

This matters because technical indicators depend on time order and valid numeric values.

### 5) Indicators are calculated from historical closes

After cleanup, the backend computes:

- `MA20`: average of the latest 20 valid closes
- `MA50`: average of the latest 50 valid closes
- `RSI(14)`: gain/loss strength over 14 periods
- `Momentum`: percentage move vs. a 5-day lookback
- `Volatility`: latest daily percentage move
- `Breakout`: whether current price is above the previous 20-day high

If there is not enough history, the indicator returns `null`, not `0`.

That is a deliberate design choice:

- `0` would look like a real market signal
- `null` correctly means "not enough data"

### 6) Portfolio context changes the interpretation

The app does not look at each stock in isolation.

It also computes portfolio context:

- sector allocation
- overexposed sectors
- the sector exposure of the current symbol

Example:

- if the portfolio is already 80% in one sector, even a good technical setup may be downgraded

This is handled through a portfolio adjustment layer.

### 7) Technical score and portfolio score become a final decision

The decision engine combines:

- technical score
- portfolio adjustment

to create a final score.

Basic idea:

- strong bullish signals raise the score
- weak or bearish signals lower the score
- concentration risk can reduce the score further

Then the decision is mapped approximately like this:

- high positive score -> `BUY`
- high negative score -> `SELL`
- middle zone -> `HOLD`

Confidence is then derived from:

- score magnitude
- RSI neutrality
- distance between price and MA50

### 8) Missing critical indicators trigger a safety guard

If key indicators are missing, the app does not try to bluff confidence.

Instead it forces:

- `decision = HOLD`
- `confidence = low`
- `reason = "Insufficient data"`

The frontend then shows:

- `Not enough data`

instead of `0` or `--`.

### 9) The backend returns structured output

For each symbol, the backend returns data such as:

- current price
- historical series
- MA20 / MA50 / RSI
- momentum and breakout
- technical score
- portfolio adjustment
- final score
- decision
- confidence
- reasoning

It also returns portfolio-level insight such as:

- sector allocation
- overexposed sectors
- top-level portfolio summary

### 10) The frontend transforms JSON into UI

The React dashboard turns the response into:

- a price chart
- tracked stock cards
- RSI / MA metrics
- decision badge
- confidence display
- portfolio insight panel
- signals list
- reasoning panel

So the final theory is:

```text
User input -> normalization -> symbol resolution -> Yahoo data -> cleanup ->
indicator calculation -> portfolio adjustment -> decision engine -> API response ->
dashboard rendering
```

---

## Current Stack

### Backend

- Node.js HTTP server
- Yahoo Finance chart API
- optional Gemini fallback for ticker resolution / reasoning

### Frontend

- React
- React Router
- Axios
- TradingView `lightweight-charts`
- Tailwind-based styling

---

## Project Structure

```text
ai-investor-agent/
├── backend/
│   ├── server.js
│   ├── README.md
│   ├── package.json
│   └── engine/
│       ├── pipeline.js
│       ├── yahooClient.js
│       ├── symbolResolver.js
│       ├── indicators.js
│       ├── indicatorService.js
│       ├── portfolioService.js
│       ├── riskService.js
│       ├── decisionEngine.js
│       ├── aiService.js
│       └── stocks.json
├── frontend/
│   ├── package.json
│   └── src/
│       ├── context/
│       ├── pages/
│       ├── components/
│       └── layout/
├── ai_investor_agent/
├── api.py
├── main.py
└── README.md
```

Note:

- `backend/` + `frontend/` is the current live web app path
- `ai_investor_agent/`, `api.py`, and `main.py` are older prototype assets kept in the repo

---

## Quick Start

### 1) Start the backend

```bash
cd backend
cp .env.example .env
npm install
npm start
```

Default backend URL:

```text
http://127.0.0.1:3001
```

Optional backend `.env` values:

```env
PORT=3001
HOST=127.0.0.1
GEMINI_API_KEY=
```

### 2) Start the frontend

```bash
cd frontend
npm install
npm start
```

Default frontend URL:

```text
http://localhost:3000
```

Optional frontend env:

```env
REACT_APP_API_BASE_URL=http://127.0.0.1:3001
```

---

## API

### Health check

```text
GET /health
```

### Single stock analysis

```text
GET /api/stock/:symbol
```

Example:

```text
GET /api/stock/RELIANCE
```

### Portfolio analysis

```text
POST /api/portfolio/analyze
```

### Autonomous opportunity radar (3-step agent)

```text
POST /api/agent/opportunity-radar
```

### Opportunity radar history

```text
GET /api/agent/opportunity-radar/history?limit=25
```

Returns the latest persisted autonomous radar runs so UI can show daily signal history.

This endpoint runs a fully autonomous 3-step workflow:

1. detect signal from market + indicators
2. enrich each signal with portfolio context
3. generate actionable alert with explainability + sources

Example request:

```json
[
  { "symbol": "TCS", "weight": 40 },
  { "symbol": "RELIANCE", "weight": 35 }
]
```

Example response shape:

```json
{
  "workflow": [
    "detect_signal",
    "enrich_with_portfolio_context",
    "generate_actionable_alert"
  ],
  "autonomous": true,
  "portfolioInsight": "Technology sector exposure is 53.33%",
  "generatedAt": "2026-03-26T16:29:35.956Z",
  "alerts": [
    {
      "symbol": "TCS",
      "action": "HOLD",
      "signalType": "oversold-reversal-watch",
      "signalStrength": 30,
      "priorityScore": 34,
      "backtestedSuccessRate": null,
      "portfolioRelevance": "Moderate concentration: use staged entries and tight risk controls.",
      "contextSignals": [
        {
          "type": "quarterly_result",
          "impact": "positive",
          "title": "Q3 revenue beat street estimates",
          "source": "ET Markets",
          "sourceUrl": "https://economictimes.indiatimes.com/markets",
          "credibilityTier": "news",
          "credibilityScore": 2,
          "ageDays": 2,
          "recencyWeight": 1,
          "weightedImpactScore": 6
        }
      ],
      "explanation": "...",
      "riskFlags": ["high-sector-concentration", "oversold"],
      "sources": [
        "Yahoo Finance chart API",
        "In-house indicator pipeline (MA/RSI/momentum)",
        "Portfolio exposure engine"
      ]
    }
  ]
}
```

Example history response shape:

```json
{
  "items": [
    {
      "generatedAt": "2026-03-26T16:43:03.491Z",
      "portfolioInsight": "Technology sector exposure is 53.33%",
      "alerts": [
        {
          "symbol": "TCS",
          "action": "HOLD",
          "signalType": "oversold-reversal-watch"
        }
      ]
    }
  ],
  "count": 1
}
```

Example request:

```json
[
  { "symbol": "RELIANCE", "weight": 50 },
  { "symbol": "TCS", "weight": 30 },
  { "symbol": "INFY", "weight": 20 }
]
```

Example response:

```json
{
  "portfolioInsight": "Technology sector exposure is 60.00%",
  "sectorAllocation": {
    "Technology": 60,
    "Energy": 40
  },
  "overexposedSectors": [],
  "results": [
    {
      "symbol": "RELIANCE",
      "resolvedSymbol": "RELIANCE.NS",
      "price": 2941.35,
      "historical": [
        {
          "date": "2026-03-19",
          "open": 2868.2,
          "high": 2890.95,
          "low": 2859.6,
          "close": 2880.4
        },
        {
          "date": "2026-03-20",
          "open": 2880.4,
          "high": 2901.4,
          "low": 2873.1,
          "close": 2892.6
        }
      ],
      "trend": "neutral",
      "rsi": 52.61,
      "ma20": 2901.84,
      "ma50": 2890.12,
      "momentum_percent": 2.04,
      "volatility_percent": 0.44,
      "breakout": false,
      "technical_score": 1,
      "portfolio_adjustment": 0,
      "risk_score": 0,
      "final_score": 1,
      "decision": "HOLD",
      "confidence": 20,
      "data_warning": null,
      "reason": "Gemini API key not configured.",
      "next_action": "Evaluate manually based on signals."
    }
  ]
}
```

---

## Validation Checklist (Hackathon Demo)

Use this checklist to verify the core Opportunity Radar features end-to-end.

### 1) Backend health and API routes

Start backend:

```bash
cd backend
npm start
```

Health check:

```bash
curl http://127.0.0.1:3001/health
```

Expected:

```json
{ "ok": true, "service": "indian-investor-decision-engine" }
```

Run opportunity radar:

```bash
curl -X POST http://127.0.0.1:3001/api/agent/opportunity-radar \
  -H "Content-Type: application/json" \
  -d '[
    {"symbol":"TCS","weight":40},
    {"symbol":"RELIANCE","weight":35},
    {"symbol":"ICICIBANK","weight":25}
  ]'
```

Expected response fields:

- `workflow` with 3 steps
- `portfolioInsight` string
- `alerts[].priorityScore`
- `alerts[].contextSignals[].credibilityTier`
- `alerts[].contextSignals[].recencyWeight`

Read radar history:

```bash
curl "http://127.0.0.1:3001/api/agent/opportunity-radar/history?limit=5"
```

Expected:

- `items` array present
- `count` equals returned item count
- most recent run appears first

### 2) Automated backend tests

Run all backend tests:

```bash
cd backend
npm test
```

Expected summary:

- market context tests pass (9/9)
- opportunity radar API integration tests pass (positive + negative cases)

### 3) Frontend manual checks

Start frontend:

```bash
cd frontend
npm start
```

Run frontend radar smoke tests (deterministic, non-watch mode):

```bash
cd frontend
npm run test:radar
```

Expected summary:

- `OpportunityRadarPage.test.js` runs and exits automatically
- action/risk/credibility/history sorting UI assertions pass

Open:

```text
http://localhost:3000/opportunity-radar
```

Verify UI behaviors:

- `Run Opportunity Radar` and `Run Sample Radar` buttons trigger scans
- `Latest Alerts` filters work for action, risk, and credibility tier
- `Sort: Priority/Confidence/Signal Strength` updates alert ranking
- `Recent Radar Runs` sort works for latest vs highest average priority
- context badges display tier and recency labels (example: `[REGULATORY] [D3]`)

### 4) Quick failure checks

Verify these return proper errors:

- invalid JSON body to radar endpoint returns HTTP 400
- wrong payload shape returns HTTP 400
- unknown route returns HTTP 404

---

## ⚠️ Security Best Practices

### Environment Variables

**CRITICAL**: Never commit `.env` files to version control.

Environment variables are already in `.gitignore`, but ensure:

```bash
# Verify .env is ignored
git status | grep -i ".env"  # Should return nothing

# If accidentally committed, remove from history:
git rm --cached .env
git rm --cached .env.example
git commit --amend --no-edit
git push --force-with-lease
```

### API Keys

If you have committed API keys:

1. **Rotate immediately** at the service provider (Gemini, etc.)
2. Remove from Git history:
   ```bash
   git log --all --source -- .env
   git log --all --source -- .env.example
   ```
3. Use `git filter-branch` or `BFG Repo-Cleaner` to scrub history

### Recommended Security Hardening

- [ ] **Environment Variables**: Use `.env.example` as template only
- [ ] **Input Validation**: Sanitize all symbol inputs (alphanumeric + `.` only)
- [ ] **Rate Limiting**: Add API endpoint rate limiting (5-10 req/min per IP)
- [ ] **CORS**: Restrict frontend origin in production
- [ ] **Authentication**: Add user login for multi-user scenarios
- [ ] **Database**: Use encrypted connection strings in `.env`
- [ ] **Secrets Manager**: Use AWS Secrets Manager / HashiCorp Vault in prod
- [ ] **HTTPS**: Force HTTPS in production (redirect HTTP)
- [ ] **Logging**: Never log API keys or sensitive data
- [ ] **Dependency Audit**: Run `npm audit` regularly

### Current Status

- ⚠️ **Gemini API key may be exposed** if committed to repository
  - Rotate the key at https://aistudio.google.com/
  - Add to `.gitignore`
- ✅ `.env` is already in `.gitignore`
- ✅ No database credentials currently needed

---

## Important Behaviors

- Missing or invalid Yahoo OHLC values are removed before indicator calculation
- Historical data is processed oldest to latest
- Indicators return `null` if history is insufficient
- The backend does not use default `0` values for missing indicators
- Missing key indicators trigger a safe `HOLD` decision
- The frontend renders a TradingView-style candlestick chart with MA20/MA50 overlays
- The frontend shows `Not enough data for chart` if there are not enough valid OHLC points
- The frontend shows `Not enough data` for missing metrics
- Insufficient-data cases are logged in the backend for debugging

---

## Disclaimer

This project is a rule-based prototype for demos, experimentation, and learning.

It is not financial advice.
