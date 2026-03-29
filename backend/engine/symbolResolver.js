const fs = require('fs');
const path = require('path');

const FALLBACK_SYMBOL_MAP = {
  RELIANCE: 'RELIANCE.NS',
  TCS: 'TCS.NS',
  INFY: 'INFY.NS',
  HDFCBANK: 'HDFCBANK.NS',
  ICICIBANK: 'ICICIBANK.NS',
  AXISBANK: 'AXISBANK.NS',
  SBIN: 'SBIN.NS',
  LT: 'LT.NS',
  ITC: 'ITC.NS',
  TATASTEEL: 'TATASTEEL.NS',
  ADANIPORTS: 'ADANIPORTS.NS',
  IRCTC: 'IRCTC.NS',
  TRENT: 'TRENT.NS',
  ZOMATO: 'ETERNAL.NS',
  KOTAKBANK: 'KOTAKBANK.NS',
  BHARTIARTL: 'BHARTIARTL.NS',
  HINDUNILVR: 'HINDUNILVR.NS',
  MARUTI: 'MARUTI.NS',
  AAPL: 'AAPL',
  MSFT: 'MSFT',
  GOOGL: 'GOOGL',
  NVDA: 'NVDA',
  TSLA: 'TSLA',
};

function normalizeInputSymbol(rawSymbol) {
  return String(rawSymbol || '').trim().toUpperCase();
}

function normalizeSuffix(symbol) {
  if (symbol.endsWith('.NSE')) {
    return symbol.replace('.NSE', '.NS');
  }
  if (symbol.endsWith('.BSE')) {
    return symbol.replace('.BSE', '.BO');
  }
  return symbol;
}

function normalizeBaseSymbol(symbol) {
  return normalizeInputSymbol(symbol)
    .replace(/\.NS$/, '')
    .replace(/\.BO$/, '')
    .replace(/\.NSE$/, '')
    .replace(/\.BSE$/, '');
}

function loadSymbolMap() {
  const stocksPath = path.join(__dirname, 'stocks.json');
  if (!fs.existsSync(stocksPath)) {
    return FALLBACK_SYMBOL_MAP;
  }

  try {
    const raw = fs.readFileSync(stocksPath, 'utf8');
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) {
      return FALLBACK_SYMBOL_MAP;
    }

    const mapFromFile = rows.reduce((acc, row) => {
      const symbol = normalizeBaseSymbol(row?.symbol);
      const yahooSymbol = normalizeSuffix(normalizeInputSymbol(row?.yahooSymbol));
      if (symbol && yahooSymbol) {
        acc[symbol] = yahooSymbol;
      }
      return acc;
    }, {});

    return {
      ...FALLBACK_SYMBOL_MAP,
      ...mapFromFile,
    };
  } catch (_error) {
    return FALLBACK_SYMBOL_MAP;
  }
}

const SYMBOL_MAP = loadSymbolMap();

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

function fuzzyMatchSymbol(symbol) {
  const keys = Object.keys(SYMBOL_MAP);
  let bestKey = '';
  let bestDistance = Number.POSITIVE_INFINITY;

  keys.forEach((key) => {
    const distance = levenshtein(symbol, key);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestKey = key;
    }
  });

  if (bestKey && bestDistance <= 2) {
    return SYMBOL_MAP[bestKey];
  }
  return null;
}

async function resolveWithGemini(rawSymbol, geminiApiKey) {
  if (!geminiApiKey) {
    return null;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
  const prompt = [
    'Convert this stock symbol into a Yahoo Finance compatible ticker.',
    'Return only the ticker text, nothing else.',
    `Input: ${rawSymbol}`,
  ].join('\n');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return null;
  }

  return normalizeSuffix(
    String(text)
      .trim()
      .split(/\s+/)[0]
      .replace(/[^A-Z0-9.\-]/gi, '')
      .toUpperCase()
  );
}

async function resolveSymbol(rawSymbol, options = {}) {
  const { geminiApiKey = '' } = options;
  const normalized = normalizeInputSymbol(rawSymbol);
  if (!normalized) {
    throw {
      statusCode: 400,
      message: 'Symbol is required.',
    };
  }

  const directMapped = SYMBOL_MAP[normalized];
  if (directMapped) {
    return {
      inputSymbol: normalized,
      resolvedSymbol: directMapped,
      method: 'mapping',
    };
  }

  const normalizedSuffix = normalizeSuffix(normalized);
  if (normalizedSuffix.includes('.NS') || normalizedSuffix.includes('.BO')) {
    return {
      inputSymbol: normalized,
      resolvedSymbol: normalizedSuffix,
      method: 'direct',
    };
  }

  const fuzzyMapped = fuzzyMatchSymbol(normalized);
  if (fuzzyMapped) {
    return {
      inputSymbol: normalized,
      resolvedSymbol: fuzzyMapped,
      method: 'fuzzy',
    };
  }

  const geminiResolved = await resolveWithGemini(normalized, geminiApiKey);
  if (geminiResolved) {
    return {
      inputSymbol: normalized,
      resolvedSymbol: geminiResolved,
      method: 'gemini',
    };
  }

  return {
    inputSymbol: normalized,
    resolvedSymbol: normalizedSuffix,
    method: 'passthrough',
  };
}

module.exports = {
  resolveSymbol,
  normalizeInputSymbol,
};
