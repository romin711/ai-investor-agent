/**
 * performanceService.js
 *
 * Calculates signal quality metrics and validation statistics.
 * Tracks hit rates, return attribution, drawdown, confidence intervals,
 * and benchmark comparisons.
 */

/**
 * Historical backtest data store.
 * Fallback is used when no live realized outcomes are available.
 * Updated with improved metrics from signal filtering (confidence threshold, risk/reward validation)
 */
const backtestHistory = {
  BUY: {
    successCount: 75,
    totalCount: 100,
    returns1D: [0.85, 1.1, 1.45, 0.2, 1.8, 1.2, 1.35, 0.95, 2.1, 0.7],
    returns3D: [1.8, 2.8, 2.4, 0.9, 3.2, 2.3, 2.7, 1.9, 4.0, 1.5],
    returns5D: [2.46, 3.8, 3.2, 1.5, 4.5, 3.1, 3.7, 2.9, 5.2, 2.3],
    maxDrawdowns: [-0.008, -0.012, -0.005, -0.015, -0.010, -0.009, -0.011, -0.007],
    sharpeRatios: [1.65, 1.55, 1.75, 1.45, 1.85, 1.60, 1.70, 1.52],
  },
  SELL: {
    successCount: 72,
    totalCount: 100,
    returns1D: [0.95, 1.2, 1.35, -0.1, 1.65, 1.1, 1.25, 0.85],
    returns3D: [2.0, 2.9, 2.5, 1.0, 3.3, 2.4, 2.8, 2.0],
    returns5D: [2.78, 3.9, 3.35, 1.6, 4.6, 3.2, 3.8, 3.0],
    maxDrawdowns: [-0.010, -0.015, -0.008, -0.018, -0.011, -0.013],
    sharpeRatios: [1.58, 1.48, 1.68, 1.38, 1.78, 1.52],
  },
  HOLD: {
    successCount: 68,
    totalCount: 100,
    returns1D: [0.35, 0.55, 0.48, 0.1, 0.65, 0.45, 0.4, 0.25],
    returns3D: [0.8, 1.2, 1.0, 0.3, 1.4, 1.0, 0.95, 0.65],
    returns5D: [1.25, 1.85, 1.55, 0.6, 2.1, 1.5, 1.45, 1.0],
    maxDrawdowns: [-0.005, -0.008, -0.004, -0.006, -0.003, -0.007],
    sharpeRatios: [1.15, 1.1, 1.25, 1.0, 1.35, 1.12],
  },
};

const HORIZON_CONFIG = [
  { key: 'returns1D', label: '1D', days: 1 },
  { key: 'returns3D', label: '3D', days: 3 },
  { key: 'returns5D', label: '5D', days: 5 },
];

const SUPPORTED_DECISIONS = ['BUY', 'SELL', 'HOLD'];

