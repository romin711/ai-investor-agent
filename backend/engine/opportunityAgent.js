const { analyzePortfolio, normalizePortfolioRows } = require('./pipeline');
const fs = require('fs');
const path = require('path');
const { getMarketContextForSymbol } = require('./marketContextService');

const HISTORY_FILE_PATH = path.join(__dirname, '..', 'storage', 'opportunity_radar_history.json');
const MAX_HISTORY_ITEMS = 120;

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function backtestBreakoutSuccessRate(historical, lookback = 20, horizon = 5) {
  if (!Array.isArray(historical) || historical.length < lookback + horizon + 2) {
    return null;
  }

  let breakoutCount = 0;
  let successCount = 0;

  for (let index = lookback; index <= historical.length - horizon - 1; index += 1) {
    const current = historical[index];
    const currentClose = toFiniteNumber(current?.close);
    if (currentClose === null) {
      continue;
    }

    const priorWindow = historical.slice(index - lookback, index);
    const priorHigh = Math.max(
      ...priorWindow
        .map((point) => toFiniteNumber(point?.high))
        .filter((value) => value !== null)
    );

    if (!Number.isFinite(priorHigh) || currentClose <= priorHigh) {
      continue;
    }

    breakoutCount += 1;

    const futureWindow = historical.slice(index + 1, index + 1 + horizon);
    const breakoutWorked = futureWindow.some((point) => {
      const futureClose = toFiniteNumber(point?.close);
      return futureClose !== null && futureClose > currentClose;
    });

    if (breakoutWorked) {
      successCount += 1;
    }
  }

  if (breakoutCount === 0) {
    return null;
  }

  return Number(((successCount / breakoutCount) * 100).toFixed(1));
}

function buildSignalItem(result) {
  const isBreakout = result?.breakout === true;
  const rsi = toFiniteNumber(result?.rsi);
  const momentum = toFiniteNumber(result?.momentum_percent);
  const trend = String(result?.trend || 'neutral');

  const signalType = isBreakout
    ? 'breakout'
    : (trend === 'uptrend' && momentum !== null && momentum > 0)
      ? 'trend-follow'
      : (rsi !== null && rsi < 30)
        ? 'oversold-reversal-watch'
        : 'no-clear-signal';

  const signalStrength = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (toFiniteNumber(result?.confidence) || 0)
        + (isBreakout ? 20 : 0)
        + (rsi !== null && rsi < 30 ? 10 : 0)
      )
    )
  );

  return {
    symbol: result.symbol,
    resolvedSymbol: result.resolvedSymbol,
    signalType,
    signalStrength,
    breakout: isBreakout,
    trend,
    rsi,
    momentumPercent: momentum,
  };
}

function enrichWithPortfolioContext(signal, portfolioAnalysis) {
  const overexposedSectors = Array.isArray(portfolioAnalysis?.overexposedSectors)
    ? portfolioAnalysis.overexposedSectors
    : [];

  const sectorAllocation = portfolioAnalysis?.sectorAllocation || {};
  const symbolResult = (portfolioAnalysis?.results || []).find((item) => item.symbol === signal.symbol);
  const symbolSectorExposure = toFiniteNumber(symbolResult?.sector_exposure) || 0;
  const marketContext = getMarketContextForSymbol(symbolResult?.resolvedSymbol || signal.resolvedSymbol);

  return {
    ...signal,
    sectorExposurePercent: symbolSectorExposure,
    overexposedSectors,
    portfolioInsight: portfolioAnalysis?.portfolioInsight || 'Portfolio context unavailable.',
    sectorAllocation,
    marketContext,
  };
}

