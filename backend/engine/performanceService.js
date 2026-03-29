/**
 * performanceService.js
 *
 * Calculates signal quality metrics and validation statistics.
 * Tracks hit rates, return attribution, drawdown, confidence intervals,
 * and benchmark comparisons.
 */

/**
 * In-memory backtest store for explicit simulations only.
 * This must remain empty by default to avoid predefined values in validation metrics.
 */
const backtestHistory = {};

const SUPPORTED_DECISIONS = ['BUY', 'SELL', 'HOLD'];
const HORIZON_PRIORITY = ['5D', '3D', '1D'];

function getHorizonDays(horizonLabel) {
  if (horizonLabel === '1D') return 1;
  if (horizonLabel === '3D') return 3;
  return 5;
}

function selectBestHorizon(countsByHorizon = {}) {
  for (const horizon of HORIZON_PRIORITY) {
    const count = Number(countsByHorizon[horizon]) || 0;
    if (count > 0) return horizon;
  }
  return '5D';
}

function getDatasetReturnsForHorizon(dataset, horizonLabel = '5D') {
  if (horizonLabel === '1D') return Array.isArray(dataset?.returns1D) ? dataset.returns1D : [];
  if (horizonLabel === '3D') return Array.isArray(dataset?.returns3D) ? dataset.returns3D : [];
  return Array.isArray(dataset?.returns5D) ? dataset.returns5D : [];
}

function getDatasetDrawdownsForHorizon(dataset, horizonLabel = '5D') {
  if (horizonLabel === '1D') return Array.isArray(dataset?.maxDrawdowns1D) ? dataset.maxDrawdowns1D : [];
  if (horizonLabel === '3D') return Array.isArray(dataset?.maxDrawdowns3D) ? dataset.maxDrawdowns3D : [];
  return Array.isArray(dataset?.maxDrawdowns5D) ? dataset.maxDrawdowns5D : [];
}

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

