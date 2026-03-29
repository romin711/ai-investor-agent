const { analyzePortfolio, normalizePortfolioRows } = require('./pipeline');
const { getFinancialHealthScore } = require('./financialDataService');
const { getFinancialEventsEnhanced } = require('./financialDataService');
const { fetchFinancialNews, getMarketSummary } = require('./marketIntelService');
const { normalizeInputSymbol } = require('./symbolResolver');

const SYMBOL_ALIAS_MAP = {
  RELIANCE: ['ril', 'reliance industries', 'reliance'],
  INFY: ['infosys', 'infy'],
  TCS: ['tcs', 'tata consultancy services'],
  HDFCBANK: ['hdfc bank', 'hdfc'],
  ICICIBANK: ['icici bank', 'icici'],
  SBIN: ['sbi', 'state bank of india', 'sbin'],
  LT: ['l&t', 'l and t', 'larsen and toubro', 'lt'],
  ITC: ['itc'],
  AXISBANK: ['axis bank', 'axisbank'],
  TATASTEEL: ['tata steel', 'tatasteel'],
  ADANIPORTS: ['adani ports', 'adani ports and sez', 'adaniports'],
  IRCTC: ['irctc', 'indian railway catering'],
  TATAMOTORS: ['tata motors', 'tatamotors'],
};

const INTENT_KEYWORDS = {
  risk: ['risk', 'downside', 'drawdown', 'volatility', 'unsafe', 'danger'],
  why: ['why', 'reason', 'explain', 'rationale', 'because'],
  buyDecision: ['should i buy', 'can i buy', 'is it good to buy', 'buy or wait', 'buy this', 'buy infy', 'buy now'],
  actionNow: ['what now', 'what should i do', 'next step', 'next move', 'what to do now'],
  timing: ['enter now', 'entry', 'timing', 'now', 'buy now', 'sell now', 'when to enter', 'when should i enter'],
};

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeRows(inputRows) {
  if (!Array.isArray(inputRows) || !inputRows.length) {
    return [];
  }

  try {
    return normalizePortfolioRows(inputRows);
  } catch (_error) {
    return [];
  }
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectUserIntent(question) {
  const normalized = normalizeSearchText(question);
  const matches = (keywords) => keywords.some((keyword) => normalized.includes(keyword));

  if (matches(INTENT_KEYWORDS.risk)) {
    return 'risk';
  }
  if (matches(INTENT_KEYWORDS.why)) {
    return 'why';
  }
  if (matches(INTENT_KEYWORDS.buyDecision)) {
    return 'buy_decision';
  }
  if (matches(INTENT_KEYWORDS.actionNow)) {
    return 'action_now';
  }
  if (matches(INTENT_KEYWORDS.timing)) {
    return 'timing';
  }
  return 'decision';
}

function isBroadMarketQuestion(question) {
  const normalized = normalizeSearchText(question);
  const marketTerms = ['market', 'nifty', 'sensex', 'macro', 'index', 'broader market', 'overall market'];
  return marketTerms.some((term) => normalized.includes(term));
}

function isShortFollowUpQuestion(question) {
  const normalized = normalizeSearchText(question);
  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length > 7) {
    return false;
  }

  const knownIntent = detectUserIntent(question) !== 'decision';
  return knownIntent || tokens.length <= 4;
}

function levenshteinDistance(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  const dp = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));

  for (let i = 0; i <= left.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[left.length][right.length];
}

function fuzzyConfidence(input, candidate) {
  const left = normalizeSearchText(input).replace(/\s+/g, '');
  const right = normalizeSearchText(candidate).replace(/\s+/g, '');
  if (!left || !right) {
    return 0;
  }

  const distance = levenshteinDistance(left, right);
  const maxLen = Math.max(left.length, right.length);
  if (!maxLen) {
    return 0;
  }

  return Math.max(0, 1 - (distance / maxLen));
}

function baseSymbol(symbol) {
  return normalizeInputSymbol(symbol)
    .replace(/\.NS$/, '')
    .replace(/\.BO$/, '');
}

function buildSymbolDictionary(candidates = []) {
  const cleaned = Array.from(new Set((candidates || [])
    .map((item) => normalizeInputSymbol(item))
    .filter(Boolean)));

  return cleaned.map((symbol) => {
    const base = baseSymbol(symbol);
    const aliases = SYMBOL_ALIAS_MAP[base] || [];
    const tokens = Array.from(new Set([
      symbol,
      base,
      ...aliases,
    ].map((item) => normalizeSearchText(item)).filter(Boolean)));

    return {
      symbol,
      base,
      tokens,
    };
  });
}

function scoreSymbolCandidate(questionText, dictionaryEntry) {
  const normalizedQuestion = normalizeSearchText(questionText);
  const questionTokens = normalizedQuestion.split(' ').filter(Boolean);
  let bestScore = 0;
  let reason = 'no_match';

  dictionaryEntry.tokens.forEach((token) => {
    if (!token) {
      return;
    }

    if (normalizedQuestion.includes(token)) {
      const score = token.length >= 4 ? 0.98 : 0.9;
      if (score > bestScore) {
        bestScore = score;
        reason = 'direct_phrase';
      }
      return;
    }

    questionTokens.forEach((questionToken) => {
      const confidence = fuzzyConfidence(questionToken, token);
      if (confidence >= 0.8) {
        const score = Math.min(0.89, confidence);
        if (score > bestScore) {
          bestScore = score;
          reason = 'fuzzy_match';
        }
      }
    });
  });

  return {
    symbol: dictionaryEntry.symbol,
    confidence: Number(bestScore.toFixed(2)),
    reason,
  };
}

function extractRankedSymbols(question, candidates = [], sessionTurns = [], options = {}) {
  const dictionary = buildSymbolDictionary(candidates);
  const ranked = dictionary
    .map((entry) => scoreSymbolCandidate(question, entry))
    .filter((item) => item.confidence >= 0.55)
    .sort((left, right) => right.confidence - left.confidence);

  const strongExplicit = ranked.some((item) => item.confidence >= 0.8);
  const shouldPreferSession = Boolean(options?.preferSessionContext) && !strongExplicit;

  const latestTurn = Array.isArray(sessionTurns) && sessionTurns.length
    ? sessionTurns[sessionTurns.length - 1]
    : null;

  const priorSymbols = Array.isArray(latestTurn?.symbolsAnalyzed)
    ? latestTurn.symbolsAnalyzed.map((item) => normalizeInputSymbol(item)).filter(Boolean)
    : [];

  if (shouldPreferSession && priorSymbols.length) {
    const contextRanked = priorSymbols
      .map((symbol, index) => ({
        symbol,
        confidence: Number((Math.max(0.64, 0.82 - (index * 0.08))).toFixed(2)),
        reason: 'active_context',
      }))
      .slice(0, 4);

    return {
      ranked: contextRanked,
      symbols: contextRanked.map((item) => item.symbol),
      source: 'session',
      explicitInQuestion: false,
    };
  }

  if (ranked.length) {
    return {
      ranked,
      symbols: ranked.map((item) => item.symbol),
      source: 'question',
      explicitInQuestion: strongExplicit,
    };
  }

  if (priorSymbols.length) {
    const fallbackRanked = priorSymbols
      .map((symbol, index) => ({
        symbol,
        confidence: Number((Math.max(0.58, 0.78 - (index * 0.08))).toFixed(2)),
        reason: 'session_context',
      }))
      .slice(0, 4);

    return {
      ranked: fallbackRanked,
      symbols: fallbackRanked.map((item) => item.symbol),
      source: 'session',
      explicitInQuestion: false,
    };
  }

  const defaultSymbols = (candidates || []).slice(0, 4).map((item) => normalizeInputSymbol(item)).filter(Boolean);
  return {
    ranked: defaultSymbols.map((symbol) => ({ symbol, confidence: 0.52, reason: 'portfolio_default' })),
    symbols: defaultSymbols,
    source: 'portfolio',
    explicitInQuestion: false,
  };
}

function rankEvents(events) {
  const safe = Array.isArray(events) ? events : [];
  return safe
    .slice()
    .sort((left, right) => {
      const leftScore = Math.abs(Number(left?.impactScore || 0)) * Number(left?.recencyDecayFactor || 1);
      const rightScore = Math.abs(Number(right?.impactScore || 0)) * Number(right?.recencyDecayFactor || 1);
      return rightScore - leftScore;
    });
}

function buildAlertEventCitations(latestAlerts, focusSymbols) {
  const symbolSet = new Set(focusSymbols.map((item) => String(item).toUpperCase()));

  const citations = [];
  (Array.isArray(latestAlerts) ? latestAlerts : []).forEach((alert) => {
    const symbol = String(alert?.symbol || '').toUpperCase();
    if (!symbolSet.has(symbol)) {
      return;
    }

    const contextSignals = Array.isArray(alert?.contextSignals) ? alert.contextSignals : [];
    contextSignals.slice(0, 3).forEach((event) => {
      citations.push({
        source: event?.source || 'Market context event',
        symbol,
        title: event?.title || 'Context signal',
        date: event?.date || '',
        credibilityTier: event?.credibilityTier || 'community',
        endpoint: '/api/agent/opportunity-radar',
        url: event?.sourceUrl || '',
      });
    });
  });

  return citations;
}

function summarizePortfolio(analysisResult) {
  const results = Array.isArray(analysisResult?.results) ? analysisResult.results : [];
  if (!results.length) {
    return 'No portfolio analysis available.';
  }

  const buy = results.filter((item) => String(item?.decision || '').toUpperCase() === 'BUY').length;
  const sell = results.filter((item) => String(item?.decision || '').toUpperCase() === 'SELL').length;
  const hold = results.length - buy - sell;

  return `Portfolio scan across ${results.length} symbols: ${buy} BUY, ${hold} HOLD, ${sell} SELL.`;
}

