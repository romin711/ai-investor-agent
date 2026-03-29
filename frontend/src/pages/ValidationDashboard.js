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

function formatPctOrDash(value, digits = 2, withSign = false, showDash = false) {
  if (showDash) return '—';
  return formatPct(value, digits, withSign);
}

function computeReliabilityScore(metrics) {
  const backendScore = Number(metrics?.reliabilityScore);
  if (Number.isFinite(backendScore)) {
    return Math.round(clamp(backendScore, 0, 100));
  }

  const predictiveScore = Number(metrics?.predictiveScore);
  if (Number.isFinite(predictiveScore)) {
    return Math.round(clamp(predictiveScore, 0, 100));
  }

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
  const earlyStage = String(metrics?.mode || '').toLowerCase() === 'early-stage'
    || metrics?.reliabilityScore === null;
  if (earlyStage) {
    return {
      reliable: false,
      tradable: false,
      riskLevel: 'High',
      message: 'System is collecting live outcome data. Early confidence is based on signal quality, not realized performance.',
    };
  }

  const hitRateLowerBound = Number(metrics?.reliability?.hitRateLowerBound) || 0;
  const deflatedSharpe = Number(metrics?.reliability?.deflatedSharpe) || 0;
  const drawdown = Math.abs(Number(metrics?.maxDrawdown) || 0);
  const sampleSize = Number(metrics?.signalCount) || 0;
  const outperformance = Number(metrics?.baselineComparison?.outperformancePct || 0);

  const backendReadiness = metrics?.tradingReadiness?.gates;

  const reliable = reliabilityScore >= 70
    && hitRateLowerBound >= 0.52
    && deflatedSharpe >= 0.6;

  const tradable = backendReadiness
    ? Boolean(metrics?.tradingReadiness?.tradable)
    : (reliable && sampleSize >= 150 && drawdown <= 0.12 && outperformance > 0);

  let riskLevel = 'High';
  if (drawdown <= 0.08 && reliabilityScore >= 75) riskLevel = 'Low';
  else if (drawdown <= 0.14 && reliabilityScore >= 55) riskLevel = 'Moderate';

  return {
    reliable,
    tradable,
    riskLevel,
    message: reliable
      ? 'Model quality is statistically acceptable, but position sizing and execution controls remain mandatory.'
      : 'Model quality is still statistically fragile. Keep this in paper/small-size mode until sample depth and robustness improve.',
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
        const evaluationHorizon = String(row.evaluationHorizon || '5D');
        const sampleSize = Number(row?.returnAttribution?.[evaluationHorizon]?.sampleSize) || 0;
        return {
          signalType,
          hitRate: Number(row.hitRate) || 0,
          evaluationHorizon,
          returnValue: Number(row?.returnAttribution?.[evaluationHorizon]?.mean) || 0,
          drawdown: sampleSize > 0 ? Math.abs(Number(row.worstDrawdown) || 0) * 100 : null,
          sampleSize,
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
  const reliabilityDetails = validationMetrics?.reliability || null;
  const scoringMode = String(validationMetrics?.mode || validationMetrics?.dataProvenance?.scoringMode || 'live');
  const isEarlyStage = scoringMode === 'early-stage' || validationMetrics?.reliabilityScore === null;
  const dataProvenance = validationMetrics?.dataProvenance || null;
  const isStrictLiveOnly = Boolean(dataProvenance?.strictLiveOnly);
  const hasSufficientLiveOutcomes = Boolean(dataProvenance?.hasSufficientLiveOutcomes);

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
  const evaluationHorizon = String(validationMetrics?.evaluationHorizon || '5D');
  const liveOutcomeCount = Number(validationMetrics?.liveOutcomeCount || 0);
  const trackedOutcomeCount = Number(
    validationMetrics?.trackedOutcomeCount
      || validationMetrics?.dataProvenance?.trackedOutcomeCount
      || liveOutcomeCount
      || 0
  );
  const realized5DOutcomeCount = Number(
    validationMetrics?.realized5DOutcomeCount
      || validationMetrics?.dataProvenance?.realized5DOutcomeCount
      || 0
  );

  const baseline = validationMetrics?.baselineComparison || {
    outperformancePct: 0,
    strategyCompoundedReturnPct: 0,
    baselineCompoundedReturnPct: 0,
  };

  const outperformancePct = Number(baseline.outperformancePct || 0);
  const hasValidatedSample = signalCount > 0;

  const reliabilityHeadline = isEarlyStage ? 'Not yet validated' : `${reliabilityLabel} reliability`;
  const reliabilityTitle = isEarlyStage ? 'Predictive Confidence Score' : 'AI Reliability Score';

  return (
    <div className="space-y-6">
      <Card interactive={false} className={`p-6 ${reliabilityTheme.border} ${reliabilityTheme.bg}`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#F3F4F6]">Validation Dashboard</h1>
            <p className="mt-2 text-sm text-[#9CA3AF]">
              Fast answer to one question: can this AI be trusted with real money today?
            </p>
            <p className="mt-2 text-xs text-[#9CA3AF]">
              Data mode: {isStrictLiveOnly ? 'Strict live outcomes only' : 'Legacy mixed mode'}
              {dataProvenance?.mode ? ` (${typeof dataProvenance.mode === 'string' ? dataProvenance.mode : 'legacy'})` : ''}
            </p>
            {!hasSufficientLiveOutcomes ? (
              <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                Insufficient live outcomes: metrics shown with zero-sample reliability state until more realized trades are collected.
              </p>
            ) : null}
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Data maturity: Tracked signals {trackedOutcomeCount} | Realized outcomes {liveOutcomeCount} | Minimum for validation 10 realized and 5 at 5D.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsMethodologyOpen(true)}
            className="self-start rounded-md border border-[#334155] bg-[#111827] px-3 py-1.5 text-xs font-semibold text-[#CBD5E1] hover:bg-[#0F172A]"
          >
            View methodology
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-[#334155] bg-[#0F172A] p-4 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">{reliabilityTitle}</p>
            <div className="mt-2 flex items-end gap-3">
              <p className="text-5xl font-black leading-none text-[#F3F4F6]">{reliabilityScore}</p>
              <p className="pb-1 text-lg font-semibold text-[#9CA3AF]">/ 100</p>
            </div>
            <p className={`mt-2 text-sm font-semibold ${reliabilityTheme.text}`}>{reliabilityHeadline}</p>
            <p className="mt-3 text-xs text-[#9CA3AF]">
              {isEarlyStage
                ? 'Early-stage confidence from signal quality and distribution. Realized-performance reliability activates after minimum sample thresholds.'
                : 'Built from lower-bound hit rate, deflated Sharpe, drawdown quality, and sample adequacy.'}
            </p>
            {reliabilityDetails ? (
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[#9CA3AF]">
                <p>Hit-rate lower bound: {hasValidatedSample ? `${(Number(reliabilityDetails.hitRateLowerBound || 0) * 100).toFixed(1)}%` : '—'}</p>
                <p>Deflated Sharpe: {hasValidatedSample ? Number(reliabilityDetails.deflatedSharpe || 0).toFixed(2) : '—'}</p>
                <p>Sample adequacy: {hasValidatedSample ? `${(Number(reliabilityDetails.components?.sampleAdequacy || 0) * 100).toFixed(1)}%` : '—'}</p>
                <p>Drawdown quality: {hasValidatedSample ? `${(Number(reliabilityDetails.components?.drawdownQuality || 0) * 100).toFixed(1)}%` : '—'}</p>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-[#334155] bg-[#0F172A] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Final Verdict</p>
            <p className={`mt-2 text-base font-semibold ${verdict.reliable ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
              {isEarlyStage ? 'Model is in early-stage validation' : verdict.reliable ? 'Model appears reliable' : 'Model reliability is weak'}
            </p>
            <p className="mt-2 text-sm text-[#E5E7EB]">
              Tradable: <span className="font-semibold">{verdict.tradable ? 'Yes, with risk controls' : 'Not ready for full-size trading'}</span>
            </p>
            <p className="mt-1 text-sm text-[#E5E7EB]">
              Risk level: <span className="font-semibold">{verdict.riskLevel}</span>
            </p>
            {validationMetrics?.tradingReadiness?.gates ? (
              <p className="mt-2 text-xs text-[#9CA3AF]">
                Gates passed: {Number(validationMetrics.tradingReadiness.passedCount || 0)} / {Number(validationMetrics.tradingReadiness.totalGates || 0)}
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card interactive={false} className="p-5">
          <h2 className="text-lg font-bold text-[#F3F4F6]">Performance</h2>
          <p className="mt-1 text-xs text-[#9CA3AF]">Returns vs baseline</p>
          <p className={`mt-4 text-3xl font-bold ${outperformancePct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {formatPctOrDash(outperformancePct, 2, true, !hasValidatedSample)}
          </p>
          <p className="mt-1 text-sm text-[#9CA3AF]">Outperformance</p>
          <div className="mt-3 space-y-1 text-xs text-[#9CA3AF]">
            <p>Strategy: {formatPctOrDash(Number(baseline.strategyCompoundedReturnPct || 0), 2, true, !hasValidatedSample)}</p>
            <p>Baseline: {formatPctOrDash(Number(baseline.baselineCompoundedReturnPct || 0), 2, true, !hasValidatedSample)}</p>
          </div>
        </Card>

        <Card interactive={false} className="p-5">
          <h2 className="text-lg font-bold text-[#F3F4F6]">Risk</h2>
          <p className="mt-1 text-xs text-[#9CA3AF]">Volatility and downside</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-[#9CA3AF]">Sharpe</p>
              <p className={`text-2xl font-bold ${sharpeRatio >= 1 ? 'text-emerald-600' : 'text-amber-600'}`}>{hasValidatedSample ? sharpeRatio.toFixed(2) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-[#9CA3AF]">Max drawdown</p>
              <p className={`text-2xl font-bold ${maxDrawdown <= 10 ? 'text-emerald-600' : maxDrawdown <= 16 ? 'text-amber-600' : 'text-rose-600'}`}>
                {hasValidatedSample ? `${maxDrawdown.toFixed(2)}%` : '—'}
              </p>
            </div>
          </div>
        </Card>

        <Card interactive={false} className="p-5">
          <h2 className="text-lg font-bold text-[#F3F4F6]">Accuracy</h2>
          <p className="mt-1 text-xs text-[#9CA3AF]">How often signals are correct</p>
          <p className={`mt-4 text-3xl font-bold ${hitRate >= 55 ? 'text-emerald-600' : hitRate >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
            {hasValidatedSample ? `${hitRate.toFixed(1)}%` : '—'}
          </p>
          <div className="mt-2 space-y-1 text-xs text-[#9CA3AF]">
            <p>Validated signals ({evaluationHorizon}): {signalCount}</p>
            <p>Realized outcomes (>=1D): {liveOutcomeCount}</p>
            <p>Realized outcomes (5D): {realized5DOutcomeCount}</p>
            <p>Tracked outcome records: {trackedOutcomeCount}</p>
          </div>
        </Card>
      </div>

      <Card interactive={false} className="p-6">
        <h2 className="text-xl font-bold text-[#F3F4F6]">Signal Comparison</h2>
        <p className="mt-1 text-sm text-[#9CA3AF]">
          Which signal types deserve more trust and capital.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="px-3 py-2">Signal Type</th>
                <th className="px-3 py-2">Hit Rate</th>
                <th className="px-3 py-2">Return ({evaluationHorizon})</th>
                <th className="px-3 py-2">Drawdown</th>
                <th className="px-3 py-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {decisionRows.map((row) => (
                <tr key={row.signalType} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-3 font-semibold text-[#F3F4F6]">{row.signalType}</td>
                  <td className="px-3 py-3 text-[#E5E7EB]">{row.sampleSize > 0 ? `${(row.hitRate * 100).toFixed(1)}%` : '—'}</td>
                  <td className={`px-3 py-3 font-semibold ${row.returnValue >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {row.sampleSize > 0 ? formatPct(row.returnValue, 2, true) : '—'}
                  </td>
                  <td className={`px-3 py-3 font-semibold ${row.drawdown !== null && row.drawdown <= 8 ? 'text-emerald-600' : row.drawdown !== null && row.drawdown <= 14 ? 'text-amber-600' : 'text-rose-600'}`}>
                    {row.sampleSize > 0 && row.drawdown !== null ? `${row.drawdown.toFixed(2)}%` : '—'}
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
        <h2 className="text-xl font-bold text-[#F3F4F6]">Alert Distribution Insight</h2>
        <p className="mt-1 text-sm text-[#9CA3AF]">What your signal mix implies for trading behavior.</p>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(decisionBreakdown).map(([signalType, count]) => {
            const share = totalDecisionCount > 0 ? (count / totalDecisionCount) * 100 : 0;
            return (
              <div key={signalType} className="rounded-lg border border-[#334155] bg-[#0F172A] p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[#9CA3AF]">{signalType}</p>
                <p className="mt-1 text-2xl font-bold text-[#F3F4F6]">{count}</p>
                <p className="text-xs text-[#9CA3AF]">{share.toFixed(1)}%</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-lg border border-[#334155] bg-[#0F172A] p-4 text-sm text-[#E5E7EB]">
          {biasInsight}
        </div>
      </Card>

      <Card interactive={false} className="p-6">
        <h2 className="text-2xl font-extrabold tracking-tight text-[#F3F4F6]">Final Verdict</h2>
        <p className="mt-2 text-base text-[#E5E7EB]">{verdict.message}</p>

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
          <div className="w-full max-w-xl rounded-xl border border-[#334155] bg-[#111827] p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-[#F3F4F6]">Methodology</h3>
              <button
                type="button"
                onClick={() => setIsMethodologyOpen(false)}
                className="rounded-md border border-[#334155] px-2 py-1 text-xs font-semibold text-[#9CA3AF] hover:bg-[#0F172A]"
              >
                Close
              </button>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-[#E5E7EB]">
              Reliability score combines lower-bound hit rate confidence, deflated Sharpe, drawdown quality, and sample adequacy.
              Signal success is direction-aware: BUY wins on positive return, SELL wins on negative return, HOLD wins in low-volatility
              ranges. Trading readiness requires all backend gates to pass (sample depth, reliability threshold, robust Sharpe,
              drawdown budget, and positive outperformance versus baseline).
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ValidationDashboard;
