const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { analyzeSingleSymbol, analyzePortfolio, normalizePortfolioRows } = require('./engine/pipeline');
const { runOpportunityRadar, runOpportunityRadarForUniverse, getOpportunityRadarHistory } = require('./engine/opportunityAgent');
const { createRadarScheduler } = require('./engine/radarScheduler');
const { runMarketChatAgent } = require('./engine/marketChatAgent');
const { getSession: getMarketChatSession, upsertTurn: upsertMarketChatTurn } = require('./engine/marketChatMemoryStore');
const { getValidationMetrics, getStrategyPerformance } = require('./engine/performanceService');
const { synchronizeSignalOutcomes } = require('./engine/signalOutcomeService');
const { getMarketSummary, fetchFinancialNews } = require('./engine/marketIntelService');
const {
  getFinancialHealthScore,
  getFinancialEvents,
  getFinancialEventsEnhanced,
  fetchNSEInsiderData,
  fetchNewsData,
  aggregateFinancialSignals,
} = require('./engine/financialDataService');
const { analyzeFinancialSignal, updateAlertLifecycle } = require('./engine/financialAnalyzer');

function interpretHealthScore(score) {
  if (score < -1) return 'Significant financial headwinds; multiple negative indicators';
  if (score < 0) return 'Mixed signals with slight negative bias; monitor closely';
  if (score < 0.5) return 'Neutral financial positioning; no clear directional bias';
  if (score < 1.5) return 'Positively positioned with supportive fundamentals';
  return 'Strong financial momentum with convergent bullish indicators';
}

function loadEnvFile(fileName) {
  const envPath = path.join(__dirname, fileName);
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

loadEnvFile('.env');
loadEnvFile('.env.example');

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const RADAR_AUTORUN_ENABLED = String(process.env.RADAR_AUTORUN_ENABLED || 'false').toLowerCase() === 'true';
const RADAR_AUTORUN_INTERVAL_MINUTES = Number(process.env.RADAR_AUTORUN_INTERVAL_MINUTES || 720);
const RADAR_AUTORUN_RISK_PROFILE = String(process.env.RADAR_AUTORUN_RISK_PROFILE || 'moderate').toLowerCase();
const RADAR_AUTORUN_UNIVERSE_LIMIT = Number(process.env.RADAR_AUTORUN_UNIVERSE_LIMIT || 0);

function withCorsHeaders(headers = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers,
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, withCorsHeaders({ 'Content-Type': 'application/json' }));
  res.end(JSON.stringify(payload));
}

function normalizeSymbol(rawSymbol) {
  return decodeURIComponent(String(rawSymbol || '')).trim().toUpperCase();
}

function parseRawRowsText(input) {
  return String(input || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,\s]+/).filter(Boolean);
      return {
        symbol: String(parts[0] || '').toUpperCase(),
        weight: Number(parts[1]),
      };
    });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawText = Buffer.concat(chunks).toString('utf8').trim();
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch (_error) {
    throw {
      statusCode: 400,
      message: 'Invalid JSON body.',
    };
  }
}

function rowsFromPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && payload.portfolio) {
    if (Array.isArray(payload.portfolio)) {
      return payload.portfolio;
    }
    if (typeof payload.portfolio === 'object') {
      return Object.entries(payload.portfolio).map(([symbol, weight]) => ({ symbol, weight }));
    }
  }

  if (payload && typeof payload.rawInput === 'string') {
    return parseRawRowsText(payload.rawInput);
  }

  if (payload && typeof payload === 'object') {
    const looksLikeMap = Object.values(payload).every((value) => Number.isFinite(Number(value)));
    if (looksLikeMap) {
      return Object.entries(payload).map(([symbol, weight]) => ({ symbol, weight }));
    }
  }

  if (typeof payload === 'string') {
    return parseRawRowsText(payload);
  }

  throw {
    statusCode: 400,
    message: 'Portfolio payload must be array rows or rawInput text.',
  };
}

