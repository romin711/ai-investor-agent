import React, { useEffect, useMemo, useState } from 'react';
import Card from '../components/ui/Card';
import { usePortfolio } from '../context/PortfolioContext';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function reliabilityBand(score) {
  if (score >= 70) return 'High';
  if (score >= 45) return 'Moderate';
  return 'Low';
}

function reliabilityTone(label) {
  if (label === 'High') {
    return {
      text: 'text-emerald-700 dark:text-emerald-300',
      border: 'border-emerald-200 dark:border-emerald-900/40',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    };
  }

  if (label === 'Moderate') {
    return {
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-200 dark:border-amber-900/40',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
    };
  }

  return {
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-200 dark:border-rose-900/40',
    bg: 'bg-rose-50 dark:bg-rose-900/20',
  };
}

function confidenceTone(value) {
  const level = String(value || '').toLowerCase();
  if (level.includes('high')) return 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-900/40';
  if (level.includes('moderate') || level.includes('medium')) return 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/20 dark:border-amber-900/40';
  return 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-900/20 dark:border-rose-900/40';
}

function formatPct(value, digits = 2, withSign = false) {
  const numeric = Number(value) || 0;
  const prefix = withSign && numeric > 0 ? '+' : '';
  return `${prefix}${numeric.toFixed(digits)}%`;
}

function computeReliabilityScore(metrics) {
  const sharpe = Number(metrics?.sharpeRatio) || 0;
  const hitRate = Number(metrics?.hitRate) || 0;
  const maxDrawdown = Math.abs(Number(metrics?.maxDrawdown) || 0);
  const sampleSize = Number(metrics?.signalCount) || 0;

  const sharpeScore = clamp((sharpe / 2) * 100, 0, 100);
  const hitRateScore = clamp(((hitRate - 0.4) / 0.3) * 100, 0, 100);
  const drawdownScore = clamp((1 - (maxDrawdown / 0.2)) * 100, 0, 100);
  const sampleScore = clamp((sampleSize / 120) * 100, 0, 100);

  const composite = (
    (sharpeScore * 0.35)
    + (hitRateScore * 0.3)
    + (drawdownScore * 0.2)
    + (sampleScore * 0.15)
  );

  return Math.round(clamp(composite, 0, 100));
}

function summarizeBias(decisionBreakdown, totalCount) {
  if (!totalCount) {
    return 'No alert history yet. Run scans to estimate signal bias and trading behavior.';
  }

  const rows = Object.entries(decisionBreakdown).filter(([, count]) => count > 0);
  if (rows.length === 0) {
    return 'No classified BUY/SELL/HOLD signals found. Verify upstream action tagging.';
  }

  const [dominantSignal, dominantCount] = rows.sort((a, b) => b[1] - a[1])[0];
  const dominantShare = dominantCount / totalCount;

  if (dominantSignal === 'HOLD' && dominantShare >= 0.55) {
    return `Bias is defensive (${Math.round(dominantShare * 100)}% HOLD). Trading should be selective and size should stay small until stronger directional conviction appears.`;
  }

  if (dominantSignal === 'BUY' && dominantShare >= 0.55) {
    return `Bias is risk-on (${Math.round(dominantShare * 100)}% BUY). Favor momentum entries, but cap exposure in case trend reverses.`;
  }

  if (dominantSignal === 'SELL' && dominantShare >= 0.55) {
    return `Bias is bearish (${Math.round(dominantShare * 100)}% SELL). Protect capital first and avoid aggressive long additions.`;
  }

  return `Signal mix is balanced (largest bucket ${dominantSignal} at ${Math.round(dominantShare * 100)}%). Market regime is mixed, so prioritize setups with stronger confidence and clear risk limits.`;
}

function buildVerdict(reliabilityScore, metrics) {
  const hitRate = Number(metrics?.hitRate) || 0;
  const sharpe = Number(metrics?.sharpeRatio) || 0;
  const drawdown = Math.abs(Number(metrics?.maxDrawdown) || 0);
  const sampleSize = Number(metrics?.signalCount) || 0;

  const reliable = reliabilityScore >= 60 && hitRate >= 0.55 && sharpe >= 1;
  const tradable = reliable && sampleSize >= 25 && drawdown <= 0.15;

  let riskLevel = 'High';
  if (drawdown <= 0.08 && sharpe >= 1.2) riskLevel = 'Low';
  else if (drawdown <= 0.14 && sharpe >= 0.9) riskLevel = 'Moderate';

  return {
    reliable,
    tradable,
    riskLevel,
    message: reliable
      ? 'Model quality is acceptable, but execution discipline still matters.'
      : 'Model quality is not yet strong enough for high-conviction capital deployment.',
  };
}

