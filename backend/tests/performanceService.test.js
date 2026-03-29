const assert = require('assert');
const {
  getSignalPerformance,
  getValidationMetrics,
  getStrategyPerformance,
} = require('../engine/performanceService');

function assertRange(value, min, max, label) {
  assert.ok(Number.isFinite(value), `${label} must be finite`);
  assert.ok(value >= min && value <= max, `${label} must be within [${min}, ${max}]`);
}

function runPerformanceServiceTests() {
  const buyMetrics = getSignalPerformance('BUY');
  assert.ok(buyMetrics.sampleSize >= 0, 'BUY sample size should be non-negative');
  assertRange(buyMetrics.hitRate, 0, 1, 'BUY hit rate');
  assert.ok(Array.isArray(buyMetrics.hitRateCI95) && buyMetrics.hitRateCI95.length === 2, 'BUY hit rate CI95 must exist');
  assert.ok(buyMetrics.returnAttribution && buyMetrics.returnAttribution['5D'], 'BUY return attribution for 5D must exist');
  assert.ok(Array.isArray(buyMetrics.returnAttribution['5D'].ci95), 'BUY 5D return CI95 must exist');
  assert.ok(buyMetrics.worstDrawdown <= 0, 'BUY worst drawdown should be <= 0');
  assert.ok(
    buyMetrics.source === 'live-outcomes' || buyMetrics.source === 'insufficient-live-outcomes',
    'BUY source should indicate real live outcomes status'
  );

  const strategy = getStrategyPerformance();
  assert.ok(strategy.BUY && strategy.SELL && strategy.HOLD, 'Strategy performance must include BUY/SELL/HOLD');

  const validation = getValidationMetrics([]);
  assert.ok(validation.signalCount >= 0, 'Validation signal count should be non-negative');
  assertRange(validation.hitRate, 0, 1, 'Validation hit rate');
  assert.ok(Array.isArray(validation.hitRateCI95) && validation.hitRateCI95.length === 2, 'Validation hit rate CI95 must exist');
  assert.ok(validation.returnAttribution && validation.returnAttribution['1D'] && validation.returnAttribution['3D'] && validation.returnAttribution['5D'], 'Validation return attribution must include 1D/3D/5D');
  assert.ok(validation.baselineComparison && Number.isFinite(validation.baselineComparison.outperformancePct), 'Baseline comparison must include outperformance');
  assert.ok(validation.maxDrawdown <= 0, 'Validation max drawdown should be <= 0');
  assert.ok(validation.reliability, 'Reliability payload must exist');
  assert.ok(
    validation.reliabilityScore === null || Number.isFinite(validation.reliabilityScore),
    'Reliability score must be finite or null in early-stage mode'
  );
  assert.ok(Number.isFinite(validation.predictiveScore), 'Predictive score must exist');
  if ((Number(validation.alertSampleCount) || 0) > 0) {
    assertRange(validation.predictiveScore, 30, 75, 'Predictive score');
  } else {
    assert.ok(validation.predictiveScore === 0, 'Predictive score should be 0 when no signals are available');
  }
  assert.ok(
    validation.mode === 'live' || validation.mode === 'early-stage',
    'Validation mode must be live or early-stage'
  );
  if (validation.mode === 'live') {
    assertRange(validation.reliabilityScore, 0, 100, 'Reliability score');
  } else {
    assert.ok(validation.reliabilityScore === null, 'Reliability score should be null in early-stage mode');
  }
  assert.ok(validation.reliability.components && Number.isFinite(validation.reliability.components.sampleAdequacy), 'Reliability components must exist');
  assert.ok(validation.tradingReadiness && typeof validation.tradingReadiness.tradable === 'boolean', 'Trading readiness must exist');
  assert.ok(validation.tradingReadiness.totalGates >= 1, 'Trading readiness gates must be tracked');
  assert.ok(Array.isArray(validation.tradingReadiness.failedGates), 'Trading readiness should include failed gate diagnostics');
  assert.ok(Array.isArray(validation.tradingReadiness.passedGates), 'Trading readiness should include passed gate diagnostics');
  assert.ok(Array.isArray(validation.tradingReadiness.recommendations), 'Trading readiness should include recommendations array');
  if (validation.tradingReadiness.failedGates.length > 0) {
    const gate = validation.tradingReadiness.failedGates[0];
    assert.ok(typeof gate.gate === 'string' && gate.gate.length > 0, 'Failed gate should include gate name');
    assert.ok(typeof gate.reason === 'string' && gate.reason.length > 0, 'Failed gate should include reason');
    assert.ok(typeof gate.remediation === 'string' && gate.remediation.length > 0, 'Failed gate should include remediation');
  }

  console.log('Performance service signal-quality tests passed.');
}

runPerformanceServiceTests();