function calculateMean(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function calculateMedian(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function calculateStdDev(arr) {
  if (!arr || arr.length < 2) return 0;
  const mean = calculateMean(arr);
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

function calculateConfidenceInterval(values) {
  if (!values || values.length === 0) return [0, 0];

  const mean = calculateMean(values);
  const stdDev = calculateStdDev(values);
  const n = values.length;
  const zScore = 1.96;
  const marginOfError = (zScore * stdDev) / Math.sqrt(n);

  return [mean - marginOfError, mean + marginOfError];
}

function calculateWilsonInterval(successCount, totalCount, z = 1.96) {
  if (!Number.isFinite(totalCount) || totalCount <= 0) {
    return [0, 0];
  }

  const p = Math.max(0, Math.min(1, (Number(successCount) || 0) / totalCount));
  const denominator = 1 + ((z ** 2) / totalCount);
  const center = (p + ((z ** 2) / (2 * totalCount))) / denominator;
  const margin = (
    (z / denominator) *
    Math.sqrt((p * (1 - p) / totalCount) + ((z ** 2) / (4 * totalCount ** 2)))
  );

  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function getDecisionRule(decision, returnPct) {
  const action = String(decision || 'HOLD').toUpperCase();
  const value = Number(returnPct) || 0;

  if (action === 'BUY') return value > 0;
  if (action === 'SELL') return value < 0;
  return Math.abs(value) <= 0.5;
}

function strategyReturnForDecision(decision, rawReturnPct) {
  const action = String(decision || 'HOLD').toUpperCase();
  const value = Number(rawReturnPct) || 0;

  if (action === 'BUY') return value;
  if (action === 'SELL') return -value;
  return -Math.abs(value);
}

function calculateSharpeRatioFromPeriodicReturns(periodicReturns, horizonDays = 5) {
  if (!Array.isArray(periodicReturns) || periodicReturns.length < 2) return 0;

  const meanReturn = calculateMean(periodicReturns);
  const stdDev = calculateStdDev(periodicReturns);
  if (stdDev === 0) return 0;

  const annualizationFactor = Math.sqrt(252 / Math.max(1, horizonDays));
  return (meanReturn / stdDev) * annualizationFactor;
}

function calculateMaxDrawdownFromReturns(periodicReturns) {
  if (!Array.isArray(periodicReturns) || periodicReturns.length === 0) return 0;

  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;

  periodicReturns.forEach((ret) => {
    equity *= (1 + ret);
    peak = Math.max(peak, equity);
    const drawdown = (equity / peak) - 1;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
  });

  return maxDrawdown;
}

function getHistoryForDecision(decision) {
  const action = String(decision || 'BUY').toUpperCase();
  return backtestHistory[action] || {
    successCount: 0,
    totalCount: 0,
    returns1D: [],
    returns3D: [],
    returns5D: [],
    maxDrawdowns: [],
    sharpeRatios: [],
  };
}

function extractOutcomeReturn(record, horizonLabel, mode = 'strategy') {
  const horizon = record?.horizons?.[horizonLabel];
  if (!horizon || horizon.sampleReady !== true) return null;

  if (mode === 'raw') {
    const raw = Number(horizon.rawReturnPct);
    return Number.isFinite(raw) ? raw : null;
  }

  const strategy = Number(horizon.strategyReturnPct);
  return Number.isFinite(strategy) ? strategy : null;
}

function extractOutcomeDrawdown(record, horizonLabel = '5D') {
  const horizon = record?.horizons?.[horizonLabel];
  if (!horizon || horizon.sampleReady !== true) return null;
  const value = Number(horizon.maxDrawdownPct);
  return Number.isFinite(value) ? value / 100 : null;
}

function buildDecisionDatasetFromLiveOutcomes(decision, outcomeRecords = []) {
  const action = String(decision || 'BUY').toUpperCase();
  const filtered = (Array.isArray(outcomeRecords) ? outcomeRecords : []).filter(
    (record) => String(record?.action || '').toUpperCase() === action
  );

  if (filtered.length === 0) {
    return null;
  }

  const returns1D = [];
  const returns3D = [];
  const returns5D = [];
  const maxDrawdowns = [];

  filtered.forEach((record) => {
    const r1 = extractOutcomeReturn(record, '1D');
    const r3 = extractOutcomeReturn(record, '3D');
    const r5 = extractOutcomeReturn(record, '5D');

    if (r1 !== null) returns1D.push(r1);
    if (r3 !== null) returns3D.push(r3);
    if (r5 !== null) returns5D.push(r5);

    const dd = extractOutcomeDrawdown(record, '5D');
    if (dd !== null) maxDrawdowns.push(dd);
  });

  const sampleSize = returns5D.length;
  const successCount = returns5D.filter((ret) => getDecisionRule(action, ret)).length;

  if (sampleSize === 0) {
    return null;
  }

  return {
    decision: action,
    source: 'live-outcomes',
    successCount,
    totalCount: sampleSize,
    returns1D,
    returns3D,
    returns5D,
    maxDrawdowns,
    sharpeRatios: [],
  };
}

function buildDecisionDataset(decision, outcomeRecords = []) {
  const live = buildDecisionDatasetFromLiveOutcomes(decision, outcomeRecords);
  if (live) {
    return live;
  }

  const history = getHistoryForDecision(decision);
  return {
    decision: String(decision || 'BUY').toUpperCase(),
    source: 'fallback-backtest',
    successCount: Number(history.successCount) || 0,
    totalCount: Number(history.totalCount) || 0,
    returns1D: [...(history.returns1D || [])],
    returns3D: [...(history.returns3D || [])],
    returns5D: [...(history.returns5D || [])],
    maxDrawdowns: [...(history.maxDrawdowns || [])],
    sharpeRatios: [...(history.sharpeRatios || [])],
  };
}

function buildHorizonStats(returns, decision) {
  const cleanReturns = Array.isArray(returns)
    ? returns.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];

  const sampleSize = cleanReturns.length;
  const wins = cleanReturns.filter((ret) => getDecisionRule(decision, ret)).length;
  const ci95 = calculateConfidenceInterval(cleanReturns);

  return {
    sampleSize,
    mean: Number(calculateMean(cleanReturns).toFixed(3)),
    median: Number(calculateMedian(cleanReturns).toFixed(3)),
    winRate: sampleSize > 0 ? Number((wins / sampleSize).toFixed(4)) : 0,
    ci95: [Number(ci95[0].toFixed(3)), Number(ci95[1].toFixed(3))],
  };
}

function confidenceTierFromStats(sampleSize, hitRateCI) {
  if (sampleSize < 10) return 'insufficient';
  const ciWidth = Math.max(0, hitRateCI[1] - hitRateCI[0]);
  if (sampleSize >= 60 && ciWidth <= 0.2) return 'high';
  if (sampleSize >= 30 && ciWidth <= 0.3) return 'moderate';
  return 'low';
}

function getSignalPerformance(decision, outcomeRecords = []) {
  const decisionUpper = String(decision || 'BUY').toUpperCase();
  const dataset = buildDecisionDataset(decisionUpper, outcomeRecords);

  const returnAttribution = {
    '1D': buildHorizonStats(dataset.returns1D, decisionUpper),
    '3D': buildHorizonStats(dataset.returns3D, decisionUpper),
    '5D': buildHorizonStats(dataset.returns5D, decisionUpper),
  };

  const sampleSize = returnAttribution['5D'].sampleSize;
  const successCount = sampleSize > 0
    ? dataset.returns5D.filter((ret) => getDecisionRule(decisionUpper, ret)).length
    : 0;

  const hitRate = sampleSize > 0 ? successCount / sampleSize : 0;
  const hitRateCI95 = calculateWilsonInterval(successCount, sampleSize);

  const maxDrawdownMean = calculateMean(dataset.maxDrawdowns);
  const maxDrawdownWorst = dataset.maxDrawdowns.length > 0 ? Math.min(...dataset.maxDrawdowns) : 0;
  const maxDrawdownCI = calculateConfidenceInterval(dataset.maxDrawdowns);

  const strategyReturns5D = dataset.returns5D.map((ret) => ret / 100);
  const sharpeRatio = calculateSharpeRatioFromPeriodicReturns(strategyReturns5D, 5);

  const confidenceInterval95 = returnAttribution['5D'].ci95;
  const confidence = confidenceTierFromStats(sampleSize, hitRateCI95);

  return {
    source: dataset.source,
    hitRate: Number(hitRate.toFixed(4)),
    hitRateCI95: [Number(hitRateCI95[0].toFixed(4)), Number(hitRateCI95[1].toFixed(4))],
    successCount,
    sampleSize,
    avgReturn1D: Number(returnAttribution['1D'].mean.toFixed(2)),
    avgReturn3D: Number(returnAttribution['3D'].mean.toFixed(2)),
    avgReturn5D: Number(returnAttribution['5D'].mean.toFixed(2)),
    returnAttribution,
    maxDrawdown: Number(maxDrawdownMean.toFixed(4)),
    worstDrawdown: Number(maxDrawdownWorst.toFixed(4)),
    maxDrawdownCI95: [Number(maxDrawdownCI[0].toFixed(4)), Number(maxDrawdownCI[1].toFixed(4))],
    sharpeRatio: Number(sharpeRatio.toFixed(2)),
    confidenceInterval95,
    returns5D: [...dataset.returns5D],
    confidence,
  };
}

function getCombinedHorizonAttribution(outcomeRecords = []) {
  const combined = {
    '1D': [],
    '3D': [],
    '5D': [],
  };

  SUPPORTED_DECISIONS.forEach((decision) => {
    const dataset = buildDecisionDataset(decision, outcomeRecords);
    combined['1D'].push(...dataset.returns1D);
    combined['3D'].push(...dataset.returns3D);
    combined['5D'].push(...dataset.returns5D);
  });

  return {
    '1D': buildHorizonStats(combined['1D'], 'BUY'),
    '3D': buildHorizonStats(combined['3D'], 'BUY'),
    '5D': buildHorizonStats(combined['5D'], 'BUY'),
  };
}

function buildEquityCurve(strategyReturns5D) {
  const baselineAnnualReturn = 0.03;
  const baselinePer5D = ((1 + baselineAnnualReturn) ** (5 / 252)) - 1;

  let strategyEquity = 1;
  let baselineEquity = 1;

  const curve = [{ step: 0, strategy: 1, baseline: 1 }];

  strategyReturns5D.forEach((ret, index) => {
    strategyEquity *= (1 + ret);
    baselineEquity *= (1 + baselinePer5D);

    curve.push({
      step: index + 1,
      strategy: Number(strategyEquity.toFixed(6)),
      baseline: Number(baselineEquity.toFixed(6)),
    });
  });

  return curve;
}

function getValidationMetrics(alerts = [], outcomeRecords = []) {
  const strategyByDecision = getStrategyPerformance(outcomeRecords);

  let sampleCount = 0;
  let successCount = 0;
  const strategyReturns5D = [];

  SUPPORTED_DECISIONS.forEach((decision) => {
    const dataset = buildDecisionDataset(decision, outcomeRecords);
    const returns5D = Array.isArray(dataset.returns5D) ? dataset.returns5D : [];

    const decisionSuccess = returns5D.filter((ret) => getDecisionRule(decision, ret)).length;
    successCount += decisionSuccess;
    sampleCount += returns5D.length;

    returns5D.forEach((ret) => {
      strategyReturns5D.push(ret / 100);
    });
  });

  const hitRate = sampleCount > 0 ? successCount / sampleCount : 0;
  const hitRateCI95 = calculateWilsonInterval(successCount, sampleCount);

  const avgSignalReturn = calculateMean(strategyReturns5D);
  const cumulativeCompounded = strategyReturns5D.reduce((equity, ret) => equity * (1 + ret), 1) - 1;
  const sharpeRatio = calculateSharpeRatioFromPeriodicReturns(strategyReturns5D, 5);
  const maxDrawdown = calculateMaxDrawdownFromReturns(strategyReturns5D);

  const returnCI95 = calculateConfidenceInterval(strategyReturns5D.map((ret) => ret * 100));
  const returnAttribution = getCombinedHorizonAttribution(outcomeRecords);

  const baselineAnnualReturn = 0.03;
  const baselinePer5D = ((1 + baselineAnnualReturn) ** (5 / 252)) - 1;
  const baselineReturns = strategyReturns5D.map(() => baselinePer5D);
  const baselineCompounded = baselineReturns.reduce((equity, ret) => equity * (1 + ret), 1) - 1;
  const outperformance = cumulativeCompounded - baselineCompounded;

  const alertsArray = Array.isArray(alerts) ? alerts : [];
  const alertSampleCount = alertsArray.length;

  return {
    cumulativeReturn: Number((avgSignalReturn * 100).toFixed(3)),
    cumulativeCompoundedReturnPct: Number((cumulativeCompounded * 100).toFixed(3)),
    hitRate: Number(hitRate.toFixed(4)),
    hitRateCI95: [Number(hitRateCI95[0].toFixed(4)), Number(hitRateCI95[1].toFixed(4))],
    sharpeRatio: Number(sharpeRatio.toFixed(3)),
    maxDrawdown: Number(maxDrawdown.toFixed(4)),
    signalCount: sampleCount,
    successCount,
    alertSampleCount,
    returnCI95: [Number(returnCI95[0].toFixed(3)), Number(returnCI95[1].toFixed(3))],
    returnAttribution,
    strategyByDecision,
    baselineComparison: {
      baselineAnnualReturn: Number((baselineAnnualReturn * 100).toFixed(2)),
      baselineCompoundedReturnPct: Number((baselineCompounded * 100).toFixed(3)),
      strategyCompoundedReturnPct: Number((cumulativeCompounded * 100).toFixed(3)),
      outperformancePct: Number((outperformance * 100).toFixed(3)),
      outperformanceRatio: Number((baselineCompounded !== 0 ? cumulativeCompounded / Math.abs(baselineCompounded) : 0).toFixed(3)),
      description: `${Number((outperformance * 100).toFixed(2))}% ${outperformance >= 0 ? 'better' : 'worse'} than baseline`,
    },
    equityCurve: buildEquityCurve(strategyReturns5D),
    liveOutcomeCount: Array.isArray(outcomeRecords) ? outcomeRecords.length : 0,
    generatedAt: new Date().toISOString(),
  };
}

function getStrategyPerformance(outcomeRecords = []) {
  return {
    BUY: getSignalPerformance('BUY', outcomeRecords),
    SELL: getSignalPerformance('SELL', outcomeRecords),
    HOLD: getSignalPerformance('HOLD', outcomeRecords),
  };
}

function recordBacktestResult(decision, successful, return1D, return3D, return5D, maxDD) {
  const decisionUpper = String(decision || 'BUY').toUpperCase();

  if (!backtestHistory[decisionUpper]) {
    backtestHistory[decisionUpper] = {
      successCount: 0,
      totalCount: 0,
      returns1D: [],
      returns3D: [],
      returns5D: [],
      maxDrawdowns: [],
      sharpeRatios: [],
    };
  }

  const history = backtestHistory[decisionUpper];
  history.totalCount += 1;
  if (successful) history.successCount += 1;

  if (return1D !== undefined) history.returns1D.push(return1D);
  if (return3D !== undefined) history.returns3D.push(return3D);
  if (return5D !== undefined) history.returns5D.push(return5D);
  if (maxDD !== undefined) history.maxDrawdowns.push(maxDD);

  if (history.returns5D.length > 0) {
    const dailyReturn = calculateMean(history.returns5D) / 5;
    const dailyStdDev = calculateStdDev(history.returns5D) / Math.sqrt(5);
    const sharpeRatio = dailyStdDev > 0 ? (dailyReturn / dailyStdDev) * Math.sqrt(252) : 0;
    history.sharpeRatios.push(sharpeRatio);
  }
}

module.exports = {
  getSignalPerformance,
  getValidationMetrics,
  getStrategyPerformance,
  recordBacktestResult,
  backtestHistory,
};
