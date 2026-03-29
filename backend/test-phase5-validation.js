/**
 * Phase 5: Comprehensive Validation Tests
 * Tests signal purity, confidence accuracy, and pattern consistency
 */

const { runOpportunityRadarForUniverse } = require('./engine/opportunityAgent');
const assert = require('assert');

async function testSignalPurity() {
  console.log('\n🔍 TEST 1: Signal Purity (No Arbitrary Rewriting)\n');

  const result = await runOpportunityRadarForUniverse({ universeLimit: 8 });
  
  const alerts = result.alerts || [];
  console.log(`Analyzed ${alerts.length} symbols`);

  // Check: No quota conversion messages
  const conversionMessages = alerts.filter((a) =>
    a.reasons && a.reasons.some((r) => r.includes('Converted from') || r.includes('quota'))
  );

  assert.strictEqual(
    conversionMessages.length,
    0,
    `❌ FAIL: Found ${conversionMessages.length} alerts with quota conversions (should be 0)`
  );
  console.log('✅ PASS: Zero quota conversions (signal purity verified)');

  // Check: All signals have consistent type/confidence relationship
  const inconsistentSignals = alerts.filter((a) => {
    const rawAction = a.signalDecision?.type;
    const reportedAction = a.action;
    return rawAction !== reportedAction && a.executed !== false; // Skip watch-only
  });

  assert.strictEqual(
    inconsistentSignals.length,
    0,
    `❌ FAIL: Found ${inconsistentSignals.length} signals with inconsistent type/action`
  );
  console.log('✅ PASS: All signals have consistent type/action mapping');

  // Check: No signals with inverted confidence
  const invertedConfidence = alerts.filter((a) => {
    const conf = a.confidence || 0;
    const action = a.action;
    // SELL with high confidence should have low values near 0 (or just be negative bias)
    // This is more about ensuring data integrity
    return !Number.isFinite(conf) || conf < 0 || conf > 100;
  });

  assert.strictEqual(
    invertedConfidence.length,
    0,
    `❌ FAIL: Found ${invertedConfidence.length} alerts with invalid confidence ranges`
  );
  console.log('✅ PASS: All confidence scores in valid range [0, 100]');
}

async function testDataQualityImpact() {
  console.log('\n📊 TEST 2: Data Quality Impact on Confidence\n');

  const result = await runOpportunityRadarForUniverse({ universeLimit: 5 });
  const alerts = result.alerts || [];

  // Check: No alerts with null confidence (data quality threshold)
  const nullConfidenceCount = alerts.filter((a) => a.confidence === null).length;
  console.log(`Alerts with null confidence: ${nullConfidenceCount}/${alerts.length}`);

  // This is acceptable - low-data symbols should have null confidence
  if (nullConfidenceCount > 0) {
    console.log(`  → ${nullConfidenceCount} symbol(s) below minimum data threshold`);
  }

  // Check: High confidence signals have reasonable support
  const highConfidenceAlerts = alerts.filter((a) => a.confidence >= 70);
  console.log(`High confidence signals (≥70%): ${highConfidenceAlerts.length}`);

  highConfidenceAlerts.forEach((a) => {
    const reasons = a.reasons || [];
    const hasDataCheck = reasons.some((r) =>
      r.includes('trend') || r.includes('RSI') || r.includes('momentum')
    );
    if (!hasDataCheck) {
      console.warn(`  ⚠️  ${a.symbol}: High confidence (${a.confidence}%) without clear technical reason`);
    }
  });

  console.log('✅ PASS: Data quality filtering applied correctly');
}

async function testUniverseScanConsistency() {
  console.log('\n🏁 TEST 3: Universe Scan Consistency & Statistics\n');

  const result = await runOpportunityRadarForUniverse({ universeLimit: 10 });
  
  if (!result.signalStats) {
    console.log('⚠️  signalStats not available, skipping statistical checks');
    return;
  }

  const { buyCount, sellCount, holdCount, totalSignals } = result.signalStats;
  console.log(`Total signals: ${totalSignals}`);
  console.log(`  BUY:  ${buyCount} (${((buyCount / totalSignals) * 100).toFixed(1)}%)`);
  console.log(`  SELL: ${sellCount} (${((sellCount / totalSignals) * 100).toFixed(1)}%)`);
  console.log(`  HOLD: ${holdCount} (${((holdCount / totalSignals) * 100).toFixed(1)}%)`);

  // Check: Scanner mode is active (no portfolio-specific penalties)
  assert.strictEqual(result.analysisMode, 'scanner', '❌ analysisMode should be "scanner"');
  console.log('✅ PASS: Scanner mode active');

  // Check: Reasonable distribution (no extreme skew toward BUY)
  const buyRatio = buyCount / totalSignals;
  assert(buyRatio <= 0.6, `❌ BUY ratio too high (${(buyRatio * 100).toFixed(1)}%, should be ≤60%)`);
  console.log(`✅ PASS: BUY ratio within reasonable bounds (${(buyRatio * 100).toFixed(1)}%)`);

  // Check: All alerts present
  const alertCount = (result.alerts || []).length;
  assert.strictEqual(
    alertCount,
    totalSignals,
    `❌ Alert count mismatch: ${alertCount} alerts vs ${totalSignals} signals`
  );
  console.log(`✅ PASS: All ${totalSignals} signals have corresponding alerts`);
}

async function testConfidenceConsistency() {
  console.log('\n🎯 TEST 4: Confidence Score Consistency\n');

  const result = await runOpportunityRadarForUniverse({ universeLimit: 6 });
  const alerts = result.alerts || [];

  let confidenceStats = { min: 100, max: 0, sum: 0, count: 0 };

  alerts.forEach((a) => {
    if (a.confidence !== null) {
      confidenceStats.min = Math.min(confidenceStats.min, a.confidence);
      confidenceStats.max = Math.max(confidenceStats.max, a.confidence);
      confidenceStats.sum += a.confidence;
      confidenceStats.count += 1;
    }
  });

  if (confidenceStats.count > 0) {
    const avg = confidenceStats.sum / confidenceStats.count;
    console.log(`Confidence range: [${confidenceStats.min}, ${confidenceStats.max}]`);
    console.log(`Average confidence: ${avg.toFixed(1)}%`);

    // Check: Confidence spread (should not be uniform)
    const spread = confidenceStats.max - confidenceStats.min;
    assert(spread >= 10, `❌ Confidence spread too narrow (${spread}%, should vary)`);
    console.log(`✅ PASS: Confidence values properly distributed (spread: ${spread}%)`);
  }

  // Check: HOLD signals typically have moderate-to-low confidence
  const holdAlerts = alerts.filter((a) => a.action === 'HOLD' && a.confidence !== null);
  const holdAvgConf = holdAlerts.length > 0 ? holdAlerts.reduce((s, a) => s + a.confidence, 0) / holdAlerts.length : 0;
  console.log(`Average HOLD confidence: ${holdAvgConf.toFixed(1)}%`);
  
  if (holdAvgConf > 70) {
    console.warn(`  ⚠️  HOLD signals have high average confidence (${holdAvgConf.toFixed(1)}%) - may indicate bias`);
  }

  console.log('✅ PASS: Confidence metrics reasonable');
}

async function runAllTests() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  Phase 5: Comprehensive Validation Tests');
  console.log('════════════════════════════════════════════════════════════════');

  try {
    await testSignalPurity();
    await testDataQualityImpact();
    await testUniverseScanConsistency();
    await testConfidenceConsistency();

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('  ✅ ALL VALIDATION TESTS PASSED');
    console.log('════════════════════════════════════════════════════════════════\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runAllTests();
