import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { usePortfolio } from '../context/PortfolioContext';

function formatDateTime(value) {
  if (!value) {
    return 'Unknown time';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }

  return date.toLocaleString();
}

function formatConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '--';
  }
  const normalized = numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
  return `${normalized}%`;
}

function formatPlanPrice(value) {
  if (value === null || value === undefined || value === '') {
    return '--';
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '--';
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(numeric);
}

function formatPlanPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '--';
  }
  return `${numeric.toFixed(1)}%`;
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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

function normalizedConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return numeric <= 1 ? numeric * 100 : numeric;
}

function resolvePrimarySignal(alert) {
  const action = String(alert?.signalDecision?.type || alert?.action || 'HOLD').toUpperCase();
  const confidence = normalizedConfidence(alert?.signalDecision?.confidence ?? alert?.confidence);
  const label = String(alert?.signalDecision?.label || 'No Edge');
  const factors = Array.isArray(alert?.signalDecision?.factors) ? alert.signalDecision.factors : [];

  return {
    action,
    primarySignal: `${action} | ${label}`,
    dominantFactor: factors[0]?.name ? `${factors[0].name}: ${factors[0].impact}` : 'No dominant factor',
    supportingSignals: factors.slice(1).map((f) => `${f.name}: ${f.impact}`),
    conflictNote: null,
    confidence,
  };
}

function getConfidenceInterpretation(signalView) {
  const confidence = Number(signalView?.confidence) || 0;
  const band = confidence >= 72 ? 'High' : confidence >= 52 ? 'Moderate' : 'Low';

  if (band === 'High') {
    return {
      band,
      explanation: 'Confidence is high enough to act only with execution confirmation.',
    };
  }

  if (band === 'Moderate') {
    return {
      band,
      explanation: 'Confidence is moderate; wait for trigger-level confirmation.',
    };
  }

  return {
    band,
    explanation: 'Confidence is low; no immediate edge.',
  };
}

function buildWhySignalBullets(alert, signalView) {
  const fromBackend = Array.isArray(alert?.signalDecision?.reasoning)
    ? alert.signalDecision.reasoning.filter(Boolean)
    : [];
  if (fromBackend.length) {
    return fromBackend.slice(0, 3);
  }

  const trend = String(alert?.trend || alert?.technicalTrend || 'neutral').replace(/-/g, ' ');
  return [
    `Trend state: ${trend}`,
    `Signal type: ${String(alert?.signalType || 'unknown').replace(/-/g, ' ')}`,
    `Confidence: ${formatConfidence(alert?.confidence)}`,
  ].slice(0, 3);
}

function buildActionGuide(alert, signalView) {
  const action = String(signalView?.action || alert?.signalDecision?.type || alert?.action || 'HOLD').toUpperCase();
  const backendAction = String(alert?.signalDecision?.action || '').trim();
  const confidence = getConfidenceInterpretation(signalView);

  if (action === 'HOLD') {
    return {
      now: backendAction || 'No trade — wait for breakout or reversal confirmation',
      waitFor: 'Wait for trend break or validated reversal pattern.',
      risk: 'Avoid forced entries while edge remains weak.',
      confidence,
    };
  }

  if (action === 'BUY') {
    return {
      now: backendAction || 'Enter on pullback with confirmation',
      waitFor: 'Wait for continuation close above trigger zone.',
      risk: 'Exit if trend support fails.',
      confidence,
    };
  }

  if (action === 'SELL') {
    return {
      now: backendAction || 'Short on continuation breakdown',
      waitFor: 'Wait for downside continuation below trigger zone.',
      risk: 'Cut position if bearish continuation fails.',
      confidence,
    };
  }

  return {
    now: backendAction || 'No trade — wait for breakout or reversal confirmation',
    waitFor: 'Wait for clear directional trigger.',
    risk: 'Avoid entries without confirmation.',
    confidence,
  };
}

function computeExecutionPlanMetrics(alert) {
  const plan = alert?.executionPlan;
  if (!plan) {
    return {};
  }

  const action = String(alert?.action || alert?.decision || 'BUY').toUpperCase();
  const direction = action === 'SELL' ? -1 : 1;

  const entryLow = toFiniteNumber(plan.entryRangeLow);
  const entryHigh = toFiniteNumber(plan.entryRangeHigh) ?? entryLow;
  const entryPrice = toFiniteNumber(plan.entryPrice);
  const stopLoss = toFiniteNumber(plan.stopLoss);
  const target1 = toFiniteNumber(plan.targetPrice);
  const target2 = target1 !== null ? target1 * 1.02 : null;
  const entryMid = entryLow !== null && entryHigh !== null ? (entryLow + entryHigh) / 2 : null;
  const referencePrice = entryPrice ?? entryMid ?? entryLow ?? toFiniteNumber(alert?.price);

  if (!referencePrice || referencePrice <= 0) {
    return {
      entryRangePct: null,
      maxLossPct: null,
      target1UpsidePct: null,
      target2UpsidePct: null,
    };
  }

  const pctChange = (delta) => {
    if (!Number.isFinite(delta)) {
      return null;
    }
    return Math.abs((delta / referencePrice) * 100);
  };

  const pctChangeSigned = (delta) => {
    if (!Number.isFinite(delta)) {
      return null;
    }
    return ((delta / referencePrice) * 100) * direction;
  };

  return {
    entryRangePct: entryLow !== null && entryHigh !== null ? pctChange(entryHigh - entryLow) : null,
    maxLossPct: stopLoss !== null ? pctChange(referencePrice - stopLoss) : null,
    target1UpsidePct: target1 !== null ? pctChangeSigned(target1 - referencePrice) : null,
    target2UpsidePct: target2 !== null ? pctChangeSigned(target2 - referencePrice) : null,
  };
}