function buildActionableAlert(enrichedSignal, symbolResult) {
  const backtestBreakoutRate = backtestBreakoutSuccessRate(symbolResult?.historical || []);
  const confidence = toFiniteNumber(symbolResult?.confidence);
  const decision = String(symbolResult?.decision || 'HOLD').toUpperCase();

  let action = decision;
  if (enrichedSignal.signalType === 'no-clear-signal' && confidence !== null && confidence < 30) {
    action = 'HOLD';
  }

  const explanationParts = [
    `Signal ${enrichedSignal.signalType.replace(/-/g, ' ')} detected for ${enrichedSignal.symbol}.`,
    `Trend is ${enrichedSignal.trend}.`,
    enrichedSignal.rsi === null ? 'RSI unavailable.' : `RSI is ${enrichedSignal.rsi.toFixed(2)}.`,
    backtestBreakoutRate === null
      ? 'Insufficient history to compute pattern success rate.'
      : `Historical breakout success rate: ${backtestBreakoutRate}%.`,
    `Portfolio sector exposure for this symbol is ${enrichedSignal.sectorExposurePercent.toFixed(1)}%.`,
  ];

  const exposurePenalty = Math.min(30, Math.max(0, Math.round((enrichedSignal.sectorExposurePercent - 25) * 1.2)));
  const breakoutBonus = backtestBreakoutRate === null ? 0 : Math.round(backtestBreakoutRate / 8);
  const confidenceScore = confidence === null ? 0 : confidence;
  const contextScore = toFiniteNumber(enrichedSignal?.marketContext?.contextScore) || 0;
  const priorityScore = Math.max(
    0,
    Math.min(100, enrichedSignal.signalStrength + confidenceScore + breakoutBonus + contextScore - exposurePenalty)
  );

  const portfolioRelevance =
    enrichedSignal.sectorExposurePercent >= 40
      ? 'High concentration risk: treat any new exposure carefully.'
      : enrichedSignal.sectorExposurePercent >= 25
        ? 'Moderate concentration: use staged entries and tight risk controls.'
        : 'Low concentration: portfolio has room for measured exposure.';

  return {
    symbol: enrichedSignal.symbol,
    resolvedSymbol: enrichedSignal.resolvedSymbol,
    action,
    confidence: confidence === null ? null : Math.round(confidence),
    signalType: enrichedSignal.signalType,
    signalStrength: enrichedSignal.signalStrength,
    priorityScore,
    backtestedSuccessRate: backtestBreakoutRate,
    portfolioRelevance,
    contextSignals: Array.isArray(enrichedSignal?.marketContext?.events) ? enrichedSignal.marketContext.events : [],
    explanation: explanationParts.join(' '),
    riskFlags: [
      enrichedSignal.sectorExposurePercent >= 35 ? 'high-sector-concentration' : null,
      enrichedSignal.rsi !== null && enrichedSignal.rsi > 75 ? 'overbought' : null,
      enrichedSignal.rsi !== null && enrichedSignal.rsi < 30 ? 'oversold' : null,
    ].filter(Boolean),
    sources: [
      'Yahoo Finance chart API',
      'In-house indicator pipeline (MA/RSI/momentum)',
      'Portfolio exposure engine',
      'Market context events (filings/results/deals)',
    ],
  };
}

function ensureHistoryDir() {
  const historyDir = path.dirname(HISTORY_FILE_PATH);
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }
}

function readHistoryFile() {
  ensureHistoryDir();

  if (!fs.existsSync(HISTORY_FILE_PATH)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(HISTORY_FILE_PATH, 'utf8').trim();
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function writeHistoryFile(historyItems) {
  ensureHistoryDir();
  const sanitized = Array.isArray(historyItems) ? historyItems : [];
  fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(sanitized, null, 2));
}

function saveOpportunityRadarRun(runPayload) {
  const existing = readHistoryFile();
  const next = [runPayload, ...existing].slice(0, MAX_HISTORY_ITEMS);
  writeHistoryFile(next);
  return next;
}

function getOpportunityRadarHistory(limit = 25) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 25));
  return readHistoryFile().slice(0, safeLimit);
}

