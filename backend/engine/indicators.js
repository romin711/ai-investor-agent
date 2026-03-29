function cleanValues(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((value) => Number.isFinite(value));
}

function movingAverage(values, period) {
  const cleaned = cleanValues(values);
  if (cleaned.length < period) {
    return null;
  }

  const recent = cleaned.slice(-period);
  const sum = recent.reduce((acc, value) => acc + value, 0);
  return sum / period;
}

function calculateRsi(values, period = 14) {
  const cleaned = cleanValues(values);
  if (cleaned.length <= period) {
    return null;
  }

  const recent = cleaned.slice(-(period + 1));
  let gains = 0;
  let losses = 0;

  for (let i = 1; i < recent.length; i += 1) {
    const change = recent[i] - recent[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) {
    return 100;
  }

  const relativeStrength = avgGain / avgLoss;
  return 100 - (100 / (1 + relativeStrength));
}

function getRSI(values, period = 14) {
  return calculateRsi(values, period);
}

function getTrendStrength(values, shortPeriod = 20, longPeriod = 50) {
  const shortMa = movingAverage(values, shortPeriod);
  const longMa = movingAverage(values, longPeriod);
  if (!Number.isFinite(shortMa) || !Number.isFinite(longMa) || longMa === 0) {
    return null;
  }

  // Normalized trend score in [-1, 1]
  const normalized = (shortMa - longMa) / longMa;
  return Math.max(-1, Math.min(1, normalized * 8));
}

function getVolatility(values, period = 20) {
  const cleaned = cleanValues(values);
  if (cleaned.length <= period) {
    return null;
  }

  const recent = cleaned.slice(-(period + 1));
  const returns = [];
  for (let i = 1; i < recent.length; i += 1) {
    const prev = recent[i - 1];
    const curr = recent[i];
    if (!Number.isFinite(prev) || prev === 0 || !Number.isFinite(curr)) {
      continue;
    }
    returns.push((curr - prev) / prev);
  }

  if (!returns.length) {
    return null;
  }

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  // Annualized volatility as fraction (e.g., 0.2 = 20%)
  return stdDev * Math.sqrt(252);
}

function getMomentum(values, period = 10) {
  const cleaned = cleanValues(values);
  if (cleaned.length <= period) {
    return null;
  }

  const current = cleaned[cleaned.length - 1];
  const prior = cleaned[cleaned.length - 1 - period];
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) {
    return null;
  }

  // Normalized ROC in [-1, 1]
  const roc = (current - prior) / prior;
  return Math.max(-1, Math.min(1, roc * 6));
}

module.exports = {
  movingAverage,
  calculateRsi,
  getRSI,
  getTrendStrength,
  getVolatility,
  getMomentum,
};
