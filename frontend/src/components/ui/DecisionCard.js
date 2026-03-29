import React from 'react';

function DecisionCard({ decision, probabilityRange, entryRange, stopLoss, targetPrice, riskRewardRatio, confidence }) {
  // Determine decision colors
  const decisionColors = {
    BUY: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
    SELL: { bg: 'bg-rose-50 dark:bg-rose-950/30', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800' },
    HOLD: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
  };

  const colors = decisionColors[decision] || decisionColors.HOLD;

  return (
    <div className={`rounded-2xl border-2 p-8 ${colors.bg} ${colors.border}`}>
      {/* Decision Label */}
      <div className="mb-6 flex items-baseline justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-gray-500 dark:text-slate-400">
          AI Recommendation
        </p>
        <span className="text-xs font-semibold text-muted">
          Confidence: {confidence}
        </span>
      </div>

      {/* Large Decision */}
      <div className="mb-8">
        <p className={`text-7xl font-black ${colors.text}`}>{decision}</p>
      </div>

      {/* Probability Range */}
      <div className="mb-6 space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">
          Probability Range
        </p>
        <p className={`text-2xl font-bold ${colors.text}`}>
          {probabilityRange}
        </p>
        <p className="text-xs text-muted">
          Estimated likelihood of target achievement
        </p>
      </div>

      {/* Trading Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 rounded-xl bg-white/40 p-4 dark:bg-slate-900/30">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
            Entry Range
          </p>
          <p className="mt-1 text-lg font-bold text-primary">
            {entryRange}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
            Stop Loss
          </p>
          <p className="mt-1 text-lg font-bold text-rose-600 dark:text-rose-400">
            {stopLoss}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
            Target
          </p>
          <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {targetPrice}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
            Risk:Reward
          </p>
          <p className="mt-1 text-lg font-bold text-primary">
            {riskRewardRatio}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          className="ripple-btn rounded-lg bg-[#1F2937] px-4 py-3 text-sm font-semibold text-primary transition-all duration-200 ease-in-out hover:bg-[#2A3A52]"
        >
          View Details
        </button>
        <button
          type="button"
          className={`ripple-btn rounded-lg px-4 py-3 text-sm font-semibold text-white transition-all duration-200 ease-in-out
            ${decision === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            ${decision === 'SELL' ? 'bg-rose-600 hover:bg-rose-700' : ''}
            ${decision === 'HOLD' ? 'bg-amber-600 hover:bg-amber-700' : ''}
          `}
        >
          Execute (Simulated)
        </button>
      </div>
    </div>
  );
}

export default DecisionCard;