function formatSummary(explanation) {
  const text = String(explanation || '').trim();
  if (!text) {
    return 'No strong signal detected.';
  }

  if (text.toLowerCase().includes('ai reasoning failed')) {
    return 'No strong signal detected.';
  }

  return text;
}

function signalChipsForAlert(alert) {
  const chips = [];

  const trend = String(alert?.trend || '').trim();
  if (trend) {
    chips.push({
      key: `trend-${trend}`,
      label: trend.replace(/^./, (c) => c.toUpperCase()),
      tone: 'border-white/15 bg-[#0f172a] text-[#9CA3AF]',
    });
  }

  const rsi = Number(alert?.rsi);
  if (Number.isFinite(rsi)) {
    chips.push({
      key: `rsi-${rsi}`,
      label: `RSI ${Math.round(rsi)}`,
      tone: 'border-[#3B82F6]/40 bg-[#3B82F6]/12 text-[#93C5FD]',
    });
  }

  if (Array.isArray(alert?.riskFlags) && alert.riskFlags.includes('oversold')) {
    chips.push({
      key: 'oversold',
      label: 'Oversold',
      tone: 'border-[#F59E0B]/40 bg-[#F59E0B]/12 text-[#FBBF24]',
    });
  }

  const signalType = String(alert?.signalType || '').trim();
  if (signalType) {
    chips.push({
      key: `signal-${signalType}`,
      label: signalType.replace(/-/g, ' '),
      tone: 'border-[#3B82F6]/40 bg-[#3B82F6]/12 text-[#93C5FD]',
    });
  }

  return chips.slice(0, 4);
}

function riskFlagTone(flag) {
  if (flag === 'high-sector-concentration') {
    return 'border-[#EF4444]/40 bg-[#EF4444]/12 text-[#FCA5A5]';
  }
  if (flag === 'oversold') {
    return 'border-[#F59E0B]/40 bg-[#F59E0B]/12 text-[#FBBF24]';
  }
  if (flag === 'overbought') {
    return 'border-[#F59E0B]/40 bg-[#F59E0B]/12 text-[#FBBF24]';
  }
  return 'border-white/15 bg-[#0f172a] text-[#9CA3AF]';
}

