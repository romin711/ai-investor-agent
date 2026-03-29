const fs = require('fs');
const path = require('path');
const { fetchYahooStockData } = require('./yahooClient');

const OUTCOMES_FILE_PATH = path.join(__dirname, '..', 'storage', 'signal_outcomes.json');
const HORIZON_DAYS = [1, 3, 5];
const MAX_STORED_OUTCOMES = 2500;
const MAX_SYNC_HISTORY_RUNS = 180;

function ensureOutcomesDir() {
  const dir = path.dirname(OUTCOMES_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readOutcomesFile() {
  ensureOutcomesDir();
  if (!fs.existsSync(OUTCOMES_FILE_PATH)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(OUTCOMES_FILE_PATH, 'utf8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function writeOutcomesFile(items) {
  ensureOutcomesDir();
  const rows = Array.isArray(items) ? items : [];
  fs.writeFileSync(OUTCOMES_FILE_PATH, JSON.stringify(rows, null, 2));
}

function toDateOnly(input) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildOutcomeKey(run, alert, index) {
  return [
    String(run?.generatedAt || ''),
    String(alert?.symbol || ''),
    String(alert?.action || ''),
    String(index),
  ].join('|');
}

function getCanonicalOutcomeSignature(record) {
  const symbol = String(record?.symbol || '').toUpperCase();
  const action = String(record?.action || '').toUpperCase();
  const runDate = String(record?.runDate || '').slice(0, 10);
  const entryDate = String(
    record?.horizons?.['1D']?.entryDate
    || record?.horizons?.['3D']?.entryDate
    || record?.horizons?.['5D']?.entryDate
    || ''
  ).slice(0, 10);
  const entryPrice = toFiniteNumber(record?.entryPrice);
  const roundedEntryPrice = entryPrice === null ? 'na' : entryPrice.toFixed(2);

  if (!symbol || !action || !runDate) {
    return null;
  }

  // Canonical grouping avoids overweighting repeated scans for the same setup.
  return `${runDate}|${symbol}|${action}|${entryDate || 'na'}|${roundedEntryPrice}`;
}

function compactOutcomeRecords(items = [], maxItems = MAX_STORED_OUTCOMES) {
  const rows = Array.isArray(items) ? items : [];
  const dedupeByKey = new Map();

  rows.forEach((record) => {
    const key = String(record?.key || '').trim();
    const action = String(record?.action || '').toUpperCase();
    const symbol = String(record?.symbol || '').toUpperCase();
    if (!key || !symbol || !['BUY', 'SELL', 'HOLD'].includes(action)) {
      return;
    }

    dedupeByKey.set(key, {
      ...record,
      symbol,
      action,
    });
  });

  const sorted = Array.from(dedupeByKey.values()).sort((left, right) => {
    const runDateCmp = String(right?.runGeneratedAt || '').localeCompare(String(left?.runGeneratedAt || ''));
    if (runDateCmp !== 0) return runDateCmp;
    return String(right?.updatedAt || '').localeCompare(String(left?.updatedAt || ''));
  });

  const canonicalMap = new Map();
  const canonicalOrdered = [];

  sorted.forEach((record) => {
    const signature = getCanonicalOutcomeSignature(record);
    if (!signature) {
      return;
    }

    if (!canonicalMap.has(signature)) {
      canonicalMap.set(signature, record);
      canonicalOrdered.push(record);
    }
  });

  const requestedLimit = Number(maxItems);
  const safeLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.floor(requestedLimit)
    : MAX_STORED_OUTCOMES;
  return canonicalOrdered.slice(0, safeLimit);
}

function compactAndPersistOutcomes(items = [], maxItems = MAX_STORED_OUTCOMES) {
  const original = Array.isArray(items) ? items : [];
  const compacted = compactOutcomeRecords(original, maxItems);

  const isSameLength = original.length === compacted.length;
  const hasSameOrder = isSameLength && original.every((item, index) => (
    String(item?.key || '') === String(compacted[index]?.key || '')
  ));

  if (!hasSameOrder) {
    writeOutcomesFile(compacted);
  }

  return compacted;
}

function findEntryIndex(historical, runDate) {
  if (!Array.isArray(historical) || historical.length === 0 || !runDate) {
    return -1;
  }

  const idx = historical.findIndex((point) => String(point?.date) >= runDate);
  if (idx >= 0) return idx;
  return historical.length - 1;
}

function strategyReturnForAction(action, rawReturnPct) {
  const decision = String(action || 'HOLD').toUpperCase();
  const value = Number(rawReturnPct) || 0;

  if (decision === 'BUY') return value;
  if (decision === 'SELL') return -value;
  return -Math.abs(value);
}

function isSuccess(action, rawReturnPct) {
  const decision = String(action || 'HOLD').toUpperCase();
  const value = Number(rawReturnPct) || 0;

  if (decision === 'BUY') return value > 0;
  if (decision === 'SELL') return value < 0;
  return Math.abs(value) <= 0.5;
}

function computeMaxDrawdownPct(action, entryPrice, windowBars) {
  if (!Array.isArray(windowBars) || windowBars.length === 0 || !Number.isFinite(entryPrice) || entryPrice <= 0) {
    return null;
  }

  const decision = String(action || 'HOLD').toUpperCase();

  if (decision === 'BUY') {
    const minLow = windowBars
      .map((bar) => toFiniteNumber(bar?.low))
      .filter((v) => v !== null)
      .reduce((acc, v) => Math.min(acc, v), entryPrice);
    return ((minLow - entryPrice) / entryPrice) * 100;
  }

  if (decision === 'SELL') {
    const maxHigh = windowBars
      .map((bar) => toFiniteNumber(bar?.high))
      .filter((v) => v !== null)
      .reduce((acc, v) => Math.max(acc, v), entryPrice);
    return ((entryPrice - maxHigh) / entryPrice) * 100;
  }

  const maxHigh = windowBars
    .map((bar) => toFiniteNumber(bar?.high))
    .filter((v) => v !== null)
    .reduce((acc, v) => Math.max(acc, v), entryPrice);
  const minLow = windowBars
    .map((bar) => toFiniteNumber(bar?.low))
    .filter((v) => v !== null)
    .reduce((acc, v) => Math.min(acc, v), entryPrice);

  const adverseMove = Math.max(
    Math.abs((maxHigh - entryPrice) / entryPrice),
    Math.abs((minLow - entryPrice) / entryPrice)
  );

  return -adverseMove * 100;
}

function computeOutcomeForAlert(run, alert, index, yahooData) {
  const action = String(alert?.action || '').toUpperCase();
  if (!['BUY', 'SELL', 'HOLD'].includes(action)) {
    return null;
  }

  const historical = Array.isArray(yahooData?.historical) ? yahooData.historical : [];
  if (historical.length < 2) {
    return null;
  }

  const runDate = toDateOnly(run?.generatedAt);
  const entryIndex = findEntryIndex(historical, runDate);
  if (entryIndex < 0) {
    return null;
  }

  const entryBar = historical[entryIndex] || null;
  const entryPrice = toFiniteNumber(alert?.executionPlan?.entryPrice) || toFiniteNumber(entryBar?.close);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return null;
  }

  const horizons = {};
  HORIZON_DAYS.forEach((days) => {
    const label = `${days}D`;
    const targetIndex = entryIndex + days;

    if (targetIndex >= historical.length) {
      horizons[label] = {
        sampleReady: false,
      };
      return;
    }

    const targetBar = historical[targetIndex];
    const targetClose = toFiniteNumber(targetBar?.close);
    if (!Number.isFinite(targetClose) || targetClose <= 0) {
      horizons[label] = {
        sampleReady: false,
      };
      return;
    }

    const rawReturnPct = ((targetClose - entryPrice) / entryPrice) * 100;
    const strategyReturnPct = strategyReturnForAction(action, rawReturnPct);
    const success = isSuccess(action, rawReturnPct);
    const windowBars = historical.slice(entryIndex, targetIndex + 1);
    const maxDrawdownPct = computeMaxDrawdownPct(action, entryPrice, windowBars);

    horizons[label] = {
      sampleReady: true,
      rawReturnPct: Number(rawReturnPct.toFixed(4)),
      strategyReturnPct: Number(strategyReturnPct.toFixed(4)),
      success,
      maxDrawdownPct: Number((maxDrawdownPct || 0).toFixed(4)),
      entryDate: entryBar?.date || null,
      exitDate: targetBar?.date || null,
    };
  });

  return {
    key: buildOutcomeKey(run, alert, index),
    symbol: String(alert?.symbol || '').toUpperCase(),
    resolvedSymbol: String(alert?.resolvedSymbol || alert?.symbol || '').toUpperCase(),
    action,
    runGeneratedAt: run?.generatedAt || null,
    runDate,
    entryPrice: Number(entryPrice.toFixed(4)),
    entryIndex,
    horizons,
    updatedAt: new Date().toISOString(),
  };
}

async function synchronizeSignalOutcomes(historyRuns = []) {
  const existing = compactAndPersistOutcomes(readOutcomesFile(), MAX_STORED_OUTCOMES);
  const existingMap = new Map(existing.map((record) => [record.key, record]));

  const symbolDataCache = new Map();
  const runs = Array.isArray(historyRuns) ? historyRuns.slice(0, MAX_SYNC_HISTORY_RUNS) : [];

  for (const run of runs) {
    const alerts = Array.isArray(run?.alerts) ? run.alerts : [];

    for (let index = 0; index < alerts.length; index += 1) {
      const alert = alerts[index];
      const key = buildOutcomeKey(run, alert, index);
      const symbol = String(alert?.resolvedSymbol || alert?.symbol || '').toUpperCase();
      if (!symbol) continue;

      let yahooData = symbolDataCache.get(symbol);
      if (!yahooData) {
        try {
          yahooData = await fetchYahooStockData(symbol);
          symbolDataCache.set(symbol, yahooData);
        } catch (_error) {
          symbolDataCache.set(symbol, null);
          continue;
        }
      }

      if (!yahooData) {
        continue;
      }

      const computed = computeOutcomeForAlert(run, alert, index, yahooData);
      if (computed) {
        existingMap.set(key, computed);
      }
    }
  }

  const merged = compactAndPersistOutcomes(Array.from(existingMap.values()), MAX_STORED_OUTCOMES);
  return merged;
}

function getStoredSignalOutcomes() {
  return compactAndPersistOutcomes(readOutcomesFile(), MAX_STORED_OUTCOMES);
}

module.exports = {
  synchronizeSignalOutcomes,
  getStoredSignalOutcomes,
  compactOutcomeRecords,
};