function ValidationDashboard() {
  const { opportunityRadarHistory } = usePortfolio();
  const [validationMetrics, setValidationMetrics] = useState(null);
  const [performanceByDecision, setPerformanceByDecision] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isMethodologyOpen, setIsMethodologyOpen] = useState(false);

  const apiBase = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:3001';
  const fallbackApiBase = apiBase.includes('127.0.0.1')
    ? apiBase.replace('127.0.0.1', 'localhost')
    : apiBase.replace('localhost', '127.0.0.1');

  useEffect(() => {
    let active = true;

    const fetchValidation = async () => {
      setIsLoading(true);
      setError('');

      const bases = [apiBase, fallbackApiBase];

      for (const base of bases) {
        try {
          const perfResponse = await fetch(`${base}/api/validation/performance`);
          if (!perfResponse.ok) {
            throw new Error(`Validation API error (${perfResponse.status})`);
          }

          const perfData = await perfResponse.json();
          let breakdown = perfData?.strategyByDecision;

          if (!breakdown) {
            const breakdownResponse = await fetch(`${base}/api/validation/strategy-breakdown`);
            if (breakdownResponse.ok) {
              breakdown = await breakdownResponse.json();
            }
          }

          if (active) {
            setValidationMetrics(perfData);
            setPerformanceByDecision(breakdown || {});
            setIsLoading(false);
          }
          return;
        } catch (_err) {
          // Try next host alias.
        }
      }

      if (active) {
        setError('Unable to load validation metrics from backend. Start backend and retry.');
        setIsLoading(false);
      }
    };

    fetchValidation();

    return () => {
      active = false;
    };
  }, [apiBase, fallbackApiBase]);

  const allAlerts = useMemo(() => {
    const history = Array.isArray(opportunityRadarHistory) ? opportunityRadarHistory : [];
    return history.flatMap((run) => (Array.isArray(run.alerts) ? run.alerts : []));
  }, [opportunityRadarHistory]);

  const decisionBreakdown = useMemo(() => {
    const breakdown = { BUY: 0, SELL: 0, HOLD: 0, NEUTRAL: 0 };
    allAlerts.forEach((alert) => {
      const action = String(alert.action || 'NEUTRAL').toUpperCase();
      breakdown[action] = (breakdown[action] || 0) + 1;
    });
    return breakdown;
  }, [allAlerts]);

  const decisionRows = useMemo(() => {
    const order = ['BUY', 'SELL', 'HOLD'];
    return order
      .filter((signalType) => performanceByDecision?.[signalType])
      .map((signalType) => {
        const row = performanceByDecision[signalType] || {};
        return {
          signalType,
          hitRate: Number(row.hitRate) || 0,
          return5D: Number(row?.returnAttribution?.['5D']?.mean) || 0,
          drawdown: Math.abs(Number(row.worstDrawdown) || 0) * 100,
          confidence: String(row.confidence || 'low'),
        };
      });
  }, [performanceByDecision]);

  const reliabilityScore = useMemo(
    () => computeReliabilityScore(validationMetrics || {}),
    [validationMetrics]
  );

  const reliabilityLabel = reliabilityBand(reliabilityScore);
  const reliabilityTheme = reliabilityTone(reliabilityLabel);

  const verdict = useMemo(
    () => buildVerdict(reliabilityScore, validationMetrics || {}),
    [reliabilityScore, validationMetrics]
  );

  const totalDecisionCount = Object.values(decisionBreakdown).reduce((sum, count) => sum + count, 0);
  const biasInsight = summarizeBias(decisionBreakdown, totalDecisionCount);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card interactive={false} className="p-6">
          <p className="text-center text-slate-500">Loading validation metrics...</p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card interactive={false} className="p-6">
          <p className="text-center text-sm text-rose-600">{error}</p>
        </Card>
      </div>
    );
  }

  const hitRate = Number(validationMetrics?.hitRate || 0) * 100;
  const sharpeRatio = Number(validationMetrics?.sharpeRatio || 0);
  const maxDrawdown = Math.abs(Number(validationMetrics?.maxDrawdown || 0) * 100);
  const signalCount = Number(validationMetrics?.signalCount || 0);
  const liveOutcomeCount = Number(validationMetrics?.liveOutcomeCount || 0);

  const baseline = validationMetrics?.baselineComparison || {
    outperformancePct: 0,
    strategyCompoundedReturnPct: 0,
    baselineCompoundedReturnPct: 0,
  };

  const outperformancePct = Number(baseline.outperformancePct || 0);

  return (
    <div className="space-y-6">
      <Card interactive={false} className={`p-6 ${reliabilityTheme.border} ${reliabilityTheme.bg}`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Validation Dashboard</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Fast answer to one question: can this AI be trusted with real money today?
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsMethodologyOpen(true)}
            className="self-start rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            View methodology
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-white/60 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-950/40 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">AI Reliability Score</p>
            <div className="mt-2 flex items-end gap-3">
              <p className="text-5xl font-black leading-none text-slate-900 dark:text-slate-100">{reliabilityScore}</p>
              <p className="pb-1 text-lg font-semibold text-slate-500 dark:text-slate-400">/ 100</p>
            </div>
            <p className={`mt-2 text-sm font-semibold ${reliabilityTheme.text}`}>{reliabilityLabel} reliability</p>
            <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
              Built from hit rate, Sharpe, drawdown, and sample size for decision confidence.
            </p>
          </div>

          <div className="rounded-lg border border-white/60 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Final Verdict</p>
            <p className={`mt-2 text-base font-semibold ${verdict.reliable ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
              {verdict.reliable ? 'Model appears reliable' : 'Model reliability is weak'}
            </p>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              Tradable: <span className="font-semibold">{verdict.tradable ? 'Yes, with risk controls' : 'Not ready for full-size trading'}</span>
            </p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
              Risk level: <span className="font-semibold">{verdict.riskLevel}</span>
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card interactive={false} className="p-5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Performance</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Returns vs baseline</p>
          <p className={`mt-4 text-3xl font-bold ${outperformancePct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {formatPct(outperformancePct, 2, true)}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Outperformance</p>
          <div className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-400">
            <p>Strategy: {formatPct(Number(baseline.strategyCompoundedReturnPct || 0), 2, true)}</p>
            <p>Baseline: {formatPct(Number(baseline.baselineCompoundedReturnPct || 0), 2, true)}</p>
          </div>
        </Card>

        <Card interactive={false} className="p-5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Risk</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Volatility and downside</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Sharpe</p>
              <p className={`text-2xl font-bold ${sharpeRatio >= 1 ? 'text-emerald-600' : 'text-amber-600'}`}>{sharpeRatio.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Max drawdown</p>
              <p className={`text-2xl font-bold ${maxDrawdown <= 10 ? 'text-emerald-600' : maxDrawdown <= 16 ? 'text-amber-600' : 'text-rose-600'}`}>
                {maxDrawdown.toFixed(2)}%
              </p>
            </div>
          </div>
        </Card>

        <Card interactive={false} className="p-5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Accuracy</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">How often signals are correct</p>
          <p className={`mt-4 text-3xl font-bold ${hitRate >= 55 ? 'text-emerald-600' : hitRate >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
            {hitRate.toFixed(1)}%
          </p>
          <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
            <p>Validated signals: {signalCount}</p>
            <p>Live outcomes: {liveOutcomeCount}</p>
          </div>
        </Card>
      </div>

      <Card interactive={false} className="p-6">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Signal Comparison</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Which signal types deserve more trust and capital.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="px-3 py-2">Signal Type</th>
                <th className="px-3 py-2">Hit Rate</th>
                <th className="px-3 py-2">Return (5D)</th>
                <th className="px-3 py-2">Drawdown</th>
                <th className="px-3 py-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {decisionRows.map((row) => (
                <tr key={row.signalType} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-3 font-semibold text-slate-900 dark:text-slate-100">{row.signalType}</td>
                  <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{(row.hitRate * 100).toFixed(1)}%</td>
                  <td className={`px-3 py-3 font-semibold ${row.return5D >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formatPct(row.return5D, 2, true)}
                  </td>
                  <td className={`px-3 py-3 font-semibold ${row.drawdown <= 8 ? 'text-emerald-600' : row.drawdown <= 14 ? 'text-amber-600' : 'text-rose-600'}`}>
                    {row.drawdown.toFixed(2)}%
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${confidenceTone(row.confidence)}`}>
                      {row.confidence}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card interactive={false} className="p-6">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Alert Distribution Insight</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">What your signal mix implies for trading behavior.</p>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(decisionBreakdown).map(([signalType, count]) => {
            const share = totalDecisionCount > 0 ? (count / totalDecisionCount) * 100 : 0;
            return (
              <div key={signalType} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{signalType}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{count}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{share.toFixed(1)}%</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
          {biasInsight}
        </div>
      </Card>

      <Card interactive={false} className="p-6">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Final Verdict</h2>
        <p className="mt-2 text-base text-slate-700 dark:text-slate-300">{verdict.message}</p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className={`rounded-lg border p-3 ${verdict.reliable ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300'}`}>
            <p className="text-xs uppercase tracking-[0.12em]">Is model reliable?</p>
            <p className="mt-1 font-semibold">{verdict.reliable ? 'Yes' : 'No'}</p>
          </div>

          <div className={`rounded-lg border p-3 ${verdict.tradable ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300'}`}>
            <p className="text-xs uppercase tracking-[0.12em]">Is it tradable?</p>
            <p className="mt-1 font-semibold">{verdict.tradable ? 'Tradable with controls' : 'Paper-trade / reduce size'}</p>
          </div>

          <div className={`rounded-lg border p-3 ${verdict.riskLevel === 'Low' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300' : verdict.riskLevel === 'Moderate' ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300'}`}>
            <p className="text-xs uppercase tracking-[0.12em]">Risk level</p>
            <p className="mt-1 font-semibold">{verdict.riskLevel}</p>
          </div>
        </div>
      </Card>

      {isMethodologyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="Methodology details">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Methodology</h3>
              <button
                type="button"
                onClick={() => setIsMethodologyOpen(false)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                Close
              </button>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              Reliability score combines Sharpe, hit rate, drawdown, and sample size. Signal success is direction-aware:
              BUY wins on positive return, SELL wins on negative return, HOLD wins in low-volatility ranges. Baseline uses
              buy-and-hold compounding assumptions from backend metrics.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ValidationDashboard;
