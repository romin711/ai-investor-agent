const { movingAverage, calculateRsi } = require('./indicators');
const {
  analyzePortfolioExposure,
  detectSector,
} = require('./portfolioService');
const { calculateRiskScore } = require('./riskService');
const { makeDecision } = require('./decisionEngine');
const { generateReasoning } = require('./aiService');
const { resolveSymbol, normalizeInputSymbol } = require('./symbolResolver');
const { fetchYahooStockData } = require('./yahooClient');
const { analyzePatternIntelligence } = require('./patternIntelligence');
const { generateMockSignal, buildMockMarketData } = require('./mockSignalGenerator');

const USE_MOCK_SIGNALS = String(process.env.USE_MOCK_SIGNALS || 'true').toLowerCase() === 'true';

function normalizePortfolioRows(inputRows) {
  const rows = Array.isArray(inputRows)
    ? inputRows
    : (inputRows && typeof inputRows === 'object')
      ? Object.entries(inputRows).map(([symbol, weight]) => ({ symbol, weight }))
      : [];

  const normalized = rows
    .map((row) => ({
      symbol: normalizeInputSymbol(row?.symbol),
      weight: Number(row?.weight),
    }))
    .filter((row) => row.symbol && Number.isFinite(row.weight));

  if (!normalized.length) {
    throw {
      statusCode: 400,
      message: 'Portfolio input requires at least one valid row.',
    };
  }

  normalized.forEach((row, index) => {
    if (row.weight <= 0) {
      throw {
        statusCode: 400,
        message: `Row ${index + 1}: weight must be greater than 0.`,
      };
    }
  });

  return normalized;
}

