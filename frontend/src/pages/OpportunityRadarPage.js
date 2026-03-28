import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import AlphaPanel from '../components/ui/AlphaPanel';
import ActionCard from '../components/ui/ActionCard';
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

function tierTone(tier) {
  if (tier === 'regulatory') {
    return 'text-emerald-700 dark:text-emerald-300';
  }
  if (tier === 'official') {
    return 'text-blue-700 dark:text-blue-300';
  }
  if (tier === 'news') {
    return 'text-amber-700 dark:text-amber-300';
  }
  return 'text-slate-600 dark:text-slate-300';
}

function formatBacktestRate(value) {
  if (value === null || value === undefined || value === '') {
    return 'Not enough data';
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 'Not enough data';
  }

  return `${numeric}%`;
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
  const formatted = formatComputedPercent(value);
  return formatted === 'N/A' ? 'N/A' : `+${formatted}`;
}

function computeExecutionPlanMetrics(alert) {
  const plan = alert?.executionPlan;
  if (!plan) {
    return {};
  }

  const entryLow = toFiniteNumber(plan.entryRangeLow);
  const entryHigh = toFiniteNumber(plan.entryRangeHigh) ?? entryLow;
  const stopLoss = toFiniteNumber(plan.stopLoss);
  const target1 = toFiniteNumber(plan.targetPrice);
  const target2 = target1 !== null ? target1 * 1.02 : null;
  const referencePrice = toFiniteNumber(alert?.price) ?? entryLow;

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

  return {
    entryRangePct: entryLow !== null && entryHigh !== null ? pctChange(entryHigh - entryLow) : null,
    maxLossPct: stopLoss !== null ? pctChange(referencePrice - stopLoss) : null,
    target1UpsidePct: target1 !== null ? pctChange(target1 - referencePrice) : null,
    target2UpsidePct: target2 !== null ? pctChange(target2 - referencePrice) : null,
  };
}

