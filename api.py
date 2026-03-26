"""FastAPI backend for the AI Investor Agent system."""

from __future__ import annotations

import json
from datetime import datetime
from datetime import timezone
from pathlib import Path
from threading import Lock
from typing import Any

from fastapi import Body
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi import Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydantic import Field

from ai_investor_agent.api_service import InvestorAnalysisService


class PortfolioItem(BaseModel):
    symbol: str
    weight: float


class PortfolioSaveRequest(BaseModel):
    user_id: str = Field(default="default-user", min_length=1)
    portfolio: list[PortfolioItem]


app = FastAPI(
    title="AI Investor Agent API",
    version="1.0.0",
    description="Backend API for portfolio-aware stock analysis.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

service = InvestorAnalysisService()
STORE_FILE = Path(__file__).resolve().parent / "ai_investor_agent" / "storage" / "portfolio_store.json"
STORE_LOCK = Lock()


def _ensure_store_file() -> None:
    STORE_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not STORE_FILE.exists():
        STORE_FILE.write_text("{}", encoding="utf-8")


def _read_store() -> dict[str, list[dict[str, float | str]]]:
    _ensure_store_file()
    try:
        payload = json.loads(STORE_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        return {}
    return {
        str(user_id): value
        for user_id, value in payload.items()
        if isinstance(value, list)
    }


def _write_store(store: dict[str, list[dict[str, float | str]]]) -> None:
    _ensure_store_file()
    STORE_FILE.write_text(json.dumps(store, indent=2), encoding="utf-8")


@app.get("/")
def root() -> dict[str, str]:
    return {
        "message": "AI Investor Agent API is running.",
        "analyze_endpoint": "POST /analyze",
        "save_endpoint": "POST /portfolio/save",
        "load_endpoint": "GET /portfolio/load",
        "quotes_endpoint": "GET /realtime/quotes?symbols=AAPL,MSFT,GOOGL",
    }


@app.post("/analyze")
def analyze(
    portfolio: list[PortfolioItem] = Body(...)
) -> dict[str, Any]:
    normalized_input = [
        {"symbol": item.symbol, "weight": item.weight}
        for item in portfolio
    ]

    try:
        return service.analyze(normalized_input)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/portfolio/save")
def save_portfolio(payload: PortfolioSaveRequest) -> dict[str, Any]:
    user_id = payload.user_id.strip() or "default-user"
    normalized_input = [
        {"symbol": item.symbol, "weight": item.weight}
        for item in payload.portfolio
    ]

    try:
        normalized_portfolio = service.normalize_portfolio(normalized_input)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    with STORE_LOCK:
        store = _read_store()
        store[user_id] = normalized_portfolio
        _write_store(store)

    return {
        "user_id": user_id,
        "saved_count": len(normalized_portfolio),
        "portfolio": normalized_portfolio,
    }


@app.get("/portfolio/load")
def load_portfolio(
    user_id: str = Query(default="default-user", min_length=1)
) -> dict[str, Any]:
    lookup_id = user_id.strip() or "default-user"
    with STORE_LOCK:
        store = _read_store()
        portfolio = store.get(lookup_id, [])
    return {
        "user_id": lookup_id,
        "portfolio": portfolio,
    }


@app.get("/realtime/quotes")
def realtime_quotes(
    symbols: str = Query(..., description="Comma-separated symbols, e.g. AAPL,MSFT,GOOGL")
) -> dict[str, Any]:
    normalized_symbols = [
        symbol.strip().upper()
        for symbol in symbols.split(",")
        if symbol.strip()
    ]

    if not normalized_symbols:
        raise HTTPException(status_code=422, detail="At least one symbol is required.")

    quotes = service.data_agent.fetch_stock_data(normalized_symbols)
    return {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "quotes": quotes,
    }
