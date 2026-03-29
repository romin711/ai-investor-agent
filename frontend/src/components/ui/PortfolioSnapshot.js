import React from 'react';

function PortfolioSnapshot({ portfolioValue, dailyPnL, dailyPnLPercent, cashReserve, lastUpdated, onRefresh, isRefreshing }) {
  const isPnLPositive = !String(dailyPnL || '').startsWith('-');

  return (
    <div className="space-y-4">
      {/* Portfolio Value Card */}
      <div className="rounded-xl border border-white/10 bg-[#111827] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
          Portfolio Value
        </p>
        <p className="mt-2 text-3xl font-bold text-primary">
          {portfolioValue}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-sm text-secondary">Today's PnL</p>
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold
            ${isPnLPositive
              ? 'bg-emerald-900/30 text-emerald-300'
              : 'bg-rose-900/30 text-rose-300'
            }`}
          >
            <span>{dailyPnL}</span>
            <span className="text-xs">({dailyPnLPercent})</span>
          </span>
        </div>
      </div>

      {/* Cash Available Card */}
      <div className="rounded-xl border border-white/10 bg-[#111827] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
          Cash Available
        </p>
        <p className="mt-2 text-2xl font-bold text-primary">
          {cashReserve}
        </p>
        <p className="mt-2 text-xs text-muted">
          Ready for trades
        </p>
      </div>

      {/* Refresh Button */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        className="ripple-btn w-full rounded-lg bg-[#1F2937] px-4 py-3 text-sm font-semibold text-primary transition-all duration-200 ease-in-out hover:bg-[#2A3A52] disabled:opacity-60"
      >
        {isRefreshing ? 'Updating...' : 'Refresh Data'}
      </button>

      {/* Last Updated */}
      {lastUpdated && (
        <p className="text-xs text-center text-muted">
          Updated: {new Date(lastUpdated).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

export default PortfolioSnapshot;
