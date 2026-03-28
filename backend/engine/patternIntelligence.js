function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeHistorical(historical) {
  if (!Array.isArray(historical)) {
    return [];
  }

  return historical
    .map((point) => ({
      date: String(point?.date || '').slice(0, 10),
      open: toFiniteNumber(point?.open),
      high: toFiniteNumber(point?.high),
      low: toFiniteNumber(point?.low),
      close: toFiniteNumber(point?.close),
    }))
    .filter((point) => point.date && point.open !== null && point.high !== null && point.low !== null && point.close !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function calculateRsiSeries(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length <= period) {
    return [];
  }

  const gains = [];
  const losses = [];

  for (let i = 1; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    gains.push(delta > 0 ? delta : 0);
    losses.push(delta < 0 ? Math.abs(delta) : 0);
  }

  const avg = (arr, start, end) => {
    const slice = arr.slice(start, end);
    if (!slice.length) {
      return null;
    }
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  };

  const rsi = Array(closes.length).fill(null);
  for (let idx = period; idx < closes.length; idx += 1) {
    const avgGain = avg(gains, idx - period, idx);
    const avgLoss = avg(losses, idx - period, idx);
    if (avgGain === null || avgLoss === null) {
      continue;
    }

    if (avgLoss === 0) {
      rsi[idx] = 100;
      continue;
    }

    const rs = avgGain / avgLoss;
    rsi[idx] = 100 - (100 / (1 + rs));
  }

  return rsi;
}

function pctDiff(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) {
    return null;
  }
  return ((a - b) / b) * 100;
}

function detectBreakoutAt(points, index, lookback = 15) {
  if (index < lookback) {
    return false;
  }

  const currentClose = points[index]?.close;
  if (!Number.isFinite(currentClose)) {
    return false;
  }

  const priorHigh = Math.max(...points.slice(index - lookback, index).map((point) => point.high));
  return Number.isFinite(priorHigh) && currentClose > priorHigh;
}

function detectBullishReversalAt(points, index) {
  if (index < 1) {
    return false;
  }

  const prev = points[index - 1];
  const curr = points[index];

  const prevBearish = prev.close < prev.open;
  const currBullish = curr.close > curr.open;
  const engulfing = curr.close > prev.open && curr.open < prev.close;

  return prevBearish && currBullish && engulfing;
}

function detectBearishReversalAt(points, index) {
  if (index < 1) {
    return false;
  }

  const prev = points[index - 1];
  const curr = points[index];

  const prevBullish = prev.close > prev.open;
  const currBearish = curr.close < curr.open;
  const engulfing = curr.open > prev.close && curr.close < prev.open;

  return prevBullish && currBearish && engulfing;
}

function detectSupportBounceAt(points, index, lookback = 20, tolerancePct = 1.2) {
  if (index < lookback) {
    return false;
  }

  const currentClose = points[index]?.close;
  if (!Number.isFinite(currentClose)) {
    return false;
  }

  const support = Math.min(...points.slice(index - lookback, index).map((point) => point.low));
  const distancePct = Math.abs(pctDiff(currentClose, support) || 999);
  const bullishBody = currentClose >= points[index].open;

  return Number.isFinite(support) && distancePct <= tolerancePct && bullishBody;
}

function detectResistanceRejectionAt(points, index, lookback = 20, tolerancePct = 1.2) {
  if (index < lookback) {
    return false;
  }

  const currentClose = points[index]?.close;
  if (!Number.isFinite(currentClose)) {
    return false;
  }

  const resistance = Math.max(...points.slice(index - lookback, index).map((point) => point.high));
  const distancePct = Math.abs(pctDiff(currentClose, resistance) || 999);
  const bearishBody = currentClose <= points[index].open;

  return Number.isFinite(resistance) && distancePct <= tolerancePct && bearishBody;
}

function detectBullishDivergenceAt(points, rsiSeries, index, lookback = 8) {
  if (index < lookback || !Array.isArray(rsiSeries)) {
    return false;
  }

  const leftIndex = index - lookback;
  const priceNow = points[index]?.close;
  const priceThen = points[leftIndex]?.close;
  const rsiNow = rsiSeries[index];
  const rsiThen = rsiSeries[leftIndex];

  if (!Number.isFinite(priceNow) || !Number.isFinite(priceThen) || !Number.isFinite(rsiNow) || !Number.isFinite(rsiThen)) {
    return false;
  }

  return priceNow < priceThen && rsiNow > rsiThen;
}

function detectBearishDivergenceAt(points, rsiSeries, index, lookback = 8) {
  if (index < lookback || !Array.isArray(rsiSeries)) {
    return false;
  }

  const leftIndex = index - lookback;
  const priceNow = points[index]?.close;
  const priceThen = points[leftIndex]?.close;
  const rsiNow = rsiSeries[index];
  const rsiThen = rsiSeries[leftIndex];

  if (!Number.isFinite(priceNow) || !Number.isFinite(priceThen) || !Number.isFinite(rsiNow) || !Number.isFinite(rsiThen)) {
    return false;
  }

  return priceNow > priceThen && rsiNow < rsiThen;
}

