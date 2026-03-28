const { analyzePortfolio, normalizePortfolioRows } = require('./pipeline');
const { getFinancialHealthScore } = require('./financialDataService');
const { getFinancialEventsEnhanced } = require('./financialDataService');
const { fetchFinancialNews, getMarketSummary } = require('./marketIntelService');

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

function extractSymbols(question, candidates = []) {
  const upperQuestion = String(question || '').toUpperCase();
  const tokenMatches = upperQuestion.match(/[A-Z]{2,15}/g) || [];
  const candidateSet = new Set(candidates.map((item) => String(item || '').toUpperCase()));

  const direct = tokenMatches.filter((token) => candidateSet.has(token));
  const uniqueDirect = Array.from(new Set(direct));

  if (uniqueDirect.length) {
    return uniqueDirect;
  }

  return candidates.slice(0, 3);
}

function extractSymbolsWithHistory(question, candidates = [], sessionTurns = []) {
  const fromQuestion = extractSymbols(question, candidates);
  if (fromQuestion.length) {
    return fromQuestion;
  }

  const latestTurn = Array.isArray(sessionTurns) && sessionTurns.length
    ? sessionTurns[sessionTurns.length - 1]
    : null;

  const priorSymbols = Array.isArray(latestTurn?.symbolsAnalyzed)
    ? latestTurn.symbolsAnalyzed.map((item) => String(item || '').toUpperCase()).filter(Boolean)
    : [];

  if (priorSymbols.length) {
    return priorSymbols;
  }

  return candidates.slice(0, 3);
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

function buildConversationContext(sessionTurns = []) {
  if (!Array.isArray(sessionTurns) || !sessionTurns.length) {
    return 'No prior conversation turns.';
  }

  const recentTurns = sessionTurns.slice(-4);
  const formatted = recentTurns.map((turn, index) => {
    const question = trimText(turn?.question || '', 400);
    const answer = trimText(turn?.answer || '', 700);
    return `Turn ${index + 1}\nQuestion: ${question || 'n/a'}\nAnswer: ${answer || 'n/a'}`;
  });

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

function buildExecutionActionBullets(topAlert, riskLevel = 'Medium') {
  if (!topAlert) {
    return [
      'Wait for a clean directional break before adding exposure.',
      `Keep position sizing defensive until risk shifts below ${riskLevel}.`,
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
      : `Enter ${symbol} only on confirmation with disciplined sizing.`;

    const riskGuard = stopLoss !== null
      ? `Place stop below ${stopLoss.toFixed(2)} and cut risk immediately on a close below support.`
      : `Use a hard stop below recent support; do not hold through a support break.`;

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
    `Hold ${symbol} and wait for either an RSI momentum reset or a decisive support/resistance break.`,
    stopLoss !== null
      ? `If price closes below ${stopLoss.toFixed(2)}, shift to defensive posture and cut size.`
      : 'If price breaks support on closing basis, cut exposure and wait for a better setup.',
    `Keep risk tight while portfolio risk remains ${riskLevel}.`,
  ].slice(0, 3);
}

function ensureStructuredAdvisorAnswer(rawAnswer, context = {}) {
  const safe = trimText(rawAnswer || '', 2200);
  const hasPrimarySignal = /^\s*primary\s+signal\s*:/im.test(safe);
  const hasAnswer = /^\s*answer\s*:/im.test(safe);
  const hasWhy = /^\s*why\s*:/im.test(safe);
  const hasAction = /^\s*action\s*:/im.test(safe);

  if (hasPrimarySignal && hasAnswer && hasWhy && hasAction) {
    const cleaned = safe
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => sanitizeAdvisorText(line));

    const output = [];
    let mode = '';
    let whyCount = 0;
    let actionCount = 0;

    cleaned.forEach((line) => {
      const lower = line.toLowerCase();
      if (lower.startsWith('primary signal:')) {
        mode = 'primary';
        output.push(`PRIMARY SIGNAL: ${line.replace(/^primary\s+signal\s*:\s*/i, '').trim()}`);
        return;
      }
      if (lower.startsWith('answer:')) {
        mode = 'answer';
        output.push(`Answer: ${line.replace(/^answer\s*:\s*/i, '').trim()}`);
        return;
      }
      if (lower.startsWith('why:')) {
        mode = 'why';
        output.push('Why:');
        return;
      }
      if (lower.startsWith('action:')) {
        mode = 'action';
        output.push('Action:');
        return;
      }

      const bullet = line.replace(/^[-*]\s*/, '').trim();
      if (!bullet) {
        return;
      }

      if (mode === 'why' && whyCount < 3) {
        output.push(`- ${bullet}`);
        whyCount += 1;
        return;
      }
      if (mode === 'action' && actionCount < 3) {
        output.push(`- ${bullet}`);
        actionCount += 1;
      }
    });

    return output.join('\n');
  }

  const chunks = sentenceChunks(safe);
  const answerLine = sanitizeAdvisorText(chunks[0] || 'Current setup is mixed, so selective execution is better than broad exposure.');

  const primarySignal = sanitizeAdvisorText(
    context?.primarySignal
      || context?.topAlertActionLine
      || 'High-conviction setups are limited, so trade selectively with strict risk control.'
  );

  const whyBullets = [
    sanitizeAdvisorText(chunks[1] || context?.portfolioSummary || 'Portfolio signals are mixed across tracked symbols.'),
    sanitizeAdvisorText(chunks[2] || (context?.marketContextSummary ? `Market context: ${context.marketContextSummary}` : 'Market context remains risk-sensitive.')),
    sanitizeAdvisorText(chunks[3] || (Array.isArray(context?.topNews) && context.topNews.length
      ? `Current news: ${(context.topNews || []).slice(0, 1).map((item) => `${item?.source || 'News'} - ${item?.headline || 'headline unavailable'}`).join('')}`
      : 'Current market news is mixed without a single dominant catalyst.')),
  ].slice(0, 3);

  const actionBullets = buildExecutionActionBullets(context?.topAlert || null, context?.riskLevel || 'Medium').slice(0, 3);

  return [
    `PRIMARY SIGNAL: ${primarySignal}`,
    `Answer: ${answerLine.replace(/^answer\s*:\s*/i, '')}`,
    'Why:',
    ...whyBullets.map((item) => `- ${String(item).replace(/^[-*]\s*/, '')}`),
    'Action:',
    ...actionBullets.map((item) => `- ${item}`),
  ].join('\n');
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
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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

  const payload = await response.json();
  if (!response.ok) {
    return {
      answer: null,
      errorCode: String(payload?.error?.status || payload?.error?.code || 'gemini_request_failed'),
      httpStatus: response.status,
    };
  }

  const answer = extractGeminiText(payload);
  if (!answer) {
    return {
      answer: null,
      errorCode: 'empty_gemini_answer',
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
    buildConversationContext(options?.sessionTurns || []),
    '',
    'Structured portfolio + market context:',
    JSON.stringify(context),
  ].join('\n');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const primaryPrompt = `${systemPrompt}\n\n${userPrompt}`;

  const compactContext = {
    portfolioSummary: context?.portfolioSummary || 'Portfolio summary unavailable.',
    focusSymbols: Array.isArray(context?.focusSymbols) ? context.focusSymbols.slice(0, 4) : [],
    marketSummary: context?.marketSummary?.summaryLine || 'Market summary unavailable.',
    latestNews: Array.isArray(context?.latestNews) ? context.latestNews.slice(0, 2) : [],
  };
  const compactPrompt = [
    systemPrompt,
    '',
    `User question: ${trimText(question, 900)}`,
    '',
    'Conversation context:',
    buildConversationContext(options?.sessionTurns || []),
    '',
    'Compact context:',
    JSON.stringify(compactContext),
  ].join('\n');

  const attempts = [
    { prompt: primaryPrompt, delayMs: 0 },
    { prompt: primaryPrompt, delayMs: 350 },
    { prompt: compactPrompt, delayMs: 600 },
  ];

  let lastErrorCode = 'gemini_request_failed';
  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await sleep(attempt.delayMs);
    }

    try {
      const result = await invokeGeminiGenerateContent(endpoint, attempt.prompt);
      if (result?.answer) {
        return {
          answer: result.answer,
          model,
        };
      }
      lastErrorCode = String(result?.errorCode || lastErrorCode);
    } catch (_error) {
      lastErrorCode = 'gemini_network_error';
    }
  }

  return {
    answer: null,
    model,
    errorCode: lastErrorCode,
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

  if (aiErrorCode === 'RESOURCE_EXHAUSTED' || aiErrorCode === 'insufficient_quota') {
    lines.push('I could not use the Gemini response right now because your API quota is exhausted, so this answer is generated from your local market analytics.');
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

async function runMarketChatAgent(question, options = {}) {
  const portfolioRows = normalizeRows(options?.portfolioRows || []);
  const latestAlerts = Array.isArray(options?.latestAlerts) ? options.latestAlerts : [];
  const sessionTurns = Array.isArray(options?.sessionTurns) ? options.sessionTurns : [];

  const analysis = portfolioRows.length
    ? await analyzePortfolio(portfolioRows, { geminiApiKey: options?.geminiApiKey || '' })
    : { results: [] };

  const analysisResults = Array.isArray(analysis?.results) ? analysis.results : [];
  const alertSymbols = latestAlerts
    .map((alert) => String(alert?.symbol || '').toUpperCase())
    .filter(Boolean);
  const candidateSymbols = Array.from(new Set([
    ...analysisResults.map((item) => String(item?.symbol || '').toUpperCase()).filter(Boolean),
    ...alertSymbols,
  ]));
  const focusSymbols = extractSymbolsWithHistory(question, candidateSymbols, sessionTurns).slice(0, 4);

  const [healthPairs, eventPairs, marketSummary, marketNews] = await Promise.all([
    Promise.all(
    focusSymbols.map(async (symbol) => {
      try {
        const score = await getFinancialHealthScore(symbol);
        return [symbol, score];
      } catch (_error) {
        return [symbol, null];
      }
    })
  ),
    Promise.all(
      focusSymbols.map(async (symbol) => {
        try {
          const events = await getFinancialEventsEnhanced(symbol);
          return [symbol, rankEvents(events).slice(0, 4)];
        } catch (_error) {
          return [symbol, []];
        }
      })
    ),
    getMarketSummary().catch(() => null),
    fetchFinancialNews(8).catch(() => []),
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

  const followUpUsed = !extractSymbols(question, candidateSymbols).length && sessionTurns.length > 0;

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

  const geminiResult = await generateGeminiMarketAnswer(question, contextForAi, {
    geminiApiKey: options?.geminiApiKey,
    geminiModel: options?.geminiModel,
    sessionTurns,
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
  const usedGemini = Boolean(geminiResult?.answer);
  const decisionIntel = deriveDecisionIntel({
    focusSymbols,
    analysisMap,
    alertMap,
    healthMap,
    marketSummary,
    scanSummary,
  });

  return {
    question: String(question || '').trim(),
    answer,
    workflow: [
      'parse_intent_and_symbols',
      'fetch_portfolio_and_fundamental_context',
      usedGemini ? 'synthesize_with_gemini_and_market_news' : 'synthesize_portfolio_aware_recommendation',
    ],
    symbolsAnalyzed: focusSymbols,
    followUpUsed,
    citations: citations.slice(0, 14),
    aiProvider: usedGemini ? 'gemini' : 'rule_based_fallback',
    model: usedGemini ? geminiResult.model : null,
    aiErrorCode: usedGemini ? null : (geminiResult?.errorCode || null),
    decisionIntel,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  runMarketChatAgent,
};
