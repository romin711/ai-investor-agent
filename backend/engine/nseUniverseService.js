const fs = require('fs');
const path = require('path');

const DEFAULT_STOCKS_FILE = path.join(__dirname, 'stocks.json');

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readUniverseSource() {
  const customPath = String(process.env.NSE_UNIVERSE_FILE || '').trim();
  const filePath = customPath || DEFAULT_STOCKS_FILE;

  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function getNseUniverseSymbols() {
  const source = readUniverseSource();

  const symbols = source
    .map((item) => ({
      symbol: String(item?.symbol || '').trim().toUpperCase(),
      yahooSymbol: String(item?.yahooSymbol || '').trim().toUpperCase(),
    }))
    .filter((item) => item.symbol && item.yahooSymbol.endsWith('.NS'))
    .map((item) => item.symbol);

  return Array.from(new Set(symbols));
}

function getNseUniverseRows(options = {}) {
  const symbols = getNseUniverseSymbols();
  const limit = toFiniteNumber(options?.limit);
  const safeLimit = Number.isFinite(limit) && limit > 0
    ? Math.min(symbols.length, Math.floor(limit))
    : symbols.length;

  const selected = symbols.slice(0, safeLimit);
  if (!selected.length) {
    return [];
  }

  const equalWeight = Number((100 / selected.length).toFixed(2));
  return selected.map((symbol) => ({
    symbol,
    weight: equalWeight,
  }));
}

module.exports = {
  getNseUniverseRows,
  getNseUniverseSymbols,
};