function OpportunityRadarPage() {
  const {
    opportunityRadarHistory,
    fetchOpportunityRadarHistory,
    runOpportunityRadar,
    runOpportunityRadarUniverse,
    getRadarSchedulerStatus,
    startRadarScheduler,
    stopRadarScheduler,
    runRadarSchedulerNow,
    isRunningOpportunityRadar,
    isRunningUniverseRadar,
    apiError,
  } = usePortfolio();

  // Mode management
  const [scanMode, setScanMode] = useState('portfolio');
  const [portfolioScanData, setPortfolioScanData] = useState(null);
  const [universeScanData, setUniverseScanData] = useState(null);
  const [portfolioScanError, setPortfolioScanError] = useState(null);
  const [universeScanError, setUniverseScanError] = useState(null);

  // Filter and sort state
  const [actionFilter, setActionFilter] = useState('ALL');
  const riskFilter = 'ALL';
  const credibilityTierFilter = 'ALL';
  const [quickFilter, setQuickFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('priority');
  const [historySortBy, setHistorySortBy] = useState('latest');
  const [selectedRiskProfile, setSelectedRiskProfile] = useState('moderate');
  const [universeLimit, setUniverseLimit] = useState(150);
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [isUpdatingScheduler, setIsUpdatingScheduler] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const cardRefs = useRef({});

  const refreshSchedulerStatus = useCallback(async () => {
    try {
      const status = await getRadarSchedulerStatus();
      setSchedulerStatus(status);
    } catch (_error) {
      setSchedulerStatus(null);
    }
  }, [getRadarSchedulerStatus]);

  useEffect(() => {
    fetchOpportunityRadarHistory(30);
    refreshSchedulerStatus();
  }, [fetchOpportunityRadarHistory, refreshSchedulerStatus]);

  const runPortfolioScan = useCallback(async () => {
    setPortfolioScanError(null);
    try {
      const data = await runOpportunityRadar(null, { riskProfile: selectedRiskProfile });
      setPortfolioScanData(data);
    } catch (error) {
      setPortfolioScanError(error?.message || 'Portfolio scan failed');
    }
  }, [runOpportunityRadar, selectedRiskProfile]);

  const runUniverseScan = useCallback(async () => {
    setUniverseScanError(null);
    try {
      const data = await runOpportunityRadarUniverse({ riskProfile: selectedRiskProfile, universeLimit });
      setUniverseScanData(data);
    } catch (error) {
      setUniverseScanError(error?.message || 'Universe scan failed');
    }
  }, [runOpportunityRadarUniverse, selectedRiskProfile, universeLimit]);

  // Get active scan data based on current mode
  const activeScanData = scanMode === 'portfolio' ? portfolioScanData : universeScanData;
  const activeScanError = scanMode === 'portfolio' ? portfolioScanError : universeScanError;
  const isScanning = scanMode === 'portfolio' ? isRunningOpportunityRadar : isRunningUniverseRadar;

  const latestAlerts = useMemo(() => {
    const raw = Array.isArray(activeScanData?.alerts) ? activeScanData.alerts : [];

    const filtered = raw.filter((alert) => {
      const actionOk = actionFilter === 'ALL' || String(alert?.action || '').toUpperCase() === actionFilter;
      const risks = Array.isArray(alert?.riskFlags) ? alert.riskFlags : [];
      const riskOk = riskFilter === 'ALL' || risks.includes(riskFilter);
      const confidenceScore = Number(alert?.confidence || 0);
      const confidenceNormalized = Number.isFinite(confidenceScore)
        ? (confidenceScore <= 1 ? confidenceScore * 100 : confidenceScore)
        : 0;

      const quickFilterOk = quickFilter === 'ALL'
        || (quickFilter === 'BUY' && String(alert?.action || '').toUpperCase() === 'BUY')
        || (quickFilter === 'SELL' && String(alert?.action || '').toUpperCase() === 'SELL')
        || (quickFilter === 'HIGH_CONF' && confidenceNormalized >= 70);
      
      let tierOk = true;
      if (credibilityTierFilter !== 'ALL') {
        const contextSignals = Array.isArray(alert?.contextSignals) ? alert.contextSignals : [];
        tierOk = contextSignals.some((signal) => String(signal?.credibilityTier || 'community').toUpperCase() === credibilityTierFilter);
      }
      
      return actionOk && riskOk && tierOk && quickFilterOk;
    });

    const ranked = filtered.slice().sort((left, right) => {
      if (sortBy === 'confidence') {
        return Number(right?.confidence || 0) - Number(left?.confidence || 0);
      }
      if (sortBy === 'strength') {
        return Number(right?.signalStrength || 0) - Number(left?.signalStrength || 0);
      }
      return Number(right?.priorityScore || 0) - Number(left?.priorityScore || 0);
    });

    return ranked;
  }, [actionFilter, credibilityTierFilter, activeScanData, quickFilter, riskFilter, sortBy]);

  const marketSummary = useMemo(() => {
    const alerts = Array.isArray(activeScanData?.alerts) ? activeScanData.alerts : [];
    const buyCount = alerts.filter((item) => String(item?.action || '').toUpperCase() === 'BUY').length;
    const sellCount = alerts.filter((item) => String(item?.action || '').toUpperCase() === 'SELL').length;

    let marketTrend = 'Mixed';
    if (buyCount >= sellCount + 2) {
      marketTrend = 'Bullish';
    } else if (sellCount >= buyCount + 2) {
      marketTrend = 'Bearish';
    }

    const topSignalType = alerts
      .map((item) => String(item?.signalType || '').trim())
      .filter(Boolean)
      .reduce((acc, item) => {
        acc[item] = (acc[item] || 0) + 1;
        return acc;
      }, {});

    const sectorHighlight = Object.entries(topSignalType)
      .sort((a, b) => b[1] - a[1])[0]?.[0]
      ? String(Object.entries(topSignalType).sort((a, b) => b[1] - a[1])[0][0]).replace(/-/g, ' ')
      : (scanMode === 'portfolio' ? 'Portfolio-heavy opportunities' : 'Broad market opportunities');

    const highRiskFlags = alerts.filter((item) => Array.isArray(item?.riskFlags) && item.riskFlags.includes('high-sector-concentration')).length;
    const riskLevel = highRiskFlags >= 2 || sellCount > buyCount ? 'High' : (highRiskFlags === 1 ? 'Moderate' : 'Low');

    const summaryLine = `Market showing ${marketTrend.toLowerCase()} sentiment with focus on ${sectorHighlight.toLowerCase()}.`;

    return {
      marketTrend,
      sectorHighlight,
      riskLevel,
      summaryLine,
    };
  }, [activeScanData, scanMode]);

  const sortedHistory = useMemo(() => {
    const items = Array.isArray(opportunityRadarHistory) ? opportunityRadarHistory : [];
    
    const withAvgPriority = items.map((item) => {
      const alerts = Array.isArray(item?.alerts) ? item.alerts : [];
      const avgPriority = alerts.length > 0
        ? alerts.reduce((sum, alert) => sum + (Number(alert?.priorityScore) || 0), 0) / alerts.length
        : 0;
      return { ...item, avgPriority };
    });

    return withAvgPriority
      .slice()
      .sort((left, right) => {
        if (historySortBy === 'highest-priority') {
          return Number(right.avgPriority || 0) - Number(left.avgPriority || 0);
        }
        return String(right?.generatedAt || '').localeCompare(String(left?.generatedAt || ''));
      });
  }, [historySortBy, opportunityRadarHistory]);

  const topHistoryItems = sortedHistory.slice(0, 10);
  const latestScanSummary = useMemo(() => {
    const scopeLabel = scanMode === 'portfolio' ? 'Portfolio Scan' : 'Universe Scan';
    const symbolsScanned = Number(
      activeScanData?.universe?.symbolsScanned
      || activeScanData?.alphaEvidence?.totalSymbolsScanned
      || 0
    );
    const alerts = Array.isArray(activeScanData?.alerts) ? activeScanData.alerts : [];
    const buyCount = alerts.filter((item) => String(item?.action || '').toUpperCase() === 'BUY').length;
    const sellCount = alerts.filter((item) => String(item?.action || '').toUpperCase() === 'SELL').length;
    const holdCount = alerts.filter((item) => String(item?.action || '').toUpperCase() === 'HOLD').length;

    return {
      scanLabel: scopeLabel,
      symbolsScanned,
      alertsCount: alerts.length,
      buyCount,
      sellCount,
      holdCount,
      generatedAt: activeScanData?.generatedAt || null,
    };
  }, [activeScanData, scanMode]);

  useEffect(() => {
    if (!expandedId) {
      return;
    }

    const target = cardRefs.current[expandedId];
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [expandedId]);

  return (
    <div className="space-y-6 bg-[#0B1220] text-[#E5E7EB]">
      <Card className="relative overflow-hidden p-0" interactive={false}>
        <div className="relative border-b border-white/10 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">Opportunity Radar</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#E5E7EB]">
                {scanMode === 'portfolio' ? 'Analyze Your Portfolio Signals' : 'Discover Market Opportunities'}
              </h2>
              <p className="mt-2 text-sm text-[#9CA3AF]">
                {scanMode === 'portfolio'
                  ? 'Evaluate trading signals based on your current holdings, sector exposure, and position sizing.'
                  : 'Scan the entire NSE universe to identify high-priority setups ranked by opportunity score.'}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setScanMode('portfolio')}
                className={`ripple-btn rounded-2xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  scanMode === 'portfolio'
                    ? 'bg-[#3B82F6] text-white shadow-sm hover:-translate-y-0.5'
                    : 'border border-white/15 bg-[#111827] text-[#E5E7EB] hover:-translate-y-0.5 hover:border-[#3B82F6]/50'
                }`}
              >
                Portfolio Scan
              </button>
              <button
                type="button"
                onClick={() => setScanMode('universe')}
                className={`ripple-btn rounded-2xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  scanMode === 'universe'
                    ? 'bg-[#3B82F6] text-white shadow-sm hover:-translate-y-0.5'
                    : 'border border-white/15 bg-[#111827] text-[#E5E7EB] hover:-translate-y-0.5 hover:border-[#3B82F6]/50'
                }`}
              >
                Universe Scan
              </button>

              <button
                type="button"
                onClick={scanMode === 'portfolio' ? runPortfolioScan : runUniverseScan}
                disabled={isScanning}
                className="ripple-btn ml-auto rounded-2xl bg-[#3B82F6] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#2563EB] disabled:opacity-70"
              >
                {isScanning ? (scanMode === 'portfolio' ? 'Scanning Portfolio...' : 'Scanning Universe...') : 'Run Scan'}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-[#111827] px-3 py-2 border border-white/10">
                <p className="text-xs font-semibold text-[#9CA3AF]">
                  {scanMode === 'portfolio' ? '📊 Evaluate signals based on your current holdings' : '🔍 Scan entire market for new opportunities'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-[#111827] p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#9CA3AF]">Latest Scope</p>
              <p className="mt-1 text-sm font-semibold text-[#E5E7EB]">{latestScanSummary.scanLabel}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#111827] p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#9CA3AF]">Symbols Scanned</p>
              <p className="mt-1 text-sm font-semibold text-[#E5E7EB]">{latestScanSummary.symbolsScanned || '--'}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#111827] p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#9CA3AF]">Alerts</p>
              <p className="mt-1 text-sm font-semibold text-[#E5E7EB]">{latestScanSummary.alertsCount}</p>
              <p className="mt-1 text-[11px] text-[#9CA3AF]">B {latestScanSummary.buyCount} | H {latestScanSummary.holdCount} | S {latestScanSummary.sellCount}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#111827] p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#9CA3AF]">Last Update</p>
              <p className="mt-1 text-sm font-semibold text-[#E5E7EB]">{formatDateTime(latestScanSummary.generatedAt)}</p>
            </div>
          </div>
        </div>

        <div className="relative grid gap-4 p-6 lg:grid-cols-12">
          <div className="lg:col-span-8 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Scan Setup</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-[#9CA3AF]">
                  <span className="font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Risk Profile</span>
                  <select
                    value={selectedRiskProfile}
                    onChange={(event) => setSelectedRiskProfile(event.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-[#0f172a] px-3 py-2 text-sm text-[#E5E7EB] outline-none focus:border-[#3B82F6]"
                  >
                    <option value="conservative">Conservative</option>
                    <option value="moderate">Moderate</option>
                    <option value="aggressive">Aggressive</option>
                  </select>
                </label>

                {scanMode === 'universe' ? (
                  <label className="space-y-1 text-xs text-[#9CA3AF]">
                    <span className="font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Universe Limit</span>
                    <input
                      type="number"
                      min={10}
                      max={2000}
                      value={universeLimit}
                      onChange={(event) => setUniverseLimit(Number(event.target.value) || 0)}
                      className="w-full rounded-xl border border-white/15 bg-[#0f172a] px-3 py-2 text-sm text-[#E5E7EB] outline-none focus:border-[#3B82F6]"
                    />
                  </label>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Scheduler</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      setIsUpdatingScheduler(true);
                      try {
                        await startRadarScheduler();
                        await refreshSchedulerStatus();
                      } finally {
                        setIsUpdatingScheduler(false);
                      }
                    }}
                    disabled={isUpdatingScheduler}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/25 dark:text-emerald-300"
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setIsUpdatingScheduler(true);
                      try {
                        await stopRadarScheduler();
                        await refreshSchedulerStatus();
                      } finally {
                        setIsUpdatingScheduler(false);
                      }
                    }}
                    disabled={isUpdatingScheduler}
                    className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/25 dark:text-rose-300"
                  >
                    Stop
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setIsUpdatingScheduler(true);
                      try {
                        await runRadarSchedulerNow();
                        await refreshSchedulerStatus();
                      } finally {
                        setIsUpdatingScheduler(false);
                      }
                    }}
                    disabled={isUpdatingScheduler}
                    className="rounded-lg border border-white/15 bg-[#0f172a] px-3 py-1.5 text-xs font-semibold text-[#E5E7EB]"
                  >
                    Run Now
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-[#9CA3AF] sm:grid-cols-2">
                <p>Status: <span className="font-semibold">{schedulerStatus?.running ? 'Running' : 'Stopped'}</span></p>
                <p>Interval: <span className="font-semibold">{schedulerStatus?.intervalMinutes ?? '--'} min</span></p>
                <p>Last Run: <span className="font-semibold">{formatDateTime(schedulerStatus?.lastRunFinishedAt)}</span></p>
                <p>Last Summary: <span className="font-semibold">{schedulerStatus?.lastRunSummary ? `${schedulerStatus.lastRunSummary.alerts} alerts / ${schedulerStatus.lastRunSummary.symbolsScanned} symbols` : 'No runs yet'}</span></p>
              </div>
            </div>

            {apiError ? <p className="text-sm text-[#DC2626]">{apiError}</p> : null}
            {activeScanError ? <p className="text-sm text-[#DC2626]">{activeScanError}</p> : null}
          </div>

          <aside className="lg:col-span-4 rounded-2xl border border-white/10 bg-[#111827] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Run Guide</p>
            <ol className="mt-3 space-y-3 text-sm text-[#E5E7EB] leading-6">
              <li className="rounded-lg border border-white/10 bg-[#0f172a] px-3 py-2">1. Choose risk profile and universe limit.</li>
              <li className="rounded-lg border border-white/10 bg-[#0f172a] px-3 py-2">2. Run NSE Universe Scan to fetch opportunities.</li>
              <li className="rounded-lg border border-white/10 bg-[#0f172a] px-3 py-2">3. Filter alerts by action, risk, and credibility.</li>
              <li className="rounded-lg border border-white/10 bg-[#0f172a] px-3 py-2">4. Review execution plan before placing trades.</li>
            </ol>
          </aside>
        </div>
      </Card>

      <Card className="p-7" interactive={false}>
        <h3 className="text-2xl font-bold tracking-tight text-[#E5E7EB]">
          {scanMode === 'portfolio' ? 'Portfolio Analysis Signals' : 'NSE Universe Scan Signals'}
        </h3>
        <p className="mt-1 text-xs text-[#9CA3AF]">
          {scanMode === 'portfolio' 
            ? 'Signals ranked by relevance to your portfolio holdings and risk profile.'
            : 'Filter and rank latest opportunities from your most recent market-wide scan.'}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Quick Filters</span>
          <button
            type="button"
            onClick={() => setQuickFilter('BUY')}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${quickFilter === 'BUY' ? 'border-[#22C55E] bg-[#22C55E] text-white' : 'border-white/15 bg-[#111827] text-[#E5E7EB] hover:border-[#3B82F6]/50'}`}
          >
            Only BUY
          </button>
          <button
            type="button"
            onClick={() => setQuickFilter('SELL')}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${quickFilter === 'SELL' ? 'border-[#EF4444] bg-[#EF4444] text-white' : 'border-white/15 bg-[#111827] text-[#E5E7EB] hover:border-[#3B82F6]/50'}`}
          >
            Only SELL
          </button>
          <button
            type="button"
            onClick={() => setQuickFilter('HIGH_CONF')}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${quickFilter === 'HIGH_CONF' ? 'border-[#3B82F6] bg-[#3B82F6] text-white' : 'border-white/15 bg-[#111827] text-[#E5E7EB] hover:border-[#3B82F6]/50'}`}
          >
            High Confidence
          </button>
          <button
            type="button"
            onClick={() => setQuickFilter('ALL')}
            className="rounded-lg border border-white/15 bg-[#111827] px-3 py-1.5 text-xs font-semibold text-[#E5E7EB] hover:border-[#3B82F6]/50"
          >
            Reset
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <select
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
            className="rounded-xl border border-white/15 bg-[#111827] px-3 py-2 text-sm text-[#E5E7EB] outline-none focus:border-[#3B82F6]"
          >
            <option value="ALL">All Actions</option>
            <option value="BUY">BUY</option>
            <option value="HOLD">HOLD</option>
            <option value="SELL">SELL</option>
          </select>

          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="rounded-xl border border-white/15 bg-[#111827] px-3 py-2 text-sm text-[#E5E7EB] outline-none focus:border-[#3B82F6]"
          >
            <option value="priority">Sort: Priority Score</option>
            <option value="confidence">Sort: Confidence</option>
            <option value="strength">Sort: Signal Strength</option>
          </select>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {isScanning ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-800 dark:bg-blue-900/20">
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                {scanMode === 'portfolio' ? '📊 Analyzing portfolio signals...' : '🔍 Scanning NSE universe...'}
              </p>
              <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                {scanMode === 'portfolio' 
                  ? 'This may take 30-60 seconds as we analyze your holdings and current market conditions.'
                  : `This may take 1-5 minutes scanning up to ${universeLimit} symbols...`}
              </p>
            </div>
          ) : latestAlerts.length ? latestAlerts.map((alert, idx) => {
            const executionMetrics = computeExecutionPlanMetrics(alert);
            const cardId = `${alert.symbol || 'SYMBOL'}-${alert.signalType || 'signal'}-${alert.action || 'HOLD'}-${idx}`;
            const isExpanded = expandedId === cardId;
            const reasonChips = signalChipsForAlert(alert).slice(0, 2);
            const riskTag = Array.isArray(alert?.riskFlags) && alert.riskFlags.length
              ? {
                key: `risk-${alert.riskFlags[0]}`,
                label: String(alert.riskFlags[0]).replace(/-/g, ' '),
                tone: riskFlagTone(alert.riskFlags[0]),
              }
              : null;
            const compactTags = [riskTag, ...reasonChips]
              .filter(Boolean)
              .filter((item, i, arr) => arr.findIndex((x) => x.label === item.label) === i)
              .slice(0, 2);
            const signalView = resolvePrimarySignal(alert);
            const actionLabel = String(alert?.signalDecision?.type || signalView?.action || alert?.action || 'HOLD').toUpperCase();
            const explanationItems = buildWhySignalBullets(alert, signalView);
            const actionGuide = buildActionGuide(alert, signalView);
            const factorItems = Array.isArray(alert?.signalDecision?.factors) ? alert.signalDecision.factors.slice(0, 3) : [];
            const warningItems = Array.isArray(alert?.signalDecision?.warnings) ? alert.signalDecision.warnings.slice(0, 2) : [];
            const actionToneClass = actionLabel === 'BUY'
              ? 'hover:border-[#22C55E]/45 hover:shadow-[0_0_0_1px_rgba(34,197,94,0.22),0_12px_28px_-16px_rgba(34,197,94,0.35)]'
              : actionLabel === 'SELL'
                ? 'hover:border-[#EF4444]/45 hover:shadow-[0_0_0_1px_rgba(239,68,68,0.22),0_12px_28px_-16px_rgba(239,68,68,0.35)]'
                : 'hover:border-[#F59E0B]/45 hover:shadow-[0_0_0_1px_rgba(245,158,11,0.2),0_12px_28px_-16px_rgba(245,158,11,0.32)]';
            const confidenceToneClass = actionLabel === 'BUY'
              ? 'text-[#22C55E]'
              : actionLabel === 'SELL'
                ? 'text-[#EF4444]'
                : 'text-[#F59E0B]';
            const confidenceScore = Number(alert?.confidence || 0);
            const confidenceNormalized = Number.isFinite(confidenceScore)
              ? (confidenceScore <= 1 ? confidenceScore * 100 : confidenceScore)
              : 0;
            const priorityClass = confidenceNormalized >= 70
              ? 'ring-1 ring-[#3B82F6]/35'
              : confidenceNormalized < 45
                ? 'border-white/20'
                : '';
            const summaryLine = String(alert?.signalDecision?.summary || formatSummary(alert.explanation));
            return (
            <article
              key={cardId}
              ref={(node) => {
                if (node) {
                  cardRefs.current[cardId] = node;
                }
              }}
              className={`flex h-full flex-col rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 ${actionToneClass} ${priorityClass}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-lg font-bold tracking-tight text-[#E5E7EB]">{alert.symbol}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#93C5FD]">{signalView.primarySignal}</p>
                </div>

                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">Confidence</p>
                  <p className={`mt-1 text-4xl font-bold leading-none ${confidenceToneClass}`}>{formatConfidence(alert.confidence)}</p>
                </div>
              </div>

              <div className="mt-4 flex items-start justify-between gap-3">
                <div>
                  <Badge action={actionLabel || 'HOLD'} />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {compactTags.map((chip) => (
                    <span
                      key={chip.key}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${chip.tone}`}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
              </div>

              <p className="mt-4 truncate text-sm leading-6 text-[#9CA3AF]" title={summaryLine}>
                {summaryLine}
              </p>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    if (isExpanded) {
                      setExpandedId(null);
                      return;
                    }
                    setExpandedId(cardId);
                  }}
                  className="rounded-lg border border-white/15 bg-[#111827] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#E5E7EB] transition hover:border-[#3B82F6] hover:text-[#93C5FD]"
                >
                  {isExpanded ? 'Hide Analysis ▲' : 'Why this signal? ▼'}
                </button>
              </div>

              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'mt-4 max-h-[1200px] opacity-100' : 'max-h-0 opacity-0'}`}
              >
                <div className="rounded-xl border border-white/10 bg-[#0f172a] p-4">
                  <p className="rounded-lg border border-[#3B82F6]/35 bg-[#3B82F6]/12 px-3 py-2 text-sm text-[#BFDBFE]">
                    {summaryLine}
                  </p>

                  <div className="mt-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Key Factors</p>
                    <ul className="mt-2 list-disc space-y-2 pl-4 text-sm text-[#E5E7EB] leading-6">
                      {factorItems.length ? factorItems.map((factor) => (
                        <li key={`${cardId}-${factor.name}`}>
                          {factor.name}: {factor.value === null || factor.value === undefined ? 'N/A' : Number(factor.value).toFixed(2)} ({factor.impact})
                        </li>
                      )) : (
                        <li>No factor breakdown available</li>
                      )}
                    </ul>
                  </div>

                  <div>
                    <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Why this signal</p>
                    <ul className="mt-2 list-disc space-y-2 pl-4 text-sm text-[#E5E7EB] leading-6">
                      {explanationItems.map((item) => (
                        <li key={`${cardId}-${item.slice(0, 16)}`}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-6 border-t border-white/10 pt-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Signal Strength</p>
                    <div className="mt-2 space-y-2 text-sm text-[#E5E7EB]">
                      <div className="rounded-lg border border-white/10 bg-[#111827] px-3 py-2">
                        <p className="text-xs uppercase tracking-[0.12em] text-[#9CA3AF]">Dominant Factor</p>
                        <p className="mt-1 font-semibold text-[#E5E7EB]">{signalView.dominantFactor}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-[#111827] px-3 py-2">
                        <p className="text-xs uppercase tracking-[0.12em] text-[#9CA3AF]">Supporting Signals</p>
                        <p className="mt-1 text-sm text-[#E5E7EB]">
                          {(signalView.supportingSignals || []).join(' | ') || 'No strong supporting signal yet.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-white/10 pt-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Action</p>
                    <div className="mt-2 space-y-2 rounded-lg border border-[#22C55E]/30 bg-[#0f1f17] p-4 text-sm text-[#E5E7EB]">
                      <p><span className="font-semibold text-[#86EFAC]">Do now:</span> {actionGuide.now}</p>
                      <p><span className="font-semibold text-[#93C5FD]">Wait for:</span> {actionGuide.waitFor}</p>
                      <p><span className="font-semibold text-[#FCA5A5]">Risk condition:</span> {actionGuide.risk}</p>
                      <p className="border-t border-white/10 pt-2 text-xs text-[#9CA3AF]">
                        Confidence interpretation: <span className="font-semibold text-[#E5E7EB]">{actionGuide.confidence.band}</span> — {actionGuide.confidence.explanation}
                      </p>
                    </div>

                    {actionLabel !== 'HOLD' && alert.executionPlan ? (
                      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-white/10 bg-[#111827] px-3 py-2 text-xs text-[#E5E7EB]">
                        <span>Entry Zone</span>
                        <span className="text-right">{formatPlanPrice(alert.executionPlan.entryRangeLow)} - {formatPlanPrice(alert.executionPlan.entryRangeHigh)}</span>
                        <span>Stop Loss</span>
                        <span className="text-right">{formatPlanPrice(alert.executionPlan.stopLoss)}</span>
                        <span>Target</span>
                        <span className="text-right">{formatPlanPrice(alert.executionPlan.targetPrice)}</span>
                        <span>Risk/Reward</span>
                        <span className="text-right">{formatComputedPercent(executionMetrics.maxLossPct)} / {formatSignedComputedPercent(executionMetrics.target1UpsidePct)}</span>
                        <span>Position Size</span>
                        <span className="text-right">{formatPlanPercent(alert.executionPlan.suggestedPositionSizePct)}</span>
                      </div>
                    ) : null}
                  </div>

                  {warningItems.length ? (
                    <div className="mt-4 border-t border-white/10 pt-4 text-xs text-[#FCA5A5]">
                      <p className="font-semibold uppercase tracking-[0.14em]">Warnings</p>
                      <ul className="mt-2 list-disc space-y-1 pl-4">
                        {warningItems.map((warning) => (
                          <li key={`${cardId}-${warning}`}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {alert.portfolioRelevance ? (
                    <div className="mt-4 border-t border-white/10 pt-4 text-xs text-[#9CA3AF]">
                      <p className="text-[#93C5FD]">{typeof alert.portfolioRelevance === 'string' ? alert.portfolioRelevance : alert.portfolioRelevance?.message || 'Portfolio relevance N/A'}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
              );
            }) : (
            <p className="text-sm text-[#9CA3AF]">
              No high-confidence opportunities right now. Monitor market.
            </p>
          )}
        </div>
      </Card>

      <Card className="p-6" interactive={false}>
        <h3 className="text-lg font-semibold">Market Summary</h3>
        <p className="mt-1 text-xs text-[#9CA3AF]">
          Quick pulse for trend, sector focus, and risk to support faster decisions.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-[#111827] p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#9CA3AF]">Market Trend</p>
            <p className="mt-1 text-xl font-bold text-[#E5E7EB]">{marketSummary.marketTrend}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#111827] p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#9CA3AF]">Sector Highlight</p>
            <p className="mt-1 text-xl font-bold capitalize text-[#E5E7EB]">{marketSummary.sectorHighlight}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#111827] p-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#9CA3AF]">Risk Level</p>
            <p className="mt-1 text-xl font-bold text-[#E5E7EB]">{marketSummary.riskLevel}</p>
          </div>
        </div>
        <p className="mt-4 rounded-xl border border-white/10 bg-[#111827] px-3 py-2 text-sm text-[#9CA3AF]">
          {marketSummary.summaryLine}
        </p>
      </Card>

      <Card className="p-6" interactive={false}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Recent Radar Runs</h3>
          <select
            value={historySortBy}
            onChange={(event) => setHistorySortBy(event.target.value)}
            className="rounded-xl border border-white/15 bg-[#111827] px-3 py-2 text-sm text-[#E5E7EB] outline-none focus:border-[#3B82F6]"
          >
            <option value="latest">Latest Runs</option>
            <option value="highest-priority">Highest Avg Priority</option>
          </select>
        </div>
        <div className="mt-4 space-y-3">
          {topHistoryItems.length ? topHistoryItems.map((item, index) => (
            <div key={`${item.generatedAt || 'unknown'}-${index}`} className="rounded-xl border border-white/10 bg-[#111827] px-4 py-3 text-sm">
              <p className="font-semibold text-[#E5E7EB]">
                Run at {formatDateTime(item.generatedAt)}
              </p>
              <p className="mt-1 text-[#9CA3AF]">
                Alerts: {Array.isArray(item.alerts) ? item.alerts.length : 0}
                {' '}| Portfolio rows: {Array.isArray(item.portfolioRows) ? item.portfolioRows.length : 0}
                {' '}| Avg Priority: {Number.isFinite(item.avgPriority) ? item.avgPriority.toFixed(2) : 'NA'}
              </p>
              {item?.portfolioInsight ? (
                <p className="mt-1 text-xs text-[#9CA3AF]">{typeof item.portfolioInsight === 'string' ? item.portfolioInsight : item.portfolioInsight?.message || 'Portfolio insights N/A'}</p>
              ) : null}
            </div>
          )) : (
            <p className="text-sm text-[#9CA3AF]">
              No history yet. Your radar runs will appear here after the first scan.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

export default OpportunityRadarPage;
