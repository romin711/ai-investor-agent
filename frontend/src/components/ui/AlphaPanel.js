import React from 'react';
import Badge from './Badge';

/**
 * AlphaPanel: Displays signal quality metrics and expected edge
 * Shows: hit rate, expected return, sample size, downside risk, confidence
 */
function AlphaPanel({ backtestStats }) {
  const {
    hitRate,        // 0.0-1.0
    avgReturn5D,
    maxDrawdown,    // worst case % loss
    sampleSize,
    confidenceInterval95, // [lower, upper] bounds
    sharpeRatio,
  } = backtestStats || {};

  // Confidence level based on sample size
  const getConfidenceLevel = (n) => {
    if (!n) return 'insufficient';
    if (n < 10) return 'low';
    if (n < 30) return 'moderate';
    return 'high';
  };

  const confidence = getConfidenceLevel(sampleSize);
  const confColor = {
    high: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    moderate: 'border-amber-200 bg-amber-50 text-amber-700',
    low: 'border-rose-200 bg-rose-50 text-rose-700',
    insufficient: 'border-slate-200 bg-slate-50 text-slate-600',
  }[confidence];

  if (!backtestStats) {
    return (
      <div className={`rounded-lg border ${confColor} p-3`}>
        <p className="text-xs font-semibold text-slate-500">No backtest data</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Signal Quality Proof</h4>
        <Badge action={confidence} />
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {/* Hit Rate */}
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Hit Rate</p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
            {(hitRate * 100).toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-slate-500">n={sampleSize}</p>
        </div>

        {/* Avg Return */}
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Avg Return (5D)</p>
          <p className={`mt-1 text-lg font-bold ${avgReturn5D >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {avgReturn5D >= 0 ? '+' : ''}{avgReturn5D?.toFixed(2)}%
          </p>
          <p className="mt-1 text-xs text-slate-500">
            CI: [{(confidenceInterval95?.[0] || 0).toFixed(1)}%, {(confidenceInterval95?.[1] || 0).toFixed(1)}%]
          </p>
        </div>

        {/* Sharpe Ratio */}
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Sharpe Ratio</p>
          <p className={`mt-1 text-lg font-bold ${sharpeRatio >= 1 ? 'text-emerald-600' : 'text-slate-600'}`}>
            {sharpeRatio?.toFixed(2) || 'N/A'}
          </p>
          <p className="mt-1 text-xs text-slate-500">Risk-Adjusted</p>
        </div>

        {/* Max Drawdown */}
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Max Drawdown</p>
          <p className="mt-1 text-lg font-bold text-rose-600">{Math.abs(maxDrawdown || 0).toFixed(2)}%</p>
          <p className="mt-1 text-xs text-slate-500">Worst Case</p>
        </div>
      </div>

      {/* Confidence Note */}
      <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
        {confidence === 'insufficient'
          ? '⚠️ Insufficient backtest history to claim statistical significance'
          : confidence === 'low'
            ? '⚠️ Low confidence: small sample size. Use cautiously.'
            : confidence === 'moderate'
              ? '✓ Moderate confidence: sample size adequate for most decisions'
              : '✅ High confidence: statistically significant result'}
      </p>
    </div>
  );
}

export default AlphaPanel;
