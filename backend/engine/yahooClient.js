const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const NSE_HOME_URL = 'https://www.nseindia.com';
const NSE_QUOTE_BASE = 'https://www.nseindia.com/api/quote-equity';

const NSE_HEADERS = {
  'user-agent': 'Mozilla/5.0',
  'accept-language': 'en-US,en;q=0.9',
};

const nseCookieState = {
  value: '',
  expiresAt: 0,
};

function toDateString(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toNseNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    const numeric = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(numeric) ? numeric : null;
  }

  return toFiniteNumber(value);
}

function normalizeNseSymbol(symbol) {
  return String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/\.(NS|BO)$/, '');
}

async function getNseCookie() {
  if (nseCookieState.value && Date.now() < nseCookieState.expiresAt) {
    return nseCookieState.value;
  }

  const response = await fetch(NSE_HOME_URL, {
    headers: {
      ...NSE_HEADERS,
      accept: 'text/html,application/xhtml+xml',
    },
  });

  const setCookie = response.headers.get('set-cookie') || '';
  const cookie = setCookie
    .split(',')
    .map((part) => part.split(';')[0])
    .filter(Boolean)
    .join('; ');

  if (!cookie) {
    return '';
  }

  nseCookieState.value = cookie;
  nseCookieState.expiresAt = Date.now() + (10 * 60 * 1000);
  return cookie;
}

async function fetchNseLastPrice(symbol) {
  const nseSymbol = normalizeNseSymbol(symbol);
  if (!nseSymbol) {
    return null;
  }

  const cookie = await getNseCookie();
  const url = `${NSE_QUOTE_BASE}?symbol=${encodeURIComponent(nseSymbol)}`;

  const response = await fetch(url, {
    headers: {
      ...NSE_HEADERS,
      accept: 'application/json,text/plain,*/*',
      referer: `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(nseSymbol)}`,
      ...(cookie ? { cookie } : {}),
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const lastPrice = toNseNumber(payload?.priceInfo?.lastPrice);
  const lastUpdateTime = String(payload?.metadata?.lastUpdateTime || '').trim() || null;

  if (!Number.isFinite(lastPrice)) {
    return null;
  }

  return {
    source: 'NSE quote-equity',
    price: Number(lastPrice.toFixed(2)),
    lastUpdateTime,
  };
}

function parseYahooChart(payload, symbol) {
  const result = payload?.chart?.result?.[0];
  const error = payload?.chart?.error;

  if (error) {
    throw {
      statusCode: 404,
      message: `Invalid symbol. Please provide a valid stock ticker. ${symbol}`,
    };
  }

  if (!result) {
    throw {
      statusCode: 502,
      message: `Yahoo response missing chart data for ${symbol}.`,
    };
  }

  const timestamps = result.timestamp || [];
  const quotes = result?.indicators?.quote?.[0] || {};
  const opens = quotes.open || [];
  const highs = quotes.high || [];
  const lows = quotes.low || [];
  const closes = quotes.close || [];
  const volumes = quotes.volume || [];
  const historical = timestamps
    .map((timestamp, index) => {
      const unixSeconds = toFiniteNumber(timestamp);
      const open = toFiniteNumber(opens[index]);
      const high = toFiniteNumber(highs[index]);
      const low = toFiniteNumber(lows[index]);
      const close = toFiniteNumber(closes[index]);
      const volume = toFiniteNumber(volumes[index]);
      if (
        unixSeconds === null
        || open === null
        || high === null
        || low === null
        || close === null
        || open <= 0
        || high <= 0
        || low <= 0
        || close <= 0
      ) {
        return null;
      }

      return {
        timestamp: unixSeconds,
        date: toDateString(unixSeconds),
        open,
        high,
        low,
        close,
        volume,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.timestamp - right.timestamp)
    .map(({ timestamp: _timestamp, ...point }) => point);

  const latestHistorical = historical[historical.length - 1] || null;
  const marketPrice = toFiniteNumber(result?.meta?.regularMarketPrice);
  const currentPrice = marketPrice ?? latestHistorical?.close ?? null;

  return {
    symbol,
    price: currentPrice === null ? null : Number(currentPrice.toFixed(2)),
    historical,
    closes: historical.map((item) => item.close),
  };
}

async function fetchYahooStockData(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  const canTryNseFallback = normalized && !normalized.includes('.') && /^[A-Z0-9-]{2,20}$/.test(normalized);
  const candidates = canTryNseFallback ? [normalized, `${normalized}.NS`] : [normalized || String(symbol || '')];

  let parsed = null;
  let lastError = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(candidate)}?range=1y&interval=1d&includePrePost=false&events=div%2Csplit`;

    let response;
    let text;
    let payload;

    try {
      response = await fetch(url);
      text = await response.text();
      payload = text ? JSON.parse(text) : {};
    } catch (_error) {
      lastError = {
        statusCode: 502,
        message: `Invalid Yahoo response while fetching ${candidate}.`,
      };
      continue;
    }

    if (!response.ok) {
      lastError = {
        statusCode: response.status || 502,
        message: `Yahoo request failed for ${candidate}.`,
      };
      continue;
    }

    try {
      parsed = parseYahooChart(payload, candidate);
      break;
    } catch (error) {
      lastError = {
        statusCode: error?.statusCode || 502,
        message: error?.message || `Yahoo request failed for ${candidate}.`,
      };
    }
  }

  if (!parsed) {
    throw (lastError || {
      statusCode: 502,
      message: `Yahoo request failed for ${symbol}.`,
    });
  }

  // Prefer NSE LTP for NSE-listed symbols when available.
  if (String(parsed.symbol || '').toUpperCase().endsWith('.NS')) {
    try {
      const nseQuote = await fetchNseLastPrice(parsed.symbol);
      if (nseQuote?.price !== null && nseQuote?.price !== undefined) {
        parsed.price = nseQuote.price;
        parsed.price_source = nseQuote.source;
        parsed.price_updated_at = nseQuote.lastUpdateTime;
      }
    } catch (_error) {
      // Keep Yahoo-derived price if NSE quote fetch fails.
    }
  }

  return parsed;
}

module.exports = {
  fetchYahooStockData,
};
