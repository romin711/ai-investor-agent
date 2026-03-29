/**
 * Feature Engine
 * Responsibility: Compute technical indicators with strict NULL-on-insufficient-data policy
 * NO defaults, NO fallback values, NO confidence inflation
 */

const { getRSI, getTrendStrength, getVolatility, getMomentum } = require('./indicators');

/**
 * Compute all technical features for a symbol
 * @param {Array<number>} closes - Array of closing prices (oldest first)
 * @param {number} dataPoints - Confirmed available data points
 * @returns {{rsi, trendStrength, volatility, momentum, confidence}}
 *          All values NULL if insufficient data
 */
function computeFeatures(closes, dataPoints) {
  // Minimum required data points for reliable technical analysis
  const minRequired = 60;

  // If insufficient data, return all nulls without defaults
  if (!closes || closes.length < minRequired || dataPoints < minRequired) {
    return {
      rsi: null,
      trendStrength: null,
      volatility: null,
      momentum: null,
      confidence: null, // NULL confidence when data insufficient
      hasInsufficientData: true,
      availablePoints: closes ? closes.length : 0,
    };
  }

  try {
    const rsi = getRSI(closes);
    const trendStrength = getTrendStrength(closes);
    const volatility = getVolatility(closes);
    const momentum = getMomentum(closes);

    // Validate that we got actual numbers, not fallback defaults
    const hasNullValues = [rsi, trendStrength, volatility, momentum].some((v) => v === null);

    return {
      rsi: Number.isFinite(rsi) ? rsi : null,
      trendStrength: Number.isFinite(trendStrength) ? trendStrength : null,
      volatility: Number.isFinite(volatility) ? volatility : null,
      momentum: Number.isFinite(momentum) ? momentum : null,
      confidence: hasNullValues ? null : 1.0, // Only full confidence if all features computed
      hasInsufficientData: false,
      availablePoints: closes.length,
    };
  } catch (err) {
    console.error(`FeatureEngine error for symbol with ${closes.length} bars:`, err.message);
    return {
      rsi: null,
      trendStrength: null,
      volatility: null,
      momentum: null,
      confidence: null,
      hasInsufficientData: true,
      error: err.message,
      availablePoints: closes.length,
    };
  }
}

/**
 * Extract last N closes for pattern detection
 * Returns NULL if insufficient data
 */
function getRecentCloses(closes, bars) {
  if (!closes || closes.length < bars) {
    return null;
  }
  return closes.slice(-bars);
}

/**
 * Support/resistance levels from recent data
 * Returns NULL if insufficient data (no computed defaults)
 */
function computeSupportResistanceZones(closes) {
  const recentCloses = getRecentCloses(closes, 20);
  if (!recentCloses || recentCloses.length < 20) {
    return {
      support: null,
      resistance: null,
      hasData: false,
    };
  }

  return {
    support: Math.min(...recentCloses),
    resistance: Math.max(...recentCloses),
    hasData: true,
  };
}

module.exports = {
  computeFeatures,
  getRecentCloses,
  computeSupportResistanceZones,
};