function calculateDeflatedSharpeApprox(sharpeRatio, sampleSize) {
  const sr = Number(sharpeRatio) || 0;
  const n = Number(sampleSize) || 0;

  if (!Number.isFinite(sr) || !Number.isFinite(n) || n <= 1 || sr <= 0) {
    return 0;
  }

  // Conservative approximation that penalizes high Sharpe from tiny samples.
  const samplePenalty = Math.sqrt(Math.max(0, Math.min(1, n / 252)));
  const smallSamplePenalty = n < 30 ? 0.6 : n < 60 ? 0.8 : 1;
  return sr * samplePenalty * smallSamplePenalty;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function computePredictiveConfidence(signals = []) {
  const rows = Array.isArray(signals) ? signals : [];
  if (rows.length === 0) {
    return {
      predictiveScore: 0,
      confidenceLevel: 'low',
      components: {
        holdDominancePenalty: 0,
        directionalParticipationReward: 0,
        buySellBalanceReward: 0,
        signalCountReward: 0,
      },
    };
  }

  const counts = { BUY: 0, SELL: 0, HOLD: 0 };

  rows.forEach((row) => {
    const action = String(row?.action || 'HOLD').toUpperCase();
    if (action === 'BUY' || action === 'SELL' || action === 'HOLD') {
      counts[action] += 1;
    }
  });

  const total = rows.length;
  const holdRatio = counts.HOLD / total;
  const directionalRatio = (counts.BUY + counts.SELL) / total;

  let score = 50;

  let holdDominancePenalty = 0;
  if (holdRatio > 0.95) holdDominancePenalty = -25;
  else if (holdRatio > 0.85) holdDominancePenalty = -15;
  else if (holdRatio > 0.70) holdDominancePenalty = -8;
  score += holdDominancePenalty;

  let directionalParticipationReward = 0;
  if (directionalRatio > 0.30) directionalParticipationReward = 10;
  else if (directionalRatio > 0.15) directionalParticipationReward = 5;
  score += directionalParticipationReward;

  let buySellBalanceReward = 0;
  if (counts.BUY > 0 && counts.SELL > 0) buySellBalanceReward = 5;
  score += buySellBalanceReward;

  let signalCountReward = 0;
  if (total > 100) signalCountReward = 5;
  score += signalCountReward;

  const predictiveScore = Math.round(clamp(score, 30, 75));
  const confidenceLevel = predictiveScore > 60 ? 'high' : predictiveScore >= 40 ? 'medium' : 'low';

  return {
    predictiveScore,
    confidenceLevel,
    components: {
      holdDominancePenalty,
      directionalParticipationReward,
      buySellBalanceReward,
      signalCountReward,
    },
  };
}

function buildReliabilityMetrics({
  hitRateCI95,
  sharpeRatio,
  maxDrawdown,
  signalCount,
}) {
  const sampleSize = Number(signalCount) || 0;
  const hitRateLowerBound = Array.isArray(hitRateCI95) ? Number(hitRateCI95[0]) || 0 : 0;
  const drawdownMagnitude = Math.abs(Number(maxDrawdown) || 0);
  const deflatedSharpe = calculateDeflatedSharpeApprox(sharpeRatio, sampleSize);

  const hitComponent = clamp01(hitRateLowerBound);
  const sharpeComponent = clamp01(deflatedSharpe / 2);
  const drawdownComponent = clamp01(1 - (drawdownMagnitude / 0.2));
  const sampleComponent = clamp01(Math.log(1 + sampleSize) / Math.log(1 + 500));

  const score = Math.round(clamp01(
    (0.30 * hitComponent)
    + (0.25 * sharpeComponent)
    + (0.25 * drawdownComponent)
    + (0.20 * sampleComponent)
  ) * 100);

  return {
    score,
    hitRateLowerBound: Number(hitRateLowerBound.toFixed(4)),
    deflatedSharpe: Number(deflatedSharpe.toFixed(4)),
    components: {
      hitRateLowerBound: Number(hitComponent.toFixed(4)),
      deflatedSharpe: Number(sharpeComponent.toFixed(4)),
      drawdownQuality: Number(drawdownComponent.toFixed(4)),
      sampleAdequacy: Number(sampleComponent.toFixed(4)),
    },
    weights: {
      hitRateLowerBound: 0.30,
      deflatedSharpe: 0.25,
      drawdownQuality: 0.25,
      sampleAdequacy: 0.20,
    },
  };
}

function buildTradingReadiness({
  reliability,
  signalCount,
  maxDrawdown,
  outperformance,
}) {
  const sampleSize = Number(signalCount) || 0;
  const drawdownMagnitude = Math.abs(Number(maxDrawdown) || 0);
  const outperf = Number(outperformance) || 0;
  const reliabilityScore = Number(reliability?.score) || 0;
  const deflatedSharpe = Number(reliability?.deflatedSharpe) || 0;

  const gates = {
    minSample: sampleSize >= 200,
    strongReliability: reliabilityScore >= 70,
    robustDeflatedSharpe: deflatedSharpe >= 1.0,
    acceptableDrawdown: drawdownMagnitude <= 0.12,
    positiveOutperformance: outperf > 0,
  };

  const passedCount = Object.values(gates).filter(Boolean).length;

  const gateDiagnostics = {
    minSample: {
      current: sampleSize,
      target: 200,
      unit: 'signals',
      reason: gates.minSample
        ? 'Sufficient realized signal depth.'
        : `Only ${sampleSize} realized signals available; at least 200 are required.`,
      remediation: gates.minSample
        ? null
        : `Collect ${Math.max(0, 200 - sampleSize)} more realized outcomes via longer live run history or controlled backtests.`,
    },
    strongReliability: {
      current: Number(reliabilityScore.toFixed(2)),
      target: 70,
      unit: 'score',
      reason: gates.strongReliability
        ? 'Composite reliability is above production threshold.'
        : `Reliability score ${reliabilityScore.toFixed(1)} is below the 70 threshold.`,
      remediation: gates.strongReliability
        ? null
        : 'Improve lower-bound hit rate and drawdown quality before raising capital allocation.',
    },
    robustDeflatedSharpe: {
      current: Number(deflatedSharpe.toFixed(3)),
      target: 1.0,
      unit: 'ratio',
      reason: gates.robustDeflatedSharpe
        ? 'Risk-adjusted return remains robust after sample-size penalty.'
        : `Deflated Sharpe ${deflatedSharpe.toFixed(2)} is below 1.00.`,
      remediation: gates.robustDeflatedSharpe
        ? null
        : 'Reduce variance of outcomes: tighten stop-loss discipline and remove low-conviction setups.',
    },
    acceptableDrawdown: {
      current: Number((drawdownMagnitude * 100).toFixed(2)),
      target: 12,
      unit: 'pct',
      reason: gates.acceptableDrawdown
        ? 'Drawdown is within the defined risk budget.'
        : `Drawdown ${ (drawdownMagnitude * 100).toFixed(2) }% exceeds the 12% budget.`,
      remediation: gates.acceptableDrawdown
        ? null
        : 'Lower per-trade risk, tighten sector concentration, and reduce leverage until drawdown is below 12%.',
    },
    positiveOutperformance: {
      current: Number((outperf * 100).toFixed(2)),
      target: 0,
      unit: 'pct',
      reason: gates.positiveOutperformance
        ? 'Strategy outperforms baseline net of compounding comparison.'
        : `Outperformance is ${ (outperf * 100).toFixed(2) }%; must be positive.`,
      remediation: gates.positiveOutperformance
        ? null
        : 'Revisit entry filtering and execution assumptions so net strategy return exceeds baseline.',
    },
  };

  const failedGates = Object.entries(gates)
    .filter(([, passed]) => !passed)
    .map(([gate]) => ({
      gate,
      ...gateDiagnostics[gate],
    }));

  const passedGates = Object.entries(gates)
    .filter(([, passed]) => passed)
    .map(([gate]) => ({
      gate,
      ...gateDiagnostics[gate],
    }));

  const recommendations = failedGates.map((item) => item.remediation).filter(Boolean);

  return {
    gates,
    passedCount,
    totalGates: Object.keys(gates).length,
    tradable: passedCount === Object.keys(gates).length,
    failedGates,
    passedGates,
    recommendations,
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
    (record) => (
      String(record?.action || '').toUpperCase() === action
      // Only include persisted live outcomes produced by signalOutcomeService.
      && typeof record?.key === 'string'
      && record.key.length > 0
    )
  );

  if (filtered.length === 0) {
    return null;
  }

  const returns1D = [];
  const returns3D = [];
  const returns5D = [];
  const maxDrawdowns1D = [];
  const maxDrawdowns3D = [];
  const maxDrawdowns5D = [];

  filtered.forEach((record) => {
    const r1 = extractOutcomeReturn(record, '1D');
    const r3 = extractOutcomeReturn(record, '3D');
    const r5 = extractOutcomeReturn(record, '5D');

    if (r1 !== null) returns1D.push(r1);
    if (r3 !== null) returns3D.push(r3);
    if (r5 !== null) returns5D.push(r5);

    const dd1 = extractOutcomeDrawdown(record, '1D');
    const dd3 = extractOutcomeDrawdown(record, '3D');
    const dd5 = extractOutcomeDrawdown(record, '5D');
    if (dd1 !== null) maxDrawdowns1D.push(dd1);
    if (dd3 !== null) maxDrawdowns3D.push(dd3);
    if (dd5 !== null) maxDrawdowns5D.push(dd5);
  });

  const countsByHorizon = {
    '1D': returns1D.length,
    '3D': returns3D.length,
    '5D': returns5D.length,
  };
  const evaluationHorizon = selectBestHorizon(countsByHorizon);
  const evaluationReturns = getDatasetReturnsForHorizon({ returns1D, returns3D, returns5D }, evaluationHorizon);
  const sampleSize = evaluationReturns.length;
  const successCount = evaluationReturns.filter((ret) => getDecisionRule(action, ret)).length;

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
    maxDrawdowns1D,
    maxDrawdowns3D,
    maxDrawdowns5D,
    maxDrawdowns: [...maxDrawdowns5D],
    sharpeRatios: [],
    evaluationHorizon,
  };
}