function summarizeSymbol(symbol, analysisMap, healthMap, alertMap) {
  const analysis = analysisMap.get(symbol);
  const health = healthMap.get(symbol);
  const alert = alertMap.get(symbol);

  const decision = String(alert?.action || analysis?.decision || 'HOLD').toUpperCase();
  const confidence = toFiniteNumber(alert?.confidence ?? analysis?.confidence);
  const backtest = toFiniteNumber(alert?.backtestedSuccessRate);
  const healthScore = toFiniteNumber(health?.healthScore);

  const segments = [
    `${symbol}: ${decision}`,
    confidence === null ? 'confidence n/a' : `confidence ${Math.round(confidence)}%`,
    backtest === null ? 'pattern backtest n/a' : `pattern backtest ${backtest.toFixed(1)}%`,
    healthScore === null ? 'financial health n/a' : `financial health ${healthScore.toFixed(2)}`,
  ];

  return segments.join(', ');
}

function isConfiguredGeminiKey(value) {
  const key = String(value || '').trim();
  if (!key) {
    return false;
  }

  const lowered = key.toLowerCase();
  const placeholderPatterns = [
    'your_gemini_api_key_here',
    'replace_me',
    'changeme',
    'example',
  ];

  return !placeholderPatterns.some((pattern) => lowered.includes(pattern));
}

function trimText(value, maxLength = 2400) {
  const safe = String(value || '').trim();
  if (safe.length <= maxLength) {
    return safe;
  }
  return `${safe.slice(0, Math.max(0, maxLength - 3))}...`;
}

function buildConversationContext(sessionTurns = [], summarizedHistory = '') {
  if ((!Array.isArray(sessionTurns) || !sessionTurns.length) && !String(summarizedHistory || '').trim()) {
    return 'No prior conversation turns.';
  }

  const recentTurns = (Array.isArray(sessionTurns) ? sessionTurns : []).slice(-3);
  const formatted = recentTurns.map((turn, index) => {
    const question = trimText(turn?.question || '', 400);
    const answer = trimText(turn?.answer || '', 700);
    return `Turn ${index + 1}\nQuestion: ${question || 'n/a'}\nAnswer: ${answer || 'n/a'}`;
  });

  if (String(summarizedHistory || '').trim()) {
    formatted.unshift(`Summary: ${trimText(summarizedHistory, 350)}`);
  }

  return formatted.join('\n\n');
}

