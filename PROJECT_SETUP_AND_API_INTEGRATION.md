# Project Setup and API Integration Guide

This guide explains how to start the project from scratch, run each service, and integrate APIs in the frontend.

## 1. Prerequisites

- Node.js 18+
- npm 9+
- Python 3.10+ (only if you want to run the optional FastAPI service)

## 2. Clone and Open the Project

```bash
git clone <your-repo-url>
cd ai-investor-agent
```

## 3. Start Node Backend (Primary API)

Run from the backend folder:

```bash
cd backend
npm install
cp .env.example .env
npm start
```

Backend starts at:

- `http://127.0.0.1:3001`

### Backend environment variables (`backend/.env`)

```env
PORT=3001
HOST=127.0.0.1
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
NEWSAPI_KEY=
USE_MOCK_SIGNALS=false
USE_MOCK_FINANCIAL_DATA=false
RADAR_AUTORUN_ENABLED=false
RADAR_AUTORUN_INTERVAL_MINUTES=720
RADAR_AUTORUN_RISK_PROFILE=moderate
RADAR_AUTORUN_UNIVERSE_LIMIT=0
NSE_UNIVERSE_FILE=
```

Important:
- Set `GEMINI_API_KEY` for AI-driven reasoning in market chat and decision logic.
- Set `NEWSAPI_KEY` to enable financial news endpoints and richer market context.
- Keep mock flags as `false` for real-data behavior.

### How to get NEWSAPI_KEY

1. Go to https://newsapi.org and create an account.
2. Verify your email address after signup.
3. Open your account dashboard and copy your API key.
4. Add it to `backend/.env`:

```env
NEWSAPI_KEY=your_newsapi_key_here
```

5. Restart the backend server so the new key is loaded.
6. Validate with:

```bash
curl "http://127.0.0.1:3001/api/news/financial?limit=5"
```

If the key is valid, you should receive a news payload instead of empty or fallback data.

## 4. Start Frontend

Open a new terminal and run from the frontend folder:

```bash
cd frontend
npm install
cp .env.example .env
npm start
```

Frontend starts at:

- `http://127.0.0.1:3000`

### Frontend environment variable (`frontend/.env`)

```env
REACT_APP_API_BASE_URL=http://127.0.0.1:3001
```

If backend port changes, update this value.

## 5. API Integration Basics

The frontend should call backend APIs using `REACT_APP_API_BASE_URL`.

Example (Axios):

```js
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:3001',
  headers: {
    'Content-Type': 'application/json',
  },
});

export async function analyzePortfolio(portfolio) {
  const response = await api.post('/api/portfolio/analyze', portfolio);
  return response.data;
}
```

## 6. Core Backend API Endpoints

Base URL:

- `http://127.0.0.1:3001`

Health:
- `GET /health`

Portfolio and stock:
- `GET /api/stock/:symbol`
- `POST /api/portfolio/analyze`

Opportunity radar:
- `POST /api/agent/opportunity-radar`
- `POST /api/agent/opportunity-radar/universe`
- `GET /api/agent/opportunity-radar/history?limit=25`
- `GET /api/agent/opportunity-radar/scheduler`
- `POST /api/agent/opportunity-radar/scheduler/start`
- `POST /api/agent/opportunity-radar/scheduler/stop`
- `POST /api/agent/opportunity-radar/scheduler/run-now`

Market chat:
- `POST /api/agent/market-chat`
- `GET /api/agent/market-chat/session?sessionId=...`

Validation and market intel:
- `GET /api/validation/performance`
- `GET /api/validation/readiness`
- `GET /api/validation/strategy-breakdown`
- `GET /api/validation/outcomes`
- `GET /api/market/summary`
- `GET /api/news/financial?limit=5`

Financial endpoints:
- `GET /api/financial/health?symbol=...`
- `GET /api/financial/events?symbol=...`
- `GET /api/financial/signal?symbol=...&price=...`
- `GET /api/financial/insider?symbol=...`
- `GET /api/financial/news?symbol=...`

Feature-gated endpoint:
- `POST /api/backtest/run` (requires `ENABLE_SYNTHETIC_BACKTEST=true`)

## 7. cURL API Integration Examples

Analyze portfolio:

```bash
curl -X POST http://127.0.0.1:3001/api/portfolio/analyze \
  -H "Content-Type: application/json" \
  -d '[{"symbol":"RELIANCE","weight":40},{"symbol":"TCS","weight":60}]'
```

Run opportunity radar:

```bash
curl -X POST http://127.0.0.1:3001/api/agent/opportunity-radar \
  -H "Content-Type: application/json" \
  -d '{"portfolio":[{"symbol":"INFY","weight":50},{"symbol":"HDFCBANK","weight":50}],"riskProfile":"moderate"}'
```

Ask market chat:

```bash
curl -X POST http://127.0.0.1:3001/api/agent/market-chat \
  -H "Content-Type: application/json" \
  -d '{"question":"Should I reduce concentration risk in my portfolio?"}'
```

## 8. Optional: Run Python FastAPI Service

This project also includes a Python API (`api.py`) with endpoints such as `/analyze` and `/realtime/quotes`.

From project root:

```bash
python -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn pydantic
uvicorn api:app --host 127.0.0.1 --port 8000 --reload
```

Python API base URL:

- `http://127.0.0.1:8000`

Python API routes:
- `POST /analyze`
- `POST /portfolio/save`
- `GET /portfolio/load?user_id=default-user`
- `GET /realtime/quotes?symbols=AAPL,MSFT`

## 9. Run Tests

Backend tests:

```bash
cd backend
npm test
```

Frontend tests:

```bash
cd frontend
npm test
```

Focused radar test:

```bash
cd frontend
npm run test:radar
```

## 10. Troubleshooting

- Backend port conflict:
  - Update `PORT` in `backend/.env` and restart backend.
- Frontend cannot reach backend:
  - Check `REACT_APP_API_BASE_URL` and confirm backend is running.
- AI responses missing in chat:
  - Set valid `GEMINI_API_KEY` in `backend/.env`.
- CORS issues:
  - Backend already allows CORS for local development; confirm you are calling the correct host and port.

## 11. Recommended Startup Order

1. Start backend (`backend`, port `3001`).
2. Start frontend (`frontend`, port `3000`).
3. Verify `GET /health` returns `{ "ok": true }`.
4. Test `POST /api/portfolio/analyze` with sample payload.
5. Enable optional keys (`GEMINI_API_KEY`, `NEWSAPI_KEY`) for richer results.