function buildDecisionDataset(decision, outcomeRecords = []) {
  const live = buildDecisionDatasetFromLiveOutcomes(decision, outcomeRecords);
  if (live) {
    return live;
  }

  // No seeded fallback: return explicit empty state when live outcomes are unavailable.
  const history = {
    successCount: 0,
    totalCount: 0,
    returns1D: [],
    returns3D: [],
    returns5D: [],
    maxDrawdowns: [],
    sharpeRatios: [],
  };
  return {
    decision: String(decision || 'BUY').toUpperCase(),
    source: 'insufficient-live-outcomes',
    successCount: Number(history.successCount) || 0,
    totalCount: Number(history.totalCount) || 0,
    returns1D: [...(history.returns1D || [])],
    returns3D: [...(history.returns3D || [])],
    returns5D: [...(history.returns5D || [])],
    maxDrawdowns1D: [],
    maxDrawdowns3D: [],
    maxDrawdowns5D: [],
    maxDrawdowns: [...(history.maxDrawdowns || [])],
    sharpeRatios: [...(history.sharpeRatios || [])],
    evaluationHorizon: '5D',
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

  const evaluationHorizon = selectBestHorizon({
    '1D': returnAttribution['1D'].sampleSize,
    '3D': returnAttribution['3D'].sampleSize,
    '5D': returnAttribution['5D'].sampleSize,
  });
  const evaluationDays = getHorizonDays(evaluationHorizon);
  const evaluationReturns = getDatasetReturnsForHorizon(dataset, evaluationHorizon);

  const sampleSize = evaluationReturns.length;
  const successCount = sampleSize > 0
    ? evaluationReturns.filter((ret) => getDecisionRule(decisionUpper, ret)).length
    : 0;

  const hitRate = sampleSize > 0 ? successCount / sampleSize : 0;
  const hitRateCI95 = calculateWilsonInterval(successCount, sampleSize);

  const selectedDrawdowns = getDatasetDrawdownsForHorizon(dataset, evaluationHorizon);
  const maxDrawdownMean = calculateMean(selectedDrawdowns);
  const maxDrawdownWorst = selectedDrawdowns.length > 0 ? Math.min(...selectedDrawdowns) : 0;
  const maxDrawdownCI = calculateConfidenceInterval(selectedDrawdowns);

  const strategyReturnsEvaluated = evaluationReturns.map((ret) => ret / 100);
  const sharpeRatio = calculateSharpeRatioFromPeriodicReturns(strategyReturnsEvaluated, evaluationDays);

  const confidenceInterval95 = returnAttribution[evaluationHorizon].ci95;
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
    evaluationHorizon,
    returnAttribution,
    maxDrawdown: Number(maxDrawdownMean.toFixed(4)),
    worstDrawdown: Number(maxDrawdownWorst.toFixed(4)),
    maxDrawdownCI95: [Number(maxDrawdownCI[0].toFixed(4)), Number(maxDrawdownCI[1].toFixed(4))],
    sharpeRatio: Number(sharpeRatio.toFixed(2)),
    confidenceInterval95,
    returnsEvaluated: [...evaluationReturns],
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

function buildEquityCurve(strategyReturns, horizonDays = 5) {
  const baselineAnnualReturn = 0.03;
  const baselinePerHorizon = ((1 + baselineAnnualReturn) ** (horizonDays / 252)) - 1;

  let strategyEquity = 1;
  let baselineEquity = 1;

  const curve = [{ step: 0, strategy: 1, baseline: 1 }];

  strategyReturns.forEach((ret, index) => {
    strategyEquity *= (1 + ret);
    baselineEquity *= (1 + baselinePerHorizon);

    curve.push({
      step: index + 1,
      strategy: Number(strategyEquity.toFixed(6)),
      baseline: Number(baselineEquity.toFixed(6)),
    });
  });

  return curve;
}

function getValidationMetrics(alerts = [], outcomeRecords = []) {
  const allOutcomeRecords = Array.isArray(outcomeRecords) ? outcomeRecords : [];
  const normalizedOutcomeRecords = allOutcomeRecords.filter((record) => (
    typeof record?.key === 'string'
    && record.key.length > 0
    && SUPPORTED_DECISIONS.includes(String(record?.action || '').toUpperCase())
  ));
  const realizedOutcomeCount = normalizedOutcomeRecords.filter((record) => (
    ['1D', '3D', '5D'].some((horizon) => record?.horizons?.[horizon]?.sampleReady === true)
  )).length;
  const realized5DOutcomeCount = normalizedOutcomeRecords.filter((record) => (
    record?.horizons?.['5D']?.sampleReady === true
  )).length;

  const strategyByDecision = getStrategyPerformance(outcomeRecords);
  const predictiveConfidence = computePredictiveConfidence(alerts);

  const datasetsByDecision = {};
  const aggregateReturnsByHorizon = {
    '1D': [],
    '3D': [],
    '5D': [],
  };

  SUPPORTED_DECISIONS.forEach((decision) => {
    const dataset = buildDecisionDataset(decision, outcomeRecords);
    datasetsByDecision[decision] = dataset;
    aggregateReturnsByHorizon['1D'].push(...(dataset.returns1D || []));
    aggregateReturnsByHorizon['3D'].push(...(dataset.returns3D || []));
    aggregateReturnsByHorizon['5D'].push(...(dataset.returns5D || []));
  });

  const evaluationHorizon = selectBestHorizon({
    '1D': aggregateReturnsByHorizon['1D'].length,
    '3D': aggregateReturnsByHorizon['3D'].length,
    '5D': aggregateReturnsByHorizon['5D'].length,
  });
  const evaluationDays = getHorizonDays(evaluationHorizon);

  let sampleCount = 0;
  let successCount = 0;
  const strategyReturnsEvaluated = [];

  SUPPORTED_DECISIONS.forEach((decision) => {
    const dataset = datasetsByDecision[decision];
    const evaluatedReturns = getDatasetReturnsForHorizon(dataset, evaluationHorizon);

    const decisionSuccess = evaluatedReturns.filter((ret) => getDecisionRule(decision, ret)).length;
    successCount += decisionSuccess;
    sampleCount += evaluatedReturns.length;

    evaluatedReturns.forEach((ret) => {
      strategyReturnsEvaluated.push(ret / 100);
    });
  });

  const hitRate = sampleCount > 0 ? successCount / sampleCount : 0;
  const hitRateCI95 = calculateWilsonInterval(successCount, sampleCount);

  const avgSignalReturn = calculateMean(strategyReturnsEvaluated);
  const cumulativeCompounded = strategyReturnsEvaluated.reduce((equity, ret) => equity * (1 + ret), 1) - 1;
  const sharpeRatio = calculateSharpeRatioFromPeriodicReturns(strategyReturnsEvaluated, evaluationDays);
  const maxDrawdown = calculateMaxDrawdownFromReturns(strategyReturnsEvaluated);

  const returnCI95 = calculateConfidenceInterval(strategyReturnsEvaluated.map((ret) => ret * 100));
  const returnAttribution = getCombinedHorizonAttribution(outcomeRecords);

  const baselineAnnualReturn = 0.03;
  const baselinePerHorizon = ((1 + baselineAnnualReturn) ** (evaluationDays / 252)) - 1;
  const baselineReturns = strategyReturnsEvaluated.map(() => baselinePerHorizon);
  const baselineCompounded = baselineReturns.reduce((equity, ret) => equity * (1 + ret), 1) - 1;
  const outperformance = cumulativeCompounded - baselineCompounded;
  const reliability = buildReliabilityMetrics({
    hitRateCI95,
    sharpeRatio,
    maxDrawdown,
    signalCount: sampleCount,
  });
  const hasMinimumValidationSamples = realizedOutcomeCount >= 10 && realized5DOutcomeCount >= 5;
  const scoringMode = hasMinimumValidationSamples ? 'live' : 'early-stage';
  const reliabilityScore = hasMinimumValidationSamples ? reliability.score : null;
  const reliabilityForReadiness = hasMinimumValidationSamples
    ? reliability
    : {
      ...reliability,
      score: 0,
      deflatedSharpe: 0,
    };
  const tradingReadiness = buildTradingReadiness({
    reliability: reliabilityForReadiness,
    signalCount: sampleCount,
    maxDrawdown,
    outperformance,
  });

  const alertsArray = Array.isArray(alerts) ? alerts : [];
  const alertSampleCount = alertsArray.length;

  const decisionSources = Object.fromEntries(
    Object.entries(strategyByDecision || {}).map(([decision, metrics]) => [
      decision,
      String(metrics?.source || 'unknown'),
    ])
  );
  const allDecisionSources = Object.values(decisionSources);
  const liveSourceCount = allDecisionSources.filter((source) => source === 'live-outcomes').length;
  const insufficientCount = allDecisionSources.filter((source) => source === 'insufficient-live-outcomes').length;
  const mode = insufficientCount > 0 ? 'insufficient-live-outcomes' : 'live-outcomes-only';

  return {
    cumulativeReturn: Number((avgSignalReturn * 100).toFixed(3)),
    cumulativeCompoundedReturnPct: Number((cumulativeCompounded * 100).toFixed(3)),
    hitRate: Number(hitRate.toFixed(4)),
    hitRateCI95: [Number(hitRateCI95[0].toFixed(4)), Number(hitRateCI95[1].toFixed(4))],
    sharpeRatio: Number(sharpeRatio.toFixed(3)),
    maxDrawdown: Number(maxDrawdown.toFixed(4)),
    evaluationHorizon,
    evaluationHorizonDays: evaluationDays,
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
    reliability: hasMinimumValidationSamples
      ? reliability
      : {
        ...reliability,
        score: null,
      },
    reliabilityScore,
    predictiveScore: predictiveConfidence.predictiveScore,
    predictiveConfidence,
    mode: scoringMode,
    tradingReadiness,
    dataProvenance: {
      mode,
      strictLiveOnly: true,
      scoringMode,
      decisionSources,
      liveDecisionSourceCount: liveSourceCount,
      insufficientDecisionSourceCount: insufficientCount,
      hasSufficientLiveOutcomes: sampleCount > 0,
      hasMinimumValidationSamples,
      evaluationHorizon,
      trackedOutcomeCount: normalizedOutcomeRecords.length,
      realizedOutcomeCount,
      realized5DOutcomeCount,
    },
    equityCurve: buildEquityCurve(strategyReturnsEvaluated, evaluationDays),
    liveOutcomeCount: realizedOutcomeCount,
    trackedOutcomeCount: normalizedOutcomeRecords.length,
    realized5DOutcomeCount,
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
