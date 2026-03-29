const fs = require('fs');
const path = require('path');
const { fetchYahooStockData } = require('./yahooClient');
const { resolveSymbol } = require('./symbolResolver');

const STORE_PATH = path.join(__dirname, '..', 'storage', 'market_chat_outcomes.json');
const EVALUATION_WINDOW_DAYS = 7;

function ensureStoreDir() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readStore() {
  ensureStoreDir();
  if (!fs.existsSync(STORE_PATH)) {
    return { predictions: [] };
  }

  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8').trim();
    if (!raw) {
      return { predictions: [] };
    }

    const parsed = JSON.parse(raw);
    return {
      predictions: Array.isArray(parsed?.predictions) ? parsed.predictions : [],
    };
  } catch (_error) {
    return { predictions: [] };
  }
}

function writeStore(store) {
  ensureStoreDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function startOfDayIso(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function dateAfterDays(value, days) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function findClosestClose(historical, targetDate) {
  if (!Array.isArray(historical) || !historical.length || !targetDate) {
    return null;
  }

  const exact = historical.find((item) => String(item?.date) === targetDate);
  if (exact && toFiniteNumber(exact.close) !== null) {
    return toFiniteNumber(exact.close);
  }

  const sorted = historical
    .filter((item) => String(item?.date || '') >= targetDate)
    .sort((left, right) => String(left?.date || '').localeCompare(String(right?.date || '')));

  if (sorted.length) {
    return toFiniteNumber(sorted[0].close);
  }

  return toFiniteNumber(historical[historical.length - 1]?.close);
}

function isPredictionCorrect(prediction, returnPct) {
  const signal = String(prediction || '').toUpperCase();
  if (!Number.isFinite(returnPct)) {
    return null;
  }

  if (signal === 'BUY') {
    return returnPct > 1;
  }
  if (signal === 'SELL') {
    return returnPct < -1;
  }
  return Math.abs(returnPct) <= 1.5;
}

function buildPerformance(predictions = []) {
  const evaluated = predictions.filter((item) => item?.correct === true || item?.correct === false);
  const total = evaluated.length;
  const correct = evaluated.filter((item) => item.correct === true).length;

  const bySymbol = {};
  const bySignal = {};

  evaluated.forEach((item) => {
    const symbol = String(item.symbol || '').toUpperCase();
    const signal = String(item.prediction || '').toUpperCase();

    if (!bySymbol[symbol]) {
      bySymbol[symbol] = { total: 0, correct: 0 };
    }
    if (!bySignal[signal]) {
      bySignal[signal] = { total: 0, correct: 0 };
    }

    bySymbol[symbol].total += 1;
    bySignal[signal].total += 1;
    if (item.correct) {
      bySymbol[symbol].correct += 1;
      bySignal[signal].correct += 1;
    }
  });

  return {
    totalEvaluated: total,
    accuracyPct: total ? Number(((correct / total) * 100).toFixed(2)) : null,
    bySymbol,
    bySignal,
  };
}

function recordPredictions(params = {}) {
  const store = readStore();
  const nowIso = new Date().toISOString();
  const signals = Array.isArray(params?.predictionSignals) ? params.predictionSignals : [];

  const rows = signals
    .map((signal) => {
      const symbol = String(signal?.symbol || '').toUpperCase().trim();
      const prediction = String(signal?.prediction || 'HOLD').toUpperCase();
      const confidence = toFiniteNumber(signal?.confidence);
      if (!symbol) {
        return null;
      }

      return {
        id: `mco_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        requestId: String(params?.requestId || ''),
        sessionId: String(params?.sessionId || ''),
        symbol,
        prediction,
        confidence,
        timestamp: String(signal?.generatedAt || params?.generatedAt || nowIso),
        outcome_7d: null,
        correct: null,
        evaluatedAt: null,
        startPrice: null,
        endPrice: null,
      };
    })
    .filter(Boolean);

  if (!rows.length) {
    return { added: 0, performance: buildPerformance(store.predictions) };
  }

  store.predictions.push(...rows);
  // Keep bounded history for local JSON persistence.
  store.predictions = store.predictions.slice(-5000);
  writeStore(store);

  return {
    added: rows.length,
    performance: buildPerformance(store.predictions),
  };
}

async function evaluatePendingPredictions() {
  const store = readStore();
  const now = Date.now();
  let evaluatedCount = 0;

  for (let i = 0; i < store.predictions.length; i += 1) {
    const item = store.predictions[i];
    if (item.correct === true || item.correct === false) {
      continue;
    }

    const ts = new Date(item.timestamp).getTime();
    if (!Number.isFinite(ts)) {
      continue;
    }

    const ageDays = (now - ts) / (1000 * 60 * 60 * 24);
    if (ageDays < EVALUATION_WINDOW_DAYS) {
      continue;
    }

    const resolved = await resolveSymbol(item.symbol, { geminiApiKey: '' });
    const market = await fetchYahooStockData(resolved.resolvedSymbol);
    const startDate = startOfDayIso(item.timestamp);
    const endDate = dateAfterDays(item.timestamp, EVALUATION_WINDOW_DAYS);

    const startPrice = findClosestClose(market?.historical || [], startDate);
    const endPrice = findClosestClose(market?.historical || [], endDate);

    if (!Number.isFinite(startPrice) || !Number.isFinite(endPrice) || startPrice <= 0) {
      continue;
    }

    const movementPct = ((endPrice - startPrice) / startPrice) * 100;
    const correct = isPredictionCorrect(item.prediction, movementPct);

    store.predictions[i] = {
      ...item,
      outcome_7d: Number(movementPct.toFixed(2)),
      correct,
      evaluatedAt: new Date().toISOString(),
      startPrice: Number(startPrice.toFixed(2)),
      endPrice: Number(endPrice.toFixed(2)),
    };
    evaluatedCount += 1;
  }

  if (evaluatedCount > 0) {
    writeStore(store);
  }

  return {
    evaluatedCount,
    performance: buildPerformance(store.predictions),
  };
}

module.exports = {
  recordPredictions,
  evaluatePendingPredictions,
};
