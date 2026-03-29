import React, { useState } from 'react';

function SignalBreakdown({ symbol, signals, isCollapsed = true }) {
  const [expanded, setExpanded] = useState(!isCollapsed);

  // Sort signals by weight (descending) and take top 3
  const topSignals = signals
    .sort((a, b) => (b.weight || 0) - (a.weight || 0))
    .slice(0, 3);

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      {/* Header - Clickable to expand/collapse */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-850"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-700 dark:text-slate-300">
              Signal Analysis
            </p>
            <p className="mt-1 text-sm text-secondary">
              Top 3 reasons driving this decision
            </p>
          </div>
          <span className={`text-xl text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="space-y-3">
            {topSignals.length > 0 ? (
              topSignals.map((signal, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  {/* Signal Index Circle */}
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {idx + 1}
                    </span>
                  </div>

                  {/* Signal Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {signal.label}
                        </p>
                        <p className="mt-0.5 text-xs text-secondary">
                          {signal.detail || 'No additional details'}
                        </p>
                      </div>
                      {/* Weight Badge */}
                      <span className="flex-shrink-0 inline-block whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {signal.weight}%
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">
                No signal data available
              </p>
            )}
          </div>

          {/* Disclaimer */}
          {topSignals.length > 0 && (
            <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800">
              <p className="text-xs text-secondary">
                <span className="font-semibold">Note:</span> These weights represent signal contribution to the current decision. Market conditions constantly evolve.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SignalBreakdown;
