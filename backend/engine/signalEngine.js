/**
 * Signal Engine
 * Single weighted, conflict-aware, explainable model.
 */

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, value));
}

function logistic(x) {
  return 1 / (1 + Math.exp(-x));
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeTrendScore(trendStrength) {
  const value = toNumber(trendStrength);
  if (value === null) return null;
  return clamp(value, -1, 1);
}

function normalizeMomentumScoreFromRsi(rsi) {
  const value = toNumber(rsi);
  if (value === null) return null;
  return clamp((value - 50) / 50, -1, 1);
}

function normalizeDivergenceScore(patterns = {}, explicitDivergence = null) {
  const override = toNumber(explicitDivergence);
  if (override !== null) {
    return clamp(override, -1, 1);
  }

  const type = String(patterns?.type || '').toLowerCase();
  const label = String(patterns?.label || '').toLowerCase();
  if (type.includes('bullish-divergence') || label.includes('bullish divergence')) {
    return 0.6;
  }
  if (type.includes('bearish-divergence') || label.includes('bearish divergence')) {
    return -0.6;
  }
  return 0;
}

function normalizeVolumeScore(volatility, closes = [], historical = [], explicitVolume = null, trendStrength = null) {
  const override = toNumber(explicitVolume);
  if (override !== null) {
    const trend = toNumber(trendStrength);
    if (trend !== null) {
      if (Math.abs(trend) < 0.15) return 0;
      return clamp(Math.abs(override) * Math.sign(trend), -1, 1);
    }
    return clamp(override, -1, 1);
  }

  const bars = Array.isArray(historical) && historical.length ? historical : [];
  const volumes = bars
    .map((bar) => toNumber(bar?.volume))
    .filter((value) => value !== null && value > 0);
  if (volumes.length < 20) return null;

  const latest = volumes[volumes.length - 1];
  const avg20 = volumes.slice(-20).reduce((sum, value) => sum + value, 0) / 20;
  if (!Number.isFinite(avg20) || avg20 <= 0) return null;

  const ratio = latest / avg20;
  if (ratio >= 1.2) return 0.5;
  if (ratio <= 0.8) return -0.5;
  return 0;
}

function normalizeVolatilityScore(volatility) {
  const value = toNumber(volatility);
  if (value === null) return null;
  return value <= 0.2 ? 0.3 : -0.3;
}

function normalizePatternScore(patterns = {}) {
  const type = String(patterns?.type || '').toLowerCase();
  if (patterns?.breakoutDetected || type.includes('breakout')) return 0.25;
  if (type.includes('breakdown') || type.includes('bearish')) return -0.25;
  return 0;
}

function buildDataQualityScore(normalizedFactors, externalQuality = null) {
  const factorValues = Object.values(normalizedFactors);
  const present = factorValues.filter((value) => value !== null).length;
  const baseQuality = factorValues.length > 0 ? present / factorValues.length : 0;
  const ext = toNumber(externalQuality);
  if (ext === null) return clamp(baseQuality, 0, 1);
  return clamp(baseQuality * clamp(ext, 0, 1), 0, 1);
}

function buildDrivers(normalizedFactors) {
  const labels = {
    trendScore: 'Trend',
    momentumScore: 'RSI Momentum',
    divergenceScore: 'Divergence',
    volumeScore: 'Volume',
    volatilityScore: 'Volatility',
    patternScore: 'Pattern',
  };

  return Object.entries(normalizedFactors)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `${labels[key]} (${value >= 0 ? '+' : ''}${Number(value).toFixed(2)})`);
}

function factorImpact(name, value, raw = null) {
  if (!Number.isFinite(value)) {
    return 'Unavailable';
  }

  if (name === 'Trend') {
    if (value >= 0.6) return 'Bullish';
    if (value <= -0.6) return 'Bearish';
    return 'Neutral';
  }

  if (name === 'RSI') {
    if (Number.isFinite(raw) && raw < 30) return 'Oversold';
    if (Number.isFinite(raw) && raw > 70) return 'Overbought';
    return 'Weak momentum';
  }

  if (name === 'Divergence') {
    if (value > 0) return 'Bullish';
    if (value < 0) return 'Bearish';
    return 'None';
  }

  return value > 0 ? 'Bullish' : value < 0 ? 'Bearish' : 'Neutral';
}

function buildStructuredFactors(normalizedFactors, rawRsi) {
  return [
    {
      name: 'Trend',
      value: normalizedFactors.trendScore,
      impact: factorImpact('Trend', normalizedFactors.trendScore),
    },
    {
      name: 'RSI',
      value: Number.isFinite(rawRsi) ? rawRsi : null,
      impact: factorImpact('RSI', normalizedFactors.momentumScore, rawRsi),
    },
    {
      name: 'Divergence',
      value: normalizedFactors.divergenceScore,
      impact: factorImpact('Divergence', normalizedFactors.divergenceScore),
    },
  ];
}

