import React, { useEffect, useMemo, useState } from 'react';

/**
 * Financial Research Card
 * Displays fundamental analysis: filings, insider trading, block trades, management tone
 * Shows patterns and alpha evidence for trading decisions
 */
export default function FinancialResearchCard({ symbol, symbols = [], portfolioData = [] }) {
  const [financialDataBySymbol, setFinancialDataBySymbol] = useState({});
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedSection, setExpandedSection] = useState('patterns');

  const symbolList = useMemo(() => {
    const fromSymbolsProp = Array.isArray(symbols)
      ? symbols.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean)
      : [];

    const fromPortfolio = Array.isArray(portfolioData)
      ? portfolioData.map((row) => String(row?.symbol || '').trim().toUpperCase()).filter(Boolean)
      : [];

    const merged = [...fromSymbolsProp, ...fromPortfolio, String(symbol || '').trim().toUpperCase()].filter(Boolean);
    return Array.from(new Set(merged));
  }, [portfolioData, symbol, symbols]);

  useEffect(() => {
    if (!symbolList.length) {
      setSelectedSymbol('');
      return;
    }
    setSelectedSymbol((previous) => (symbolList.includes(previous) ? previous : symbolList[0]));
  }, [symbolList]);

  useEffect(() => {
    if (!symbolList.length) return;

    const fetchFinancialData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const hosts = ['127.0.0.1', 'localhost'];
        const nextData = {};

        await Promise.all(symbolList.map(async (itemSymbol) => {
          for (const host of hosts) {
            try {
              const response = await fetch(
                `http://${host}:3001/api/financial/health?symbol=${encodeURIComponent(itemSymbol)}`,
                { method: 'GET', headers: { 'Content-Type': 'application/json' } }
              );
              if (response.ok) {
                const data = await response.json();
                nextData[itemSymbol] = data;
                return;
              }
            } catch (_e) {
              // Try next host alias.
            }
          }
        }));

        if (!Object.keys(nextData).length) {
          throw new Error('No financial data fetched.');
        }

        setFinancialDataBySymbol(nextData);
      } catch (err) {
        setError('Failed to load financial data. Check your portfolio first.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchFinancialData();
  }, [symbolList]);

  const financialData = selectedSymbol ? financialDataBySymbol[selectedSymbol] : null;

  if (!symbolList.length) return null;

  if (isLoading) {
    return (
      <section className="rounded-2xl bg-white p-4 shadow-md dark:bg-[#1E293B] lg:col-span-2 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Fundamental Research
        </h3>
        <div className="mt-4 animate-pulse space-y-3">
          <div className="h-4 bg-slate-200 rounded dark:bg-slate-700 w-3/4"></div>
          <div className="h-4 bg-slate-200 rounded dark:bg-slate-700 w-1/2"></div>
        </div>
      </section>
    );
  }

  if (error || !financialData) {
    return (
      <section className="rounded-2xl bg-white p-4 shadow-md dark:bg-[#1E293B] lg:col-span-2 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Fundamental Research
        </h3>
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{error || 'No data'}</p>
      </section>
    );
  }

  const healthScore = financialData.healthScore || 0;
  const interpretation = financialData.interpretation || '';
  const topEvents = financialData.topEvents || [];
  const patterns = financialData.aggregatedPatterns || [];

  const topDrivers = topEvents.slice(0, 3);
  const positiveDrivers = topDrivers.filter((event) => (event.impactScore || 0) > 0);
  const negativeDrivers = topDrivers.filter((event) => (event.impactScore || 0) < 0);
  const compositeImpact = topDrivers.reduce((sum, event) => sum + (event.impactScore || 0), 0);

  const getCompositeSignalText = () => {
    if (topDrivers.length === 0) {
      return 'No major converged patterns yet and no high-impact events detected. Wait for fresh filings, insider activity, or management/news catalysts.';
    }
    if (compositeImpact >= 1.5) {
      return 'Composite signal is bullish with positive event alignment across key drivers.';
    }
    if (compositeImpact <= -1.5) {
      return 'Composite signal is bearish with downside pressure across key drivers.';
    }
    return 'Composite signal is mixed; monitor the strongest positive and negative drivers before acting.';
  };

  // Color code health score
  const getHealthColor = (score) => {
    if (score > 1.5) return 'text-green-600 dark:text-green-400';
    if (score > 0.5) return 'text-blue-600 dark:text-blue-400';
    if (score < -1.5) return 'text-red-600 dark:text-red-400';
    if (score < -0.5) return 'text-orange-600 dark:text-orange-400';
    return 'text-slate-600 dark:text-slate-400';
  };

  const getHealthBgColor = (score) => {
    if (score > 1.5) return 'bg-green-50 dark:bg-green-900/20';
    if (score > 0.5) return 'bg-blue-50 dark:bg-blue-900/20';
    if (score < -1.5) return 'bg-red-50 dark:bg-red-900/20';
    if (score < -0.5) return 'bg-orange-50 dark:bg-orange-900/20';
    return 'bg-slate-50 dark:bg-slate-900/20';
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-md dark:bg-[#1E293B] lg:col-span-2 p-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Fundamental Research
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            Filings • Insider Trading • Block Trades • Management Tone
          </p>
        </div>
        {symbolList.length > 1 ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Symbol</span>
            <select
              value={selectedSymbol}
              onChange={(event) => setSelectedSymbol(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#0F766E] dark:border-slate-600 dark:bg-slate-900"
            >
              {symbolList.map((itemSymbol) => (
                <option key={itemSymbol} value={itemSymbol}>{itemSymbol}</option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {/* FINANCIAL HEALTH SCORE */}
      <div className={`mt-4 rounded-lg p-4 ${getHealthBgColor(healthScore)}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
              Financial Health Score
            </p>
            <p className={`mt-2 text-3xl font-bold ${getHealthColor(healthScore)}`}>
              {healthScore > 0 ? '+' : ''}{healthScore.toFixed(2)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
              Interpretation
            </p>
            <p className="mt-2 text-xs leading-tight text-slate-700 dark:text-slate-300 max-w-xs">
              {interpretation}
            </p>
          </div>
        </div>
      </div>

      {/* TABS FOR SECTIONS */}
      <div className="mt-6 border-b border-slate-200 dark:border-slate-700">
        <div className="flex gap-4">
          {['patterns', 'events', 'alpha'].map((section) => (
            <button
              key={section}
              onClick={() => setExpandedSection(section)}
              className={`pb-3 px-1 text-sm font-medium transition-colors ${
                expandedSection === section
                  ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300'
              }`}
            >
              {section === 'patterns' && 'Patterns'}
              {section === 'events' && 'Events'}
              {section === 'alpha' && 'Alpha Panel'}
            </button>
          ))}
        </div>
      </div>

      {/* SECTION: AGGREGATED PATTERNS */}
      {expandedSection === 'patterns' && (
        <div className="mt-4 space-y-3">
          {patterns.length > 0 ? (
            patterns.map((pattern, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/40"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {pattern.pattern.replace(/_/g, ' ')}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      {pattern.reasoning}
                    </p>
                    <div className="mt-2 space-y-1">
                      {pattern.signals?.map((sig, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-slate-600 dark:text-slate-400">
                            {sig.type}
                          </span>
                          <span
                            className={`font-semibold ${
                              sig.score > 0 ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {sig.score > 0 ? '+' : ''}{sig.score}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="ml-4 text-right">
                    <div
                      className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${
                        pattern.recommendation === 'BUY'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : pattern.recommendation === 'SELL'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}
                    >
                      {pattern.recommendation}
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {pattern.confidence}% confidence
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No converged patterns found. Analyze individual event drivers below.
            </p>
          )}
        </div>
      )}

      {/* SECTION: FINANCIAL EVENTS */}
      {expandedSection === 'events' && (
        <div className="mt-4 space-y-2">
          {topEvents.length > 0 ? (
            topEvents.map((event, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/40"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded-md ${
                          event.type === 'FILING'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : event.type === 'INSIDER_TRADING'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                            : event.type === 'BLOCK_TRADE'
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
                        }`}
                      >
                        {event.type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(event.date).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-900 dark:text-slate-100 font-medium">
                      {event.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      Credibility: {event.credibility}
                    </p>
                  </div>
                  <span
                    className={`ml-4 text-lg font-bold ${
                      event.impactScore > 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {event.impactScore > 0 ? '+' : ''}{event.impactScore}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No recent financial events found.
            </p>
          )}
        </div>
      )}

      {/* SECTION: ALPHA PANEL */}
      {expandedSection === 'alpha' && patterns.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-blue-50 dark:bg-blue-900/20">
            <p className="text-xs font-bold uppercase text-blue-900 dark:text-blue-100">
              Alpha Evidence
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {patterns.map((pattern, idx) => (
                <div key={idx}>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Hit Rate</p>
                  <p className="mt-1 text-lg font-bold text-blue-600 dark:text-blue-400">
                    {pattern.confidence}%
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                    {pattern.pattern.split('_')[0]}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-3">
              <p className="text-xs text-slate-600 dark:text-slate-400">Expected Edge</p>
              <p className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                {patterns[0]?.confidence > 80
                  ? 'Strong convergence of fundamental signals; high confidence trade setup'
                  : patterns[0]?.confidence > 70
                  ? 'Moderate evidence; favorable risk/reward ratio'
                  : 'Weak evidence; wait for more confirmation'}
              </p>
            </div>
          </div>
        </div>
      )}

      {expandedSection === 'alpha' && patterns.length === 0 && (
        <div className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3">
          <p className="text-xs text-amber-900 dark:text-amber-100">{getCompositeSignalText()}</p>
          {topDrivers.length > 0 && (
            <div className="mt-3 space-y-2">
              {topDrivers.map((event, idx) => (
                <div key={`${event.type}-${event.date}-${idx}`} className="text-xs text-amber-900 dark:text-amber-100">
                  <span className="font-semibold">{event.type.replace(/_/g, ' ')}</span>
                  <span className="mx-1">-</span>
                  <span>{event.title}</span>
                  <span className="mx-1">(impact:</span>
                  <span className={event.impactScore >= 0 ? 'font-semibold text-green-700 dark:text-green-300' : 'font-semibold text-red-700 dark:text-red-300'}>
                    {event.impactScore > 0 ? '+' : ''}{event.impactScore}
                  </span>
                  <span>)</span>
                </div>
              ))}
              <p className="pt-1 text-xs text-amber-900 dark:text-amber-100">
                Positives: {positiveDrivers.length} | Negatives: {negativeDrivers.length} | Net Impact: {compositeImpact > 0 ? '+' : ''}{compositeImpact.toFixed(2)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* FOOTER */}
      <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Financial data includes regulatory filings, insider trades, block purchases, management
          guidance, and momentum/news context. Signals are generated from multi-factor pattern
          recognition.
        </p>
      </div>
    </section>
  );
}
