# Arthasanket — AI Investor Agent

> Portfolio-aware market intelligence with actionable signals, explainable reasoning, and validation-first analytics.

![Frontend](https://img.shields.io/badge/Frontend-React%2018-blue)
![Backend](https://img.shields.io/badge/Backend-Node.js-brightgreen)
![AI](https://img.shields.io/badge/AI-Gemini%202.5%20Flash-purple)
![Status](https://img.shields.io/badge/Status-Active%20Hackathon-orange)
![License](https://img.shields.io/badge/License-Not%20Specified-lightgrey)

Arthasanket helps retail investors turn raw portfolio holdings into structured decisions. It combines technical analysis, market context, financial events, and AI-assisted explanations into one workflow: analyze portfolio -> run opportunity radar -> validate signal quality -> ask portfolio-aware market questions.

---

## 🚀 Project Overview

This repository contains a production-style React + Node workflow for portfolio decision support:

1. **Frontend dashboard** for portfolio input, insights, market chat, radar scans, validation metrics, and charts.
2. **Node backend engine** with route-level orchestration for analysis, alert generation, market-chat synthesis, financial APIs, and outcome validation.
3. **Local JSON persistence** for radar runs, signal outcomes, and market chat sessions.

Real problem addressed:
Manual portfolio review is fragmented across charts, news, and intuition. This project consolidates those into a single decision pipeline with explainable outputs and measurable reliability gates.

---

## ✨ Features

### Frontend

- Portfolio builder with JSON import and weight validation
- Live analyze/refresh workflow from a shared context layer
- Opportunity Radar UI (portfolio scan + NSE universe scan)
- Market Chat UI with session load/resume
- Validation dashboard (hit rate, Sharpe, drawdown, readiness)
- Dashboard with market summary and financial headline feed

### Backend APIs

- Portfolio analysis endpoint with flexible payload parsing
- Symbol-level analysis endpoint
- Opportunity Radar endpoints (scan/history/scheduler controls)
- Validation endpoints with synchronized realized outcomes
- Financial endpoints (health/events/signal/insider/news)
- Market summary + financial news endpoints
- Synthetic backtest endpoint (explicitly feature-gated)

### AI / Decision Intelligence

- Gemini-powered reasoning for technical decisions
- Multi-step Market Chat agent with context-aware prompt synthesis
- Fallback deterministic response path when AI fails/timeouts
- Signal classification with confidence + execution-plan generation

### System / Reliability

- Host fallback logic (`127.0.0.1` <-> `localhost`) in frontend calls
- Route-level validations and centralized backend error mapping
- Radar scheduler with overlap protection (`isExecuting` guard)
- JSON-backed historical stores for reproducible validation

---

## 🧰 Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18, React Router DOM 6, Axios, Lightweight Charts | CRA-based SPA with route modules and shared context |
| Backend | Node.js (native `http` server) | API routing handled directly in `backend/server.js` |
| Database | JSON file stores | `backend/storage/*.json` for sessions/outcomes/history |
| External APIs | Yahoo Finance Chart API, NSE quote-equity, NewsAPI, RSS feeds | Yahoo + NSE for prices, NewsAPI/RSS for headlines/events |
| AI Model | Google Gemini (`gemini-2.5-flash` default) | Used in market chat and reasoning paths with fallback |
| Libraries/Tools | Testing Library, Tailwind/PostCSS, Jest (via react-scripts), Node tests | UI tests + backend engine/API tests |

---

## 🧭 System Architecture

### High-level interaction

1. User interacts with React pages (`/portfolio`, `/opportunity-radar`, `/market-chat`, `/validation-dashboard`).
2. Frontend context (`PortfolioContext`) calls backend APIs.
3. Backend orchestrates engine modules:
   - `pipeline.js` for per-symbol/portfolio analysis
   - `opportunityAgent.js` for alert generation
   - `marketChatAgent.js` for multi-source synthesis + AI response
   - `signalOutcomeService.js` + `performanceService.js` for validation metrics
4. Outputs are persisted to JSON stores where required.
5. Frontend renders live status, insights, and readiness metrics.

### Request lifecycle (example: Opportunity Radar)

1. Frontend posts portfolio rows or universe settings.
2. Backend normalizes rows and runs `analyzePortfolio`.
3. Signal features are classified (`BUY`/`SELL`/`HOLD`).
4. Execution plan, confidence, risk flags, and evidence fields are attached.
5. Run is saved to `backend/storage/opportunity_radar_history.json`.
6. Frontend displays alerts + historical runs.

---

## 🗂️ Project Structure

```text
ai-investor-agent/
├── backend/
│   ├── server.js                       # Main HTTP API server and route dispatch
│   ├── package.json                    # Backend scripts
│   ├── engine/
│   │   ├── pipeline.js                 # Portfolio/symbol analysis pipeline
│   │   ├── opportunityAgent.js         # Radar scan + alert generation
│   │   ├── marketChatAgent.js          # Multi-step AI chat orchestration
│   │   ├── performanceService.js       # Validation metrics + readiness logic
│   │   ├── signalOutcomeService.js     # Outcome synchronization and persistence
│   │   ├── marketIntelService.js       # Market summary + RSS financial news
│   │   ├── financialDataService.js     # Financial health/events/news integrations
│   │   └── ...
│   ├── tests/                          # Backend test suite
│   └── storage/                        # Runtime JSON stores
│       ├── opportunity_radar_history.json
│       ├── signal_outcomes.json
│       ├── market_chat_sessions.json
│       └── market_chat_outcomes.json
├── frontend/
│   ├── package.json                    # Frontend scripts and deps
│   └── src/
│       ├── context/PortfolioContext.js # API abstraction + shared state
│       ├── layout/AppLayout.js         # Primary app shell + quick scan trigger
│       ├── pages/                      # Dashboard / Portfolio / Chat / Radar / Validation
│       └── ...
├── ai_investor_agent/                  # Python agent package (present in repo)
├── api.py                              # Python FastAPI entrypoint (present in repo)
├── main.py                             # Python CLI entrypoint (present in repo)
└── validate-refactoring.sh             # Utility validation script
```

---

## ⚙️ Installation & Setup

### Prerequisites

- Node.js 18+
- npm 9+
- Python 3.10+ (only if you want to run Python modules too)

### 1) Clone

```bash
git clone <your-repo-url>
cd ai-investor-agent
```

### 2) Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

### 3) Frontend setup

```bash
cd ../frontend
npm install
cp .env.example .env
```

### 4) Configure environment variables

#### Backend (`backend/.env`)

```env
PORT=3001
HOST=127.0.0.1
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
NEWSAPI_KEY=
USE_MOCK_FINANCIAL_DATA=false
RADAR_AUTORUN_ENABLED=false
RADAR_AUTORUN_INTERVAL_MINUTES=720
RADAR_AUTORUN_RISK_PROFILE=moderate
RADAR_AUTORUN_UNIVERSE_LIMIT=0
NSE_UNIVERSE_FILE=
```

Notes:

- `GEMINI_API_KEY` enables AI synthesis paths.
- `NEWSAPI_KEY` enables NewsAPI-based financial news enrichment.
- `RADAR_AUTORUN_*` controls the scheduler behavior.

#### Frontend (`frontend/.env`)

```env
REACT_APP_API_BASE_URL=http://127.0.0.1:3001
```

---

## ▶️ Usage

### Run backend

```bash
cd backend
npm start
```

### Run frontend

```bash
cd frontend
npm start
```

### Run tests

```bash
# backend
cd backend
npm test

# frontend
cd ../frontend
npm test
```

### Typical user workflow

1. Open `/portfolio`, add symbols + weights, run analyze.
2. Open `/opportunity-radar`, run portfolio scan or universe scan.
3. Review `/insights` and `/dashboard` for decision context.
4. Use `/market-chat` for portfolio-aware what-to-do-next guidance.
5. Check `/validation-dashboard` for statistical reliability/readiness.

---

## 🔌 API Documentation

Base URL: `http://127.0.0.1:3001`

### Core endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Service heartbeat + market context mode |
| GET | `/api/stock/:symbol` | Analyze one symbol |
| POST | `/api/portfolio/analyze` | Analyze full portfolio |
| POST | `/api/agent/opportunity-radar` | Portfolio radar scan |
| POST | `/api/agent/opportunity-radar/universe` | NSE universe radar scan |
| GET | `/api/agent/opportunity-radar/history?limit=25` | Get radar history |
| GET | `/api/agent/opportunity-radar/scheduler` | Scheduler state |
| POST | `/api/agent/opportunity-radar/scheduler/start` | Start scheduler |
| POST | `/api/agent/opportunity-radar/scheduler/stop` | Stop scheduler |
| POST | `/api/agent/opportunity-radar/scheduler/run-now` | Trigger immediate run |
| POST | `/api/agent/market-chat` | Portfolio-aware market Q&A |
| GET | `/api/agent/market-chat/session?sessionId=...` | Load chat session |
| GET | `/api/validation/performance` | Validation metrics |
| GET | `/api/validation/readiness` | Trading readiness snapshot |
| GET | `/api/validation/strategy-breakdown` | Decision-type breakdown |
| GET | `/api/validation/outcomes` | Synced outcomes list |
| GET | `/api/market/summary` | Market overview |
| GET | `/api/news/financial?limit=5` | Financial headlines |
| GET | `/api/financial/health?symbol=...` | Financial health score |
| GET | `/api/financial/events?symbol=...` | Financial events |
| GET | `/api/financial/signal?symbol=...&price=...` | Financial signal output |
| GET | `/api/financial/insider?symbol=...` | Insider data feed |
| GET | `/api/financial/news?symbol=...` | Symbol news feed |
| POST | `/api/backtest/run` | Synthetic backtest (feature-gated) |

### Portfolio analyze request format

Accepted request body variants for `POST /api/portfolio/analyze`:

```json
[
  { "symbol": "RELIANCE", "weight": 40 },
  { "symbol": "TCS", "weight": 60 }
]
```

```json
{
  "portfolio": [
    { "symbol": "RELIANCE", "weight": 40 },
    { "symbol": "TCS", "weight": 60 }
  ]
}
```

```json
{
  "rawInput": "RELIANCE 40\nTCS 60"
}
```

### Example response (truncated)

```json
{
  "portfolioInsight": "...",
  "sectorAllocation": { "Technology": 60, "Energy": 40 },
  "overexposedSectors": [],
  "results": [
    {
      "symbol": "RELIANCE",
      "resolvedSymbol": "RELIANCE.NS",
      "decision": "HOLD",
      "confidence": 62,
      "technical_score": 0.34,
      "reason": "...",
      "next_action": "..."
    }
  ]
}
```

---

## 🧠 Architecture / Logic Deep Dive

### 1) Analysis pipeline (`pipeline.js`)

- Normalizes holdings and validates positive weights
- Resolves tickers using mapping/fuzzy/Gemini-assisted resolution
- Pulls historical candles and latest prices (Yahoo, NSE price preference)
- Computes MA/RSI/momentum/volatility/pattern features
- Produces decision payload with risk/context fields

### 2) Opportunity Radar (`opportunityAgent.js`)

- Converts analysis results into structured signal items
- Classifies decision type (`BUY`/`SELL`/`HOLD`) and confidence
- Builds execution plan (entry range, stop-loss, target, horizon)
- Persists each run for later analytics and UI history

### 3) Market Chat (`marketChatAgent.js`)

- Detects user intent and focus symbols
- Aggregates portfolio analysis + alerts + financial events + market/news context
- Calls Gemini with strict response format and retry logic
- If AI path fails/invalid, produces deterministic fallback answer
- Stores turns and prediction metadata for session continuity and tracking

### 4) Validation engine (`signalOutcomeService.js` + `performanceService.js`)

- Replays historical alerts against fetched market data across horizons (1D/3D/5D)
- Computes hit rate, Wilson confidence interval, Sharpe, max drawdown, baseline outperformance
- Produces readiness gates with explicit pass/fail diagnostics

### 5) Error handling strategy

- Backend route wrapper maps thrown errors to HTTP responses
- Frontend host fallback retries local alias if network resolution fails
- Market chat uses step-level safe execution (`runSafeStep`) to avoid full-request collapse
- External feed failures degrade gracefully to partial data instead of hard crash

---

## 🖼️ Screenshots / Demo

![Dashboard Demo](./assets/dashboard-demo.png)
![Opportunity Radar Demo](./assets/opportunity-radar-demo.png)
![Market Chat Demo](./assets/market-chat-demo.png)
![Validation Demo](./assets/validation-demo.png)

---

## 🔭 Future Improvements

- Add API authentication + authorization for all non-health routes
- Restrict CORS to explicit frontend origins
- Replace JSON file stores with transactional persistence (e.g., SQLite/Postgres)
- Add schema validation layer (request/response contracts) across API boundaries
- Surface degraded data quality mode explicitly in UI (not only server internals)
- Extract large `server.js` route handlers into modular controllers/services

---

## 🤝 Contributing

1. Fork the repository.
2. Create a feature branch.
3. Keep changes small and testable.
4. Run backend and frontend tests before opening a PR.
5. Submit a clear PR with context, screenshots (if UI), and test notes.

---

## 📄 License

No license file is currently present in this repository.
Add a `LICENSE` file (for example MIT/Apache-2.0) before public redistribution.

## Disclaimer

This project is for educational, research, and prototyping use.
It is not financial advice. Always perform independent research and risk assessment before trading.
