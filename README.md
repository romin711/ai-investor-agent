# Arthasanket - AI Investor Agent

Portfolio-aware market intelligence with actionable signals, explainable reasoning, and validation-first analytics.

Detailed onboarding guide:

- [PROJECT_SETUP_AND_API_INTEGRATION.md](PROJECT_SETUP_AND_API_INTEGRATION.md)

## What This Repo Contains

This workspace has two backend options and one frontend:

- Node backend (primary app backend): portfolio analysis, opportunity radar, market chat, validation metrics, and financial data routes.
- React frontend: dashboard and workflows for portfolio, radar, chat, insights, and validation.
- Python agent package (optional/parallel implementation): FastAPI API and CLI runner for multi-agent portfolio analysis.

## Monorepo Layout

```text
ai-investor-agent/
|- backend/                 # Primary Node API server (port 3001 by default)
|- frontend/                # React app (port 3000 by default)
|- ai_investor_agent/       # Python package with agents/workflow
|- api.py                   # Optional FastAPI entrypoint
|- main.py                  # Optional Python CLI entrypoint
`- validate-refactoring.sh
```

## Quick Start (Node + React)

Prerequisites:

- Node.js 18+
- npm 9+

1. Backend setup

```bash
cd backend
npm install
cp .env.example .env
npm start
```

Backend runs at `http://127.0.0.1:3001`.

2. Frontend setup (new terminal)

```bash
cd frontend
npm install
cp .env.example .env
npm start
```

Frontend runs at `http://127.0.0.1:3000`.

3. Open the app

- Dashboard: `http://127.0.0.1:3000/dashboard`
- Portfolio: `http://127.0.0.1:3000/portfolio`
- Opportunity Radar: `http://127.0.0.1:3000/opportunity-radar`
- Market Chat: `http://127.0.0.1:3000/market-chat`
- Validation: `http://127.0.0.1:3000/validation-dashboard`

## Environment Variables

### backend/.env

```env
PORT=3001
HOST=127.0.0.1
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
NEWSAPI_KEY=

# Production-safe defaults: real data mode unless explicitly enabled.
USE_MOCK_SIGNALS=false
USE_MOCK_FINANCIAL_DATA=false

RADAR_AUTORUN_ENABLED=false
RADAR_AUTORUN_INTERVAL_MINUTES=720
RADAR_AUTORUN_RISK_PROFILE=moderate
RADAR_AUTORUN_UNIVERSE_LIMIT=0
NSE_UNIVERSE_FILE=

# Optional. Needed only to enable synthetic backtest endpoint.
ENABLE_SYNTHETIC_BACKTEST=false
```

Notes:

- Set `GEMINI_API_KEY` to unlock AI-generated reasoning in market chat and decision flows.
- Keep mock flags disabled in production-like runs.
- Synthetic backtest is intentionally feature-gated.

### frontend/.env

```env
REACT_APP_API_BASE_URL=http://127.0.0.1:3001
```

## Verified API Reference (Node Backend)

Base URL: `http://127.0.0.1:3001`

### Health and analysis

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Service status + market context mode |
| GET | `/api/stock/:symbol` | Analyze a single symbol |
| POST | `/api/portfolio/analyze` | Analyze portfolio rows |

### Opportunity radar

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/agent/opportunity-radar` | Portfolio-based radar run |
| POST | `/api/agent/opportunity-radar/universe` | Universe scan |
| GET | `/api/agent/opportunity-radar/history?limit=25` | Radar history |
| GET | `/api/agent/opportunity-radar/scheduler` | Scheduler status |
| POST | `/api/agent/opportunity-radar/scheduler/start` | Start scheduler |
| POST | `/api/agent/opportunity-radar/scheduler/stop` | Stop scheduler |
| POST | `/api/agent/opportunity-radar/scheduler/run-now` | Trigger immediate scheduler run |

### Market chat

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/agent/market-chat` | Portfolio-aware Q&A |
| GET | `/api/agent/market-chat/session?sessionId=...` | Fetch chat session |

