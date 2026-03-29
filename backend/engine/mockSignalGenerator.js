/**
 * Controlled mock signal generator for demo mode.
 * Generates deterministic-but-varied feature inputs per symbol.
 */

const SCENARIOS = {
  STRONG_BULLISH: 'STRONG_BULLISH',
  STRONG_BEARISH: 'STRONG_BEARISH',
  CONFLICT_REVERSAL: 'CONFLICT_REVERSAL',
  NO_EDGE: 'NO_EDGE',
  BREAKOUT: 'BREAKOUT',
};

const SCENARIO_MAP = {
  TATASTEEL: SCENARIOS.STRONG_BULLISH,
  ADANIPORTS: SCENARIOS.STRONG_BEARISH,
  IRCTC: SCENARIOS.BREAKOUT,
  HDFCBANK: SCENARIOS.CONFLICT_REVERSAL,
  AXISBANK: SCENARIOS.CONFLICT_REVERSAL,
  RELIANCE: SCENARIOS.NO_EDGE,
  ITC: SCENARIOS.NO_EDGE,
  SBIN: SCENARIOS.STRONG_BEARISH,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round2(value) {
  return Number(value.toFixed(2));
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randomRange(rand, min, max) {
  return min + (max - min) * rand();
}

function withNoise(rand, value, noise = 0.05, min = -1, max = 1) {
  const delta = randomRange(rand, -noise, noise);
  return clamp(value + delta, min, max);
}

function symbolJitter(symbol, span) {
  const h = hashString(String(symbol || ''));
  const unit = (h % 1000) / 1000; // 0..0.999
  return (unit * 2 - 1) * span; // -span..+span
}

function pickFallbackScenario(symbol) {
  const ordered = [
    SCENARIOS.STRONG_BULLISH,
    SCENARIOS.STRONG_BEARISH,
    SCENARIOS.CONFLICT_REVERSAL,
    SCENARIOS.NO_EDGE,
    SCENARIOS.BREAKOUT,
  ];
  const index = hashString(symbol) % ordered.length;
  return ordered[index];
}

function getScenarioForSymbol(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  return SCENARIO_MAP[normalized] || pickFallbackScenario(normalized);
}

function generateScenarioValues(scenario, rand) {
  switch (scenario) {
    case SCENARIOS.STRONG_BULLISH:
      return {
        trendScore: randomRange(rand, 0.7, 0.95),
        rsi: randomRange(rand, 60, 75),
        divergence: 0,
        volume: randomRange(rand, 0.4, 0.7),
      };
    case SCENARIOS.STRONG_BEARISH:
      return {
        trendScore: randomRange(rand, -0.95, -0.7),
        rsi: randomRange(rand, 25, 40),
        divergence: 0,
        volume: randomRange(rand, 0.3, 0.6),
      };
    case SCENARIOS.CONFLICT_REVERSAL:
      return {
        trendScore: randomRange(rand, -0.85, -0.6),
        rsi: randomRange(rand, 25, 35),
        divergence: randomRange(rand, 0.5, 0.7),
        volume: randomRange(rand, 0, 0.3),
      };
    case SCENARIOS.NO_EDGE:
      return {
        trendScore: randomRange(rand, -0.3, 0.3),
        rsi: randomRange(rand, 40, 60),
        divergence: 0,
        volume: 0,
      };
    case SCENARIOS.BREAKOUT:
      return {
        trendScore: randomRange(rand, 0.4, 0.7),
        rsi: randomRange(rand, 55, 70),
        divergence: 0,
        volume: randomRange(rand, 0.6, 0.9),
      };
    default:
      return {
        trendScore: randomRange(rand, -0.2, 0.2),
        rsi: randomRange(rand, 45, 55),
        divergence: 0,
        volume: randomRange(rand, 0, 0.2),
      };
  }
}

function generateMockSignal(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  const scenario = getScenarioForSymbol(normalized);
  const rand = mulberry32(hashString(`${normalized}:${scenario}:demo-v1`));
  const base = generateScenarioValues(scenario, rand);

  const trendScore = round2(clamp(withNoise(rand, base.trendScore, 0.1, -1, 1) + symbolJitter(normalized, 0.03), -1, 1));
  const rsi = round2(clamp(withNoise(rand, base.rsi, 3, 0, 100) + symbolJitter(normalized, 0.8), 0, 100));
  const divergence = base.divergence === 0
    ? 0
    : round2(withNoise(rand, base.divergence, 0.05, -1, 1));
  const volume = round2(withNoise(rand, base.volume, 0.05, -1, 1));
  const volatility = round2(randomRange(rand, 0.2, 0.5));

  // Keep momentum consistent with RSI direction while adding slight variance.
  const momentum = round2(withNoise(rand, (rsi - 50) / 50, 0.05, -1, 1));

  return {
    symbol: normalized,
    scenario,
    trendScore,
    rsi,
    divergence,
    volume,
    volatility,
    momentum,
  };
}

function buildMockHistorical(symbol, mockSignal, bars = 90) {
  const seed = hashString(`${symbol}:${mockSignal.scenario}:history-v1`);
  const rand = mulberry32(seed);
  const start = new Date();
  start.setDate(start.getDate() - bars);

  const history = [];
  let close = 100 + randomRange(rand, -4, 4);
  for (let i = 0; i < bars; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);

    const drift = mockSignal.trendScore * 0.25;
    const shock = randomRange(rand, -0.8, 0.8) * mockSignal.volatility;
    close = Math.max(5, close + drift + shock);

    const open = close + randomRange(rand, -0.7, 0.7);
    const high = Math.max(open, close) + randomRange(rand, 0.2, 1.1);
    const low = Math.min(open, close) - randomRange(rand, 0.2, 1.1);

    const baseVolume = 1000000;
    const scaledVolume = baseVolume * (1 + mockSignal.volume + randomRange(rand, -0.1, 0.1));

    history.push({
      date: date.toISOString().slice(0, 10),
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume: Math.max(10000, Math.round(scaledVolume)),
    });
  }

  return history;
}

function buildMockMarketData(symbol, mockSignal) {
  const historical = buildMockHistorical(symbol, mockSignal, 90);
  const closes = historical.map((bar) => bar.close);
  const latest = historical[historical.length - 1] || null;

  return {
    symbol,
    closes,
    historical,
    latestPrice: latest ? latest.close : null,
    latestTimestamp: latest ? latest.date : null,
    dataPoints: closes.length,
    mock: true,
  };
}

module.exports = {
  SCENARIOS,
  SCENARIO_MAP,
  generateMockSignal,
  buildMockMarketData,
  getScenarioForSymbol,
};