function sentenceChunks(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizeAdvisorText(text) {
  return String(text || '')
    .replace(/\bnse\s+universe\s+scan\b/gi, 'market scan')
    .replace(/\bupdated\s+\d{4}-\d{2}-\d{2}[^,\n]*/gi, '')
    .replace(/\b\d+\s+symbols?\b/gi, 'broad coverage')
    .replace(/\b\d+\s+actionable\s+alerts?\b/gi, 'high-conviction setups')
    .replace(/\bapi\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function formatRiskLevel(level) {
  const safe = String(level || '').toLowerCase();
  if (safe === 'high') return 'High';
  if (safe === 'moderate') return 'Medium';
  if (safe === 'low') return 'Low';
  return 'Medium';
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const numeric = toFiniteNumber(value);
    if (numeric !== null) {
      return numeric;
    }
  }
  return null;
}

function deriveSignalContext(context = {}) {
  const activeSymbol = String(context?.activeSymbol || '').toUpperCase();
  const fallbackSymbol = String(context?.topAlert?.symbol || context?.focusSymbols?.[0] || '').toUpperCase();
  const symbol = activeSymbol || fallbackSymbol || 'PORTFOLIO';

  const analysis = symbol ? context?.analysisMap?.get(symbol) : null;
  const alert = symbol ? context?.alertMap?.get(symbol) : null;
  const health = symbol ? context?.healthMap?.get(symbol) : null;
  const trend = String(alert?.trend || analysis?.trend || 'neutral').toLowerCase();
  const action = String(alert?.action || analysis?.decision || 'HOLD').toUpperCase();
  const analysisAction = String(analysis?.decision || '').toUpperCase();
  const signalConflict = Boolean(action && analysisAction && action !== analysisAction);
  const confidence = firstFiniteNumber(alert?.confidence, analysis?.confidence);
  const backtest = firstFiniteNumber(alert?.backtestedSuccessRate, analysis?.backtestedSuccessRate);
  const healthScore = firstFiniteNumber(health?.healthScore, analysis?.healthScore);
  const momentum = firstFiniteNumber(analysis?.momentum_percent, alert?.momentum_percent, alert?.momentum);
  const volatilityPct = firstFiniteNumber(analysis?.volatility_percent, alert?.volatility_percent, alert?.volatility);
  const currentPrice = firstFiniteNumber(
    alert?.currentPrice,
    alert?.price,
    alert?.ltp,
    analysis?.current_price,
    analysis?.currentPrice,
    analysis?.close,
    analysis?.lastPrice
  );
  const stopLoss = firstFiniteNumber(alert?.executionPlan?.stopLoss, alert?.stopLoss, analysis?.stopLoss);
  const target = firstFiniteNumber(alert?.executionPlan?.targetPrice, alert?.targetPrice, analysis?.targetPrice);
  const entryLow = firstFiniteNumber(alert?.executionPlan?.entryRangeLow, alert?.executionPlan?.entryRange?.start, analysis?.entry_low);
  const entryHigh = firstFiniteNumber(alert?.executionPlan?.entryRangeHigh, alert?.executionPlan?.entryRange?.end, analysis?.entry_high);
  const supportDistancePct = currentPrice !== null && currentPrice > 0 && stopLoss !== null
    ? Math.abs(((currentPrice - stopLoss) / currentPrice) * 100)
    : null;

  return {
    symbol,
    analysis,
    alert,
    action,
    trend,
    confidence,
    backtest,
    healthScore,
    momentum,
    volatilityPct,
    currentPrice,
    stopLoss,
    target,
    entryLow,
    entryHigh,
    supportDistancePct,
    signalConflict,
  };
}

function deriveStructuredDownsideRisk(signalContext = {}, topNews = []) {
  const trend = String(signalContext?.trend || 'neutral').toLowerCase();
  const momentum = toFiniteNumber(signalContext?.momentum);
  const healthScore = toFiniteNumber(signalContext?.healthScore);
  const volatilityPct = toFiniteNumber(signalContext?.volatilityPct);
  const supportDistancePct = toFiniteNumber(signalContext?.supportDistancePct);
  const signalConflict = Boolean(signalContext?.signalConflict);
  const symbol = String(signalContext?.symbol || 'PORTFOLIO').toUpperCase();
  const action = String(signalContext?.action || 'HOLD').toUpperCase();

  const bearishNews = (Array.isArray(topNews) ? topNews : []).filter((item) => String(item?.bias || '').toLowerCase().includes('bear')).length;
  const bullishNews = (Array.isArray(topNews) ? topNews : []).filter((item) => String(item?.bias || '').toLowerCase().includes('bull')).length;

  let downsideScore = 0;
  const reasons = [];

  if (trend === 'downtrend') {
    downsideScore += 2;
    reasons.push('trend strength is weak');
  } else if (trend === 'neutral') {
    downsideScore += 1;
    reasons.push('trend is sideways without strong momentum');
  } else {
    reasons.push('trend is constructive');
  }

  if (momentum !== null && momentum < 0) {
    downsideScore += 1;
    reasons.push(`momentum is negative (${momentum.toFixed(2)}%)`);
  } else if (momentum !== null) {
    reasons.push(`momentum is positive (${momentum.toFixed(2)}%)`);
  }

  if (volatilityPct !== null) {
    if (Math.abs(volatilityPct) >= 3.2) {
      downsideScore += 2;
      reasons.push(`volatility is elevated (${Math.abs(volatilityPct).toFixed(2)}%)`);
    } else if (Math.abs(volatilityPct) >= 2.2) {
      downsideScore += 1;
      reasons.push(`volatility is moderate (${Math.abs(volatilityPct).toFixed(2)}%)`);
    } else {
      reasons.push(`volatility is contained (${Math.abs(volatilityPct).toFixed(2)}%)`);
    }
  } else {
    downsideScore += 1;
    reasons.push('volatility clarity is limited');
  }

  if (supportDistancePct !== null) {
    if (supportDistancePct > 6) {
      downsideScore += 2;
      reasons.push(`nearest risk boundary is far (${supportDistancePct.toFixed(1)}% away)`);
    } else if (supportDistancePct > 3) {
      downsideScore += 1;
      reasons.push(`support is not very close (${supportDistancePct.toFixed(1)}% away)`);
    } else {
      reasons.push(`support is close (${supportDistancePct.toFixed(1)}% away)`);
    }
  } else {
    downsideScore += 1;
    reasons.push('support proximity is not well-defined');
  }

  if (healthScore !== null && healthScore < 0) {
    downsideScore += 1;
    reasons.push('financial health is below neutral');
  }

  if (signalConflict) {
    downsideScore += 1;
    reasons.push('signals disagree across models');
  }

  if (bearishNews > bullishNews) {
    downsideScore += 1;
    reasons.push('news flow leans bearish');
  }

  if (action === 'SELL') {
    downsideScore += 1;
  }

  const probability = downsideScore >= 7 ? 'high' : downsideScore >= 4 ? 'moderate' : 'low';
  const summary = `${symbol} has ${probability} downside probability due to ${reasons.slice(0, 3).join(', ')}.`;

  return {
    probability,
    score: downsideScore,
    summary,
    reasons,
  };
}

function deriveConvictionLabel(signalContext = {}, downsideRisk = {}) {
  const confidence = toFiniteNumber(signalContext?.confidence);
  const backtest = toFiniteNumber(signalContext?.backtest);
  const probability = String(downsideRisk?.probability || '').toLowerCase();
  const signalConflict = Boolean(signalContext?.signalConflict);

  let score = 0;
  if (confidence !== null) {
    if (confidence >= 75) score += 2;
    else if (confidence >= 60) score += 1;
    else if (confidence < 50) score -= 1;
  }
  if (backtest !== null) {
    if (backtest >= 62) score += 1;
    else if (backtest < 50) score -= 1;
  }
  if (probability === 'low') score += 1;
  if (probability === 'high') score -= 2;
  if (signalConflict) score -= 1;

  if (score >= 3) return 'High';
  if (score >= 1) return 'Moderate';
  return 'Low';
}

function buildSymbolRiskSummary(activeSymbol, analysisMap, healthMap, alertMap, topNews = []) {
  const signalContext = deriveSignalContext({
    activeSymbol,
    analysisMap,
    healthMap,
    alertMap,
  });
  const downsideRisk = deriveStructuredDownsideRisk(signalContext, topNews);
  return downsideRisk.summary;
}

function buildAnalyticalWhyBullets(context = {}) {
  const symbol = String(context?.activeSymbol || '').toUpperCase();
  const analysis = symbol ? context?.analysisMap?.get(symbol) : null;
  const alert = symbol ? context?.alertMap?.get(symbol) : null;
  const health = symbol ? context?.healthMap?.get(symbol) : null;
  const intent = String(context?.intent || 'decision').toLowerCase();

  const trend = String(alert?.trend || analysis?.trend || 'neutral').toLowerCase();
  const action = String(alert?.action || analysis?.decision || 'HOLD').toUpperCase();
  const momentum = toFiniteNumber(analysis?.momentum_percent);
  const healthScore = toFiniteNumber(health?.healthScore);
  const backtest = toFiniteNumber(alert?.backtestedSuccessRate);

  const bullets = [];
  if (symbol) {
    bullets.push(`${symbol} currently leans ${action} with ${trend === 'neutral' ? 'flat' : trend} structure, which frames short-term direction.`);
  }

  if (Number.isFinite(momentum)) {
    bullets.push(`Momentum is ${momentum >= 0 ? 'positive' : 'negative'} at ${momentum.toFixed(2)}%, so follow-through ${momentum >= 0 ? 'has support' : 'is vulnerable'}.`);
  }

  if (Number.isFinite(healthScore)) {
    bullets.push(`Financial health is ${healthScore >= 0 ? 'supportive' : 'fragile'} (${healthScore.toFixed(2)}), which ${healthScore >= 0 ? 'backs dips' : 'raises downside sensitivity'}.`);
  }

  if (Number.isFinite(backtest)) {
    bullets.push(`Pattern reliability is ${backtest.toFixed(1)}%, so conviction should ${backtest >= 60 ? 'stay constructive' : 'stay measured'}.`);
  }

  if (intent === 'risk') {
    bullets.unshift(buildSymbolRiskSummary(symbol, context.analysisMap || new Map(), context.healthMap || new Map(), context.alertMap || new Map(), context.topNews || []));
  }

  return bullets
    .map((item) => sanitizeAdvisorText(item))
    .filter((item) => item && !/data unavailable|could not fetch|system/i.test(item))
    .slice(0, 3);
}

function buildExecutionActionBullets(topAlert, riskLevel = 'Medium') {
  if (!topAlert) {
    return [
      'Wait for price to break and hold above resistance before taking fresh long exposure.',
      `Use only partial size until portfolio risk drops below ${riskLevel}.`,
    ];
  }

  const symbol = String(topAlert?.symbol || '').toUpperCase() || 'the focus symbol';
  const action = String(topAlert?.action || 'HOLD').toUpperCase();
  const rsi = toFiniteNumber(topAlert?.rsi);
  const stopLoss = toFiniteNumber(topAlert?.executionPlan?.stopLoss);
  const target = toFiniteNumber(topAlert?.executionPlan?.targetPrice);
  const entryLow = toFiniteNumber(topAlert?.executionPlan?.entryRangeLow);
  const entryHigh = toFiniteNumber(topAlert?.executionPlan?.entryRangeHigh);

  if (action === 'BUY') {
    const buyCondition = entryLow !== null && entryHigh !== null
      ? `Enter ${symbol} only inside ${entryLow.toFixed(2)}-${entryHigh.toFixed(2)}; skip if price extends above this zone.`
      : `Accumulate ${symbol} gradually after confirmation candles; avoid lump-sum entry.`;

    const riskGuard = stopLoss !== null
      ? `Place stop below ${stopLoss.toFixed(2)} and cut risk immediately on a close below support.`
      : `Place a hard stop below structural support and exit if support fails on close.`;

    const trigger = rsi !== null
      ? `If RSI drops below ${Math.max(35, Math.round(rsi - 10))}, pause adds and reassess momentum before re-entry.`
      : 'If momentum weakens while breadth deteriorates, reduce size instead of averaging down.';

    return [buyCondition, riskGuard, target !== null ? `Book partial profits near ${target.toFixed(2)} and trail the remainder.` : trigger].slice(0, 3);
  }

  if (action === 'SELL') {
    return [
      `Reduce ${symbol} on strength and avoid fresh longs until trend stabilizes.`,
      stopLoss !== null
        ? `If price reclaims ${stopLoss.toFixed(2)} with volume, stop selling and reassess.`
        : 'If price reclaims key resistance with volume, stop selling and reassess.',
      `Given ${riskLevel} portfolio risk, prioritize de-risking concentrated positions first.`,
    ].slice(0, 3);
  }

  return [
    `Hold ${symbol} and wait for a validated breakout trigger before committing capital.`,
    stopLoss !== null
      ? `If price closes below ${stopLoss.toFixed(2)}, reduce exposure immediately and reassess.`
      : 'If support breaks on closing basis, cut exposure and wait for trend repair.',
    `Re-enter only when momentum aligns with trend and risk remains below ${riskLevel}.`,
  ].slice(0, 3);
}

function removeLeadingSectionLabel(text) {
  return String(text || '').replace(/^(primary\s+signal|answer|why|action)\s*:\s*/i, '').trim();
}

function normalizeLineFingerprint(text) {
  return removeLeadingSectionLabel(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasTrailingConnector(text) {
  return /\b(and|or|because|with|to|for|if|when|while|but|so)\s*$/i.test(String(text || '').trim());
}

function isPotentiallyIncompleteSentence(text) {
  const safe = String(text || '').trim();
  if (!safe || safe.length < 8) {
    return true;
  }
  if (/[:;,/-]\s*$/.test(safe)) {
    return true;
  }
  if (safe.endsWith('...')) {
    return true;
  }
  if (hasTrailingConnector(safe)) {
    return true;
  }

  const openParen = (safe.match(/\(/g) || []).length;
  const closeParen = (safe.match(/\)/g) || []).length;
  return openParen !== closeParen;
}

function finalizeSentence(text) {
  const normalized = sanitizeAdvisorText(removeLeadingSectionLabel(String(text || '').replace(/^[-*]\s*/, '')));
  if (!normalized) {
    return '';
  }

  const compact = normalized.replace(/\s+/g, ' ').trim();
  if (isPotentiallyIncompleteSentence(compact)) {
    if (/[:;,/-]\s*$/.test(compact)) {
      return `${compact.replace(/[:;,/-]\s*$/, '').trim()}.`;
    }
    return '';
  }

  if (/[.!?]$/.test(compact)) {
    return compact;
  }
  return `${compact}.`;
}

function dedupeAndLimit(lines = [], limit = 3) {
  const out = [];
  const seen = new Set();
  (Array.isArray(lines) ? lines : []).forEach((line) => {
    const safe = finalizeSentence(line);
    if (!safe) return;
    const fingerprint = normalizeLineFingerprint(safe);
    if (!fingerprint || seen.has(fingerprint)) return;
    seen.add(fingerprint);
    out.push(safe);
  });
  return out.slice(0, limit);
}

function parseStructuredAnswer(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const out = {
    primarySignal: '',
    answer: '',
    why: [],
    action: [],
  };

  let mode = '';
  lines.forEach((line) => {
    const lower = line.toLowerCase();
    if (lower.startsWith('primary signal:')) {
      if (!out.primarySignal) {
        out.primarySignal = removeLeadingSectionLabel(line);
      }
      mode = 'primary';
      return;
    }
    if (lower.startsWith('answer:')) {
      if (!out.answer) {
        out.answer = removeLeadingSectionLabel(line);
      }
      mode = 'answer';
      return;
    }
    if (lower.startsWith('why:')) {
      mode = 'why';
      return;
    }
    if (lower.startsWith('action:')) {
      mode = 'action';
      return;
    }

    if (!/^[-*]\s*/.test(line)) {
      return;
    }

    const bullet = removeLeadingSectionLabel(line.replace(/^[-*]\s*/, ''));
    if (!bullet) return;
    if (mode === 'why') out.why.push(bullet);
    if (mode === 'action') out.action.push(bullet);
  });

  return out;
}

function looksShallowReasoningLine(text) {
  const safe = String(text || '').toLowerCase();
  if (!safe) return true;
  const weakPatterns = [
    'data unavailable',
    'system',
    'market is mixed',
    'be cautious',
    'monitor',
    'watch closely',
    'no clear signal',
    'current market',
    'based on data',
  ];
  return weakPatterns.some((pattern) => safe.includes(pattern));
}

function decisionFromText(text, fallback = 'HOLD') {
  const safe = String(text || '').toUpperCase();
  if (safe.includes('BUY')) return 'BUY';
  if (safe.includes('SELL')) return 'SELL';
  if (safe.includes('HOLD')) return 'HOLD';
  return String(fallback || 'HOLD').toUpperCase();
}

function buildSymbolSpecificPrimarySignal(signalContext, downsideRisk, parsedPrimarySignal = '') {
  const symbol = String(signalContext?.symbol || 'PORTFOLIO').toUpperCase();
  const decision = decisionFromText(parsedPrimarySignal, signalContext?.action || 'HOLD');
  const conviction = deriveConvictionLabel(signalContext, downsideRisk);
  return `${symbol}: ${decision} (${conviction} Conviction)`;
}

function buildIntentAwareAnswerLine(context, signalContext, downsideRisk, parsedAnswer = '') {
  const intent = String(context?.intent || 'decision').toLowerCase();
  const symbol = String(signalContext?.symbol || 'PORTFOLIO').toUpperCase();
  const action = String(signalContext?.action || 'HOLD').toUpperCase();
  const downside = String(downsideRisk?.probability || 'moderate').toLowerCase();
  const parsed = finalizeSentence(parsedAnswer);
  if (parsed && !looksShallowReasoningLine(parsed)) {
    return parsed;
  }

  if (intent === 'risk') {
    return finalizeSentence(`${symbol} carries ${downside} downside probability, so protection and defined exits should drive execution.`);
  }
  if (intent === 'why') {
    return finalizeSentence(`${symbol} is ${action} because trend, momentum, and setup reliability are not equally strong right now.`);
  }
  if (intent === 'buy_decision') {
    if (action === 'BUY' && downside !== 'high') {
      return finalizeSentence(`Buy ${symbol} only on confirmation and avoid chasing extended candles.`);
    }
    return finalizeSentence(`Do not buy ${symbol} yet because upside confirmation is still weak versus risk.`);
  }
  if (intent === 'action_now') {
    return finalizeSentence(`For ${symbol}, follow a ${action} stance now with strict position control.`);
  }
  if (intent === 'timing') {
    return finalizeSentence(`${symbol} needs confirmation before timing an aggressive entry.`);
  }

  if (action === 'BUY') {
    return finalizeSentence(`Bias remains BUY on ${symbol}, but execution should stay staged and risk-first.`);
  }
  if (action === 'SELL') {
    return finalizeSentence(`${symbol} remains in a SELL posture, so preserving capital takes priority over dip buying.`);
  }
  return finalizeSentence(`${symbol} is a HOLD for now while waiting for a cleaner reward-to-risk setup.`);
}

function buildIntentAwareWhyBullets(context, signalContext, downsideRisk, parsedWhy = []) {
  const intent = String(context?.intent || 'decision').toLowerCase();
  const symbol = String(signalContext?.symbol || 'PORTFOLIO').toUpperCase();
  const action = String(signalContext?.action || 'HOLD').toUpperCase();
  const trend = String(signalContext?.trend || 'neutral').toLowerCase();
  const momentum = toFiniteNumber(signalContext?.momentum);
  const volatilityPct = toFiniteNumber(signalContext?.volatilityPct);
  const supportDistancePct = toFiniteNumber(signalContext?.supportDistancePct);
  const backtest = toFiniteNumber(signalContext?.backtest);
  const downside = String(downsideRisk?.probability || 'moderate').toLowerCase();

  const modelWhy = dedupeAndLimit((Array.isArray(parsedWhy) ? parsedWhy : [])
    .filter((line) => !looksShallowReasoningLine(line)), 2);

  const generated = [];
  const trendPhrase = trend === 'uptrend' ? 'uptrend' : trend === 'downtrend' ? 'downtrend' : 'sideways trend';
  generated.push(`${symbol} structure is ${trendPhrase}${momentum !== null ? ` with momentum at ${momentum.toFixed(2)}%` : ''}.`);
  generated.push(downsideRisk?.summary || `${symbol} has ${downside} downside probability based on trend, volatility, and support behavior.`);

  if (volatilityPct !== null) {
    generated.push(`Volatility is ${Math.abs(volatilityPct) >= 3 ? 'elevated' : 'contained'} at ${Math.abs(volatilityPct).toFixed(2)}%, which directly affects stop distance and position size.`);
  }

  if (backtest !== null) {
    generated.push(`Pattern reliability is ${backtest.toFixed(1)}%, so conviction should stay ${backtest >= 60 ? 'constructive' : 'measured'}.`);
  }

  if (supportDistancePct !== null) {
    generated.push(`Nearest risk boundary is ${supportDistancePct.toFixed(1)}% away, setting practical downside room for this setup.`);
  }

  if (intent === 'buy_decision' && action !== 'BUY') {
    generated.push(`${symbol} is not a buy yet because breakout confirmation and upside catalyst strength are still limited.`);
  }
  if (intent === 'risk') {
    generated.push(`${symbol} risk view prioritizes downside containment over upside capture until alignment improves.`);
  }
  if (intent === 'why') {
    generated.push(`${action} is driven by current evidence balance, not by a single indicator in isolation.`);
  }

  return dedupeAndLimit([...modelWhy, ...generated], 3);
}

function buildIntentAwareActionBullets(context, signalContext, downsideRisk, parsedAction = []) {
  const intent = String(context?.intent || 'decision').toLowerCase();
  const symbol = String(signalContext?.symbol || 'PORTFOLIO').toUpperCase();
  const action = String(signalContext?.action || 'HOLD').toUpperCase();
  const downside = String(downsideRisk?.probability || 'moderate').toLowerCase();
  const stopLoss = toFiniteNumber(signalContext?.stopLoss);
  const target = toFiniteNumber(signalContext?.target);
  const entryLow = toFiniteNumber(signalContext?.entryLow);
  const entryHigh = toFiniteNumber(signalContext?.entryHigh);

  const modelActions = dedupeAndLimit((Array.isArray(parsedAction) ? parsedAction : [])
    .filter((line) => !looksShallowReasoningLine(line)), 2);

  const generated = [];
  if (action === 'BUY') {
    if (entryLow !== null && entryHigh !== null) {
      generated.push(`Enter ${symbol} inside ${entryLow.toFixed(2)}-${entryHigh.toFixed(2)} and avoid chasing above that band.`);
    } else {
      generated.push(`Enter ${symbol} only after confirmation candles; keep entry staggered instead of lump-sum.`);
    }
    generated.push(stopLoss !== null
      ? `Keep a hard stop near ${stopLoss.toFixed(2)} and exit if support fails on close.`
      : `Keep a hard stop below structure and exit quickly if price closes below support.`);
    generated.push(target !== null
      ? `Take partial profit near ${target.toFixed(2)} and trail remaining size.`
      : `Scale out on strength rather than waiting for a single all-or-none target.`);
  } else if (action === 'SELL') {
    generated.push(`Reduce ${symbol} into strength and avoid fresh long entries until trend repairs.`);
    generated.push(stopLoss !== null
      ? `If price reclaims ${stopLoss.toFixed(2)} with volume, pause further selling and reassess.`
      : `If price reclaims key resistance with volume, pause further selling and reassess.`);
    generated.push(`Rotate released capital toward stronger relative-strength names instead of forcing this setup.`);
  } else {
    generated.push(`Hold ${symbol} and wait for a valid breakout or reversal confirmation before adding.`);
    generated.push(stopLoss !== null
      ? `If price closes below ${stopLoss.toFixed(2)}, reduce exposure and re-evaluate structure.`
      : `If support breaks on close, cut exposure and wait for trend repair.`);
    generated.push(`Re-enter only after momentum aligns with trend and the setup improves on reward-to-risk.`);
  }

  if (intent === 'risk') {
    generated.unshift(downside === 'high'
      ? `Avoid aggressive entries in ${symbol}; use reduced size with tight invalidation.`
      : `Size ${symbol} conservatively and keep loss limits predefined before entry.`);
  }
  if (intent === 'buy_decision' && action !== 'BUY') {
    generated.unshift(`Wait for a breakout trigger before buying ${symbol}; current setup does not justify immediate entry.`);
  }
  if (intent === 'action_now') {
    generated.unshift(`Immediate step: execute the ${action} plan on ${symbol} only if your stop level is pre-defined.`);
  }

  return dedupeAndLimit([...modelActions, ...generated], 3);
}

function applyLogicalConsistencyRules(answerParts, signalContext, downsideRisk, context) {
  const symbol = String(signalContext?.symbol || 'PORTFOLIO').toUpperCase();
  const action = String(signalContext?.action || decisionFromText(answerParts?.primarySignal, 'HOLD')).toUpperCase();
  const downside = String(downsideRisk?.probability || 'moderate').toLowerCase();
  const why = Array.isArray(answerParts?.why) ? answerParts.why.slice() : [];
  const actionBullets = Array.isArray(answerParts?.action) ? answerParts.action.slice() : [];

  if (downside === 'low' && action !== 'BUY') {
    const hasLowRiskNoBuyReason = why.some((line) => /\b(upside|catalyst|range|sideways|breakout)\b/i.test(line));
    if (!hasLowRiskNoBuyReason) {
      why.push(`${symbol} downside appears limited, but upside catalysts are weak and price is still range-bound, so no immediate buy trigger exists.`);
    }
  }

  if (downside === 'high') {
    const hasTightRiskAction = actionBullets.some((line) => /\b(stop|avoid|reduce|cut|size)\b/i.test(line));
    if (!hasTightRiskAction) {
      actionBullets.unshift(`Use tight stop-loss discipline on ${symbol} and reduce position size until downside pressure eases.`);
    }
  }

  if (action === 'SELL') {
    for (let i = 0; i < actionBullets.length; i += 1) {
      if (/\b(accumulate|fresh buy|buy now|add aggressively)\b/i.test(actionBullets[i])) {
        actionBullets[i] = `Avoid new buys in ${symbol} until the SELL signal is invalidated by price and volume.`;
      }
    }
  }

  if (action === 'HOLD') {
    for (let i = 0; i < actionBullets.length; i += 1) {
      if (/\b(buy now|enter immediately|aggressive buy)\b/i.test(actionBullets[i])) {
        actionBullets[i] = `Wait for breakout confirmation before converting ${symbol} from HOLD to BUY.`;
      }
    }
  }

  if (action === 'BUY' && downside === 'high') {
    actionBullets.unshift(`Treat ${symbol} as a defensive BUY: half size, hard stop, and no averaging down.`);
  }

  return {
    ...answerParts,
    primarySignal: buildSymbolSpecificPrimarySignal(signalContext, downsideRisk, answerParts?.primarySignal),
    answer: buildIntentAwareAnswerLine(context, signalContext, downsideRisk, answerParts?.answer),
    why: dedupeAndLimit(why, 3),
    action: dedupeAndLimit(actionBullets, 3),
  };
}

function renderStructuredAnswer(parts = {}) {
  const primarySignal = removeLeadingSectionLabel(parts?.primarySignal || 'PORTFOLIO: HOLD (Low Conviction)');
  const answer = removeLeadingSectionLabel(parts?.answer || 'Use selective execution with strict risk controls.');
  const why = dedupeAndLimit(parts?.why || [], 3);
  const action = dedupeAndLimit(parts?.action || [], 3);
  const answerLine = finalizeSentence(answer) || 'Use selective execution with strict risk controls.';

  const safeWhy = why.length ? why : ['Evidence is mixed, so conviction is measured and risk must stay defined.'];
  const safeAction = action.length ? action : ['Wait for cleaner alignment before taking aggressive exposure.'];

  return [
    `PRIMARY SIGNAL: ${primarySignal}`,
    `Answer: ${answerLine}`,
    'Why:',
    ...safeWhy.map((line) => `- ${line}`),
    'Action:',
    ...safeAction.map((line) => `- ${line}`),
  ].join('\n');
}

function validateStructuredAdvisorAnswer(text) {
  const safe = String(text || '').trim();
  const issues = [];
  if (!safe) {
    return { isValid: false, issues: ['empty_response'] };
  }

  const lines = safe.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const headerCounts = {
    primary: lines.filter((line) => /^primary\s+signal\s*:/i.test(line)).length,
    answer: lines.filter((line) => /^answer\s*:/i.test(line)).length,
    why: lines.filter((line) => /^why\s*:/i.test(line)).length,
    action: lines.filter((line) => /^action\s*:/i.test(line)).length,
  };

  Object.entries(headerCounts).forEach(([key, count]) => {
    if (count !== 1) {
      issues.push(`header_${key}_${count === 0 ? 'missing' : 'duplicate'}`);
    }
  });

  if (!/^primary\s+signal\s*:/i.test(lines[0] || '')) {
    issues.push('primary_signal_not_top');
  }

  const firstIndices = {
    primary: lines.findIndex((line) => /^primary\s+signal\s*:/i.test(line)),
    answer: lines.findIndex((line) => /^answer\s*:/i.test(line)),
    why: lines.findIndex((line) => /^why\s*:/i.test(line)),
    action: lines.findIndex((line) => /^action\s*:/i.test(line)),
  };
  const ordered = firstIndices.primary < firstIndices.answer
    && firstIndices.answer < firstIndices.why
    && firstIndices.why < firstIndices.action;
  if (!ordered) {
    issues.push('section_order_invalid');
  }

  let mode = '';
  lines.forEach((line) => {
    if (/^why\s*:/i.test(line)) {
      mode = 'why';
      return;
    }
    if (/^action\s*:/i.test(line)) {
      mode = 'action';
      return;
    }
    if (/^(primary\s+signal|answer)\s*:/i.test(line)) {
      mode = '';
      return;
    }
    if ((mode === 'why' || mode === 'action') && !/^[-*]\s+\S/.test(line)) {
      issues.push('malformed_bullet');
    }
  });

  const parsed = parseStructuredAnswer(safe);
  const whyBullets = parsed.why || [];
  const actionBullets = parsed.action || [];

  if (!whyBullets.length) issues.push('why_empty');
  if (!actionBullets.length) issues.push('action_empty');

  [...whyBullets, ...actionBullets, parsed.answer, parsed.primarySignal].forEach((line) => {
    const clean = String(line || '').trim();
    if (!clean) {
      issues.push('empty_line');
      return;
    }
    if (/^(primary\s+signal|answer|why|action)\s*:/i.test(clean)) {
      issues.push('duplicate_label_inside_section');
    }
    if (isPotentiallyIncompleteSentence(clean)) {
      issues.push('partial_sentence');
    }
  });

  return {
    isValid: issues.length === 0,
    issues,
  };
}

function isStructuredAdvisorAnswer(text) {
  return validateStructuredAdvisorAnswer(text).isValid;
}

function buildCanonicalStructuredAnswer(rawAnswer, context = {}) {
  const safe = trimText(rawAnswer || '', 2200);
  const parsed = parseStructuredAnswer(safe);
  const signalContext = deriveSignalContext(context);
  const downsideRisk = deriveStructuredDownsideRisk(signalContext, context?.topNews || []);

  const initialWhy = buildIntentAwareWhyBullets(context, signalContext, downsideRisk, parsed.why);
  const initialAction = buildIntentAwareActionBullets(context, signalContext, downsideRisk, parsed.action);

  const consistent = applyLogicalConsistencyRules({
    primarySignal: parsed.primarySignal,
    answer: parsed.answer,
    why: initialWhy,
    action: initialAction,
  }, signalContext, downsideRisk, context);

  return renderStructuredAnswer(consistent);
}

function ensureStructuredAdvisorAnswer(rawAnswer, context = {}) {
  const normalized = buildCanonicalStructuredAnswer(rawAnswer, context);
  const validation = validateStructuredAdvisorAnswer(normalized);
  if (validation.isValid) {
    return normalized;
  }

  const regenerated = buildCanonicalStructuredAnswer('', context);
  const regenValidation = validateStructuredAdvisorAnswer(regenerated);
  if (regenValidation.isValid) {
    return regenerated;
  }

  return renderStructuredAnswer({
    primarySignal: buildSymbolSpecificPrimarySignal(
      deriveSignalContext(context),
      deriveStructuredDownsideRisk(deriveSignalContext(context), context?.topNews || [])
    ),
    answer: 'Use strict risk controls and wait for higher-quality alignment before aggressive execution.',
    why: ['Current evidence is incomplete for a high-conviction directional bet.'],
    action: ['Trade smaller and keep hard stop-loss levels in place.'],
  });
}

function clampPercent(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return null;
  }
  return Math.max(0, Math.min(100, numeric));
}

function computeNewsSentimentScore(topNews = []) {
  const news = Array.isArray(topNews) ? topNews : [];
  if (!news.length) {
    return 0;
  }

  const aggregate = news.slice(0, 5).reduce((acc, item) => {
    const bias = String(item?.bias || '').toLowerCase();
    if (bias.includes('bull')) return acc + 1;
    if (bias.includes('bear')) return acc - 1;
    return acc;
  }, 0);

  return Math.max(-1, Math.min(1, aggregate / Math.max(1, Math.min(5, news.length))));
}

function buildScoreBreakdown(topAlert, healthMap, focusSymbols, topNews, decisionIntel) {
  const symbol = String(topAlert?.symbol || focusSymbols?.[0] || '').toUpperCase();
  const healthScoreRaw = toFiniteNumber(healthMap.get(symbol)?.healthScore);
  const healthNorm = healthScoreRaw === null ? 0 : Math.max(-1, Math.min(1, healthScoreRaw / 3));

  const momentumSource = (() => {
    const confidence = toFiniteNumber(topAlert?.confidence);
    if (confidence === null) {
      return 0;
    }
    return (confidence - 50) / 50;
  })();

  const trendPenalty = String(topAlert?.trend || '').toLowerCase() === 'downtrend' ? -0.2 : 0;
  const momentum = Math.max(-1, Math.min(1, momentumSource + trendPenalty));
  const fundamentals = healthNorm;
  const newsSentiment = computeNewsSentimentScore(topNews);
  const risk = (() => {
    const exposure = toFiniteNumber(decisionIntel?.portfolioRisk?.sectorExposurePercent);
    if (exposure === null) return 0;
    if (exposure >= 35) return -0.8;
    if (exposure >= 22) return -0.35;
    return 0.2;
  })();

  const weights = {
    momentum: 0.35,
    fundamentals: 0.30,
    newsSentiment: 0.20,
    risk: 0.15,
  };

  const weighted = {
    momentum: Number((momentum * weights.momentum).toFixed(3)),
    fundamentals: Number((fundamentals * weights.fundamentals).toFixed(3)),
    newsSentiment: Number((newsSentiment * weights.newsSentiment).toFixed(3)),
    risk: Number((risk * weights.risk).toFixed(3)),
  };

  const totalScore = weighted.momentum + weighted.fundamentals + weighted.newsSentiment + weighted.risk;
  const normalizedConfidence = Math.round(Math.max(35, Math.min(92, 50 + (totalScore * 42))));

  return {
    symbol: symbol || null,
    raw: {
      momentum: Number(momentum.toFixed(3)),
      fundamentals: Number(fundamentals.toFixed(3)),
      newsSentiment: Number(newsSentiment.toFixed(3)),
      risk: Number(risk.toFixed(3)),
    },
    weights,
    weighted,
    totalScore: Number(totalScore.toFixed(3)),
    derivedConfidencePercent: normalizedConfidence,
  };
}

function deriveEvidenceCoverage({ focusSymbols, analysisMap, alertMap, healthMap, eventsMap, topNews }) {
  const symbols = Array.isArray(focusSymbols) ? focusSymbols : [];
  if (!symbols.length) {
    return {
      score: 0,
      components: {
        analysis: 0,
        fundamentals: 0,
        events: 0,
        backtest: 0,
        alerts: 0,
        news: 0,
      },
    };
  }

  const analysisCoverage = symbols.filter((symbol) => analysisMap.get(String(symbol).toUpperCase())).length / symbols.length;
  const fundamentalsCoverage = symbols.filter((symbol) => toFiniteNumber(healthMap.get(String(symbol).toUpperCase())?.healthScore) !== null).length / symbols.length;
  const eventsCoverage = symbols.filter((symbol) => {
    const events = eventsMap.get(String(symbol).toUpperCase()) || [];
    return Array.isArray(events) && events.length > 0;
  }).length / symbols.length;

  const backtestCoverage = symbols.filter((symbol) => toFiniteNumber(alertMap.get(String(symbol).toUpperCase())?.backtestedSuccessRate) !== null).length / symbols.length;
  const alertCoverage = symbols.filter((symbol) => alertMap.get(String(symbol).toUpperCase())).length / symbols.length;
  const newsCoverage = Array.isArray(topNews) && topNews.length ? 1 : 0;

  const weights = {
    analysis: 0.30,
    fundamentals: 0.22,
    events: 0.16,
    backtest: 0.14,
    alerts: 0.10,
    news: 0.08,
  };

  const score = Number((
    (analysisCoverage * weights.analysis)
    + (fundamentalsCoverage * weights.fundamentals)
    + (eventsCoverage * weights.events)
    + (backtestCoverage * weights.backtest)
    + (alertCoverage * weights.alerts)
    + (newsCoverage * weights.news)
  ).toFixed(3));

  return {
    score,
    components: {
      analysis: Number(analysisCoverage.toFixed(3)),
      fundamentals: Number(fundamentalsCoverage.toFixed(3)),
      events: Number(eventsCoverage.toFixed(3)),
      backtest: Number(backtestCoverage.toFixed(3)),
      alerts: Number(alertCoverage.toFixed(3)),
      news: Number(newsCoverage.toFixed(3)),
    },
  };
}

function deriveHonestConfidence({
  baseConfidence,
  evidenceCoverage,
  hasSignalConflict,
  fallbackUsed,
}) {
  const base = toFiniteNumber(baseConfidence);
  const baseScore = base === null ? 54 : Math.max(28, Math.min(88, base));
  const evidence = Number.isFinite(evidenceCoverage?.score) ? evidenceCoverage.score : 0;

  let score = baseScore * (0.4 + (0.6 * evidence));
  if (hasSignalConflict) {
    score *= 0.72;
  }
  if (fallbackUsed) {
    score *= 0.78;
  }

  if (evidence < 0.45) {
    return {
      confidencePercent: null,
      reason: 'Confidence withheld because supporting evidence is too incomplete for a reliable percentage.',
    };
  }

  const confidencePercent = Math.round(Math.max(24, Math.min(90, score)));
  return {
    confidencePercent,
    reason: `Confidence ${confidencePercent}% reflects evidence coverage ${Math.round(evidence * 100)}% with ${hasSignalConflict ? 'signal conflict penalty applied' : 'no major conflict penalty'}.`,
  };
}

function deriveRiskFactors(topAlert, decisionIntel, topNews = []) {
  const factors = [];
  const exposure = toFiniteNumber(decisionIntel?.portfolioRisk?.sectorExposurePercent);
  if (exposure !== null && exposure >= 30) {
    factors.push(`High sector concentration (${exposure.toFixed(1)}%) may amplify drawdowns.`);
  }

  const trend = String(topAlert?.trend || '').toLowerCase();
  if (trend === 'downtrend') {
    factors.push('Primary symbol remains in downtrend despite signal confidence.');
  }

  const bearishNews = (Array.isArray(topNews) ? topNews : []).filter((item) => String(item?.bias || '').toLowerCase().includes('bear')).length;
  if (bearishNews >= 2) {
    factors.push('Recent financial headlines skew bearish and can cap upside follow-through.');
  }

  if (!factors.length) {
    factors.push('No outsized risk flags detected beyond normal market volatility.');
  }

  return factors.slice(0, 3);
}

function summarizeScanRun(latestScan, latestAlerts = [], analyzedCount = 0) {
  const alerts = Array.isArray(latestAlerts) ? latestAlerts : [];
  const scope = String(latestScan?.scanScope || 'portfolio').replace(/-/g, ' ');
  const generatedAt = String(latestScan?.generatedAt || '').trim();
  const scanned = Number(latestScan?.alphaEvidence?.totalSymbolsScanned || latestScan?.universe?.symbolsScanned || analyzedCount || 0);
  const buyCount = alerts.filter((item) => String(item?.action || '').toUpperCase() === 'BUY').length;
  const sellCount = alerts.filter((item) => String(item?.action || '').toUpperCase() === 'SELL').length;
  const holdCount = alerts.filter((item) => String(item?.action || '').toUpperCase() === 'HOLD').length;

  const line = [
    `${scope} scan`,
    scanned > 0 ? `${scanned} symbols` : null,
    alerts.length ? `${alerts.length} actionable alerts` : null,
    alerts.length ? `BUY ${buyCount} | HOLD ${holdCount} | SELL ${sellCount}` : null,
    generatedAt ? `updated ${generatedAt}` : null,
  ].filter(Boolean).join(', ');

  return {
    scope,
    scannedSymbols: scanned || null,
    alertCount: alerts.length,
    buyCount,
    sellCount,
    holdCount,
    generatedAt: generatedAt || null,
    summaryLine: line || 'Latest scan data unavailable.',
  };
}

function deriveDecisionIntel({ focusSymbols = [], analysisMap, alertMap, healthMap, marketSummary, scanSummary }) {
  const alertBackedSymbols = Array.from(alertMap.keys());
  const sourceSymbols = focusSymbols.length ? focusSymbols : alertBackedSymbols;

  const candidates = sourceSymbols
    .map((symbol) => {
      const upper = String(symbol || '').toUpperCase();
      const analysis = analysisMap.get(upper);
      const alert = alertMap.get(upper);
      const action = String(alert?.action || analysis?.decision || 'HOLD').toUpperCase();
      const confidence = toFiniteNumber(alert?.confidence ?? analysis?.confidence);
      const health = toFiniteNumber(healthMap.get(upper)?.healthScore);
      const backtest = toFiniteNumber(alert?.backtestedSuccessRate);
      return {
        symbol: upper,
        action,
        confidence,
        health,
        backtest,
      };
    })
    .filter((item) => item.symbol && (item.action || item.confidence !== null));

  const ranked = candidates
    .slice()
    .sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0));

  const top = ranked[0] || null;

  const sectorExposures = Array.from(alertMap.values())
    .map((item) => toFiniteNumber(item?.sectorExposurePercent))
    .filter((value) => value !== null);

  const maxSectorExposure = sectorExposures.length ? Math.max(...sectorExposures) : null;
  const sectorRiskLevel = maxSectorExposure === null
    ? 'unknown'
    : maxSectorExposure >= 35
      ? 'high'
      : maxSectorExposure >= 22
        ? 'moderate'
        : 'low';

  const keySignals = [];
  if (top?.symbol) {
    keySignals.push(`${top.symbol} ${top.action}`);
  }
  if (top?.confidence !== null && top?.confidence !== undefined) {
    keySignals.push(`Confidence ${Math.round(top.confidence)}%`);
  }
  if (top?.backtest !== null && top?.backtest !== undefined) {
    keySignals.push(`Pattern backtest ${top.backtest.toFixed(1)}%`);
  }
  if (top?.health !== null && top?.health !== undefined) {
    keySignals.push(`Financial health ${top.health.toFixed(2)}`);
  }
  if (scanSummary?.summaryLine) {
    keySignals.push('Latest scan confirms selective, conviction-based positioning.');
  }

  const riskLevel = formatRiskLevel(sectorRiskLevel);
  const nextBestAction = top?.symbol
    ? `${String(top.action || 'HOLD').toUpperCase()} ${top.symbol} with strict stop discipline and reduced size if volatility expands.`
    : 'Hold risk steady and wait for confirmation before adding exposure.';
  const alternativeStrategy = top?.symbol
    ? `If ${top.symbol} loses support on close, switch to defensive rotation and protect capital over upside capture.`
    : 'Use staggered entries only after momentum and breadth improve together.';

  return {
    overallDecision: top?.action || 'HOLD',
    confidencePercent: top?.confidence === null || top?.confidence === undefined ? null : Math.round(top.confidence),
    keySignals: keySignals.slice(0, 3).map((item) => sanitizeAdvisorText(item)),
    portfolioRisk: {
      sectorExposurePercent: maxSectorExposure,
      riskLevel: sectorRiskLevel,
    },
    riskLevel,
    nextBestAction,
    alternativeStrategy,
    marketSentiment: sanitizeAdvisorText(String(marketSummary?.summaryLine || 'Market sentiment unavailable.').trim()),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractGeminiText(payload) {
  return String(payload?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

async function invokeGeminiGenerateContent(endpoint, promptText) {
  const controller = new AbortController();
  const timeoutMs = 9000;
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  let payload;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 650,
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: promptText }],
          },
        ],
      }),
    });
    payload = await response.json();
  } catch (error) {
    clearTimeout(timeoutHandle);
    if (String(error?.name || '').toLowerCase() === 'aborterror') {
      return {
        answer: null,
        errorCode: 'TIMEOUT',
        httpStatus: null,
      };
    }

    return {
      answer: null,
      errorCode: 'TIMEOUT',
      httpStatus: null,
    };
  }

  clearTimeout(timeoutHandle);

  if (!response.ok) {
    const rawCode = String(payload?.error?.status || payload?.error?.code || '').toUpperCase();
    return {
      answer: null,
      errorCode: rawCode.includes('RESOURCE_EXHAUSTED') ? 'TIMEOUT' : 'TIMEOUT',
      httpStatus: response.status,
    };
  }

  const answer = extractGeminiText(payload);
  if (!answer) {
    return {
      answer: null,
      errorCode: 'EMPTY_RESPONSE',
      httpStatus: response.status,
    };
  }

  return {
    answer,
    errorCode: null,
    httpStatus: response.status,
  };
}

