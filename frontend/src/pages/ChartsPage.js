import React, { useEffect, useMemo, useState } from 'react';
import Card from '../components/ui/Card';
import ChartCard from '../components/ui/ChartCard';
import { usePortfolio } from '../context/PortfolioContext';

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeSymbolKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\.(NS|BO)$/, '');
}

function normalizeHistoricalSeries(item) {
  if (Array.isArray(item?.historical) && item.historical.length) {
    return item.historical
      .map((point) => {
        const open = toFiniteNumber(point?.open);
        const high = toFiniteNumber(point?.high);
        const low = toFiniteNumber(point?.low);
        const close = toFiniteNumber(point?.close);
        const volume = toFiniteNumber(point?.volume);
        const date = String(point?.date || '').slice(0, 10);

        if (!date || close === null) {
          return null;
        }

        return {
          date,
          open,
          high,
          low,
          close,
          volume,
        };
      })
      .filter((point) => point !== null);
  }
  return [];
}

function normalizeConfidence(confidenceValue) {
  const numeric = toFiniteNumber(confidenceValue);
  if (numeric === null) {
    return null;
  }
  return numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
}

function toAction(decisionValue) {
  const action = String(decisionValue || '').trim().toUpperCase();
  return ['BUY', 'HOLD', 'SELL'].includes(action) ? action : 'HOLD';
}

function getDecisionVisual(decision, confidence) {
  const baseClass = 'rounded-2xl border px-4 py-3 font-semibold uppercase tracking-[0.14em]';

  if (decision === 'BUY') {
    return {
      border: `${baseClass} border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/25 dark:text-emerald-300`,
      stockBorder: 'border-emerald-200',
    };
  }

  if (decision === 'SELL') {
    return {
      border: `${baseClass} border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700/60 dark:bg-rose-900/25 dark:text-rose-300`,
      stockBorder: 'border-rose-200',
    };
  }

  return {
    border: `${baseClass} border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-900/25 dark:text-amber-300`,
    stockBorder: 'border-amber-200',
  };
}

function getSelectedRingClass(decision) {
  if (decision === 'BUY') {
    return 'ring-emerald-500/70';
  }

  if (decision === 'SELL') {
    return 'ring-rose-500/70';
  }

  return 'ring-amber-500/70';
}

function formatOptionalCurrency(value, symbol = '') {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return 'Not enough data';
  }

  const currency = 'INR';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function formatOptionalPercent(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return 'Not enough data';
  }
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}%`;
}

function formatComputedPercent(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return 'N/A';
  }
  return `${numeric.toFixed(2)}%`;
}

function formatSignedComputedPercent(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return 'N/A';
  }
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}%`;
}

function computeExecutionPlanMetrics(executionPlan, currentPrice, action = 'BUY') {
  const entryLow = toFiniteNumber(executionPlan?.entryRangeLow);
  const entryHigh = toFiniteNumber(executionPlan?.entryRangeHigh) ?? entryLow;
  const entryPrice = toFiniteNumber(executionPlan?.entryPrice);
  const stopLoss = toFiniteNumber(executionPlan?.stopLoss);
  const target1 = toFiniteNumber(executionPlan?.targetPrice);
  const target2 = target1 !== null ? target1 * 1.02 : null;
  const entryMid = entryLow !== null && entryHigh !== null ? (entryLow + entryHigh) / 2 : null;
  const referencePrice = entryPrice ?? entryMid ?? entryLow ?? toFiniteNumber(currentPrice);
  const direction = String(action || 'BUY').toUpperCase() === 'SELL' ? -1 : 1;

  const pctChangeAbs = (delta, denominator) => {
    if (!Number.isFinite(delta) || !Number.isFinite(denominator) || denominator <= 0) {
      return null;
    }
    return Math.abs((delta / denominator) * 100);
  };

  const pctChangeSigned = (delta, denominator) => {
    if (!Number.isFinite(delta) || !Number.isFinite(denominator) || denominator <= 0) {
      return null;
    }
    return ((delta / denominator) * 100) * direction;
  };

  return {
    entryLow,
    entryHigh,
    stopLoss,
    target1,
    target2,
    entryRangePct:
      entryLow !== null && entryHigh !== null && referencePrice !== null
        ? pctChangeAbs(entryHigh - entryLow, referencePrice)
        : null,
    maxLossPct:
      stopLoss !== null && referencePrice !== null
        ? pctChangeAbs(referencePrice - stopLoss, referencePrice)
        : null,
    target1UpsidePct:
      target1 !== null && referencePrice !== null
        ? pctChangeSigned(target1 - referencePrice, referencePrice)
        : null,
    target2UpsidePct:
      target2 !== null && referencePrice !== null
        ? pctChangeSigned(target2 - referencePrice, referencePrice)
        : null,
  };
}

