import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import ChartCard from '../components/ui/ChartCard';
import StatCard from '../components/ui/StatCard';
import { ArrowTrendIcon, SparkIcon } from '../components/icons/AppIcons';
import { usePortfolio } from '../context/PortfolioContext';

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatCurrency(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return '$0.00';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(numeric);
}

function formatSignedPercent(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return '0.00%';
  }
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}%`;
}

function formatSignedCurrency(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return '$0.00';
  }
  const amount = formatCurrency(Math.abs(numeric));
  return `${numeric >= 0 ? '+' : '-'}${amount}`;
}

function formatOptionalCurrency(value) {
  const numeric = toFiniteNumber(value);
  return numeric === null ? 'Not enough data' : formatCurrency(numeric);
}

function formatOptionalNumber(value, digits = 2) {
  const numeric = toFiniteNumber(value);
  return numeric === null ? 'Not enough data' : numeric.toFixed(digits);
}

function formatOptionalPercent(value) {
  const numeric = toFiniteNumber(value);
  return numeric === null ? 'Not enough data' : formatSignedPercent(numeric);
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
  return normalized === null ? 'Not enough data' : `${normalized}%`;
}

function confidenceWidth(confidenceValue) {
  const normalized = normalizeConfidence(confidenceValue);
  return normalized === null ? 0 : normalized;
}

function normalizeHistoricalSeries(item) {
  if (Array.isArray(item?.historical) && item.historical.length) {
    return item.historical
      .map((point) => {
        const close = toFiniteNumber(point?.close);
        if (close === null) {
          return null;
        }

        return {
          date: point?.date || '',
          close,
        };
      })
      .filter(Boolean);
  }

  if (Array.isArray(item?.stock_data?.price_history) && item.stock_data.price_history.length) {
    return item.stock_data.price_history
      .map((close, index, points) => {
        const numericClose = toFiniteNumber(close);
        if (numericClose === null) {
          return null;
        }

        const dayOffset = points.length - index - 1;
        const date = new Date();
        date.setDate(date.getDate() - dayOffset);
        return {
          date: date.toISOString().slice(5, 10),
          close: numericClose,
        };
      })
      .filter(Boolean);
  }

  return [];
}

function buildSignalList(item) {
  if (Array.isArray(item?.signals)) {
    return item.signals;
  }

  const signals = item?.signals && typeof item.signals === 'object' ? item.signals : {};
  return [
    `Trend: ${item?.trend || signals.trend || 'Not enough data'}`,
    `RSI: ${formatOptionalNumber(item?.rsi ?? signals.rsi)}`,
    `Momentum: ${formatOptionalPercent(item?.momentum_percent ?? signals.momentum)}`,
    `Breakout: ${signals.breakout === true ? 'Yes' : signals.breakout === false ? 'No' : 'Not enough data'}`,
  ];
}

function toAction(decision) {
  const normalized = String(decision || '').toUpperCase();
  if (normalized.includes('BUY')) {
    return 'BUY';
  }
  if (normalized.includes('SELL')) {
    return 'SELL';
  }
  return 'HOLD';
}

function DashboardPage() {
  const navigate = useNavigate();
  const {
    analysisData,
    portfolioRows,
    realtimeQuotes,
    lastQuoteTimestamp,
    refreshRealtimeQuotes,
    isRefreshingQuotes,
    apiError,
  } = usePortfolio();

  const [selectedSymbol, setSelectedSymbol] = useState('');
  const liveResults = useMemo(() => analysisData?.results || [], [analysisData]);
  const hasLiveData = liveResults.length > 0;

  useEffect(() => {
    if (!hasLiveData) {
      setSelectedSymbol('');
      return;
    }
    setSelectedSymbol((previous) => previous || liveResults[0].symbol);
  }, [hasLiveData, liveResults]);

  const selectedResult = useMemo(() => {
    if (!hasLiveData) {
      return null;
    }
    return liveResults.find((item) => item.symbol === selectedSymbol) || liveResults[0];
  }, [hasLiveData, liveResults, selectedSymbol]);

  const symbolsForRefresh = useMemo(
    () => liveResults.map((item) => item.symbol).filter(Boolean),
    [liveResults]
  );

  const weightsBySymbol = useMemo(() => {
    const map = {};
    portfolioRows.forEach((row) => {
      const symbol = String(row.symbol || '').trim().toUpperCase();
      const weight = Number(row.weight);
      if (symbol && !Number.isNaN(weight)) {
        map[symbol] = weight;
      }
    });
    return map;
  }, [portfolioRows]);

  const trackedStocks = useMemo(() => liveResults.map((item) => {
    const latestPrice = toFiniteNumber(realtimeQuotes[item.symbol]?.price ?? item.price ?? item.stock_data?.price);
    const historical = normalizeHistoricalSeries(item);
    const previousClose = historical.length > 1 ? toFiniteNumber(historical[historical.length - 2]?.close) : null;
    const changePercent = latestPrice !== null && previousClose !== null && previousClose !== 0
      ? ((latestPrice - previousClose) / previousClose) * 100
      : null;

    return {
      symbol: item.symbol,
      priceNumeric: latestPrice,
      price: formatOptionalCurrency(latestPrice),
      changePercent,
      change: formatOptionalPercent(changePercent),
      trend: item.trend || item.signals?.trend || 'neutral',
      rsi: toFiniteNumber(item.rsi ?? item.signals?.rsi ?? item.signals?.rsi_14),
      ma20: toFiniteNumber(item.ma20 ?? item.signals?.ma20),
      ma50: toFiniteNumber(item.ma50 ?? item.signals?.ma50),
      decision: toAction(item.decision),
      confidence: normalizeConfidence(item.confidence),
      weight: Number(weightsBySymbol[item.symbol] || item.weight || 0),
      historical,
      signals: buildSignalList(item),
      reasoning: item.reason || item.reasoning || item.data_warning || 'Reasoning unavailable for this symbol.',
      portfolioInsight: item.portfolioInsight || analysisData?.portfolioInsight || 'Portfolio insight unavailable.',
      resolvedSymbol: item.resolvedSymbol || item.symbol,
    };
  }), [analysisData?.portfolioInsight, liveResults, realtimeQuotes, weightsBySymbol]);

  const selectedTracked = useMemo(() => {
    if (!trackedStocks.length) {
      return null;
    }
    return trackedStocks.find((item) => item.symbol === selectedResult?.symbol) || trackedStocks[0];
  }, [trackedStocks, selectedResult]);

  const chartSeries = useMemo(() => {
    if (!selectedTracked) {
      return [];
    }
    return selectedTracked.historical.map((point) => ({
      time: String(point.date || '').slice(-5) || 'N/A',
      price: toFiniteNumber(point.close),
    })).filter((point) => point.price !== null);
  }, [selectedTracked]);

  const hero = useMemo(() => {
    if (!selectedTracked) {
      return {
        action: 'HOLD',
        confidence: null,
        portfolioValue: 'Not enough data',
        dailyPnl: 'Not enough data',
        dailyPnlPercent: 'Not enough data',
        investedCapital: 'Not enough data',
        cashReserve: 'Not enough data',
      };
    }

    const totalValue = trackedStocks.reduce((sum, item) => {
      if (item.priceNumeric === null) {
        return null;
      }
      return (sum ?? 0) + (item.priceNumeric * item.weight);
    }, 0);
    const previousValue = trackedStocks.reduce((sum, item) => {
      const prev = item.historical.length > 1
        ? toFiniteNumber(item.historical[item.historical.length - 2].close)
        : item.priceNumeric;
      if (prev === null) {
        return null;
      }
      return (sum ?? 0) + (prev * item.weight);
    }, 0);

    const pnl = totalValue !== null && previousValue !== null ? totalValue - previousValue : null;
    const pnlPercent = pnl !== null && previousValue !== null && previousValue !== 0
      ? (pnl / previousValue) * 100
      : null;
    const totalWeight = trackedStocks.reduce((sum, item) => sum + item.weight, 0);
    const cashWeight = Math.max(0, 100 - totalWeight);
    const cashReserve = totalValue !== null && totalWeight > 0 ? totalValue * (cashWeight / totalWeight) : null;
    const investedCapital = totalValue !== null && cashReserve !== null ? Math.max(0, totalValue - cashReserve) : null;

    return {
      action: selectedTracked.decision,
      confidence: selectedTracked.confidence,
      portfolioValue: formatOptionalCurrency(totalValue),
      dailyPnl: pnl === null ? 'Not enough data' : formatSignedCurrency(pnl),
      dailyPnlPercent: pnlPercent === null ? 'Not enough data' : formatSignedPercent(pnlPercent),
      investedCapital: formatOptionalCurrency(investedCapital),
      cashReserve: formatOptionalCurrency(cashReserve),
    };
  }, [selectedTracked, trackedStocks]);

  const metrics = useMemo(() => {
    if (!selectedTracked) {
      return [
        { label: 'Price', value: 'Not enough data', helper: 'Run analysis first', tone: 'neutral' },
        { label: 'Trend', value: 'Not enough data', helper: 'Run analysis first', tone: 'neutral' },
        { label: 'RSI(14)', value: 'Not enough data', helper: 'Run analysis first', tone: 'neutral' },
        { label: 'MA50', value: 'Not enough data', helper: 'Run analysis first', tone: 'neutral' },
      ];
    }

    return [
      {
        label: 'Price',
        value: formatOptionalCurrency(selectedTracked.priceNumeric),
        helper: selectedTracked.symbol,
        tone: 'neutral',
      },
      {
        label: 'Trend',
        value: selectedTracked.trend,
        helper: selectedTracked.decision,
        tone: selectedTracked.trend === 'uptrend' ? 'success' : (selectedTracked.trend === 'downtrend' ? 'warning' : 'neutral'),
      },
      {
        label: 'RSI(14)',
        value: formatOptionalNumber(selectedTracked.rsi),
        helper: 'Momentum oscillator',
        tone: selectedTracked.rsi === null ? 'neutral' : (selectedTracked.rsi > 75 ? 'danger' : (selectedTracked.rsi < 30 ? 'success' : 'warning')),
      },
      {
        label: 'MA50',
        value: formatOptionalCurrency(selectedTracked.ma50),
        helper: '50-day moving average',
        tone: selectedTracked.priceNumeric !== null && selectedTracked.ma50 !== null && selectedTracked.priceNumeric > selectedTracked.ma50
          ? 'success'
          : selectedTracked.ma50 === null
            ? 'neutral'
            : 'warning',
      },
    ];
  }, [selectedTracked]);

  if (!hasLiveData) {
    return (
      <div className="space-y-6">
        <Card className="p-8" interactive={false}>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-[#1D4ED8]">Decision Engine</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">No live market analysis yet</h2>
            <p className="mt-3 text-sm text-gray-500 dark:text-slate-400">
              Go to Portfolio Workspace, upload JSON or enter symbols manually, then run analysis.
            </p>
            <button
              type="button"
              onClick={() => navigate('/portfolio')}
              className="ripple-btn mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1D4ED8] px-5 py-3 text-sm font-semibold text-white shadow-md transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-xl"
            >
              <SparkIcon />
              Go To Portfolio Workspace
            </button>
            {apiError ? (
              <p className="mt-4 text-sm text-[#DC2626]">{apiError}</p>
            ) : null}
          </div>
        </Card>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Core Metrics</h2>
            <span className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
              <ArrowTrendIcon />
              Waiting for model telemetry
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((item) => (
              <StatCard
                key={item.label}
                label={item.label}
                value={item.value}
                helper={item.helper}
                tone={item.tone}
              />
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="relative overflow-hidden p-8 xl:col-span-8">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-100 via-transparent to-emerald-100 opacity-80 dark:from-blue-900/30 dark:to-emerald-900/20" />
          <div className="relative z-10 flex flex-col items-center justify-center text-center">
            <p className="mb-3 text-sm text-gray-500 dark:text-slate-400">Live Decision Engine</p>
            <Badge action={hero.action} />
            <p className="mt-6 text-6xl font-bold text-slate-900 dark:text-slate-100">{formatConfidence(hero.confidence)}</p>
            <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">Confidence Score</p>

            <div className="mt-6 w-full max-w-xl">
              <div className="mb-2 flex items-center justify-between text-sm text-gray-500 dark:text-slate-400">
                <span>Signal Strength</span>
                <span>{formatConfidence(hero.confidence)}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#1D4ED8] via-[#16A34A] to-[#1D4ED8] transition-all duration-200 ease-in-out"
                  style={{ width: `${confidenceWidth(hero.confidence)}%` }}
                />
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6 xl:col-span-4">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Portfolio Value Summary</h2>
            <span className={`rounded-lg px-3 py-1 text-sm font-semibold ${
              String(hero.dailyPnlPercent || '').startsWith('-')
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
            }`}>
              {hero.dailyPnlPercent}
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-slate-400">Total Value</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{hero.portfolioValue}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800">
                <p className="text-sm text-gray-500 dark:text-slate-400">Today PnL</p>
                <p className={`text-lg font-semibold ${
                  String(hero.dailyPnl || '').startsWith('-') ? 'text-[#DC2626]' : 'text-[#16A34A]'
                }`}>{hero.dailyPnl}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800">
                <p className="text-sm text-gray-500 dark:text-slate-400">Cash Reserve</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{hero.cashReserve}</p>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-sm text-gray-500 dark:text-slate-400">Invested Capital</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{hero.investedCapital}</p>
            </div>
            <button
              type="button"
              onClick={() => refreshRealtimeQuotes(symbolsForRefresh)}
              className="ripple-btn mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-4 py-3 text-sm font-semibold text-white shadow-md transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-xl"
            >
              <SparkIcon />
              {isRefreshingQuotes ? 'Refreshing Realtime Data...' : 'Refresh Realtime Data'}
            </button>
            {lastQuoteTimestamp ? (
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Live quotes updated: {new Date(lastQuoteTimestamp).toLocaleString()}
              </p>
            ) : null}
          </div>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-10">
        <div className="space-y-6 xl:col-span-7">
          <ChartCard
            title={selectedTracked ? `${selectedTracked.symbol} Daily Prices (60D)` : 'Daily Prices'}
            subtitle="Fetched from live market API and updated with refresh"
            data={chartSeries}
          />

          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Tracked Stocks</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400">{trackedStocks.length} live positions</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {trackedStocks.map((stock) => {
                const isPositive = stock.changePercent !== null && stock.changePercent >= 0;
                const isSelected = stock.symbol === selectedTracked?.symbol;
                return (
                  <Card
                    key={stock.symbol}
                    className={`p-4 ${isSelected ? 'ring-2 ring-[#1D4ED8]' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedSymbol(stock.symbol)}
                      className="w-full text-left"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{stock.symbol}</p>
                          <p className="text-sm text-gray-500 dark:text-slate-400">
                            {stock.trend} | RSI {formatOptionalNumber(stock.rsi)}
                          </p>
                        </div>
                        <span
                          className={`rounded-lg px-2 py-1 text-sm font-semibold ${
                            isPositive
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : stock.changePercent === null
                                ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                          }`}
                        >
                          {stock.change}
                        </span>
                      </div>

                      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stock.price}</p>
                      <p className="text-sm text-gray-500 dark:text-slate-400">
                        MA20: {formatOptionalCurrency(stock.ma20)} | MA50: {formatOptionalCurrency(stock.ma50)}
                      </p>
                      <p className="mt-3 text-sm text-gray-500 dark:text-slate-400">
                        Decision: {stock.decision} | Confidence: {formatConfidence(stock.confidence)}
                      </p>
                    </button>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4 xl:col-span-3">
          <Card className="p-5">
            <h3 className="text-lg font-semibold">Portfolio Insight</h3>
            <div className={`mt-3 rounded-xl border px-3 py-3 text-sm ${
              String(selectedTracked?.portfolioInsight || '').toLowerCase().includes('high risk')
                ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-700/40 dark:bg-emerald-900/20 dark:text-emerald-200'
            }`}>
              {selectedTracked?.portfolioInsight || analysisData?.portfolioInsight || 'Portfolio insight unavailable.'}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-lg font-semibold">Reasoning</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
              {selectedTracked
                ? selectedTracked.reasoning
                : 'Select a symbol to inspect reasoning.'}
            </p>
          </Card>

          <Card className="p-5">
            <h3 className="text-lg font-semibold">Signals</h3>
            {selectedTracked?.signals?.length ? (
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-600 dark:text-slate-300">
                {selectedTracked.signals.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">No signal breakdown available.</p>
            )}
            <p className="mt-3 text-xs text-gray-500 dark:text-slate-400">
              Resolved ticker: {selectedTracked?.resolvedSymbol || 'Not enough data'}
            </p>
          </Card>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Core Metrics</h2>
          <span className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
            <ArrowTrendIcon />
            Live model telemetry
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((item) => (
            <StatCard
              key={item.label}
              label={item.label}
              value={item.value}
              helper={item.helper}
              tone={item.tone}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export default DashboardPage;