### Validation and market intel

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/validation/performance` | Performance metrics |
| GET | `/api/validation/readiness` | Trading readiness snapshot |
| GET | `/api/validation/strategy-breakdown` | Strategy-type breakdown |
| GET | `/api/validation/outcomes` | Synced outcomes |
| GET | `/api/market/summary` | Market summary |
| GET | `/api/news/financial?limit=5` | Financial headlines |

### Financial data endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/financial/health?symbol=...` | Financial health scoring |
| GET | `/api/financial/events?symbol=...` | Financial events stream |
| GET | `/api/financial/signal?symbol=...&price=...` | Financial signal synthesis |
| GET | `/api/financial/insider?symbol=...` | NSE insider data |
| GET | `/api/financial/news?symbol=...` | Symbol-specific news |

### Feature-gated endpoint

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/backtest/run` | Synthetic backtest (requires `ENABLE_SYNTHETIC_BACKTEST=true`) |

## Request Examples

### Analyze portfolio

```bash
curl -X POST http://127.0.0.1:3001/api/portfolio/analyze \
  -H "Content-Type: application/json" \
  -d '[{"symbol":"RELIANCE","weight":40},{"symbol":"TCS","weight":60}]'
```

Alternative payloads accepted by `/api/portfolio/analyze`:

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

### Run opportunity radar

```bash
curl -X POST http://127.0.0.1:3001/api/agent/opportunity-radar \
  -H "Content-Type: application/json" \
  -d '{"portfolio":[{"symbol":"INFY","weight":50},{"symbol":"HDFCBANK","weight":50}],"riskProfile":"moderate"}'
```

### Ask market chat

```bash
curl -X POST http://127.0.0.1:3001/api/agent/market-chat \
  -H "Content-Type: application/json" \
  -d '{"question":"Should I reduce concentration risk in my portfolio?"}'
```

## Test Commands

Run from the correct package folders:

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test

# Focused radar page test
cd frontend
npm run test:radar
```

## Optional Python Service and CLI

Python requirements are not installed by default in Node/React setup. If you want to run the Python path:

1. Create/activate environment and install dependencies (per your own requirements file/environment).
2. Start FastAPI app from project root:

```bash
uvicorn api:app --host 127.0.0.1 --port 8000 --reload
```

3. Run CLI analyzer:

```bash
python main.py --symbols AAPL,MSFT,RELIANCE.NS
```

Python API endpoints (from `api.py`):

- `POST /analyze`
- `POST /portfolio/save`
- `GET /portfolio/load?user_id=default-user`
- `GET /realtime/quotes?symbols=AAPL,MSFT`

## Architecture Summary

- Frontend calls backend via `PortfolioContext` and page-level services.
- `backend/server.js` dispatches all HTTP routes.
- `backend/engine/pipeline.js` drives symbol/portfolio analysis.
- `backend/engine/opportunityAgent.js` generates radar alerts and persists run history.
- `backend/engine/marketChatAgent.js` orchestrates AI + deterministic fallback responses.
- `backend/engine/signalOutcomeService.js` and `backend/engine/performanceService.js` compute validation and readiness.
- JSON stores under `backend/storage/` keep radar history, outcomes, and chat state.

## Troubleshooting

- `EADDRINUSE` on backend start:
  - Change `PORT` in `backend/.env` (example: `3002`) or stop the process using `3001`.
- Frontend cannot reach backend:
  - Verify backend is running and `REACT_APP_API_BASE_URL` matches host/port.
- Market chat returns fallback responses:
  - Check `GEMINI_API_KEY` and internet access.
- Missing news data:
  - Add `NEWSAPI_KEY` in `backend/.env`.
- Synthetic backtest returns 403:
  - Set `ENABLE_SYNTHETIC_BACKTEST=true` only in demo/testing environments.

## Contributing

1. Create a feature branch.
2. Keep changes small and focused.
3. Run backend and frontend tests.
4. Open a PR with context and test notes.

## License

No license file is currently present.
Add a `LICENSE` file (for example MIT or Apache-2.0) before public redistribution.