function computeMomentumPercent(closes, lookback = 5) {
  if (!Array.isArray(closes) || closes.length <= lookback) {
    return null;
  }

  const current = closes[closes.length - 1];
  const previous = closes[closes.length - 1 - lookback];
  if (previous === 0) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

function computeVolatilityPercent(closes) {
  if (!Array.isArray(closes) || closes.length < 2) {
    return null;
  }

  const valid = closes.filter((value) => Number.isFinite(value) && value > 0);
  if (valid.length < 2) {
    return null;
  }

  const current = valid[valid.length - 1];
  const previous = valid[valid.length - 2];
  if (previous === 0) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

function detectBreakout(price, closes) {
  if (!Number.isFinite(price) || !Array.isArray(closes) || closes.length < 21) {
    return null;
  }

  const priorWindow = closes.slice(-21, -1);
  const high20 = Math.max(...priorWindow);
  return price > high20;
}

const INSUFFICIENT_DATA_LOG_TTL_MS = 5 * 60 * 1000;
const insufficientDataLogTimestamps = new Map();

function logInsufficientData(symbol, details) {
  const cacheKey = `${symbol}|${details}`;
  const now = Date.now();
  const lastLoggedAt = insufficientDataLogTimestamps.get(cacheKey) || 0;

  if (now - lastLoggedAt < INSUFFICIENT_DATA_LOG_TTL_MS) {
    return;
  }

  insufficientDataLogTimestamps.set(cacheKey, now);
  // eslint-disable-next-line no-console
  console.warn(`[pipeline] Insufficient data for ${symbol}: ${details}`);
}

async function analyzeSingleSymbol(rawSymbol, options = {}) {
  const {
    portfolioContext = null,
    geminiApiKey = '',
    resolvedSymbol = '',
    policyContext = null,
  } = options;

  const inputSymbol = normalizeInputSymbol(rawSymbol);
  const useMockSignals = options?.useMockSignals ?? USE_MOCK_SIGNALS;

  const resolved = resolvedSymbol
    ? {
      inputSymbol,
      resolvedSymbol,
      method: 'provided',
    }
    : await resolveSymbol(rawSymbol, { geminiApiKey });

  const marketData = useMockSignals
    ? buildMockMarketData(resolved.resolvedSymbol, generateMockSignal(inputSymbol))
    : await fetchYahooStockData(resolved.resolvedSymbol);

  const price = marketData.price;
  const closes = marketData.closes;
  const historical = marketData.historical;

  const ma20 = movingAverage(closes, 20);
  const ma50 = movingAverage(closes, 50);
  const rsi = calculateRsi(closes, 14);

  const momentumPercent = computeMomentumPercent(closes, 5);
  const volatilityPercent = computeVolatilityPercent(closes);
  const patternIntelligence = analyzePatternIntelligence(historical, price);
  const breakout = patternIntelligence?.breakoutDetected;

  const missingIndicators = [
    ma20 === null ? 'ma20' : null,
    ma50 === null ? 'ma50' : null,
    rsi === null ? 'rsi' : null,
    momentumPercent === null ? 'momentum' : null,
    volatilityPercent === null ? 'volatility' : null,
    breakout === null ? 'breakout' : null,
    price === null ? 'price' : null,
  ].filter(Boolean);

  if (missingIndicators.length) {
    logInsufficientData(
      resolved.resolvedSymbol,
      `missing ${missingIndicators.join(', ')} with ${closes.length} valid closes after Yahoo cleanup`
    );
  }

  const derivedTrend = Number.isFinite(price) && Number.isFinite(ma50) && ma50 > 0
    ? (price > ma50 ? 'uptrend' : price < ma50 ? 'downtrend' : 'neutral')
    : 'neutral';
  const sector = detectSector(resolved.resolvedSymbol);

  const sectorExposure = Number(portfolioContext?.sectorAllocation?.[sector] || 0);
  const riskScore = calculateRiskScore(rsi, volatilityPercent, sectorExposure);

  const portfolioWeights = policyContext?.portfolio || {};
  const sectorMap = policyContext?.sectorMap || {};
  const decisionModel = useMockSignals
    ? await makeDecision(inputSymbol, {
      useMockSignals: true,
      portfolio: portfolioWeights,
      sectorMap,
      riskMetrics: {
        currentDrawdown: 0,
        maxDrawdown: 0.15,
        volatility: Math.abs((volatilityPercent || 0) / 100),
      },
    })
    : await makeDecision(resolved.resolvedSymbol, {
      marketData: {
        symbol: resolved.resolvedSymbol,
        closes,
        historical,
        latestPrice: price,
        latestTimestamp: historical?.length ? historical[historical.length - 1]?.date : null,
        dataPoints: closes.length,
      },
      portfolio: portfolioWeights,
      sectorMap,
      riskMetrics: {
        currentDrawdown: 0,
        maxDrawdown: 0.15,
        volatility: Math.abs((volatilityPercent || 0) / 100),
      },
    });

  const decision = String(decisionModel?.finalAction || decisionModel?.rawSignal || 'HOLD').toUpperCase();
  const confidencePct = Number.isFinite(decisionModel?.confidence)
    ? Math.round(decisionModel.confidence * 100)
    : null;
  const technicalScore = Number.isFinite(decisionModel?.weightedModel?.score)
    ? decisionModel.weightedModel.score
    : 0;

  const signalsPayload = {
    trend: derivedTrend,
    rsi,
    momentum: momentumPercent,
    breakout,
    ma20,
    ma50,
    volatility: volatilityPercent,
    support: patternIntelligence?.supportResistance?.support ?? null,
    resistance: patternIntelligence?.supportResistance?.resistance ?? null,
    support_distance_pct: patternIntelligence?.supportResistance?.supportDistancePct ?? null,
    resistance_distance_pct: patternIntelligence?.supportResistance?.resistanceDistancePct ?? null,
    pattern_signals: Array.isArray(patternIntelligence?.detectedPatterns) ? patternIntelligence.detectedPatterns : [],
    pattern_backtests: Array.isArray(patternIntelligence?.patternBacktests) ? patternIntelligence.patternBacktests : [],
    data_points: closes.length,
    insufficient_data: missingIndicators.length > 0,
  };

  const aiResult = decisionModel?.rawReason
    ? {
      reason: decisionModel.rawReason,
      next_action: 'Wait for more market data before making a new decision.',
    }
    : await generateReasoning(
      signalsPayload,
      sector,
      sectorExposure,
      riskScore,
      technicalScore,
      decision,
      geminiApiKey
    );

  return {
    symbol: resolved.inputSymbol,
    resolvedSymbol: resolved.resolvedSymbol,
    price,
    historical,
    trend: derivedTrend,
    rsi,
    ma20,
    ma50,
    momentum_percent: momentumPercent,
    volatility_percent: volatilityPercent,
    breakout,
    pattern_intelligence: patternIntelligence,
    signals: signalsPayload,
    technical_score: technicalScore,
    portfolio_adjustment: 0,
    risk_score: riskScore,
    final_score: technicalScore,
    decision,
    confidence: confidencePct,
    data_warning: missingIndicators.length ? 'Insufficient data' : null,
    decision_model: decisionModel,
    reason: aiResult.reason,
    next_action: aiResult.next_action,
  };
}

async function analyzePortfolio(rows, options = {}) {
  const normalizedRows = normalizePortfolioRows(rows);
  const geminiApiKey = options?.geminiApiKey || '';

  const resolvedRows = await Promise.all(
    normalizedRows.map(async (row) => {
      const resolved = await resolveSymbol(row.symbol, { geminiApiKey });
      return {
        ...row,
        resolvedSymbol: resolved.resolvedSymbol,
        symbolResolutionMethod: resolved.method,
      };
    })
  );

  const portfolioContext = analyzePortfolioExposure(resolvedRows);
  const totalWeight = resolvedRows.reduce((sum, row) => sum + Number(row.weight || 0), 0);
  const policyContext = {
    portfolio: resolvedRows.reduce((acc, row) => {
      const key = String(row.resolvedSymbol || row.symbol || '').toUpperCase();
      if (!key) return acc;
      const normalizedWeight = totalWeight > 0 ? Number(row.weight) / totalWeight : 0;
      acc[key] = normalizedWeight;
      return acc;
    }, {}),
    sectorMap: resolvedRows.reduce((acc, row) => {
      const key = String(row.resolvedSymbol || row.symbol || '').toUpperCase();
      if (!key) return acc;
      acc[key] = detectSector(key);
      return acc;
    }, {}),
  };

  const results = await Promise.all(
    resolvedRows.map(async (row) => {
      const result = await analyzeSingleSymbol(row.symbol, {
        portfolioContext,
        policyContext,
        geminiApiKey,
        resolvedSymbol: row.resolvedSymbol,
        useMockSignals: options?.useMockSignals,
      });

      const sector = detectSector(row.resolvedSymbol);
      return {
        ...result,
        weight: row.weight,
        sector_exposure: Number(portfolioContext.sectorAllocation[sector] || 0),
      };
    })
  );

  return {
    portfolioInsight: portfolioContext.summary,
    sectorAllocation: portfolioContext.sectorAllocation,
    overexposedSectors: portfolioContext.overexposedSectors,
    results,
  };
}

module.exports = {
  analyzeSingleSymbol,
  analyzePortfolio,
  normalizePortfolioRows,
};
