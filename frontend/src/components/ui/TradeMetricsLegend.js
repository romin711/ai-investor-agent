import React, { useState } from 'react';

function TradeMetricsLegend() {
  const [showLegend, setShowLegend] = useState(false);

  const metrics = [
    {
      label: 'Entry Range',
      description: 'Recommended price band to initiate position',
      example: '₹2,450–2,480',
    },
    {
      label: 'Stop Loss',
      description: 'Price level to exit if trade thesis breaks',
      example: '₹2,400 (2.0% below entry)',
    },
    {
      label: 'Target',
      description: 'Expected price objective for profit taking',
      example: '₹2,520 (2.9% above entry)',
    },
    {
      label: 'Risk:Reward',
      description: 'Ratio of potential loss vs. gain. 1:2 = for every 1 rupee risk, gain 2',
      example: '1:2.0 (favorable)',
    },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowLegend(!showLegend)}
        className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline"
      >
        {showLegend ? 'Hide Legend' : 'Learn Metrics'}
      </button>

      {showLegend && (
        <div className="absolute top-6 right-0 z-50 w-80 rounded-lg border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <p className="mb-4 text-sm font-bold text-slate-900 dark:text-slate-100">
            Trading Metrics Explained
          </p>
          <div className="space-y-3">
            {metrics.map((metric, idx) => (
              <div key={idx} className="border-b border-slate-100 pb-3 last:border-0 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {metric.label}
                </p>
                <p className="mt-1 text-xs text-secondary">
                  {metric.description}
                </p>
                <p className="mt-1 text-xs font-mono text-slate-700 dark:text-slate-300">
                  {metric.example}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TradeMetricsLegend;
