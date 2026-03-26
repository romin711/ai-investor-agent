# AI Indian Investor Decision Backend

## Setup

1. Create env file:

```bash
cp .env.example .env
```

2. Optional Gemini fallback key (only used if symbol mapping/fuzzy fails):

```env
GEMINI_API_KEY=your_key_optional
PORT=3001
HOST=127.0.0.1
```

3. Start backend:

```bash
npm start
```

If `3001` is already occupied, start on another port:

```bash
PORT=3002 npm start
```

## API Endpoints

- `GET /api/stock/:symbol`
  - Runs the unified decision engine for one symbol using:
    - technical score
    - portfolio adjustment (when context exists)
    - risk score
    - AI reasoning

- `POST /api/portfolio/analyze`
  - Accepts weighted rows:

```json
[
  { "symbol": "AAPL", "weight": 40 },
  { "symbol": "MSFT", "weight": 30 },
  { "symbol": "RELIANCE", "weight": 30 }
]
```

  - Also accepts raw text input format:
    - `AAPL 40`
    - `MSFT 30`
    - `RELIANCE 30`
  - Also accepts object-map format:

```json
{
  "portfolio": {
    "RELIANCE": 50,
    "TCS": 30,
    "INFY": 20
  }
}
```

## Decision Engine Layers

The engine is modular and explainable:

- `indicatorService.js`
  - weighted technical score from MA50, RSI, momentum, breakout
- `portfolioService.js`
  - sector metadata via `stocks.json`
  - sector exposure and portfolio adjustment
- `riskService.js`
  - risk score (RSI extremes, volatility, concentration)
- `decisionEngine.js`
  - final score, BUY/HOLD/SELL, confidence
- `aiService.js`
  - concise reason + next action
