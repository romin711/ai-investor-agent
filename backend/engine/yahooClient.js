const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

function toDateString(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const historical = timestamps
    .map((timestamp, index) => {
      const unixSeconds = toFiniteNumber(timestamp);
      const close = toFiniteNumber(closes[index]);
      if (unixSeconds === null || close === null) {
        return null;
      }

      return {
        timestamp: unixSeconds,
        date: toDateString(unixSeconds),
        close,
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
  const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(symbol)}?range=3mo&interval=1d&includePrePost=false&events=div%2Csplit`;
  const response = await fetch(url);
  const text = await response.text();

  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_error) {
    throw {
      statusCode: 502,
      message: `Invalid Yahoo response while fetching ${symbol}.`,
    };
  }

  if (!response.ok) {
    throw {
      statusCode: response.status || 502,
      message: `Yahoo request failed for ${symbol}.`,
    };
  }

  return parseYahooChart(payload, symbol);
}

module.exports = {
  fetchYahooStockData,
};