function pickLabel({ hasConflict, rawSignal, trendScore, probability }) {
  if (hasConflict) return 'Trend Under Pressure';
  if (rawSignal === 'HOLD' || !Number.isFinite(probability) || Math.abs((probability || 0) - 0.5) < 0.08) {
    return 'No Edge';
  }

  const trendDirectional = (rawSignal === 'BUY' && (trendScore || 0) > 0.6)
    || (rawSignal === 'SELL' && (trendScore || 0) < -0.6);
  return trendDirectional ? 'Trend Aligned' : 'Counter-Trend Setup';
}

function buildSummary({ rawSignal, label, trendScore, rsi, divergenceScore }) {
  const trendText = Number.isFinite(trendScore) ? trendScore.toFixed(2) : 'n/a';
  const rsiText = Number.isFinite(rsi) ? rsi.toFixed(1) : 'n/a';
  const divText = Number.isFinite(divergenceScore) ? divergenceScore.toFixed(2) : '0.00';

  if (label === 'Trend Under Pressure') {
    return `Trend ${trendScore < 0 ? 'is bearish' : 'is bullish'} (${trendText}) but divergence opposes it (${divText}) — no aggressive edge`;
  }

  if (label === 'No Edge') {
    return `Trend signal is weak (${trendText}) and RSI ${rsiText} shows no momentum expansion — no trade edge`;
  }

  if (rawSignal === 'BUY') {
    return `Bullish pressure confirmed by trend (${trendText}) and RSI ${rsiText} — trade bias is long`;
  }

  if (rawSignal === 'SELL') {
    return `Bearish pressure confirmed by trend (${trendText}) and RSI ${rsiText} — trade bias is short`;
  }

  return `Trend ${trendText} and RSI ${rsiText} are not providing a directional edge`;
}

function buildReasoning({ trendScore, rsi, divergenceScore, volumeScore, rawSignal }) {
  const points = [];

  if (Number.isFinite(trendScore)) {
    if (Math.abs(trendScore) > 0.6) {
      points.push(`${trendScore > 0 ? 'Uptrend' : 'Downtrend'} is strong (${trendScore.toFixed(2)})`);
    } else {
      points.push(`Trend strength is weak (${trendScore.toFixed(2)})`);
    }
  }

  if (Number.isFinite(rsi)) {
    if (rsi < 30) {
      points.push(`RSI ${rsi.toFixed(1)} is oversold`);
    } else if (rsi > 70) {
      points.push(`RSI ${rsi.toFixed(1)} is overbought`);
    } else {
      points.push(`RSI ${rsi.toFixed(1)} shows weak momentum`);
    }
  }

  if (Number.isFinite(divergenceScore) && divergenceScore !== 0) {
    points.push(`Divergence signal ${divergenceScore > 0 ? 'supports upside' : 'supports downside'} (${divergenceScore.toFixed(2)})`);
  } else {
    points.push('No divergence confirmation');
  }

  if (Number.isFinite(volumeScore) && Math.abs(volumeScore) > 0.3) {
    points.push(`Volume ${volumeScore > 0 ? 'confirms' : 'does not confirm'} direction (${volumeScore.toFixed(2)})`);
  }

  if (rawSignal === 'HOLD') {
    return points.slice(0, 3);
  }

  return points.slice(0, 3);
}

function buildAction(rawSignal) {
  if (rawSignal === 'BUY') {
    return 'Enter on pullback with confirmation';
  }
  if (rawSignal === 'SELL') {
    return 'Short on continuation breakdown';
  }
  return 'No trade — wait for breakout or reversal confirmation';
}

