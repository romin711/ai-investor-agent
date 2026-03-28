const { analyzePortfolio, normalizePortfolioRows } = require('./pipeline');
const fs = require('fs');
const path = require('path');
const { getMarketContextForSymbol } = require('./marketContextService');
const { getNseUniverseRows, getNseUniverseSymbols } = require('./nseUniverseService');

const HISTORY_FILE_PATH = path.join(__dirname, '..', 'storage', 'opportunity_radar_history.json');
const MAX_HISTORY_ITEMS = 120;

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function backtestBreakoutSuccessRate(historical, lookback = 15, horizon = 3) {
  if (!Array.isArray(historical) || historical.length < lookback + horizon + 2) {
    return {
      successRate: null,
      breakoutSamples: 0,
      lookback,
      horizon,
    };
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
    return {
      successRate: null,
      breakoutSamples: 0,
      lookback,
      horizon,
    };
  }

  return {
    successRate: Number(((successCount / breakoutCount) * 100).toFixed(1)),
    breakoutSamples: breakoutCount,
    lookback,
    horizon,
  };
}

function buildSignalItem(result) {
  const patternSignals = Array.isArray(result?.pattern_intelligence?.detectedPatterns)
    ? result.pattern_intelligence.detectedPatterns
    : [];
  const activePattern = patternSignals.find((item) => item?.detected === true);
  const activePatternKey = String(activePattern?.pattern || '').toLowerCase();
  const isBreakout = result?.breakout === true || activePatternKey === 'breakout';
  const rsi = toFiniteNumber(result?.rsi);
  const momentum = toFiniteNumber(result?.momentum_percent);
  const trend = String(result?.trend || 'neutral');

  const signalType = isBreakout
    ? 'breakout'
    : activePatternKey
      ? activePatternKey
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
    patternType: activePatternKey || null,
    patternLabel: activePattern?.label || null,
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toRoundedPrice(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}

function normalizeRiskProfile(value) {
  const normalized = String(value || 'moderate').trim().toLowerCase();
  if (normalized === 'conservative' || normalized === 'aggressive') {
    return normalized;
  }
  return 'moderate';
}

function riskProfileConfig(profile) {
  if (profile === 'conservative') {
    return {
      sizingMultiplier: 0.65,
      stopMultiplier: 0.9,
      targetMultiplier: 1.2,
      minConfidenceForAction: 60,
    };
  }

  if (profile === 'aggressive') {
    return {
      sizingMultiplier: 1.25,
      stopMultiplier: 1.15,
      targetMultiplier: 1.35,
      minConfidenceForAction: 45,
    };
  }

  return {
    sizingMultiplier: 1,
    stopMultiplier: 1,
    targetMultiplier: 1,
    minConfidenceForAction: 50,
  };
}

function buildExecutionPlan(action, confidence, symbolResult, enrichedSignal, riskProfile = 'moderate') {
  const profile = normalizeRiskProfile(riskProfile);
  const profileConfig = riskProfileConfig(profile);
  const price = toFiniteNumber(symbolResult?.price);
  const volatility = Math.abs(toFiniteNumber(symbolResult?.volatility_percent) || 1.4);
  const exposure = toFiniteNumber(enrichedSignal?.sectorExposurePercent) || 0;
  const confidenceScore = clamp(toFiniteNumber(confidence) || 0, 0, 100);
  const contextScore = toFiniteNumber(enrichedSignal?.marketContext?.contextScore) || 0;

  const baseStopPct = clamp(volatility * 1.4, 0.9, 3.2);
  const exposurePenalty = clamp((exposure - 25) * 0.02, 0, 0.35);
  const confidenceBoost = clamp((confidenceScore - 50) * 0.003, -0.15, 0.25);

  const baseSizing = (confidenceScore / 10) + (contextScore / 20) - (exposure * 0.08);
  const sizing = clamp(baseSizing * profileConfig.sizingMultiplier, 1, 15);
  const horizonDays = enrichedSignal?.signalType === 'breakout'
    ? 5
    : enrichedSignal?.signalType === 'trend-follow'
      ? 7
      : 3;

  const shouldHoldForProfile = confidenceScore < profileConfig.minConfidenceForAction;

  if (!Number.isFinite(price) || action === 'HOLD' || shouldHoldForProfile) {
    const watchTriggerBuy = Number.isFinite(price)
      ? price * (1 + (Math.max(0.7, volatility * 0.8) / 100))
      : null;
    const watchTriggerSell = Number.isFinite(price)
      ? price * (1 - (Math.max(0.7, volatility * 0.8) / 100))
      : null;

    const watchEntry = action === 'SELL' ? watchTriggerSell : (watchTriggerBuy ?? price);
    const watchRangeDelta = Number.isFinite(watchEntry) ? watchEntry * 0.004 : null;

    const watchStop = Number.isFinite(watchEntry)
      ? action === 'SELL'
        ? watchEntry * (1 + Math.max(0.8, baseStopPct * 0.65) / 100)
        : watchEntry * (1 - Math.max(0.8, baseStopPct * 0.65) / 100)
      : null;

    const watchTarget = Number.isFinite(watchEntry)
      ? action === 'SELL'
        ? watchEntry * (1 - Math.max(1.0, baseStopPct * 0.9) / 100)
        : watchEntry * (1 + Math.max(1.0, baseStopPct * 0.9) / 100)
      : null;

    return {
      stance: action === 'HOLD' ? 'wait' : 'observe',
      executable: false,
      watchOnly: true,
      entryPrice: toRoundedPrice(watchEntry),
      entryRangeLow: toRoundedPrice(Number.isFinite(watchEntry) && Number.isFinite(watchRangeDelta) ? watchEntry - watchRangeDelta : null),
      entryRangeHigh: toRoundedPrice(Number.isFinite(watchEntry) && Number.isFinite(watchRangeDelta) ? watchEntry + watchRangeDelta : null),
      stopLoss: toRoundedPrice(watchStop),
      targetPrice: toRoundedPrice(watchTarget),
      timeHorizonDays: horizonDays,
      suggestedPositionSizePct: Number(sizing.toFixed(1)),
      riskProfile: profile,
      rationale: shouldHoldForProfile
        ? `Risk profile ${profile} requires stronger confidence before execution. Use watch levels and execute only after confirmation.`
        : 'Signal quality is not strong enough for immediate execution. Monitor watch levels for confirmation.',
    };
  }

  const entryRangeDeltaPct = 0.5;
  const adjustedStopPct = clamp(
    (baseStopPct + exposurePenalty - confidenceBoost) * profileConfig.stopMultiplier,
    0.8,
    4.2
  );
  const rewardMultiplier = action === 'BUY' ? 1.9 : 1.7;
  const targetPct = adjustedStopPct * rewardMultiplier * profileConfig.targetMultiplier;

  const entryRangeLow = price * (1 - entryRangeDeltaPct / 100);
  const entryRangeHigh = price * (1 + entryRangeDeltaPct / 100);

  const stopLoss = action === 'BUY'
    ? price * (1 - adjustedStopPct / 100)
    : price * (1 + adjustedStopPct / 100);

  const targetPrice = action === 'BUY'
    ? price * (1 + targetPct / 100)
    : price * (1 - targetPct / 100);

  return {
    stance: action === 'BUY' ? 'accumulate' : 'reduce',
    executable: true,
    watchOnly: false,
    entryPrice: toRoundedPrice(price),
    entryRangeLow: toRoundedPrice(entryRangeLow),
    entryRangeHigh: toRoundedPrice(entryRangeHigh),
    stopLoss: toRoundedPrice(stopLoss),
    targetPrice: toRoundedPrice(targetPrice),
    stopDistancePct: Number(adjustedStopPct.toFixed(2)),
    targetDistancePct: Number(targetPct.toFixed(2)),
    timeHorizonDays: horizonDays,
    suggestedPositionSizePct: Number(sizing.toFixed(1)),
    riskProfile: profile,
    rationale: action === 'BUY'
      ? 'Trend/momentum alignment supports a staged long entry with defined downside.'
      : 'Weak structure favors risk reduction with tight invalidation.',
  };
}

function buildActionableAlert(enrichedSignal, symbolResult, options = {}) {
  const patternBacktests = Array.isArray(symbolResult?.pattern_intelligence?.patternBacktests)
    ? symbolResult.pattern_intelligence.patternBacktests
    : [];
  const primaryPattern = String(enrichedSignal?.patternType || (enrichedSignal?.signalType || '')).toLowerCase();
  const selectedPatternBacktest = patternBacktests.find((item) => String(item?.pattern || '').toLowerCase() === primaryPattern)
    || patternBacktests.find((item) => item?.pattern === 'breakout')
    || null;

  const fallbackBreakout = backtestBreakoutSuccessRate(symbolResult?.historical || []);
  const backtestSuccessRate = toFiniteNumber(selectedPatternBacktest?.successRate) ?? fallbackBreakout.successRate;
  const backtestSamples = Number(selectedPatternBacktest?.samples || fallbackBreakout.breakoutSamples || 0);
  const backtestHorizon = Number(selectedPatternBacktest?.horizonDays || fallbackBreakout.horizon || 0);
  const backtestLookback = Number(selectedPatternBacktest?.lookbackDays || fallbackBreakout.lookback || 0);
  const backtestPattern = String(selectedPatternBacktest?.pattern || 'breakout');
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
    backtestSuccessRate === null
      ? 'Insufficient history to compute pattern success rate.'
      : `Historical ${backtestPattern.replace(/-/g, ' ')} success rate: ${backtestSuccessRate}% over ${backtestSamples} samples.`,
    `Portfolio sector exposure for this symbol is ${enrichedSignal.sectorExposurePercent.toFixed(1)}%.`,
  ];

  const exposurePenalty = Math.min(30, Math.max(0, Math.round((enrichedSignal.sectorExposurePercent - 25) * 1.2)));
  const breakoutBonus = backtestSuccessRate === null ? 0 : Math.round(backtestSuccessRate / 8);
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

        const selectedRiskProfile = normalizeRiskProfile(options?.riskProfile);
        const executionPlan = buildExecutionPlan(action, confidence, symbolResult, enrichedSignal, selectedRiskProfile);

  return {
    symbol: enrichedSignal.symbol,
    resolvedSymbol: enrichedSignal.resolvedSymbol,
    action,
    confidence: confidence === null ? null : Math.round(confidence),
    signalType: enrichedSignal.signalType,
    patternType: enrichedSignal.patternType,
    patternLabel: enrichedSignal.patternLabel,
    signalStrength: enrichedSignal.signalStrength,
    priorityScore,
    backtestedSuccessRate: backtestSuccessRate,
    backtestPattern,
    backtestBreakoutSamples: backtestSamples,
    backtestLookback,
    backtestHorizon,
    patternBacktests,
    executionPlan,
    riskProfile: selectedRiskProfile,
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

function average(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) {
    return null;
  }

  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function buildAlphaEvidence(alerts, portfolioAnalysis) {
  const safeAlerts = Array.isArray(alerts) ? alerts : [];
  const totalSignals = safeAlerts.length;
  const actionableSignals = safeAlerts.filter((alert) => String(alert?.action || 'HOLD') !== 'HOLD');
  const highPrioritySignals = safeAlerts.filter((alert) => toFiniteNumber(alert?.priorityScore) >= 65);
  const avgConfidence = average(safeAlerts.map((alert) => toFiniteNumber(alert?.confidence)));
  const avgBacktest = average(safeAlerts.map((alert) => toFiniteNumber(alert?.backtestedSuccessRate)));

  // Composite proxy metric for quality when live realized PnL is unavailable.
  const estimatedEdgeScore = average(
    safeAlerts.map((alert) => {
      const confidence = toFiniteNumber(alert?.confidence) || 0;
      const priority = toFiniteNumber(alert?.priorityScore) || 0;
      const backtest = toFiniteNumber(alert?.backtestedSuccessRate) || 0;
      return (confidence * 0.35) + (priority * 0.4) + (backtest * 0.25);
    })
  );

  const bySignalType = Object.create(null);
  safeAlerts.forEach((alert) => {
    const key = String(alert?.signalType || 'unknown');
    if (!bySignalType[key]) {
      bySignalType[key] = [];
    }
    bySignalType[key].push(alert);
  });

  const signalTypeStats = Object.entries(bySignalType)
    .map(([signalType, items]) => {
      const avgTypeConfidence = average(items.map((item) => toFiniteNumber(item?.confidence)));
      const avgTypeBacktest = average(items.map((item) => toFiniteNumber(item?.backtestedSuccessRate)));
      return {
        signalType,
        count: items.length,
        avgConfidence: avgTypeConfidence === null ? null : Number(avgTypeConfidence.toFixed(1)),
        avgBacktestedSuccessRate: avgTypeBacktest === null ? null : Number(avgTypeBacktest.toFixed(1)),
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    totalSignals,
    actionableSignals: actionableSignals.length,
    highPrioritySignals: highPrioritySignals.length,
    estimatedEdgeScore: estimatedEdgeScore === null ? null : Number(estimatedEdgeScore.toFixed(1)),
    avgConfidence: avgConfidence === null ? null : Number(avgConfidence.toFixed(1)),
    avgBacktestedSuccessRate: avgBacktest === null ? null : Number(avgBacktest.toFixed(1)),
    totalSymbolsScanned: Array.isArray(portfolioAnalysis?.results) ? portfolioAnalysis.results.length : 0,
    signalTypeStats,
  };
}

async function runOpportunityRadar(inputRows, options = {}) {
  const normalizedRows = normalizePortfolioRows(inputRows);
  const selectedRiskProfile = normalizeRiskProfile(options?.riskProfile);

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
    return buildActionableAlert(signal, symbolResult || {}, {
      riskProfile: selectedRiskProfile,
    });
  });

  // Generate AI-powered portfolio insights
  const portfolioInsight = generatePortfolioInsights(portfolioAnalysis, alerts, normalizedRows);
  const alphaEvidence = buildAlphaEvidence(alerts, portfolioAnalysis);

  const payload = {
    workflow: [
      'detect_signal',
      'enrich_with_portfolio_context',
      'generate_actionable_alert',
    ],
    autonomous: true,
    riskProfile: selectedRiskProfile,
    portfolioInsight,
    alphaEvidence,
    generatedAt: new Date().toISOString(),
    scanScope: options?.scanScope || 'portfolio',
    portfolioRows: normalizedRows,
    alerts,
  };

  saveOpportunityRadarRun(payload);
  return payload;
}

async function runOpportunityRadarForUniverse(options = {}) {
  const limit = Number(options?.universeLimit || options?.limit || 0);
  const universeRows = getNseUniverseRows({ limit });

  if (!universeRows.length) {
    throw {
      statusCode: 400,
      message: 'NSE universe is empty. Configure stocks.json or NSE_UNIVERSE_FILE with NSE symbols.',
    };
  }

  const result = await runOpportunityRadar(universeRows, {
    ...options,
    scanScope: 'nse-universe',
  });

  return {
    ...result,
    universe: {
      requestedLimit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null,
      symbolsScanned: universeRows.length,
      totalConfiguredNseSymbols: getNseUniverseSymbols().length,
    },
  };
}

module.exports = {
  runOpportunityRadar,
  runOpportunityRadarForUniverse,
  getOpportunityRadarHistory,
};
