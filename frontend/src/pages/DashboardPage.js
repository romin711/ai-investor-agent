import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card';
import FinancialResearchCard from '../components/ui/FinancialResearchCard';
import { SparkIcon } from '../components/icons/AppIcons';
import { usePortfolio } from '../context/PortfolioContext';

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeConfidence(confidenceValue) {
  const numeric = toFiniteNumber(confidenceValue);
  if (numeric === null) {
    return null;
  }
  return numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
}

function formatConfidence(confidenceValue) {
  const normalized = normalizeConfidence(confidenceValue);
  return normalized === null ? '--' : `${normalized}%`;
}

function toAction(decision) {
  const normalized = String(decision || '').toUpperCase();
  if (normalized.includes('BUY')) return 'BUY';
  if (normalized.includes('SELL')) return 'SELL';
  return 'HOLD';
}

function decisionTone(action) {
  if (action === 'BUY') return 'text-emerald-600 dark:text-emerald-400';
  if (action === 'SELL') return 'text-rose-600 dark:text-rose-400';
  return 'text-amber-600 dark:text-amber-400';
}

function fallbackActionLine(action) {
  if (action === 'BUY') return 'Consider staggered entries only after confirmation.';
  if (action === 'SELL') return 'Reduce risk and wait for stabilization before re-entry.';
  return 'Wait for confirmation before opening new positions.';
}

function compactSignalType(alert) {
  const signal = String(alert?.signalType || '').toLowerCase();
  if (signal.includes('oversold')) return 'Oversold';
  if (signal.includes('breakout')) return 'Breakout';
  if (signal.includes('trend-follow')) return 'Trend Follow';
  return 'Weak Trend';
}

function biasTone(bias) {
  const normalized = String(bias || 'Neutral').toLowerCase();
  if (normalized === 'bullish') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  }
  if (normalized === 'bearish') {
    return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
  }
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
}