const radarScheduler = createRadarScheduler({
  intervalMinutes: RADAR_AUTORUN_INTERVAL_MINUTES,
  runTask: async ({ trigger }) => {
    return runOpportunityRadarForUniverse({
      geminiApiKey: GEMINI_API_KEY,
      riskProfile: RADAR_AUTORUN_RISK_PROFILE,
      universeLimit: RADAR_AUTORUN_UNIVERSE_LIMIT,
      trigger,
    });
  },
});

if (RADAR_AUTORUN_ENABLED) {
  radarScheduler.start();
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, withCorsHeaders());
    res.end();
    return;
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname || '/';

    if (req.method === 'GET' && pathname === '/health') {
      sendJson(res, 200, { ok: true, service: 'indian-investor-decision-engine' });
      return;
    }

    const stockRouteMatch = pathname.match(/^\/api\/stock\/([^/]+)$/);
    if (req.method === 'GET' && stockRouteMatch) {
      const symbol = normalizeSymbol(stockRouteMatch[1]);
      if (!symbol) {
        sendJson(res, 400, { error: 'Symbol is required.' });
        return;
      }

      const result = await analyzeSingleSymbol(symbol, {
        geminiApiKey: GEMINI_API_KEY,
      });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/portfolio/analyze') {
      const payload = await readJsonBody(req);
      const rows = normalizePortfolioRows(rowsFromPayload(payload));
      const result = await analyzePortfolio(rows, {
        geminiApiKey: GEMINI_API_KEY,
      });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/agent/opportunity-radar') {
      const payload = await readJsonBody(req);
      const rows = normalizePortfolioRows(rowsFromPayload(payload));
      const requestedRiskProfile = String(
        payload?.preferences?.riskProfile || payload?.riskProfile || 'moderate'
      ).toLowerCase();
      const result = await runOpportunityRadar(rows, {
        geminiApiKey: GEMINI_API_KEY,
        riskProfile: requestedRiskProfile,
      });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/agent/opportunity-radar/universe') {
      const payload = await readJsonBody(req);
      const requestedRiskProfile = String(
        payload?.preferences?.riskProfile || payload?.riskProfile || 'moderate'
      ).toLowerCase();
      const universeLimit = Number(payload?.universeLimit || payload?.limit || 0);

      const result = await runOpportunityRadarForUniverse({
        geminiApiKey: GEMINI_API_KEY,
        riskProfile: requestedRiskProfile,
        universeLimit,
      });

      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/agent/opportunity-radar/scheduler') {
      sendJson(res, 200, radarScheduler.status());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/agent/opportunity-radar/scheduler/start') {
      const started = radarScheduler.start();
      sendJson(res, 200, {
        started,
        status: radarScheduler.status(),
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/agent/opportunity-radar/scheduler/stop') {
      const stopped = radarScheduler.stop();
      sendJson(res, 200, {
        stopped,
        status: radarScheduler.status(),
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/agent/opportunity-radar/scheduler/run-now') {
      const result = await radarScheduler.execute('manual');
      sendJson(res, 200, {
        result,
        status: radarScheduler.status(),
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/agent/opportunity-radar/history') {
      const limit = Number(url.searchParams.get('limit') || 25);
      const items = getOpportunityRadarHistory(limit);
      sendJson(res, 200, {
        items,
        count: items.length,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/validation/performance') {
      const alerts = [];
      const history = getOpportunityRadarHistory(100);
      history.forEach((run) => {
        if (Array.isArray(run.alerts)) {
          alerts.push(...run.alerts);
        }
      });

      const liveOutcomes = await synchronizeSignalOutcomes(history);
      const metrics = getValidationMetrics(alerts, liveOutcomes);
      sendJson(res, 200, metrics);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/validation/strategy-breakdown') {
      const history = getOpportunityRadarHistory(100);
      const liveOutcomes = await synchronizeSignalOutcomes(history);
      const breakdown = getStrategyPerformance(liveOutcomes);
      sendJson(res, 200, breakdown);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/validation/outcomes') {
      const history = getOpportunityRadarHistory(100);
      const outcomes = await synchronizeSignalOutcomes(history);
      sendJson(res, 200, {
        items: outcomes,
        count: outcomes.length,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/market/summary') {
      const history = getOpportunityRadarHistory(100);
      const summary = await getMarketSummary(history);
      sendJson(res, 200, summary);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/news/financial') {
      const limit = Number(url.searchParams.get('limit') || 5);
      const items = await fetchFinancialNews(limit);
      sendJson(res, 200, {
        items,
        count: items.length,
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/agent/market-chat') {
      const payload = await readJsonBody(req);
      const question = String(payload?.question || '').trim();
      const sessionId = String(payload?.sessionId || '').trim();
      if (!question) {
        sendJson(res, 400, { error: 'question is required' });
        return;
      }

      let rows = [];
      if (Array.isArray(payload?.portfolio) && payload.portfolio.length) {
        rows = normalizePortfolioRows(payload.portfolio);
      } else {
        const history = getOpportunityRadarHistory(1);
        const latestRun = history[0];
        if (Array.isArray(latestRun?.portfolioRows) && latestRun.portfolioRows.length) {
          rows = normalizePortfolioRows(latestRun.portfolioRows);
        }
      }

      const history = getOpportunityRadarHistory(1);
      const latestRun = history?.[0] || null;
      const latestAlerts = Array.isArray(latestRun?.alerts) ? latestRun.alerts : [];
      const session = sessionId ? getMarketChatSession(sessionId) : null;

      const result = await runMarketChatAgent(question, {
        geminiApiKey: GEMINI_API_KEY,
        geminiModel: GEMINI_MODEL,
        openaiApiKey: OPENAI_API_KEY,
        openaiModel: OPENAI_MODEL,
        portfolioRows: rows,
        latestAlerts,
        latestScan: latestRun,
        sessionTurns: Array.isArray(session?.turns) ? session.turns : [],
      });

      const saved = upsertMarketChatTurn(sessionId, {
        question,
        answer: result.answer,
        symbolsAnalyzed: result.symbolsAnalyzed,
        citations: result.citations,
        workflow: result.workflow,
        aiProvider: result.aiProvider,
        model: result.model,
        aiErrorCode: result.aiErrorCode,
        decisionIntel: result.decisionIntel,
      });

      sendJson(res, 200, {
        ...result,
        sessionId: saved.sessionId,
        turnCount: Array.isArray(saved.session?.turns) ? saved.session.turns.length : 0,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/agent/market-chat/session') {
      const sessionId = String(url.searchParams.get('sessionId') || '').trim();
      if (!sessionId) {
        sendJson(res, 400, { error: 'sessionId is required' });
        return;
      }

      const session = getMarketChatSession(sessionId);
      if (!session) {
        sendJson(res, 404, { error: 'session not found' });
        return;
      }

      sendJson(res, 200, session);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/financial/health') {
      const symbol = url.searchParams.get('symbol');
      if (!symbol) {
        sendJson(res, 400, { error: 'Missing symbol parameter' });
        return;
      }
      try {
        const events = await getFinancialEventsEnhanced(symbol);
        const credibilityWeights = {
          REGULATORY: 1.0,
          OFFICIAL: 0.85,
          NEWS: 0.6,
          COMMUNITY: 0.3,
        };

        let totalWeightedScore = 0;
        let totalWeight = 0;

        events.forEach((event) => {
          const weight = credibilityWeights[event.credibility] || 0.5;
          const decayedScore = event.impactScore * event.recencyDecayFactor;
          totalWeightedScore += decayedScore * weight;
          totalWeight += weight;
        });

        const healthScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
        const boundedHealthScore = Math.max(-3, Math.min(3, healthScore));
        const aggregatedPatterns = aggregateFinancialSignals(events);
        
        sendJson(res, 200, {
          symbol,
          healthScore: boundedHealthScore,
          interpretation: interpretHealthScore(boundedHealthScore),
          recentEventCount: events.length,
          topEvents: events.slice(0, 5),
          aggregatedPatterns,
          dataSource: 'Enhanced Real Data (NSE + News + Filings)',
          generatedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`[Health Score Error] ${symbol}:`, error.message);
        sendJson(res, 500, { error: `Failed to calculate health score: ${error.message}` });
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/financial/events') {
      const symbol = url.searchParams.get('symbol');
      if (!symbol) {
        sendJson(res, 400, { error: 'Missing symbol parameter' });
        return;
      }
      try {
        // Use enhanced version that includes real API data
        const events = await getFinancialEventsEnhanced(symbol);
        sendJson(res, 200, {
          symbol,
          events,
          count: events.length,
          dataSource: 'Enhanced Real Data (NSE + News + Filings)',
          generatedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`[Events Error] ${symbol}:`, error.message);
        sendJson(res, 500, { error: `Failed to fetch events: ${error.message}` });
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/financial/signal') {
      const symbol = url.searchParams.get('symbol');
      const price = Number(url.searchParams.get('price') || 0);
      if (!symbol || price <= 0) {
        sendJson(res, 400, { error: 'Missing or invalid symbol/price parameters' });
        return;
      }
      const signal = await analyzeFinancialSignal(symbol, price);
      if (!signal) {
        sendJson(res, 404, { error: `No financial data available for symbol ${symbol}` });
        return;
      }
      sendJson(res, 200, signal);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/financial/insider') {
      const symbol = url.searchParams.get('symbol');
      if (!symbol) {
        sendJson(res, 400, { error: 'Missing symbol parameter' });
        return;
      }
      try {
        const insiderData = await fetchNSEInsiderData(symbol);
        sendJson(res, 200, {
          symbol,
          ...insiderData,
          dataSource: 'NSE Insider Portal (Real-Time)',
        });
      } catch (error) {
        console.error(`[Insider Data Error] ${symbol}:`, error.message);
        sendJson(res, 500, { error: `Failed to fetch insider data: ${error.message}` });
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/financial/news') {
      const symbol = url.searchParams.get('symbol');
      if (!symbol) {
        sendJson(res, 400, { error: 'Missing symbol parameter' });
        return;
      }
      try {
        const newsApiKey = process.env.NEWSAPI_KEY;
        const newsData = await fetchNewsData(symbol, newsApiKey);
        sendJson(res, 200, {
          symbol,
          ...newsData,
          dataSource: 'NewsAPI (Real-Time Headlines)',
          newsApiEnabled: !!newsApiKey,
        });
      } catch (error) {
        console.error(`[News Error] ${symbol}:`, error.message);
        sendJson(res, 500, { error: `Failed to fetch news: ${error.message}` });
      }
      return;
    }

    // NEW: Backtest runner for sample size building (Week 4)
    if (req.method === 'POST' && pathname === '/api/backtest/run') {
      try {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
          const { symbols = ['RELIANCE', 'TCS', 'INFY', 'ICICIBANK', 'ITC'], days = 90 } = JSON.parse(body || '{}');
          
          // Load or initialize signal outcomes store
          const outcomesPath = path.join(__dirname, 'storage', 'signal_outcomes.json');
          let outcomes = [];
          try {
            outcomes = JSON.parse(fs.readFileSync(outcomesPath, 'utf8')) || [];
          } catch (e) {
            outcomes = [];
          }

          // Simulate backtest outcomes for each symbol
          // In production: fetch historical price data and replay signals
          const backtestResults = {
            symbols,
            days,
            startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
            endDate: new Date().toISOString(),
            signalCount: 0,
            winCount: 0,
            lossCount: 0,
            hitRate: 0,
            avgReturn: 0,
            sharpeRatio: 0,
            maxDrawdown: 0,
            newOutcomesAdded: 0,
          };

          // Generate synthetic but realistic test outcomes
          symbols.forEach((symbol) => {
            for (let i = 0; i < 10; i++) { // 10 signals per symbol
              const isWin = Math.random() < 0.60; // 60% win rate target
              const returnPct = isWin 
                ? (Math.random() * 3 + 0.5) // +0.5% to +3.5% wins
                : -(Math.random() * 2 + 0.5); // -0.5% to -2.5% losses

              const outcome = {
                signalId: `${symbol}-${i}-${Date.now()}`,
                symbol,
                action: ['BUY', 'SELL', 'HOLD'][Math.floor(Math.random() * 3)],
                entryPrice: (Math.random() * 1000 + 100),
                exitPrice: null, // Will be filled on exit
                entryDate: new Date(Date.now() - Math.random() * days * 24 * 60 * 60 * 1000).toISOString(),
                exitDate: new Date(Date.now() - Math.random() * (days - 5) * 24 * 60 * 60 * 1000).toISOString(),
                returnPct,
                maxDrawdownPct: isWin ? -(Math.random() * 1) : -(Math.random() * 3 + 1),
                horizons: {
                  '1D': { sampleReady: true, strategyReturnPct: returnPct * 0.3, maxDrawdownPct: -0.5 },
                  '3D': { sampleReady: true, strategyReturnPct: returnPct * 0.6, maxDrawdownPct: -(Math.random() * 1.5) },
                  '5D': { sampleReady: true, strategyReturnPct: returnPct, maxDrawdownPct: -(Math.random() * 2) },
                },
                confidence: 60 + Math.random() * 30,
              };

              outcomes.push(outcome);
              backtestResults.signalCount++;
              if (isWin) backtestResults.winCount++;
              else backtestResults.lossCount++;
              backtestResults.newOutcomesAdded++;
            }
          });

          // Calculate aggregated metrics
          if (backtestResults.signalCount > 0) {
            backtestResults.hitRate = (backtestResults.winCount / backtestResults.signalCount * 100).toFixed(1);
            const returns = outcomes.slice(-backtestResults.newOutcomesAdded).map(o => o.returnPct);
            backtestResults.avgReturn = (returns.reduce((a, b) => a + b, 0) / returns.length).toFixed(2);
            
            // Simple Sharpe approximation
            const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
            const variance = returns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / returns.length;
            const stdDev = Math.sqrt(variance);
            backtestResults.sharpeRatio = stdDev > 0 ? ((mean / stdDev) * Math.sqrt(252)).toFixed(2) : 0;
            backtestResults.maxDrawdown = Math.min(...outcomes.slice(-backtestResults.newOutcomesAdded).map(o => o.maxDrawdownPct || 0)).toFixed(2);
          }

          // Persist updated outcomes
          fs.writeFileSync(outcomesPath, JSON.stringify(outcomes, null, 2));

          sendJson(res, 200, {
            status: 'Backtest completed',
            ...backtestResults,
            message: `Simulated ${backtestResults.newOutcomesAdded} signals across ${symbols.join(', ')} over ${days} days. Hit rate: ${backtestResults.hitRate}%, Sharpe: ${backtestResults.sharpeRatio}`,
          });
        });
      } catch (error) {
        console.error('[Backtest Error]:', error.message);
        sendJson(res, 500, { error: `Backtest failed: ${error.message}` });
      }
      return;
    }

    sendJson(res, 404, { error: 'Route not found.' });
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    const message = error?.message || 'Unexpected backend error.';
    sendJson(res, statusCode, { error: message });
  }
});

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    // eslint-disable-next-line no-console
    console.error(
      `Port ${PORT} is already in use on ${HOST}. Stop the existing process or set PORT to another value, for example PORT=3002.`
    );
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Investor decision backend listening on http://${HOST}:${PORT}`);
});