async function generateGeminiMarketAnswer(question, context, options = {}) {
  const apiKey = String(options?.geminiApiKey || '').trim();
  if (!isConfiguredGeminiKey(apiKey)) {
    return null;
  }

  const model = String(options?.geminiModel || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';

  const systemPrompt = [
    'You are AI Advisor, a portfolio-aware Indian market assistant speaking in a confident and concise tone.',
    'Use activeSymbol as default scope for follow-up questions unless the user explicitly asks for broad market view.',
    'For risk intent, produce symbol-specific downside reasoning, not broad macro commentary.',
    'Primary Signal must be symbol-specific in this exact pattern: SYMBOL: BUY|HOLD|SELL (Conviction).',
    'Never repeat section headers and never include duplicate labels inside bullets.',
    'Avoid incomplete sentences and avoid broken or cut-off lines.',
    'If downside risk is low but recommendation is not BUY, explicitly state weak upside catalyst or sideways structure.',
    'If downside risk is high, action must include tight stop-loss or reduced/avoided entry.',
    'Avoid generic phrases and avoid repeating template language.',
    'Answer using only the provided structured context and conversation history.',
    'Blend portfolio signals, financial health, and live market news into one coherent response.',
    'If data is missing, explicitly say what is unavailable instead of inventing facts.',
    'Write as if you are advising a retail investor in plain language, not like a system log.',
    'Do not mention internal system terms, scan labels, timestamps, raw counts, or API references.',
    'Strictly use this format and keep each bullet concise:',
    'PRIMARY SIGNAL: <single-line signal>',
    'Answer: <single line>',
    'Why:',
    '- <bullet>',
    '- <bullet>',
    '- <bullet>',
    'Action:',
    '- <bullet>',
    '- <bullet>',
    '- <bullet>',
    'Keep each section focused on top priority insights only.',
    'Do not mention internal JSON keys, workflow labels, or raw context formatting.',
  ].join(' ');

  const userPrompt = [
    `User question: ${trimText(question, 900)}`,
    '',
    'Conversation context:',
    buildConversationContext(options?.sessionTurns || [], options?.conversationSummary || ''),
    '',
    'Structured portfolio + market context:',
    JSON.stringify(context),
  ].join('\n');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const primaryPrompt = `${systemPrompt}\n\n${userPrompt}`;

  const compactContext = {
    portfolioSummary: context?.portfolioSummary || 'Portfolio summary unavailable.',
    focusSymbols: Array.isArray(context?.focusSymbols) ? context.focusSymbols.slice(0, 4) : [],
    activeSymbol: context?.activeSymbol || '',
    userIntent: context?.userIntent || 'decision',
    marketSummary: context?.marketSummary?.summaryLine || 'Market summary unavailable.',
    latestNews: Array.isArray(context?.latestNews) ? context.latestNews.slice(0, 2) : [],
  };
  const compactPrompt = [
    systemPrompt,
    '',
    `User question: ${trimText(question, 900)}`,
    '',
    'Conversation context:',
    buildConversationContext(options?.sessionTurns || [], options?.conversationSummary || ''),
    '',
    'Compact context:',
    JSON.stringify(compactContext),
  ].join('\n');

  const attempts = [
    { prompt: primaryPrompt, delayMs: 0, mode: 'primary' },
    { prompt: compactPrompt, delayMs: 350, mode: 'retry_compact_1' },
    { prompt: compactPrompt, delayMs: 550, mode: 'retry_compact_2' },
  ];

  let lastErrorCode = 'TIMEOUT';
  let correctedFormat = false;

  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await sleep(attempt.delayMs);
    }

    try {
      const result = await invokeGeminiGenerateContent(endpoint, attempt.prompt);
      if (result?.answer) {
        if (isStructuredAdvisorAnswer(result.answer)) {
          return {
            answer: result.answer,
            model,
            correctedFormat,
          };
        }

        const corrected = ensureStructuredAdvisorAnswer(result.answer, {
          portfolioSummary: context?.portfolioSummary,
          marketContextSummary: context?.marketSummary?.summaryLine,
          topNews: context?.latestNews,
        });

        if (isStructuredAdvisorAnswer(corrected)) {
          correctedFormat = true;
          return {
            answer: corrected,
            model,
            correctedFormat,
          };
        }

        lastErrorCode = 'FORMAT_ERROR';
        continue;
      }

      if (result?.errorCode) {
        lastErrorCode = String(result.errorCode);
        continue;
      }

      if (!result?.answer) {
        lastErrorCode = 'EMPTY_RESPONSE';
        continue;
      }

      if (attempt.mode.startsWith('retry_compact')) {
        lastErrorCode = 'FORMAT_ERROR';
      }
    } catch (_error) {
      lastErrorCode = 'TIMEOUT';
    }
  }

  return {
    answer: null,
    model,
    errorCode: lastErrorCode,
    correctedFormat,
  };
}