function formatMetricNumber(value, suffix = '') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '--';
  }
  return `${numeric.toFixed(1)}${suffix}`;
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
      tone: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200',
    });
  }

  const rsi = Number(alert?.rsi);
  if (Number.isFinite(rsi)) {
    chips.push({
      key: `rsi-${rsi}`,
      label: `RSI ${Math.round(rsi)}`,
      tone: 'border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    });
  }

  if (Array.isArray(alert?.riskFlags) && alert.riskFlags.includes('oversold')) {
    chips.push({
      key: 'oversold',
      label: 'Oversold',
      tone: 'border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    });
  }

  const signalType = String(alert?.signalType || '').trim();
  if (signalType) {
    chips.push({
      key: `signal-${signalType}`,
      label: signalType.replace(/-/g, ' '),
      tone: 'border-teal-300 bg-teal-100 text-teal-700 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
    });
  }

  return chips.slice(0, 4);
}

function riskFlagTone(flag) {
  if (flag === 'high-sector-concentration') {
    return 'border-red-300 bg-red-100 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300';
  }
  if (flag === 'oversold') {
    return 'border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  }
  if (flag === 'overbought') {
    return 'border-orange-300 bg-orange-100 text-orange-700 dark:border-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
  }
  return 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200';
}

function OpportunityRadarPage() {
  const {
    opportunityRadarData,
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
  const [actionFilter, setActionFilter] = useState('ALL');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [credibilityTierFilter, setCredibilityTierFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('priority');
  const [historySortBy, setHistorySortBy] = useState('latest');
  const [selectedRiskProfile, setSelectedRiskProfile] = useState('moderate');
  const [universeLimit, setUniverseLimit] = useState(150);
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [isUpdatingScheduler, setIsUpdatingScheduler] = useState(false);

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

  const latestAlerts = useMemo(() => {
    const raw = Array.isArray(opportunityRadarData?.alerts) ? opportunityRadarData.alerts : [];

    const filtered = raw.filter((alert) => {
      const actionOk = actionFilter === 'ALL' || String(alert?.action || '').toUpperCase() === actionFilter;
      const risks = Array.isArray(alert?.riskFlags) ? alert.riskFlags : [];
      const riskOk = riskFilter === 'ALL' || risks.includes(riskFilter);
      
      let tierOk = true;
      if (credibilityTierFilter !== 'ALL') {
        const contextSignals = Array.isArray(alert?.contextSignals) ? alert.contextSignals : [];
        tierOk = contextSignals.some((signal) => String(signal?.credibilityTier || 'community').toUpperCase() === credibilityTierFilter);
      }
      
      return actionOk && riskOk && tierOk;
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
  }, [actionFilter, credibilityTierFilter, opportunityRadarData, riskFilter, sortBy]);

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
    const scope = String(opportunityRadarData?.scanScope || 'portfolio').replace(/-/g, ' ');
    const scanLabel = scope.replace(/\b\w/g, (c) => c.toUpperCase());
    const symbolsScanned = Number(
      opportunityRadarData?.universe?.symbolsScanned
      || opportunityRadarData?.alphaEvidence?.totalSymbolsScanned
      || 0
    );
    const alerts = Array.isArray(opportunityRadarData?.alerts) ? opportunityRadarData.alerts : [];
    const buyCount = alerts.filter((item) => String(item?.action || '').toUpperCase() === 'BUY').length;
    const sellCount = alerts.filter((item) => String(item?.action || '').toUpperCase() === 'SELL').length;
    const holdCount = alerts.filter((item) => String(item?.action || '').toUpperCase() === 'HOLD').length;

    return {
      scanLabel,
      symbolsScanned,
      alertsCount: alerts.length,
      buyCount,
      sellCount,
      holdCount,
      generatedAt: opportunityRadarData?.generatedAt || null,
    };
  }, [opportunityRadarData]);

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden p-0" interactive={false}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_10%,rgba(15,118,110,0.18),transparent_36%),radial-gradient(circle_at_84%_18%,rgba(30,64,175,0.16),transparent_40%)]" />

        <div className="relative border-b border-slate-200/80 p-6 dark:border-slate-700/70">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Opportunity Radar</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Run NSE Universe Scan</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Scan a wider NSE universe, surface high-priority setups, then act with confidence and risk controls.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runOpportunityRadar(null, { riskProfile: selectedRiskProfile })}
                disabled={isRunningOpportunityRadar}
                className="ripple-btn rounded-2xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {isRunningOpportunityRadar ? 'Scanning Portfolio...' : 'Portfolio Scan'}
              </button>
              <button
                type="button"
                onClick={() => runOpportunityRadarUniverse({ riskProfile: selectedRiskProfile, universeLimit })}
                disabled={isRunningUniverseRadar}
                className="ripple-btn rounded-2xl bg-[#0F766E] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(15,118,110,0.8)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-70"
              >
                {isRunningUniverseRadar ? 'Scanning NSE Universe...' : 'Universe Scan'}
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Latest Scope</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{latestScanSummary.scanLabel}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Symbols Scanned</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{latestScanSummary.symbolsScanned || '--'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Alerts</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{latestScanSummary.alertsCount}</p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">B {latestScanSummary.buyCount} | H {latestScanSummary.holdCount} | S {latestScanSummary.sellCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Last Update</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{formatDateTime(latestScanSummary.generatedAt)}</p>
            </div>
          </div>
        </div>

        <div className="relative grid gap-4 p-6 lg:grid-cols-12">
          <div className="lg:col-span-8 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/65">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Scan Setup</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Risk Profile</span>
                  <select
                    value={selectedRiskProfile}
                    onChange={(event) => setSelectedRiskProfile(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#0F766E] dark:border-slate-600 dark:bg-slate-900"
                  >
                    <option value="conservative">Conservative</option>
                    <option value="moderate">Moderate</option>
                    <option value="aggressive">Aggressive</option>
                  </select>
                </label>

                <label className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Universe Limit</span>
                  <input
                    type="number"
                    min={10}
                    max={2000}
                    value={universeLimit}
                    onChange={(event) => setUniverseLimit(Number(event.target.value) || 0)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#0F766E] dark:border-slate-600 dark:bg-slate-900"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/65">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Scheduler</p>
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
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    Run Now
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                <p>Status: <span className="font-semibold">{schedulerStatus?.running ? 'Running' : 'Stopped'}</span></p>
                <p>Interval: <span className="font-semibold">{schedulerStatus?.intervalMinutes ?? '--'} min</span></p>
                <p>Last Run: <span className="font-semibold">{formatDateTime(schedulerStatus?.lastRunFinishedAt)}</span></p>
                <p>Last Summary: <span className="font-semibold">{schedulerStatus?.lastRunSummary ? `${schedulerStatus.lastRunSummary.alerts} alerts / ${schedulerStatus.lastRunSummary.symbolsScanned} symbols` : 'No runs yet'}</span></p>
              </div>
            </div>

            {apiError ? <p className="text-sm text-[#DC2626]">{apiError}</p> : null}
          </div>

          <aside className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/65">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Run Guide</p>
            <ol className="mt-3 space-y-3 text-sm text-slate-700 dark:text-slate-200">
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/70">1. Choose risk profile and universe limit.</li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/70">2. Run NSE Universe Scan to fetch opportunities.</li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/70">3. Filter alerts by action, risk, and credibility.</li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/70">4. Review execution plan before placing trades.</li>
            </ol>
          </aside>
        </div>
      </Card>

      <Card className="p-7" interactive={false}>
        <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">NSE Scan Signals</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Filter and rank latest opportunities from your most recent scan.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <select
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#0F766E] dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="ALL">All Actions</option>
            <option value="BUY">BUY</option>
            <option value="HOLD">HOLD</option>
            <option value="SELL">SELL</option>
          </select>

          <select
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#0F766E] dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="ALL">All Risk Flags</option>
            <option value="high-sector-concentration">High Sector Concentration</option>
            <option value="oversold">Oversold</option>
            <option value="overbought">Overbought</option>
          </select>

          <select
            value={credibilityTierFilter}
            onChange={(event) => setCredibilityTierFilter(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#0F766E] dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="ALL">All Credibility Tiers</option>
            <option value="REGULATORY">Regulatory</option>
            <option value="OFFICIAL">Official</option>
            <option value="NEWS">News</option>
            <option value="COMMUNITY">Community</option>
          </select>

          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#0F766E] dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="priority">Sort: Priority Score</option>
            <option value="confidence">Sort: Confidence</option>
            <option value="strength">Sort: Signal Strength</option>
          </select>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {latestAlerts.length ? latestAlerts.map((alert) => {
            const executionMetrics = computeExecutionPlanMetrics(alert);
            return (
            <article
              key={`${alert.symbol}-${alert.signalType}-${alert.action}`}
              className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900/70"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{alert.symbol}</p>
                  <div className="mt-2">
                    <Badge action={alert.action || 'HOLD'} />
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Confidence</p>
                  <p className="mt-1 text-3xl font-bold leading-none text-slate-900 dark:text-slate-100">{formatConfidence(alert.confidence)}</p>
                </div>
              </div>

              {Array.isArray(alert.riskFlags) && alert.riskFlags.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {alert.riskFlags.map((flag) => (
                    <span
                      key={`${alert.symbol}-${flag}`}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${riskFlagTone(flag)}`}
                    >
                      {flag.replace(/-/g, ' ')}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {signalChipsForAlert(alert).map((chip) => (
                  <span
                    key={chip.key}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${chip.tone}`}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>

              <p className="mt-4 break-words text-sm leading-6 text-slate-700 dark:text-slate-200">
                {formatSummary(alert.explanation)}
              </p>

              <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span>Priority {alert.priorityScore ?? 'NA'}</span>
                <span>Signal {alert.signalStrength ?? 'NA'}</span>
                <span>Backtest {formatBacktestRate(alert.backtestedSuccessRate)}</span>
                <span>Profile {String(alert.riskProfile || opportunityRadarData?.riskProfile || 'moderate').toUpperCase()}</span>
              </div>

              {alert.backtestStats && <AlphaPanel signal={alert} backtestStats={alert.backtestStats} />}
              {alert.executionPlan && <ActionCard alert={alert} tradePlan={{ decision: alert.action, entryLow: alert.executionPlan?.entryRangeLow, entryHigh: alert.executionPlan?.entryRangeHigh, stopLoss: alert.executionPlan?.stopLoss, target1: alert.executionPlan?.targetPrice, target2: alert.executionPlan?.targetPrice ? alert.executionPlan.targetPrice * 1.02 : null, timeHorizon: alert.executionPlan?.timeHorizonDays || 5, positionSize: (alert.executionPlan?.suggestedPositionSizePct || 0) / 100, rationale: alert.executionPlan?.rationale, watchOnly: alert.executionPlan?.watchOnly, executable: alert.executionPlan?.executable }} />}

              <details className="mt-4 rounded-xl border border-slate-200 bg-white/75 p-3 dark:border-slate-700 dark:bg-slate-900/55">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 transition-colors hover:text-slate-800 dark:text-slate-300 dark:hover:text-slate-100">
                  View Details
                </summary>

                {alert.executionPlan ? (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-800/60 dark:bg-emerald-900/20">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                      Action Plan
                    </p>
                    {alert.executionPlan.watchOnly ? (
                      <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">Watch-only plan: wait for confirmation before placing orders.</p>
                    ) : null}
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-700 dark:text-slate-200">
                      <span>Entry</span>
                      <span className="text-right">{formatPlanPrice(alert.executionPlan.entryPrice)}</span>
                      <span>Range</span>
                      <span className="text-right">
                        {formatPlanPrice(alert.executionPlan.entryRangeLow)} - {formatPlanPrice(alert.executionPlan.entryRangeHigh)}
                      </span>
                      <span>Range %</span>
                      <span className="text-right">{formatComputedPercent(executionMetrics.entryRangePct)}</span>
                      <span>Stop</span>
                      <span className="text-right">{formatPlanPrice(alert.executionPlan.stopLoss)}</span>
                      <span>Max Loss</span>
                      <span className="text-right">{formatComputedPercent(executionMetrics.maxLossPct)}</span>
                      <span>Target</span>
                      <span className="text-right">{formatPlanPrice(alert.executionPlan.targetPrice)}</span>
                      <span>Target 1 Upside</span>
                      <span className="text-right">{formatSignedComputedPercent(executionMetrics.target1UpsidePct)}</span>
                      <span>Target 2 Upside</span>
                      <span className="text-right">{formatSignedComputedPercent(executionMetrics.target2UpsidePct)}</span>
                      <span>Size</span>
                      <span className="text-right">{formatPlanPercent(alert.executionPlan.suggestedPositionSizePct)}</span>
                      <span>Horizon</span>
                      <span className="text-right">{alert.executionPlan.timeHorizonDays || '--'} days</span>
                    </div>
                    {alert.executionPlan.rationale ? (
                      <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300">{alert.executionPlan.rationale}</p>
                    ) : null}
                  </div>
                ) : null}

                {alert.portfolioRelevance ? (
                  <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">{alert.portfolioRelevance}</p>
                ) : null}

                {Array.isArray(alert.contextSignals) && alert.contextSignals.length ? (
                  <div className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <p className="font-semibold text-slate-700 dark:text-slate-200">Context Signals</p>
                    {alert.contextSignals.map((event, idx) => (
                      <p key={`${event.type}-${idx}`}>
                        [{String(event.impact || 'neutral').toUpperCase()}] {event.title}
                        {' '}({event.source})
                        {' '}
                        <span className={tierTone(event.credibilityTier)}>
                          [{String(event.credibilityTier || 'community').toUpperCase()}]
                        </span>
                        {' '}
                        <span>
                          [D{Number.isFinite(Number(event.ageDays)) ? Number(event.ageDays) : 'NA'}]
                        </span>
                        {event.sourceUrl ? (
                          <>
                            {' '}
                            <a
                              href={event.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-700 underline dark:text-emerald-300"
                            >
                              source
                            </a>
                          </>
                        ) : null}
                      </p>
                    ))}
                  </div>
                ) : null}

                {Array.isArray(alert.sources) && alert.sources.length ? (
                  <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                    Sources: {alert.sources.join(' | ')}
                  </p>
                ) : null}
              </details>
            </article>
              );
            }) : (
            <p className="text-sm text-gray-500 dark:text-slate-400">
              No latest alerts yet. Run Opportunity Radar to generate alerts.
            </p>
          )}
        </div>
      </Card>

      <Card className="p-6" interactive={false}>
        <h3 className="text-lg font-semibold">Alpha Evidence</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Quality proxy metrics from current autonomous scan.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Signals</p>
            <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{opportunityRadarData?.alphaEvidence?.totalSignals ?? '--'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Actionable</p>
            <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{opportunityRadarData?.alphaEvidence?.actionableSignals ?? '--'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Avg Backtest</p>
            <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">
              {formatMetricNumber(opportunityRadarData?.alphaEvidence?.avgBacktestedSuccessRate, '%')}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Edge Score</p>
            <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">
              {formatMetricNumber(opportunityRadarData?.alphaEvidence?.estimatedEdgeScore)}
            </p>
          </div>
        </div>

        {Array.isArray(opportunityRadarData?.alphaEvidence?.signalTypeStats)
          && opportunityRadarData.alphaEvidence.signalTypeStats.length ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/70">
              <p className="mb-2 font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Signal Type Breakdown</p>
              <div className="space-y-1.5">
                {opportunityRadarData.alphaEvidence.signalTypeStats.slice(0, 5).map((row) => (
                  <div key={row.signalType} className="grid grid-cols-4 gap-2 text-slate-700 dark:text-slate-200">
                    <span className="capitalize">{String(row.signalType || '').replace(/-/g, ' ')}</span>
                    <span>Count {row.count}</span>
                    <span>Conf {formatMetricNumber(row.avgConfidence, '%')}</span>
                    <span>Backtest {formatMetricNumber(row.avgBacktestedSuccessRate, '%')}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
      </Card>

      <Card className="p-6" interactive={false}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Recent Radar Runs</h3>
          <select
            value={historySortBy}
            onChange={(event) => setHistorySortBy(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#0F766E] dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="latest">Latest Runs</option>
            <option value="highest-priority">Highest Avg Priority</option>
          </select>
        </div>
        <div className="mt-4 space-y-3">
          {topHistoryItems.length ? topHistoryItems.map((item, index) => (
            <div key={`${item.generatedAt || 'unknown'}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900/70">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                Run at {formatDateTime(item.generatedAt)}
              </p>
              <p className="mt-1 text-slate-600 dark:text-slate-300">
                Alerts: {Array.isArray(item.alerts) ? item.alerts.length : 0}
                {' '}| Portfolio rows: {Array.isArray(item.portfolioRows) ? item.portfolioRows.length : 0}
                {' '}| Avg Priority: {Number.isFinite(item.avgPriority) ? item.avgPriority.toFixed(2) : 'NA'}
              </p>
              {item?.portfolioInsight ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.portfolioInsight}</p>
              ) : null}
            </div>
          )) : (
            <p className="text-sm text-gray-500 dark:text-slate-400">
              No history yet. Your radar runs will appear here after the first scan.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

export default OpportunityRadarPage;
