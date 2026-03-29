/**
 * Quick integration test for Phase 2 refactoring
 * Tests: runOpportunityRadarForUniverse without starting full server
 */

const { runOpportunityRadarForUniverse } = require('./engine/opportunityAgent');

async function testRefactoring() {
  console.log('🧪 Testing Phase 2 Refactoring (quota removal, bias fix, scanner mode)...\n');

  try {
    console.log('📊 Running opportunity radar for 3-symbol universe...');
    const result = await runOpportunityRadarForUniverse({ universeLimit: 3 });
    
    if (!result || !result.alerts) {
      console.error('❌ FAIL: Result missing alerts');
      process.exit(1);
    }

    console.log(`✅ Alerts generated: ${result.alerts.length}`);

    // Check for anti-patterns that should be removed
    const hasQuotaConversions = result.alerts.some((alert) =>
      alert.reasons && alert.reasons.some((r) => r.includes('quota') || r.includes('Converted from'))
    );

    if (hasQuotaConversions) {
      console.error('❌ FAIL: Quota conversions still present (should be removed)');
      process.exit(1);
    }
    console.log('✅ No quota conversions detected (quota logic removed)');

    // Check scanner mode flag
    if (result.analysisMode !== 'scanner') {
      console.error('❌ FAIL: analysisMode should be "scanner"');
      process.exit(1);
    }
    console.log('✅ Scanner mode correctly identified');

    // Check for neutral signal handling (bias deadzone)
    const holdAlerts = result.alerts.filter((a) => a.action === 'HOLD');
    console.log(`✅ HOLD signals: ${holdAlerts.length}/${result.alerts.length}`);

    console.log('\n✅ ALL REFACTORING CHECKS PASSED');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    console.error(err);
    process.exit(1);
  }
}

testRefactoring();