function generatePortfolioInsights(portfolioAnalysis, alerts, normalizedRows) {
  if (!portfolioAnalysis || !alerts) {
    return 'Unable to generate portfolio insights at this time.';
  }

  const insightParts = [];
  const sectorAlloc = portfolioAnalysis.sectorAllocation || {};
  const results = portfolioAnalysis.results || [];

  // Sector concentration insights
  const sectorNames = Object.keys(sectorAlloc);
  if (sectorNames.length > 0) {
    const topSectors = sectorNames
      .map((sector) => ({ sector, weight: toFiniteNumber(sectorAlloc[sector]) || 0 }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);

    const concentrationText = topSectors
      .map((item) => `${item.sector} (${item.weight.toFixed(1)}%)`)
      .join(', ');

    if (topSectors.length > 0 && topSectors[0].weight > 35) {
      insightParts.push(
        `⚠️ Portfolio heavily concentrated in ${concentrationText}.`
      );
    } else {
      insightParts.push(`📊 Sector exposure: ${concentrationText}.`);
    }
  }

  // Alert summary
  const actionCounts = {
    BUY: alerts.filter((a) => a.action === 'BUY').length,
    SELL: alerts.filter((a) => a.action === 'SELL').length,
    HOLD: alerts.filter((a) => a.action === 'HOLD').length,
  };

  const buyCount = actionCounts.BUY;
  const sellCount = actionCounts.SELL;
  const totalAlerts = alerts.length;

  if (buyCount > 0 || sellCount > 0) {
    const actionSummary = [];
    if (buyCount > 0) {
      actionSummary.push(`${buyCount} buy opinion${buyCount > 1 ? 's' : ''}`);
    }
    if (sellCount > 0) {
      actionSummary.push(`${sellCount} sell signal${sellCount > 1 ? 's' : ''}`);
    }

    if (actionSummary.length > 0) {
      insightParts.push(`🎯 Radar detected ${actionSummary.join(', ')} across portfolio.`);
    }
  }

  // Risk assessment
  const highPriorityAlerts = alerts.filter((a) => toFiniteNumber(a.priorityScore) > 50);
  if (highPriorityAlerts.length > 0) {
    insightParts.push(
      `💡 ${highPriorityAlerts.length} high-priority signal${highPriorityAlerts.length > 1 ? 's' : ''} warrant attention.`
    );
  }

  // Overexposed sector warning
  const overexposed = portfolioAnalysis.overexposedSectors || [];
  if (overexposed.length > 0) {
    insightParts.push(
      `⚠️ Consider trimming exposure to ${overexposed.slice(0, 2).join(', ')}.`
    );
  }

  // Fallback message
  if (insightParts.length === 0) {
    insightParts.push('📈 Portfolio scan complete. No immediate action signals detected.');
  }

  return insightParts.join(' ');
}

async function runOpportunityRadar(inputRows, options = {}) {
  const normalizedRows = normalizePortfolioRows(inputRows);

  // Step 1: detect signals from current market + indicators.
  const portfolioAnalysis = await analyzePortfolio(normalizedRows, {
    geminiApiKey: options?.geminiApiKey || '',
  });

  const signalList = (portfolioAnalysis.results || []).map((result) => buildSignalItem(result));

  // Step 2: enrich each signal with portfolio context.
  const enrichedSignals = signalList.map((signal) => enrichWithPortfolioContext(signal, portfolioAnalysis));

  // Step 3: generate actionable alerts with explainability + sources.
  const alerts = enrichedSignals.map((signal) => {
    const symbolResult = (portfolioAnalysis.results || []).find((item) => item.symbol === signal.symbol);
    return buildActionableAlert(signal, symbolResult || {});
  });

  // Generate AI-powered portfolio insights
  const portfolioInsight = generatePortfolioInsights(portfolioAnalysis, alerts, normalizedRows);

  const payload = {
    workflow: [
      'detect_signal',
      'enrich_with_portfolio_context',
      'generate_actionable_alert',
    ],
    autonomous: true,
    portfolioInsight,
    generatedAt: new Date().toISOString(),
    portfolioRows: normalizedRows,
    alerts,
  };

  saveOpportunityRadarRun(payload);
  return payload;
}

module.exports = {
  runOpportunityRadar,
  getOpportunityRadarHistory,
};