function buildHumanFallbackAnswer(params = {}) {
  const portfolioSummary = String(params?.portfolioSummary || 'Portfolio analysis is currently limited.').trim();
  const symbolSummaries = Array.isArray(params?.symbolSummaries) ? params.symbolSummaries : [];
  const marketContextSummary = String(params?.marketContextSummary || '').trim();
  const topNews = Array.isArray(params?.topNews) ? params.topNews : [];
  const scanSummaryLine = String(params?.scanSummaryLine || '').trim();
  const followUpUsed = Boolean(params?.followUpUsed);
  const aiErrorCode = String(params?.aiErrorCode || '').trim();

  const lines = [];

  lines.push('Fallback mode: deterministic market synthesis is active due to temporary Gemini reliability limits.');

  if (aiErrorCode === 'TIMEOUT') {
    lines.push('Gemini timed out for this request, so this response uses deterministic local analytics only.');
  }

  if (aiErrorCode === 'EMPTY_RESPONSE' || aiErrorCode === 'FORMAT_ERROR') {
    lines.push('Gemini returned an unusable output for this request, so this response is generated from deterministic portfolio analytics.');
  }

  lines.push(`Here is the quick take: ${portfolioSummary}`);

  if (scanSummaryLine) {
    lines.push(`Latest market read: ${sanitizeAdvisorText(scanSummaryLine)}`);
  }

  if (symbolSummaries.length) {
    lines.push(`On the symbols you are tracking, the current read is: ${symbolSummaries.join(' | ')}.`);
  } else {
    lines.push('I do not yet have a clear symbol match from your question, so mention one ticker and I will give a tighter recommendation.');
  }

  if (marketContextSummary) {
    lines.push(`Broader market tone right now: ${marketContextSummary}`);
  }

  if (topNews.length) {
    const headlines = topNews
      .slice(0, 2)
      .map((item) => `${item?.source || 'News'}: ${item?.headline || 'headline unavailable'}`)
      .join(' | ');
    lines.push(`Latest headlines worth watching: ${headlines}`);
  }

  if (followUpUsed) {
    lines.push('I also used your recent chat context to keep this answer aligned with your previous question.');
  }

  lines.push('Action plan: favor setups with stronger confidence plus improving financial health, and avoid increasing exposure where your portfolio is already concentrated.');

  return lines.join(' ');
}

