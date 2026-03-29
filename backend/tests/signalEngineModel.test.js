const assert = require('assert');
const signalEngine = require('../engine/signalEngine');

function testConflictCase() {
  const result = signalEngine.generateRawSignal(
    {
      rsi: 25,
      trendStrength: -0.8,
      volatility: 0.18,
      momentum: -0.2,
      confidence: 1,
    },
    [],
    { type: 'bullish-divergence', label: 'Bullish divergence' },
    { dataQualityScore: 1, historical: [] }
  );

  assert.strictEqual(result.rawSignal, 'HOLD', 'Conflict case should not produce strong directional action');
  assert.strictEqual(result.label, 'Trend Under Pressure', 'Conflict label mismatch');
  assert.ok(result.confidence >= 0.45 && result.confidence <= 0.55, `Expected confidence in [0.45, 0.55], got ${result.confidence}`);
  assert.ok(result.warnings.includes('Conflicting signals detected'), 'Missing conflict warning');
  assert.ok(result.explanation && typeof result.explanation.interpretation === 'string', 'Structured explanation missing interpretation');
}

function testBullishAlignedCase() {
  const result = signalEngine.generateRawSignal(
    {
      rsi: 60,
      trendStrength: 0.9,
      volatility: 0.1,
      momentum: 0.4,
      confidence: 1,
    },
    [],
    { type: 'none', label: '' },
    { dataQualityScore: 1, historical: [] }
  );

  assert.strictEqual(result.hasConflict, false, 'Bullish aligned setup should not be conflict');
  assert.ok(result.rawSignal === 'BUY' || result.rawSignal === 'HOLD', 'Unexpected signal value');
  assert.ok(result.probability >= 0 && result.probability <= 1, 'Probability must be in [0,1]');
}

function testMissingDataCase() {
  const result = signalEngine.generateRawSignal(
    {
      rsi: null,
      trendStrength: null,
      volatility: null,
      momentum: null,
      confidence: null,
    },
    [],
    {},
    { dataQualityScore: 0, historical: [] }
  );

  assert.strictEqual(result.rawSignal, null, 'Insufficient data should yield null signal');
  assert.strictEqual(result.confidence, null, 'Insufficient data should yield null confidence');
  assert.strictEqual(result.signalType, 'insufficient-data', 'Signal type mismatch for insufficient data');
}

function run() {
  testConflictCase();
  testBullishAlignedCase();
  testMissingDataCase();
  console.log('signalEngine weighted model tests passed.');
}

run();