function generateRawSignal(features, closes = [], patterns = {}, options = {}) {
  if (!features || features.confidence === null) {
    return {
      rawSignal: null,
      confidence: null,
      probability: null,
      score: null,
      signalType: 'insufficient-data',
      factors: {
        trendScore: null,
        momentumScore: null,
        divergenceScore: null,
        volumeScore: null,
        volatilityScore: null,
      },
      dataQualityScore: 0,
      hasConflict: false,
      warnings: ['Insufficient data for scoring model'],
      label: 'No Edge',
      summary: 'Insufficient data — no trade edge',
      factorsStructured: [
        { name: 'Trend', value: null, impact: 'Unavailable' },
        { name: 'RSI', value: null, impact: 'Unavailable' },
        { name: 'Divergence', value: null, impact: 'Unavailable' },
      ],
      reasoning: ['Minimum indicator set is unavailable'],
      interpretation: 'No trade setup — waiting for confirmation',
      action: 'No trade — wait for breakout or reversal confirmation',
      explanation: {
        signal: 'HOLD',
        confidence: null,
        label: 'No Edge',
        score: null,
        probability: null,
        summary: 'Insufficient data — no trade edge',
        factors: [
          { name: 'Trend', value: null, impact: 'Unavailable' },
          { name: 'RSI', value: null, impact: 'Unavailable' },
          { name: 'Divergence', value: null, impact: 'Unavailable' },
        ],
        drivers: ['Minimum indicator set is unavailable'],
        reasoning: ['Minimum indicator set is unavailable'],
        warnings: ['Insufficient data for scoring model'],
        interpretation: 'No trade setup — waiting for confirmation',
        action: 'No trade — wait for breakout or reversal confirmation',
      },
      reason: 'Cannot generate signal without minimum data (60 bars)',
    };
  }

  const normalizedFactors = {
    trendScore: normalizeTrendScore(features.trendStrength),
    momentumScore: normalizeMomentumScoreFromRsi(features.rsi),
    divergenceScore: normalizeDivergenceScore(patterns, features.divergence),
    volumeScore: normalizeVolumeScore(
      features.volatility,
      closes,
      options.historical || [],
      features.volume,
      features.trendStrength
    ),
    volatilityScore: normalizeVolatilityScore(features.volatility),
    patternScore: normalizePatternScore(patterns),
  };

  const weights = {
    trendScore: 0.3,
    momentumScore: 0.2,
    divergenceScore: 0.25,
    volumeScore: 0.15,
    volatilityScore: 0.1,
    patternScore: 0.1,
  };

  let finalScore = 0;
  Object.keys(weights).forEach((key) => {
    if (normalizedFactors[key] !== null) {
      finalScore += weights[key] * normalizedFactors[key];
    }
  });

  const dataQualityScore = buildDataQualityScore(normalizedFactors, options.dataQualityScore);
  const adjustedScore = finalScore * dataQualityScore;
  let probability = logistic(3 * adjustedScore);

  const trendScore = normalizedFactors.trendScore;
  const divergenceScore = normalizedFactors.divergenceScore;
  const hasConflict = trendScore !== null
    && divergenceScore !== null
    && ((trendScore < 0 && divergenceScore > 0) || (trendScore > 0 && divergenceScore < 0));

  const warnings = [];
  if (hasConflict) {
    // Conflict reduces directional conviction to neutral probability.
    probability = 0.5;
    probability = Math.min(probability, 0.65);
    warnings.push('Conflicting signals detected');
  }

  const rsi = toNumber(features.rsi);
  const volatility = toNumber(features.volatility);

  let rawSignal = 'HOLD';
  if (!hasConflict && probability > 0.7) {
    rawSignal = 'BUY';
  } else if (!hasConflict && probability < 0.3) {
    rawSignal = 'SELL';
  }

  let confidence = rawSignal === 'SELL' ? 1 - probability : probability;
  if (rsi !== null && (rsi < 30 || rsi > 70)) {
    confidence *= 0.9;
    warnings.push(rsi < 30 ? 'Oversold condition' : 'Overbought condition');
  }
  if (volatility !== null && volatility > 0.2) {
    confidence *= 0.9;
    warnings.push('High volatility regime');
  }
  if (dataQualityScore < 0.8) {
    confidence *= dataQualityScore;
    warnings.push('Low data quality confidence penalty');
  }
  confidence = clamp(confidence, 0, 1);

  let label = pickLabel({ hasConflict, rawSignal, trendScore, probability });
  const summary = buildSummary({ rawSignal, label, trendScore, rsi, divergenceScore });
  const factorsStructured = buildStructuredFactors(normalizedFactors, rsi);
  const reasoning = buildReasoning({
    trendScore,
    rsi,
    divergenceScore,
    volumeScore: normalizedFactors.volumeScore,
    rawSignal,
  });
  const interpretation = label === 'No Edge'
    ? 'No trade setup — waiting for confirmation'
    : label === 'Trend Under Pressure'
      ? 'Trend and reversal evidence conflict. Avoid aggressive positioning.'
      : rawSignal === 'BUY'
        ? 'Long setup is valid if confirmation holds.'
        : 'Short setup is valid if continuation holds.';
  const action = buildAction(rawSignal);

  if (hasConflict) {
    label = 'Trend Under Pressure';
  }

  const cappedWarnings = warnings.slice(0, 2);

  const drivers = buildDrivers(normalizedFactors);

  return {
    rawSignal,
    confidence,
    probability,
    score: adjustedScore,
    signalType: hasConflict ? 'conflicting-signals' : rawSignal === 'HOLD' ? 'mixed-signals' : `${rawSignal.toLowerCase()}-weighted`,
    factors: normalizedFactors,
    dataQualityScore,
    hasConflict,
    label,
    summary,
    factorsStructured,
    reasoning,
    interpretation,
    action,
    warnings: cappedWarnings,
    explanation: {
      signal: rawSignal,
      confidence,
      label,
      score: adjustedScore,
      probability,
      summary,
      factors: factorsStructured,
      drivers,
      reasoning,
      warnings: cappedWarnings,
      interpretation,
      action,
    },
    reason: summary,
  };
}

module.exports = {
  generateRawSignal,
};
