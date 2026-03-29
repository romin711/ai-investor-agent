<div align="center">

# 🏦 Arthasanket

### AI-Powered Investor Agent for the Indian Market

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org/)
[![Gemini AI](https://img.shields.io/badge/Gemini-AI%202.5-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
[![License](https://img.shields.io/badge/License-TBD-lightgrey?style=for-the-badge)](#-license)

> **Portfolio-aware market intelligence** with actionable signals, explainable AI reasoning, and validation-first analytics — built for NSE/BSE investors.

---

[🚀 Quick Start](#-quick-start) · [✨ Features](#-features) · [🏗 Architecture](#-architecture) · [📡 API Reference](#-api-reference) · [🔧 Configuration](#-configuration) · [🐛 Troubleshooting](#-troubleshooting) · [🤝 Contributing](#-contributing)

</div>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 📊 Portfolio Analysis
Upload your holdings and get instant, symbol-by-symbol risk breakdowns, concentration alerts, and weighted signal summaries.

</td>
<td width="50%">

### 🎯 Opportunity Radar
Scans NSE universe for emerging opportunities aligned with your portfolio's risk profile — on-demand or on a scheduled cadence.

</td>
</tr>
<tr>
<td width="50%">

### 🤖 Market Chat (AI)
Conversational market Q&A powered by **Gemini 2.5 Flash**. Ask natural-language questions about your holdings, macro trends, or strategy.

</td>
<td width="50%">

### ✅ Validation Dashboard
Track signal accuracy, trading readiness, strategy-type breakdown, and outcome syncing — all in one view.

</td>
</tr>
<tr>
<td width="50%">

### 📰 Financial News & Events
Pulls live headlines and symbol-specific events from NewsAPI, enriching every analysis with real-time context.

</td>
<td width="50%">

### 🔬 Financial Health Scoring
Aggregates insider data, events, and signals into a composite health score per NSE symbol.

</td>
</tr>
</table>

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────┐
│                    React Frontend                    │
│  Dashboard · Portfolio · Radar · Chat · Validation   │
│              http://127.0.0.1:3000                   │
└──────────────────────┬───────────────────────────────┘
                       │ REST (REACT_APP_API_BASE_URL)
┌──────────────────────▼───────────────────────────────┐
│              Node.js Backend  (server.js)            │
│                 http://127.0.0.1:3001                │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │               Engine Layer                      │ │
│  │  pipeline.js · opportunityAgent.js              │ │
│  │  marketChatAgent.js · signalOutcomeService.js   │ │
│  │  performanceService.js                          │ │
│  └────────────────────┬────────────────────────────┘ │
│                       │                              │
│  ┌────────────────────▼────────────────────────────┐ │
│  │  JSON Storage  (backend/storage/)               │ │
│  │  radar history · outcomes · chat sessions       │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘

                 (Optional Python path)
┌──────────────────────────────────────────────────────┐
│        FastAPI / CLI  (api.py · main.py)             │
│              http://127.0.0.1:8000                   │
│  ai_investor_agent/ package — multi-agent workflow   │
└──────────────────────────────────────────────────────┘
```

### Monorepo Layout

```text
Arthasanket/
├── backend/                 # Node.js API server  (port 3001)
│   ├── engine/              # Core analysis & agent logic
│   ├── routes/              # Express route handlers
│   └── storage/             # Persistent JSON data stores
├── frontend/                # React app  (port 3000)
│   └── src/                 # Components, pages, context
├── ai_investor_agent/       # Python package — multi-agent workflow
├── api.py                   # FastAPI entrypoint  (port 8000)
├── main.py                  # Python CLI entrypoint
└── validate-refactoring.sh
```

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18+ |
| npm | 9+ |
| Python *(optional)* | 3.10+ |

> 💡 Full onboarding details: **[PROJECT_SETUP_AND_API_INTEGRATION.md](PROJECT_SETUP_AND_API_INTEGRATION.md)**

---

### Step 1 — Start the Backend

```bash
cd backend
npm install
cp .env.example .env   # then add your API keys (see Configuration)
npm start
```

✅ Backend is live at **`http://127.0.0.1:3001`**

---

### Step 2 — Start the Frontend *(new terminal)*

```bash
cd frontend
npm install
cp .env.example .env
npm start
```

✅ Frontend is live at **`http://127.0.0.1:3000`**

---

### Step 3 — Open the App

| Page | URL |
|---|---|
| 🏠 Dashboard | `http://127.0.0.1:3000/dashboard` |
| 📊 Portfolio | `http://127.0.0.1:3000/portfolio` |
| 🎯 Opportunity Radar | `http://127.0.0.1:3000/opportunity-radar` |
| 🤖 Market Chat | `http://127.0.0.1:3000/market-chat` |
| ✅ Validation | `http://127.0.0.1:3000/validation-dashboard` |

---

## 🔧 Configuration

### `backend/.env`

```env
PORT=3001
HOST=127.0.0.1

# ── AI ──────────────────────────────────────────────
GEMINI_API_KEY=          # Required for AI chat & reasoning
GEMINI_MODEL=gemini-2.5-flash

# ── News ────────────────────────────────────────────
NEWSAPI_KEY=             # Required for live financial news

# ── Data Mode ───────────────────────────────────────
USE_MOCK_SIGNALS=false         # Keep false for real data
USE_MOCK_FINANCIAL_DATA=false  # Keep false for real data

# ── Radar Scheduler ─────────────────────────────────
RADAR_AUTORUN_ENABLED=false
RADAR_AUTORUN_INTERVAL_MINUTES=720
RADAR_AUTORUN_RISK_PROFILE=moderate
RADAR_AUTORUN_UNIVERSE_LIMIT=0
NSE_UNIVERSE_FILE=

# ── Feature Gates ───────────────────────────────────
ENABLE_SYNTHETIC_BACKTEST=false  # Enable only in demo/test
```

> 🔑 **Get your keys:**
> - Gemini API key → [ai.google.dev](https://ai.google.dev/)
> - NewsAPI key → [newsapi.org](https://newsapi.org/) (free tier available)

### `frontend/.env`

```env
REACT_APP_API_BASE_URL=http://127.0.0.1:3001
```

---

## 📡 API Reference

**Base URL:** `http://127.0.0.1:3001`

<details>
<summary><strong>🩺 Health & Stock Analysis</strong></summary>

| Method | Endpoint | Description |
|:---:|---|---|
| `GET` | `/health` | Service status + market context mode |
| `GET` | `/api/stock/:symbol` | Analyze a single NSE symbol |
| `POST` | `/api/portfolio/analyze` | Analyze full portfolio |

</details>

<details>
<summary><strong>🎯 Opportunity Radar</strong></summary>

| Method | Endpoint | Description |
|:---:|---|---|
| `POST` | `/api/agent/opportunity-radar` | Portfolio-based radar run |
| `POST` | `/api/agent/opportunity-radar/universe` | Full NSE universe scan |
| `GET` | `/api/agent/opportunity-radar/history?limit=25` | Past radar runs |
| `GET` | `/api/agent/opportunity-radar/scheduler` | Scheduler status |
| `POST` | `/api/agent/opportunity-radar/scheduler/start` | Start auto-scheduler |
| `POST` | `/api/agent/opportunity-radar/scheduler/stop` | Stop auto-scheduler |
| `POST` | `/api/agent/opportunity-radar/scheduler/run-now` | Trigger immediate run |

</details>

<details>
<summary><strong>🤖 Market Chat</strong></summary>

| Method | Endpoint | Description |
|:---:|---|---|
| `POST` | `/api/agent/market-chat` | Portfolio-aware AI Q&A |
| `GET` | `/api/agent/market-chat/session?sessionId=...` | Fetch chat session |

</details>

<details>
<summary><strong>✅ Validation & Market Intel</strong></summary>

| Method | Endpoint | Description |
|:---:|---|---|
| `GET` | `/api/validation/performance` | Signal performance metrics |
| `GET` | `/api/validation/readiness` | Trading readiness snapshot |
| `GET` | `/api/validation/strategy-breakdown` | Strategy-type breakdown |
| `GET` | `/api/validation/outcomes` | Synced signal outcomes |
| `GET` | `/api/market/summary` | Market summary |
| `GET` | `/api/news/financial?limit=5` | Latest financial headlines |

</details>

<details>
<summary><strong>💹 Financial Data</strong></summary>

| Method | Endpoint | Description |
|:---:|---|---|
| `GET` | `/api/financial/health?symbol=...` | Financial health score |
| `GET` | `/api/financial/events?symbol=...` | Financial events stream |
| `GET` | `/api/financial/signal?symbol=...&price=...` | Signal synthesis |
| `GET` | `/api/financial/insider?symbol=...` | NSE insider activity |
| `GET` | `/api/financial/news?symbol=...` | Symbol-specific news |

</details>

<details>
<summary><strong>🔬 Feature-Gated</strong></summary>

| Method | Endpoint | Description |
|:---:|---|---|
| `POST` | `/api/backtest/run` | Synthetic backtest *(requires `ENABLE_SYNTHETIC_BACKTEST=true`)* |

</details>

---

## 💻 Request Examples

### Analyze a portfolio

```bash
curl -X POST http://127.0.0.1:3001/api/portfolio/analyze \
  -H "Content-Type: application/json" \
  -d '[{"symbol":"RELIANCE","weight":40},{"symbol":"TCS","weight":60}]'
```

<details>
<summary>Alternative payload formats</summary>

**Object with `portfolio` key:**
```json
{
  "portfolio": [
    { "symbol": "RELIANCE", "weight": 40 },
    { "symbol": "TCS", "weight": 60 }
  ]
}
```

**Raw text input:**
```json
{
  "rawInput": "RELIANCE 40\nTCS 60"
}
```

</details>

### Run opportunity radar

```bash
curl -X POST http://127.0.0.1:3001/api/agent/opportunity-radar \
  -H "Content-Type: application/json" \
  -d '{
    "portfolio": [
      {"symbol":"INFY","weight":50},
      {"symbol":"HDFCBANK","weight":50}
    ],
    "riskProfile": "moderate"
  }'
```

### Ask the market chat

```bash
curl -X POST http://127.0.0.1:3001/api/agent/market-chat \
  -H "Content-Type: application/json" \
  -d '{"question":"Should I reduce concentration risk in my portfolio?"}'
```

---

## 🐍 Optional: Python Service & CLI

> The Python path is independent of the Node/React stack. Install only if needed.

```bash
# From project root
python -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn pydantic

# Start FastAPI server
uvicorn api:app --host 127.0.0.1 --port 8000 --reload

# Or run the CLI analyzer
python main.py --symbols AAPL,MSFT,RELIANCE.NS
```

**Python API endpoints** (`http://127.0.0.1:8000`):

| Method | Endpoint | Description |
|:---:|---|---|
| `POST` | `/analyze` | Analyze symbols |
| `POST` | `/portfolio/save` | Save portfolio |
| `GET` | `/portfolio/load?user_id=default-user` | Load portfolio |
| `GET` | `/realtime/quotes?symbols=AAPL,MSFT` | Real-time quotes |

---

## 🧪 Testing

```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test

# Focused radar page test
cd frontend && npm run test:radar
```

---

## 🐛 Troubleshooting

| Problem | Solution |
|---|---|
| `EADDRINUSE` on backend start | Change `PORT` in `backend/.env` (e.g. `3002`) or free port `3001` |
| Frontend can't reach backend | Verify backend is running; check `REACT_APP_API_BASE_URL` |
| Market chat returns fallback | Set a valid `GEMINI_API_KEY` and confirm internet access |
| No news data | Add `NEWSAPI_KEY` in `backend/.env` |
| Backtest returns `403` | Set `ENABLE_SYNTHETIC_BACKTEST=true` in **non-production** only |

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. 🍴 Fork the repository
2. 🌿 Create a feature branch: `git checkout -b feature/your-feature`
3. ✏️ Make small, focused changes
4. 🧪 Run backend and frontend tests
5. 📬 Open a PR with clear context and test notes

---

## 📄 License

No license file is currently present.  
Add a `LICENSE` file (e.g. MIT or Apache-2.0) before public redistribution.

---

<div align="center">

Made with ❤️ for Indian investors &nbsp;|&nbsp; Powered by [Gemini AI](https://ai.google.dev/) &nbsp;|&nbsp; NSE/BSE data

</div>