function ChartsPage() {
  const { analysisData, opportunityRadarData, opportunityRadarHistory, portfolioRows, realtimeQuotes } = usePortfolio();

  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [showChartSignals, setShowChartSignals] = useState(false);

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

    const decision = toAction(item.decision);
    const confidence = normalizeConfidence(item.confidence);
    const weight = Number(weightsBySymbol[item.symbol] || item.weight || 0);

    const stock = {
      symbol: item.symbol,
      priceNumeric: latestPrice,
      price: formatOptionalCurrency(latestPrice, item.symbol),
      changePercent,
      change: formatOptionalPercent(changePercent),
      rsi: toFiniteNumber(item.rsi ?? item.signals?.rsi ?? item.signals?.rsi_14),
      ma20: toFiniteNumber(item.ma20 ?? item.signals?.ma20),
      ma50: toFiniteNumber(item.ma50 ?? item.signals?.ma50),
      decision,
      confidence,
      breakout: item.breakout ?? item.signals?.breakout ?? null,
      finalScore: toFiniteNumber(item.final_score ?? item.finalScore),
      supportResistance: item.pattern_intelligence?.supportResistance || null,
      detectedPatterns: Array.isArray(item.pattern_intelligence?.detectedPatterns)
        ? item.pattern_intelligence.detectedPatterns
        : [],
      patternBacktests: Array.isArray(item.pattern_intelligence?.patternBacktests)
        ? item.pattern_intelligence.patternBacktests
        : [],
      weight,
      historical,
      decisionVisual: getDecisionVisual(decision, confidence),
    };

    return stock;
  }), [liveResults, realtimeQuotes, weightsBySymbol])

  const selectedTracked = useMemo(() => {
    if (!trackedStocks.length) {
      return null;
    }
    return trackedStocks.find((item) => item.symbol === selectedResult?.symbol) || trackedStocks[0];
  }, [trackedStocks, selectedResult]);

  const selectedExecutionPlan = useMemo(() => {
    if (!selectedTracked?.symbol) {
      return null;
    }

    const currentRunAlerts = Array.isArray(opportunityRadarData?.alerts) ? opportunityRadarData.alerts : [];
    const historyLatestRun = Array.isArray(opportunityRadarHistory) ? opportunityRadarHistory[0] : null;
    const latestHistoryAlerts = Array.isArray(historyLatestRun?.alerts) ? historyLatestRun.alerts : [];
    const candidateAlerts = currentRunAlerts.length ? currentRunAlerts : latestHistoryAlerts;

    if (!candidateAlerts.length) {
      return null;
    }

    const selectedSymbolKey = normalizeSymbolKey(selectedTracked.symbol);

    const matchingAlert = candidateAlerts.find((alert) => (
      normalizeSymbolKey(alert?.symbol) === selectedSymbolKey
      && alert?.executionPlan
    ));

    return matchingAlert?.executionPlan || null;
  }, [opportunityRadarData, opportunityRadarHistory, selectedTracked]);

  const selectedExecutionMetrics = useMemo(() => {
    if (!selectedExecutionPlan || !selectedTracked) {
      return null;
    }
    return computeExecutionPlanMetrics(selectedExecutionPlan, selectedTracked.priceNumeric, selectedTracked.decision);
  }, [selectedExecutionPlan, selectedTracked]);

  const liveSupportResistance = useMemo(() => {
    if (!selectedTracked) {
      return { supportDistancePct: null, resistanceDistancePct: null };
    }

    const livePrice = toFiniteNumber(selectedTracked.priceNumeric);
    const support = toFiniteNumber(selectedTracked.supportResistance?.support);
    const resistance = toFiniteNumber(selectedTracked.supportResistance?.resistance);

    if (livePrice === null || livePrice <= 0) {
      return {
        supportDistancePct: toFiniteNumber(selectedTracked.supportResistance?.supportDistancePct),
        resistanceDistancePct: toFiniteNumber(selectedTracked.supportResistance?.resistanceDistancePct),
      };
    }

    const pctFromPrice = (level) => {
      if (level === null) {
        return null;
      }
      return ((livePrice - level) / livePrice) * 100;
    };

    return {
      supportDistancePct: pctFromPrice(support),
      resistanceDistancePct: pctFromPrice(resistance),
    };
  }, [selectedTracked]);

  const chartSeries = useMemo(() => {
    if (!selectedTracked) {
      return [];
    }

    return selectedTracked.historical
      .map((point) => ({
        time: String(point.date || '').slice(0, 10),
        open: toFiniteNumber(point.open),
        high: toFiniteNumber(point.high),
        low: toFiniteNumber(point.low),
        close: toFiniteNumber(point.close),
        volume: toFiniteNumber(point.volume),
      }))
      .filter((point) => (
        point.time
        && point.open !== null
        && point.high !== null
        && point.low !== null
        && point.close !== null
      ))
      .sort((left, right) => left.time.localeCompare(right.time));
  }, [selectedTracked]);

  return (
    <div className="space-y-6">
      <section className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Price Charts
          </h1>
          <p className="mt-2 text-base" style={{ color: 'var(--text-muted)' }}>
            Real-time candlestick charts with technical analysis signals
          </p>
        </div>

        {!hasLiveData ? (
          <Card>
            <div className="py-8 text-center">
              <p style={{ color: 'var(--text-muted)' }}>
                No portfolio analysis available. Add stocks and run analysis to view charts.
              </p>
            </div>
          </Card>
        ) : (
          <>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Select Stock for Chart
                  </h2>
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                    Click a stock card to view its price action chart
                  </p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {trackedStocks.map((stock) => {
                  const isSelected = stock.symbol === selectedTracked?.symbol;
                  const selectedRingClass = getSelectedRingClass(stock.decision);

                  return (
                    <button
                      key={stock.symbol}
                      type="button"
                      onClick={() => setSelectedSymbol(stock.symbol)}
                      className={`rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
                        isSelected
                          ? `border ${stock.decisionVisual.stockBorder} ring-2 ${selectedRingClass}`
                          : `${stock.decisionVisual.stockBorder} border`
                      }`}
                      style={isSelected ? {
                        backgroundColor: 'var(--bg-card)',
                        color: 'var(--text-primary)'
                      } : {
                        backgroundColor: 'var(--bg-card-alt)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {stock.symbol}
                      </p>
                      <div className="mt-2 flex items-baseline justify-between gap-2">
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {stock.price}
                        </p>
                        <p className={`text-sm font-semibold ${
                          stock.changePercent !== null && stock.changePercent >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                        >
                          {stock.change}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>

            {selectedTracked && (
              <ChartCard
                title={`${selectedTracked.symbol} Price Action`}
                subtitle="Candles, MA20, MA50 and volume"
                data={chartSeries}
                meta={{
                  symbol: selectedTracked.symbol,
                  decision: selectedTracked.decision,
                  confidence: selectedTracked.confidence,
                  breakout: selectedTracked.breakout,
                  finalScore: selectedTracked.finalScore,
                }}
                showSignals={showChartSignals}
                actions={(
                  <button
                    type="button"
                    onClick={() => setShowChartSignals((previous) => !previous)}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-colors duration-200 ${
                      showChartSignals
                        ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700/60 dark:bg-blue-900/25 dark:text-blue-300'
                        : 'border'
                    }`}
                    style={!showChartSignals ? {
                      borderColor: 'var(--border)',
                      backgroundColor: 'var(--bg-card)',
                      color: 'var(--text-primary)'
                    } : {}}
                  >
                    {showChartSignals ? 'Signals On' : 'Signals Off'}
                  </button>
                )}
              />
            )}

            {selectedTracked && (
              <Card>
                <div>
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Technical Metrics
                  </h3>
                  <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card-alt)' }}>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
                        RSI (14)
                      </p>
                      <p className="mt-2 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                        {selectedTracked.rsi !== null ? Math.round(selectedTracked.rsi) : 'N/A'}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card-alt)' }}>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
                        MA20
                      </p>
                      <p className="mt-2 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                        {selectedTracked.ma20 !== null ? formatOptionalCurrency(selectedTracked.ma20) : 'N/A'}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card-alt)' }}>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
                        MA50
                      </p>
                      <p className="mt-2 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                        {selectedTracked.ma50 !== null ? formatOptionalCurrency(selectedTracked.ma50) : 'N/A'}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card-alt)' }}>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
                        Decision
                      </p>
                      <p className={`mt-2 text-lg font-bold ${
                        selectedTracked.decision === 'BUY'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : selectedTracked.decision === 'SELL'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-600 dark:text-amber-400'
                      }`}
                      >
                        {selectedTracked.decision}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
                      Action Plan Metrics
                    </h4>

                    {selectedExecutionPlan && selectedExecutionMetrics ? (
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card-alt)' }}>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Entry Range</p>
                          <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {formatOptionalCurrency(selectedExecutionMetrics.entryLow)} - {formatOptionalCurrency(selectedExecutionMetrics.entryHigh)}
                          </p>
                          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                            {formatComputedPercent(selectedExecutionMetrics.entryRangePct)} range (from planned entry)
                          </p>
                        </div>

                        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-sell-bg)', backgroundColor: 'var(--color-sell-light)' }}>
                          <p className="text-xs" style={{ color: 'var(--color-sell-text)' }}>Stop Loss</p>
                          <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-sell-text)' }}>
                            {formatOptionalCurrency(selectedExecutionMetrics.stopLoss)}
                          </p>
                          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                            Max loss: {formatComputedPercent(selectedExecutionMetrics.maxLossPct)} from planned entry
                          </p>
                        </div>

                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/40 dark:bg-emerald-900/20">
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">Target 1</p>
                          <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                            {formatOptionalCurrency(selectedExecutionMetrics.target1)}
                          </p>
                          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                            {formatSignedComputedPercent(selectedExecutionMetrics.target1UpsidePct)} {selectedTracked.decision === 'SELL' ? 'move' : 'upside'} from planned entry
                          </p>
                        </div>

                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/40 dark:bg-emerald-900/20">
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">Target 2</p>
                          <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                            {formatOptionalCurrency(selectedExecutionMetrics.target2)}
                          </p>
                          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                            {formatSignedComputedPercent(selectedExecutionMetrics.target2UpsidePct)} {selectedTracked.decision === 'SELL' ? 'move' : 'upside'} from planned entry
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-[#9CA3AF]">
                        No execution plan found for this symbol. Run Opportunity Radar to populate plan metrics.
                      </p>
                    )}
                  </div>

                  <div className="mt-6">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">
                      Pattern Intelligence
                    </h4>

                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-[#334155] bg-[#0F172A] p-3">
                        <p className="text-xs text-[#9CA3AF]">Support</p>
                        <p className="mt-1 text-sm font-semibold text-[#F3F4F6]">
                          {formatOptionalCurrency(selectedTracked.supportResistance?.support)}
                        </p>
                        <p className="mt-1 text-xs text-[#9CA3AF]">
                          Distance: {formatComputedPercent(liveSupportResistance.supportDistancePct)}
                        </p>
                      </div>

                      <div className="rounded-lg border border-[#334155] bg-[#0F172A] p-3">
                        <p className="text-xs text-[#9CA3AF]">Resistance</p>
                        <p className="mt-1 text-sm font-semibold text-[#F3F4F6]">
                          {formatOptionalCurrency(selectedTracked.supportResistance?.resistance)}
                        </p>
                        <p className="mt-1 text-xs text-[#9CA3AF]">
                          Distance: {formatComputedPercent(liveSupportResistance.resistanceDistancePct)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedTracked.detectedPatterns.length ? (
                        selectedTracked.detectedPatterns.map((pattern) => (
                          <span
                            key={pattern.pattern}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${pattern.detected
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/25 dark:text-emerald-300'
                              : 'border-[#334155] bg-[#111827] text-[#9CA3AF]'}`}
                          >
                            {pattern.label} {pattern.detected ? 'detected' : 'inactive'}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-[#9CA3AF]">No pattern intelligence available.</span>
                      )}
                    </div>

                    {selectedTracked.patternBacktests.length ? (
                      <div className="mt-3 overflow-x-auto rounded-lg border border-[#334155]">
                        <table className="min-w-full divide-y divide-[#334155] text-sm">
                          <thead className="bg-[#111827]">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Pattern</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Direction</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Success</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Samples</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Horizon</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#334155] bg-[#0F172A]">
                            {selectedTracked.patternBacktests.map((item) => (
                              <tr key={item.pattern}>
                                <td className="px-3 py-2 text-[#E5E7EB]">{item.label}</td>
                                <td className="px-3 py-2 capitalize text-[#9CA3AF]">{item.direction}</td>
                                <td className="px-3 py-2 text-[#E5E7EB]">{formatComputedPercent(item.successRate)}</td>
                                <td className="px-3 py-2 text-[#E5E7EB]">{item.samples ?? 0}</td>
                                <td className="px-3 py-2 text-[#E5E7EB]">{item.horizonDays ?? '--'}d</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default ChartsPage;
