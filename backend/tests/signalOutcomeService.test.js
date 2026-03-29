const assert = require('assert');
const { compactOutcomeRecords } = require('../engine/signalOutcomeService');

function buildRecord({
  key,
  runGeneratedAt,
  updatedAt,
  symbol = 'TCS',
  action = 'BUY',
  runDate = '2026-03-29',
  entryPrice = 2387.5,
  entryDate = '2026-03-29',
}) {
  return {
    key,
    runGeneratedAt,
    updatedAt,
    symbol,
    action,
    runDate,
    entryPrice,
    horizons: {
      '1D': {
        sampleReady: true,
        entryDate,
      },
    },
  };
}

function runSignalOutcomeServiceTests() {
  const sameSetupOlder = buildRecord({
    key: 'k-old',
    runGeneratedAt: '2026-03-29T03:00:00.000Z',
    updatedAt: '2026-03-29T03:05:00.000Z',
  });

  const sameSetupNewer = buildRecord({
    key: 'k-new',
    runGeneratedAt: '2026-03-29T04:00:00.000Z',
    updatedAt: '2026-03-29T04:05:00.000Z',
  });

  const differentAction = buildRecord({
    key: 'k-sell',
    action: 'SELL',
    runGeneratedAt: '2026-03-29T04:10:00.000Z',
    updatedAt: '2026-03-29T04:15:00.000Z',
  });

  const duplicateKeyOlder = buildRecord({
    key: 'k-dup',
    symbol: 'INFY',
    runGeneratedAt: '2026-03-29T01:00:00.000Z',
    updatedAt: '2026-03-29T01:00:00.000Z',
  });

  const duplicateKeyNewer = buildRecord({
    key: 'k-dup',
    symbol: 'INFY',
    runGeneratedAt: '2026-03-29T01:10:00.000Z',
    updatedAt: '2026-03-29T01:10:00.000Z',
  });

  const invalid = {
    key: '',
    symbol: 'ITC',
    action: 'BUY',
  };

  const compacted = compactOutcomeRecords(
    [sameSetupOlder, sameSetupNewer, differentAction, duplicateKeyOlder, duplicateKeyNewer, invalid],
    100
  );

  assert.ok(Array.isArray(compacted), 'Compacted records must be an array');
  assert.strictEqual(compacted.length, 3, 'Compaction should keep unique canonical setups and dedupe duplicate keys');

  const keptKeys = compacted.map((item) => item.key);
  assert.ok(keptKeys.includes('k-new'), 'Newest canonical setup record should be retained');
  assert.ok(!keptKeys.includes('k-old'), 'Older canonical duplicate should be removed');
  assert.ok(keptKeys.includes('k-sell'), 'Different action must be retained');
  assert.ok(keptKeys.includes('k-dup'), 'Latest duplicate key record should be retained');

  const limited = compactOutcomeRecords(compacted, 2);
  assert.strictEqual(limited.length, 2, 'Compaction should respect max item retention');

  console.log('Signal outcome service compaction tests passed.');
}

runSignalOutcomeServiceTests();
