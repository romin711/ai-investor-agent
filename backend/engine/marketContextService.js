const fs = require('fs');
const path = require('path');

const MARKET_CONTEXT_PATH = path.join(__dirname, 'market_context_events.json');
const USE_STATIC_MARKET_CONTEXT = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.USE_STATIC_MARKET_CONTEXT || '').trim().toLowerCase()
);

let cachedContext = null;

function loadContextMap() {
  if (cachedContext) {
    return cachedContext;
  }

  try {
    const raw = fs.readFileSync(MARKET_CONTEXT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    cachedContext = parsed && typeof parsed === 'object' ? parsed : {};
    return cachedContext;
  } catch (_error) {
    cachedContext = {};
    return cachedContext;
  }
}

function normalizeImpact(impact) {
  const value = String(impact || '').toLowerCase();
  if (value === 'positive' || value === 'negative' || value === 'neutral') {
    return value;
  }
  return 'neutral';
}

function impactToScore(impact) {
  if (impact === 'positive') {
    return 6;
  }
  if (impact === 'negative') {
    return -6;
  }
  return 0;
}

function normalizeSource(source) {
  return String(source || '').toLowerCase();
}

function sourceCredibilityTier(source) {
  const normalized = normalizeSource(source);

  if (normalized.includes('sebi') || normalized.includes('nse') || normalized.includes('bse')) {
    return 'regulatory';
  }
  if (normalized.includes('company') || normalized.includes('earnings call') || normalized.includes('investor relations')) {
    return 'official';
  }
  if (normalized.includes('et markets') || normalized.includes('economictimes')) {
    return 'news';
  }
  return 'community';
}

function credibilityToScore(tier) {
  if (tier === 'regulatory') {
    return 4;
  }
  if (tier === 'official') {
    return 3;
  }
  if (tier === 'news') {
    return 2;
  }
  return 1;
}

function parseDateSafe(dateText) {
  const value = String(dateText || '').trim();
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function computeEventAgeDays(dateText) {
  const parsed = parseDateSafe(dateText);
  if (!parsed) {
    return 30;
  }
  const msDiff = Date.now() - parsed.getTime();
  return Math.max(0, Math.floor(msDiff / (1000 * 60 * 60 * 24)));
}

function recencyWeight(ageDays) {
  if (ageDays <= 3) {
    return 1;
  }
  if (ageDays <= 7) {
    return 0.8;
  }
  if (ageDays <= 14) {
    return 0.55;
  }
  return 0.3;
}

function getMarketContextForSymbol(symbol) {
  if (!USE_STATIC_MARKET_CONTEXT) {
    return {
      events: [],
      contextScore: 0,
      provenance: {
        mode: 'strict-real-only',
        source: 'none',
      },
    };
  }

  const map = loadContextMap();
  const key = String(symbol || '').toUpperCase();
  const events = Array.isArray(map[key]) ? map[key] : [];

  const normalizedEvents = events.map((event) => {
    const impact = normalizeImpact(event?.impact);
    const source = String(event?.source || 'Market Source');
    const credibilityTier = sourceCredibilityTier(source);
    const credibilityScore = credibilityToScore(credibilityTier);
    const ageDays = computeEventAgeDays(event?.date);
    const decay = recencyWeight(ageDays);
    const weightedImpactScore = Number((impactToScore(impact) * decay).toFixed(2));

    return {
      type: String(event?.type || 'market_event'),
      title: String(event?.title || 'Context event'),
      source,
      sourceUrl: String(event?.sourceUrl || ''),
      date: String(event?.date || ''),
      impact,
      credibilityTier,
      credibilityScore,
      ageDays,
      recencyWeight: decay,
      weightedImpactScore,
    };
  });

  const contextScore = normalizedEvents.reduce(
    (sum, event) => sum + event.weightedImpactScore + event.credibilityScore,
    0
  );

  return {
    events: normalizedEvents,
    contextScore: Number(contextScore.toFixed(2)),
    provenance: {
      mode: 'static-context-events',
      source: 'market_context_events.json',
    },
  };
}

function getMarketContextMode() {
  return USE_STATIC_MARKET_CONTEXT ? 'static-context-events' : 'strict-real-only';
}

module.exports = {
  getMarketContextForSymbol,
  getMarketContextMode,
};