function buildNewsCitations(items = []) {
  return (Array.isArray(items) ? items : []).slice(0, 5).map((item) => ({
    source: item?.source || 'Financial news feed',
    title: item?.headline || 'Market headline',
    date: item?.publishedAt || '',
    endpoint: '/api/news/financial',
    url: item?.url || '',
  }));
}

async function runSafeStep(stepName, fn, fallbackValue, logger, stepTimings) {
  const startedAt = Date.now();
  try {
    const result = await fn();
    stepTimings[stepName] = Date.now() - startedAt;
    return result;
  } catch (error) {
    stepTimings[stepName] = Date.now() - startedAt;
    if (typeof logger === 'function') {
      logger('warn', {
        step: stepName,
        message: error?.message || 'step_failed',
      });
    }
    return fallbackValue;
  }
}

async function runMarketChatAgent(question, options = {}) {
  const startedAt = Date.now();
  const stepTimings = {};
  const logger = options?.logger;
  const portfolioRows = normalizeRows(options?.portfolioRows || []);
  const latestAlerts = Array.isArray(options?.latestAlerts) ? options.latestAlerts : [];
  const sessionTurns = Array.isArray(options?.sessionTurns) ? options.sessionTurns : [];

  const analysisPromise = portfolioRows.length
    ? runSafeStep(
      'portfolio_analysis',
      () => analyzePortfolio(portfolioRows, { geminiApiKey: options?.geminiApiKey || '' }),
      { results: [] },
      logger,
      stepTimings
    )
    : Promise.resolve({ results: [] });

  const marketSummaryPromise = runSafeStep(
    'market_summary',
    () => getMarketSummary(options?.historyRuns || []),
    null,
    logger,
    stepTimings
  );
  const marketNewsPromise = runSafeStep(
    'market_news',
    () => fetchFinancialNews(8),
    [],
    logger,
    stepTimings
  );

  const analysis = await analysisPromise;

  const analysisResults = Array.isArray(analysis?.results) ? analysis.results : [];
  const alertSymbols = latestAlerts
    .map((alert) => String(alert?.symbol || '').toUpperCase())
    .filter(Boolean);
  const candidateSymbols = Array.from(new Set([
    ...analysisResults.map((item) => String(item?.symbol || '').toUpperCase()).filter(Boolean),
    ...alertSymbols,
  ]));

  const userIntent = detectUserIntent(question);
  const broadMarketRequest = isBroadMarketQuestion(question);
  const preferSessionContext = !broadMarketRequest && isShortFollowUpQuestion(question);

  const rankedSymbols = extractRankedSymbols(question, candidateSymbols, sessionTurns, {
    preferSessionContext,
  });
  const focusSymbols = rankedSymbols.symbols.slice(0, 4);
  const activeSymbol = String(focusSymbols?.[0] || '').toUpperCase();

  const [healthPairs, eventPairs, marketSummary, marketNews] = await Promise.all([
    Promise.all(
      focusSymbols.map(async (symbol) => {
        const score = await runSafeStep(
          `health_${symbol}`,
          () => getFinancialHealthScore(symbol),
          null,
          logger,
          stepTimings
        );
        return [symbol, score];
      })
    ),
    Promise.all(
      focusSymbols.map(async (symbol) => {
        const events = await runSafeStep(
          `events_${symbol}`,
          () => getFinancialEventsEnhanced(symbol),
          [],
          logger,
          stepTimings
        );
        return [symbol, rankEvents(events).slice(0, 4)];
      })
    ),
    marketSummaryPromise,
    marketNewsPromise,
  ]);

  const analysisMap = new Map(analysisResults.map((item) => [String(item.symbol).toUpperCase(), item]));
  const healthMap = new Map(healthPairs.map(([symbol, score]) => [String(symbol).toUpperCase(), score]));
  const eventsMap = new Map(eventPairs.map(([symbol, events]) => [String(symbol).toUpperCase(), events]));
  const alertMap = new Map(
    latestAlerts
      .filter((alert) => alert?.symbol)
      .map((alert) => [String(alert.symbol).toUpperCase(), alert])
  );

  const symbolSummaries = focusSymbols.map((symbol) => summarizeSymbol(symbol, analysisMap, healthMap, alertMap));

  const followUpUsed = rankedSymbols.source === 'session' && sessionTurns.length > 0;

  const marketContextSummary = String(marketSummary?.summaryLine || '').trim();
  const topNews = (Array.isArray(marketNews) ? marketNews : []).slice(0, 4);
  const scanSummary = summarizeScanRun(options?.latestScan, latestAlerts, analysisResults.length);
  const topAlert = latestAlerts
    .slice()
    .sort((left, right) => Number(right?.confidence || 0) - Number(left?.confidence || 0))[0] || null;
  const topAlertActionLine = topAlert?.symbol
    ? `Use ${String(topAlert.symbol).toUpperCase()} as the primary execution candidate (${String(topAlert.action || 'HOLD').toUpperCase()}, confidence ${Math.round(Number(topAlert.confidence || 0))}%).`
    : null;

  const riskLevelForAnswer = formatRiskLevel(
    (() => {
      const exposure = toFiniteNumber(topAlert?.sectorExposurePercent);
      if (exposure === null) return 'moderate';
      if (exposure >= 35) return 'high';
      if (exposure >= 22) return 'moderate';
      return 'low';
    })()
  );

  const primarySignal = topAlert?.symbol
    ? `${String(topAlert.action || 'HOLD').toUpperCase()} bias on ${String(topAlert.symbol).toUpperCase()} with ${riskLevelForAnswer} portfolio risk.`
    : 'No high-conviction breakout yet; stay selective and protect downside risk.';

  const contextForAi = {
    userIntent,
    activeSymbol,
    portfolioSummary: summarizePortfolio(analysis),
    symbolSummaries,
    focusSymbols,
    marketSummary: {
      summaryLine: marketContextSummary || 'Market summary unavailable.',
      niftyMovement: marketSummary?.nifty?.movement || 'n/a',
      sensexMovement: marketSummary?.sensex?.movement || 'n/a',
      sectorTrend: marketSummary?.sectorTrend?.summary || 'n/a',
    },
    latestNews: topNews.map((item) => ({
      source: item?.source || 'Financial news feed',
      headline: item?.headline || '',
      bias: item?.bias || 'Neutral',
      publishedAt: item?.publishedAt || '',
    })),
    latestAlerts: latestAlerts.slice(0, 8).map((alert) => ({
      symbol: alert?.symbol || '',
      action: alert?.action || '',
      confidence: toFiniteNumber(alert?.confidence),
      trend: alert?.trend || '',
      backtestedSuccessRate: toFiniteNumber(alert?.backtestedSuccessRate),
    })),
    latestScan: {
      summaryLine: scanSummary.summaryLine,
      scanScope: scanSummary.scope,
      scannedSymbols: scanSummary.scannedSymbols,
      alertCount: scanSummary.alertCount,
      buyCount: scanSummary.buyCount,
      holdCount: scanSummary.holdCount,
      sellCount: scanSummary.sellCount,
      generatedAt: scanSummary.generatedAt,
    },
  };

  if (activeSymbol) {
    contextForAi.activeSymbolRisk = buildSymbolRiskSummary(activeSymbol, analysisMap, healthMap, alertMap, topNews);
  }

  const geminiResult = await generateGeminiMarketAnswer(question, contextForAi, {
    geminiApiKey: options?.geminiApiKey,
    geminiModel: options?.geminiModel,
    sessionTurns,
    conversationSummary: options?.conversationSummary || '',
  });

  const eventCitations = [];
  focusSymbols.forEach((symbol) => {
    const events = eventsMap.get(String(symbol).toUpperCase()) || [];
    events.slice(0, 2).forEach((event) => {
      eventCitations.push({
        source: event?.source || 'Financial event feed',
        symbol,
        title: event?.title || event?.type || 'Financial event',
        date: event?.date || '',
        endpoint: '/api/financial/events',
        url: event?.sourceUrl || '',
      });
    });
  });

  const alertCitations = buildAlertEventCitations(latestAlerts, focusSymbols);
  const newsCitations = buildNewsCitations(marketNews);

  const citations = [
    { source: 'Portfolio analysis engine', endpoint: '/api/portfolio/analyze' },
    { source: 'Opportunity Radar alerts', endpoint: '/api/agent/opportunity-radar' },
    { source: 'Financial health engine', endpoint: '/api/financial/health' },
    { source: 'Market summary engine', endpoint: '/api/market/summary' },
    ...eventCitations,
    ...alertCitations,
    ...newsCitations,
  ];

  const fallbackUsed = !geminiResult?.answer;
  const rawAnswer = geminiResult?.answer || buildHumanFallbackAnswer({
    portfolioSummary: summarizePortfolio(analysis),
    symbolSummaries,
    marketContextSummary,
    scanSummaryLine: scanSummary.summaryLine,
    topNews,
    followUpUsed,
    aiErrorCode: geminiResult?.errorCode,
  });
  const answer = ensureStructuredAdvisorAnswer(rawAnswer, {
    question,
    intent: userIntent,
    activeSymbol,
    focusSymbols,
    analysisMap,
    healthMap,
    alertMap,
    portfolioSummary: summarizePortfolio(analysis),
    symbolSummaries,
    marketContextSummary,
    scanSummaryLine: scanSummary.summaryLine,
    topNews,
    topAlertActionLine,
    topAlert,
    primarySignal,
    riskLevel: riskLevelForAnswer,
    followUpUsed,
  });

  const safeAnswer = isStructuredAdvisorAnswer(answer)
    ? answer
    : ensureStructuredAdvisorAnswer('', {
      question,
      intent: userIntent,
      activeSymbol,
      focusSymbols,
      analysisMap,
      healthMap,
      alertMap,
      portfolioSummary: summarizePortfolio(analysis),
      symbolSummaries,
      marketContextSummary,
      scanSummaryLine: scanSummary.summaryLine,
      topNews,
      topAlertActionLine,
      topAlert,
      primarySignal,
      riskLevel: riskLevelForAnswer,
      followUpUsed,
    });

  const decisionIntel = deriveDecisionIntel({
    focusSymbols,
    analysisMap,
    alertMap,
    healthMap,
    marketSummary,
    scanSummary,
  });

  const scoreBreakdown = buildScoreBreakdown(topAlert, healthMap, focusSymbols, topNews, decisionIntel);
  const riskFactors = deriveRiskFactors(topAlert, decisionIntel, topNews);
  const hasSignalConflict = String(topAlert?.action || '').toUpperCase() && String(analysisMap.get(activeSymbol)?.decision || '').toUpperCase()
    ? String(topAlert?.action || '').toUpperCase() !== String(analysisMap.get(activeSymbol)?.decision || '').toUpperCase()
    : false;
  const evidenceCoverage = deriveEvidenceCoverage({
    focusSymbols,
    analysisMap,
    alertMap,
    healthMap,
    eventsMap,
    topNews,
  });

  const confidenceModel = deriveHonestConfidence({
    baseConfidence: toFiniteNumber(topAlert?.confidence ?? analysisMap.get(activeSymbol)?.confidence),
    evidenceCoverage,
    hasSignalConflict,
    fallbackUsed,
  });
  const confidencePercent = confidenceModel.confidencePercent;

  const confidenceReasoning = confidencePercent === null
    ? confidenceModel.reason
    : `${confidenceModel.reason} Weighted contributors: momentum ${scoreBreakdown.weights.momentum}, fundamentals ${scoreBreakdown.weights.fundamentals}, news ${scoreBreakdown.weights.newsSentiment}, risk ${scoreBreakdown.weights.risk}.`;

  const normalizedDecisionIntel = {
    ...decisionIntel,
    confidencePercent,
  };

  const predictionSignals = focusSymbols.map((symbol) => {
    const alert = alertMap.get(String(symbol).toUpperCase());
    const analysisItem = analysisMap.get(String(symbol).toUpperCase());
    const prediction = String(alert?.action || analysisItem?.decision || 'HOLD').toUpperCase();
    return {
      symbol: String(symbol).toUpperCase(),
      prediction,
      confidence: clampPercent(toFiniteNumber(alert?.confidence ?? analysisItem?.confidence) ?? confidencePercent),
      generatedAt: new Date().toISOString(),
      source: alert ? 'alert' : 'analysis',
    };
  });

  stepTimings.total = Date.now() - startedAt;

  return {
    question: String(question || '').trim(),
    answer: safeAnswer,
    workflow: [
      'parse_intent_and_symbols',
      'fetch_portfolio_and_fundamental_context',
      fallbackUsed ? 'synthesize_portfolio_aware_recommendation' : 'synthesize_with_gemini_and_market_news',
    ],
    symbolsAnalyzed: focusSymbols,
    symbolCandidates: rankedSymbols.ranked.slice(0, 5),
    userIntent,
    activeSymbol,
    followUpUsed,
    citations: citations.slice(0, 14),
    aiProvider: 'gemini',
    fallbackUsed,
    model: fallbackUsed ? geminiResult?.model || options?.geminiModel || null : geminiResult.model,
    aiErrorCode: fallbackUsed ? (geminiResult?.errorCode || null) : null,
    errorCode: fallbackUsed ? (geminiResult?.errorCode || null) : null,
    geminiCorrectedFormat: Boolean(geminiResult?.correctedFormat),
    decisionIntel: normalizedDecisionIntel,
    scoreBreakdown,
    evidenceCoverage,
    confidenceReasoning,
    riskFactors,
    predictionSignals,
    telemetry: {
      stepTimings,
      geminiStatus: fallbackUsed ? 'failed_or_invalid' : 'ok',
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  runMarketChatAgent,
};