function buildPatternDefinitions() {
  return [
    {
      key: 'breakout',
      label: 'Breakout',
      direction: 'bullish',
      detectAt: (points, rsiSeries, index) => detectBreakoutAt(points, index),
      successAt: (entryClose, futurePoint) => futurePoint.high > entryClose,
    },
    {
      key: 'bullish-reversal',
      label: 'Bullish Reversal',
      direction: 'bullish',
      detectAt: (points, rsiSeries, index) => detectBullishReversalAt(points, index),
      successAt: (entryClose, futurePoint) => futurePoint.close > entryClose,
    },
    {
      key: 'bearish-reversal',
      label: 'Bearish Reversal',
      direction: 'bearish',
      detectAt: (points, rsiSeries, index) => detectBearishReversalAt(points, index),
      successAt: (entryClose, futurePoint) => futurePoint.close < entryClose,
    },
    {
      key: 'support-bounce',
      label: 'Support Bounce',
      direction: 'bullish',
      detectAt: (points, rsiSeries, index) => detectSupportBounceAt(points, index),
      successAt: (entryClose, futurePoint) => futurePoint.close > entryClose,
    },
    {
      key: 'resistance-rejection',
      label: 'Resistance Rejection',
      direction: 'bearish',
      detectAt: (points, rsiSeries, index) => detectResistanceRejectionAt(points, index),
      successAt: (entryClose, futurePoint) => futurePoint.close < entryClose,
    },
    {
      key: 'bullish-divergence',
      label: 'Bullish Divergence',
      direction: 'bullish',
      detectAt: (points, rsiSeries, index) => detectBullishDivergenceAt(points, rsiSeries, index),
      successAt: (entryClose, futurePoint) => futurePoint.close > entryClose,
    },
    {
      key: 'bearish-divergence',
      label: 'Bearish Divergence',
      direction: 'bearish',
      detectAt: (points, rsiSeries, index) => detectBearishDivergenceAt(points, rsiSeries, index),
      successAt: (entryClose, futurePoint) => futurePoint.close < entryClose,
    },
  ];
}

function backtestPattern(points, rsiSeries, definition, lookback = 180, horizon = 4) {
  const safePoints = Array.isArray(points) ? points : [];
  if (safePoints.length < horizon + 20) {
    return {
      pattern: definition.key,
      label: definition.label,
      direction: definition.direction,
      successRate: null,
      samples: 0,
      horizonDays: horizon,
      lookbackDays: lookback,
    };
  }

  const startIndex = Math.max(15, safePoints.length - lookback);
  let samples = 0;
  let wins = 0;

  for (let index = startIndex; index <= safePoints.length - horizon - 1; index += 1) {
    if (!definition.detectAt(safePoints, rsiSeries, index)) {
      continue;
    }

    const entryClose = safePoints[index].close;
    if (!Number.isFinite(entryClose)) {
      continue;
    }

    samples += 1;
    const futureWindow = safePoints.slice(index + 1, index + 1 + horizon);
    const succeeded = futureWindow.some((futurePoint) => definition.successAt(entryClose, futurePoint));
    if (succeeded) {
      wins += 1;
    }
  }

  return {
    pattern: definition.key,
    label: definition.label,
    direction: definition.direction,
    successRate: samples > 0 ? Number(((wins / samples) * 100).toFixed(1)) : null,
    samples,
    horizonDays: horizon,
    lookbackDays: lookback,
  };
}

function toPatternSignal(definition, detected, price, support, resistance) {
  const supportDistancePct = pctDiff(price, support);
  const resistanceDistancePct = pctDiff(price, resistance);

  return {
    pattern: definition.key,
    label: definition.label,
    direction: definition.direction,
    detected,
    explanation: detected
      ? `${definition.label} detected on recent candles.`
      : `${definition.label} not currently active.`,
    supportDistancePct: supportDistancePct === null ? null : Number(supportDistancePct.toFixed(2)),
    resistanceDistancePct: resistanceDistancePct === null ? null : Number(resistanceDistancePct.toFixed(2)),
  };
}

function analyzePatternIntelligence(historical, currentPrice) {
  const points = sanitizeHistorical(historical);
  const price = toFiniteNumber(currentPrice) ?? points[points.length - 1]?.close ?? null;

  if (!points.length || price === null) {
    return {
      supportResistance: {
        support: null,
        resistance: null,
        supportDistancePct: null,
        resistanceDistancePct: null,
      },
      detectedPatterns: [],
      patternBacktests: [],
      breakoutDetected: null,
    };
  }

  const closes = points.map((point) => point.close);
  const rsiSeries = calculateRsiSeries(closes, 14);
  const patternDefs = buildPatternDefinitions();
  const lastIndex = points.length - 1;

  const window = points.slice(Math.max(0, points.length - 40));
  const support = Math.min(...window.map((point) => point.low));
  const resistance = Math.max(...window.map((point) => point.high));

  const detectedPatterns = patternDefs.map((definition) => {
    const detected = definition.detectAt(points, rsiSeries, lastIndex);
    return toPatternSignal(definition, detected, price, support, resistance);
  });

  const patternBacktests = patternDefs.map((definition) => backtestPattern(points, rsiSeries, definition));

  const supportDistancePct = pctDiff(price, support);
  const resistanceDistancePct = pctDiff(price, resistance);

  return {
    supportResistance: {
      support: Number.isFinite(support) ? Number(support.toFixed(2)) : null,
      resistance: Number.isFinite(resistance) ? Number(resistance.toFixed(2)) : null,
      supportDistancePct: supportDistancePct === null ? null : Number(supportDistancePct.toFixed(2)),
      resistanceDistancePct: resistanceDistancePct === null ? null : Number(resistanceDistancePct.toFixed(2)),
    },
    detectedPatterns,
    patternBacktests,
    breakoutDetected: detectedPatterns.find((item) => item.pattern === 'breakout')?.detected ?? null,
  };
}

module.exports = {
  analyzePatternIntelligence,
};