function shortenHeadline(headline, maxLength = 110) {
  const text = String(headline || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength).trim()}...`;
}

function DashboardPage() {
  const navigate = useNavigate();
  const {
    analysisData,
    opportunityRadarData,
    apiBaseUrl,
    apiError,
    portfolioRows,
  } = usePortfolio();

  const [marketSummary, setMarketSummary] = useState(null);
  const [newsItems, setNewsItems] = useState([]);
  const [isLoadingMarket, setIsLoadingMarket] = useState(false);
  const [isLoadingNews, setIsLoadingNews] = useState(false);

  const liveResults = useMemo(() => analysisData?.results || [], [analysisData]);
  const primaryResult = useMemo(() => liveResults[0] || null, [liveResults]);

  const selectedAction = useMemo(() => toAction(primaryResult?.decision), [primaryResult]);
  const decisionLine = useMemo(() => {
    const nextAction = String(primaryResult?.next_action || '').trim();
    return nextAction || fallbackActionLine(selectedAction);
  }, [primaryResult, selectedAction]);

  const compactAlerts = useMemo(() => {
    const rawAlerts = Array.isArray(opportunityRadarData?.alerts) ? opportunityRadarData.alerts : [];
    return rawAlerts.slice(0, 5).map((alert) => ({
      symbol: String(alert?.symbol || '--').toUpperCase(),
      signalType: compactSignalType(alert),
      confidence: formatConfidence(alert?.confidence),
    }));
  }, [opportunityRadarData]);

  const nextSteps = useMemo(() => {
    const steps = [];
    if (selectedAction === 'SELL') {
      steps.push('Avoid new entries until trend stabilizes.');
      steps.push('Review high-beta holdings for risk reduction.');
    } else if (selectedAction === 'BUY') {
      steps.push('Use staggered entries instead of full allocation.');
      steps.push('Prioritize setups aligned with stronger sectors.');
    } else {
      steps.push('Wait for confirmation before opening new trades.');
      steps.push('Track leadership sectors before reallocating capital.');
    }

    const sectorSummary = String(marketSummary?.sectorTrend?.summary || '').toLowerCase();
    if (sectorSummary.includes('weak')) {
      steps.push('Monitor weak sectors and avoid averaging down early.');
    } else if (sectorSummary.includes('strong')) {
      steps.push('Focus watchlist on sectors showing relative strength.');
    } else {
      steps.push('Keep position sizes small in mixed market conditions.');
    }

    return steps.slice(0, 3);
  }, [marketSummary, selectedAction]);

  useEffect(() => {
    let isMounted = true;

    const fallbackBase = apiBaseUrl.includes('127.0.0.1')
      ? apiBaseUrl.replace('127.0.0.1', 'localhost')
      : apiBaseUrl.replace('localhost', '127.0.0.1');

    async function fetchWithFallback(path) {
      const endpoints = [apiBaseUrl, fallbackBase].filter(Boolean);

      for (let index = 0; index < endpoints.length; index += 1) {
        const base = endpoints[index];
        try {
          const response = await fetch(`${base}${path}`);
          if (response.ok) {
            return await response.json();
          }
        } catch (_error) {
          // Try the next host variant.
        }
      }

      return null;
    }

    async function loadIntel() {
      setIsLoadingMarket(true);
      setIsLoadingNews(true);

      const [marketData, newsData] = await Promise.all([
        fetchWithFallback('/api/market/summary'),
        fetchWithFallback('/api/news/financial?limit=5'),
      ]);

      if (!isMounted) {
        return;
      }

      setMarketSummary(marketData);
      setNewsItems(Array.isArray(newsData?.items) ? newsData.items.slice(0, 5) : []);
      setIsLoadingMarket(false);
      setIsLoadingNews(false);
    }

    loadIntel();
    return () => {
      isMounted = false;
    };
  }, [apiBaseUrl]);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2" interactive={false}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Decision</p>
          <div className="mt-3 flex items-end justify-between gap-6">
            <p className={`text-5xl font-black ${decisionTone(selectedAction)}`}>{selectedAction}</p>
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Confidence</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{formatConfidence(primaryResult?.confidence)}</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-700 dark:text-slate-200">{decisionLine}</p>
        </Card>

        <Card className="p-6" interactive={false}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Action</p>
          <div className="mt-3 space-y-2">
            {nextSteps.map((step) => (
              <p key={step} className="text-sm text-slate-700 dark:text-slate-200">• {step}</p>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-6" interactive={false}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Market Summary</p>
          {isLoadingMarket ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading market context...</p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">NIFTY 50</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{marketSummary?.nifty?.movement || '--'}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">SENSEX</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{marketSummary?.sensex?.movement || '--'}</p>
                </div>
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">{marketSummary?.sectorTrend?.summary || 'Sector trend data unavailable.'}</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{marketSummary?.summaryLine || 'No market-wide summary available yet.'}</p>
            </>
          )}
        </Card>

        <Card className="p-6" interactive={false}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Financial News</p>
          {isLoadingNews ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading live headlines...</p>
          ) : newsItems.length ? (
            <ul className="mt-3 space-y-2">
              {newsItems.map((item) => (
                <li key={`${item.headline}-${item.publishedAt || ''}`} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                  <a
                    href={item.url || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-slate-700 hover:underline dark:text-slate-200"
                    title={item.headline}
                  >
                    • {shortenHeadline(item.headline)}
                  </a>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${biasTone(item.bias)}`}>{item.bias || 'Neutral'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No live headlines available.</p>
          )}
        </Card>
      </section>

      {portfolioRows && portfolioRows.length > 0 && (
        <FinancialResearchCard
          symbols={portfolioRows.map((row) => row?.symbol)}
          portfolioData={portfolioRows}
        />
      )}

      <section>
        <Card className="p-6" interactive={false}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Opportunity Alerts</p>
            <button
              type="button"
              onClick={() => navigate('/opportunity-radar')}
              className="text-sm font-semibold text-[#0F766E] hover:underline"
            >
              View Detailed Analysis
            </button>
          </div>

          {compactAlerts.length ? (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {compactAlerts.map((alert) => (
                <button
                  type="button"
                  key={`${alert.symbol}-${alert.signalType}`}
                  onClick={() => navigate('/opportunity-radar')}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                >
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{alert.symbol}</span>
                  <span className="text-xs text-slate-600 dark:text-slate-300">{alert.signalType}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No compact alerts available. Run Opportunity Radar for live signals.</p>
          )}
        </Card>
      </section>

      {!liveResults.length ? (
        <Card className="p-6" interactive={false}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            No portfolio analysis available yet. Upload symbols in Portfolio Workspace and run analysis.
          </p>
          <button
            type="button"
            onClick={() => navigate('/portfolio')}
            className="ripple-btn mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white shadow-md transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-lg"
          >
            <SparkIcon />
            Open Portfolio Workspace
          </button>
        </Card>
      ) : null}

      {apiError ? (
        <Card className="p-4" interactive={false}>
          <p className="text-sm text-rose-600 dark:text-rose-400">{apiError}</p>
        </Card>
      ) : null}
    </div>
  );
}

export default DashboardPage;
