const assert = require('assert');

const decisionEngine = require('../engine/decisionEngine');
const patternIntelligence = require('../engine/patternIntelligence');

function buildConflictFixture(symbol = 'TEST.NS', bars = 90) {
  const historical = [];
  const closes = [];
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - bars);

  for (let i = 0; i < bars; i += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);

    // Downward drift with small oscillations to keep trend bearish and volatility realistic.
    const close = 210 - i * 0.9 + Math.sin(i / 3) * 0.6;
    const open = close + Math.cos(i / 4) * 0.4;
    const high = Math.max(open, close) + 0.7;
    const low = Math.min(open, close) - 0.7;
    const volume = 1000000 + i * 1200;

    closes.push(close);
    historical.push({
      date: date.toISOString().slice(0, 10),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });
  }

  return {
    symbol,
    closes,
    historical,
    latestPrice: closes[closes.length - 1],
    latestTimestamp: historical[historical.length - 1].date,
    dataPoints: closes.length,
  };
}

async function testConflictDecisionPath() {
  const marketData = buildConflictFixture();
  const originalAnalyze = patternIntelligence.analyzePatternIntelligence;

  patternIntelligence.analyzePatternIntelligence = () => ({
    supportResistance: {
      support: 120,
      resistance: 150,
      supportDistancePct: 1.2,
      resistanceDistancePct: -12.4,
    },
    detectedPatterns: [
      {
        pattern: 'bullish-divergence',
        label: 'Bullish Divergence',
        direction: 'bullish',
        detected: true,
      },
    ],
    patternBacktests: [],
    breakoutDetected: false,
  });

  try {
    const result = await decisionEngine.makeDecision('TEST.NS', { marketData });

    assert.strictEqual(result.rawSignal, 'HOLD', 'Conflict fixture should produce HOLD signal');
    assert.strictEqual(result.finalAction, 'HOLD', 'Final action should remain HOLD');
    assert.strictEqual(result.weightedModel?.hasConflict, true, 'Conflict flag should be true');
    assert.strictEqual(
      result.weightedModel?.label,
      'Trend Under Pressure',
      'Conflict label mismatch'
    );
    assert.ok(
      Number.isFinite(result.confidence) && result.confidence >= 0.35 && result.confidence <= 0.6,
      `Expected confidence in [0.35, 0.60], got ${result.confidence}`
    );
    assert.ok(
      Array.isArray(result.weightedModel?.warnings) && result.weightedModel.warnings.includes('Conflicting signals detected'),
      'Conflict warning should be present'
    );
    assert.strictEqual(
      typeof result.weightedModel?.explanation?.interpretation,
      'string',
      'Explanation interpretation should be present'
    );
  } finally {
    patternIntelligence.analyzePatternIntelligence = originalAnalyze;
  }
}

async function run() {
  await testConflictDecisionPath();
  console.log('decisionEngine weighted-model tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
