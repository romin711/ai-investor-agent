import React from 'react';
import Badge from './Badge';

/**
 * ActionCard: Converts BUY/SELL/HOLD into executable trade plan
 * Shows: entry, stop, target, position size, time horizon, risk/reward
 */
function ActionCard({ alert, tradePlan, portfolio }) {
  const {
    decision,          // BUY, SELL, HOLD
    entryLow, entryHigh, // entry zone
    stopLoss,
    target1, target2,
    timeHorizon,       // days
    positionSize,      // % of portfolio
    rationale,
    watchOnly = false,
    executable = true,
  } = tradePlan || {};

  const toFiniteNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const formatPrice = (value) => {
    const parsed = toFiniteNumber(value);
    return parsed === null ? 'N/A' : `₹${parsed.toFixed(2)}`;
  };

  const formatPercent = (value, { withSign = false } = {}) => {
    const parsed = toFiniteNumber(value);
    if (parsed === null) return 'N/A';
    const formatted = `${parsed.toFixed(2)}%`;
    return withSign ? `+${formatted}` : formatted;
  };

  const entryLowValue = toFiniteNumber(entryLow);
  const entryHighValue = toFiniteNumber(entryHigh) ?? entryLowValue;
  const stopLossValue = toFiniteNumber(stopLoss);
  const target1Value = toFiniteNumber(target1);
  const target2Value = toFiniteNumber(target2) ?? target1Value;
  const positionSizeValue = toFiniteNumber(positionSize) ?? 0;
  const currentPriceValue = toFiniteNumber(alert?.price) ?? entryLowValue;

  const hasValidPlan = entryLowValue !== null && stopLossValue !== null && target1Value !== null;

  const calculateMetrics = () => {
    if (!hasValidPlan || !currentPriceValue || currentPriceValue <= 0) return {};

    const percentChange = (numerator, denominator) => {
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
        return null;
      }
      return Math.abs((numerator / denominator) * 100);
    };

    const riskPercentage = percentChange(currentPriceValue - stopLossValue, currentPriceValue);
    const reward1 = percentChange(target1Value - currentPriceValue, currentPriceValue);
    const reward2 = percentChange(target2Value - currentPriceValue, currentPriceValue);
    const avgReward = reward1 !== null && reward2 !== null ? (reward1 + reward2) / 2 : null;
    const riskRewardRatio =
      avgReward !== null && riskPercentage !== null && riskPercentage > 0
        ? avgReward / riskPercentage
        : null;

    const entryRangePct =
      entryHighValue !== null && entryLowValue !== null
        ? percentChange(entryHighValue - entryLowValue, currentPriceValue)
        : null;

    return { riskPercentage, reward1, reward2, avgReward, riskRewardRatio, entryRangePct };
  };

  const metrics = calculateMetrics();

  if (!hasValidPlan) {
    return (
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
        <p className="text-xs text-slate-500">No executable plan available</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Action Plan</h4>
        <Badge action={decision} />
      </div>

      {watchOnly || executable === false ? (
        <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">
          Watch-only plan: levels are for confirmation, not immediate execution.
        </p>
      ) : null}

      {/* Entry Zone */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded border border-slate-200 p-2 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">Entry Zone</p>
          <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
            {formatPrice(entryLowValue)} - {formatPrice(entryHighValue)}
          </p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            {formatPercent(metrics.entryRangePct)} range
          </p>
        </div>

        <div className="rounded border border-rose-200 bg-rose-50 p-2 dark:border-rose-900/40 dark:bg-rose-900/20">
          <p className="text-xs text-rose-600 dark:text-rose-400">Stop Loss</p>
          <p className="mt-1 font-semibold text-rose-700 dark:text-rose-300">{formatPrice(stopLossValue)}</p>
          <p className="mt-0.5 text-xs text-rose-600 dark:text-rose-400">
            Max loss: {formatPercent(metrics.riskPercentage)}
          </p>
        </div>
      </div>

      {/* Targets */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded border border-emerald-200 bg-emerald-50 p-2 dark:border-emerald-900/40 dark:bg-emerald-900/20">
          <p className="text-xs text-emerald-600 dark:text-emerald-400">Target 1</p>
          <p className="mt-1 font-semibold text-emerald-700 dark:text-emerald-300">{formatPrice(target1Value)}</p>
          <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
            {formatPercent(metrics.reward1, { withSign: true })} upside
          </p>
        </div>

        <div className="rounded border border-emerald-200 bg-emerald-50 p-2 dark:border-emerald-900/40 dark:bg-emerald-900/20">
          <p className="text-xs text-emerald-600 dark:text-emerald-400">Target 2</p>
          <p className="mt-1 font-semibold text-emerald-700 dark:text-emerald-300">{formatPrice(target2Value)}</p>
          <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
            {formatPercent(metrics.reward2, { withSign: true })} upside
          </p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Position Size</p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{(positionSizeValue * 100).toFixed(1)}%</p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">of portfolio</p>
        </div>

        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Risk/Reward</p>
          <p className={`mt-1 text-lg font-bold ${metrics.riskRewardRatio !== null && metrics.riskRewardRatio > 1.5 ? 'text-emerald-600' : 'text-slate-900'} dark:text-slate-100`}>
            {metrics.riskRewardRatio === null ? 'N/A' : `1:${metrics.riskRewardRatio.toFixed(2)}`}
          </p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">Ratio</p>
        </div>

        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Time Horizon</p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{timeHorizon} days</p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">Hold period</p>
        </div>
      </div>

      {/* Rationale */}
      {rationale && (
        <div className="rounded border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/60">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Rationale</p>
          <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">{rationale}</p>
        </div>
      )}
    </div>
  );
}

export default ActionCard;
