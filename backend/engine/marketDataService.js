/**
 * Market Data Service
 * Responsibility: Fetch and structure market data without indicator computation
 * NO business logic, NO defaults, NO indicator calculations
 */

const { fetchYahooStockData } = require('./yahooClient');

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Fetch and structure historical OHLC data
 * @param {string} symbol - Stock symbol (e.g., 'TCS.NS')
 * @returns {Promise<{symbol, closes, historical, latestPrice, latestTimestamp, dataPoints}>}
 */
async function getHistoricalData(symbol) {
  if (!symbol) {
    throw new Error('Symbol required for market data fetch');
  }

  const marketData = await fetchYahooStockData(symbol);
  
  if (!marketData || !Array.isArray(marketData.historical) || !marketData.historical.length) {
    return {
      symbol,
      closes: [],
      historical: [],
      latestPrice: null,
      latestTimestamp: null,
      dataPoints: 0,
      error: 'Insufficient historical data',
    };
  }

  const historical = marketData.historical || [];
  const closes = historical.map((bar) => toFiniteNumber(bar?.close)).filter((v) => v !== null);
  const latestBar = historical[historical.length - 1] || {};

  return {
    symbol,
    closes,
    historical,
    latestPrice: toFiniteNumber(marketData.price),
    latestTimestamp: latestBar?.date || null,
    dataPoints: closes.length,
  };
}

/**
 * Validate data sufficiency and freshness
 * DOES NOT throw; returns quality indicators for DataQualityEngine
 * @param {Object} data - from getHistoricalData
 * @returns {{minBarsRequired: number, hasMinData: boolean, dataPoints: number}}
 */
function evaluateDataSufficiency(data) {
  const minBarsRequired = 60; // Need at least 60 bars for RSI, MA, etc.
  const dataPoints = data?.dataPoints || 0;

  return {
    minBarsRequired,
    hasMinData: dataPoints >= minBarsRequired,
    dataPoints,
  };
}

module.exports = {
  getHistoricalData,
  evaluateDataSufficiency,
};
