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

module.exports = {
  movingAverage,
  calculateRsi,
};
