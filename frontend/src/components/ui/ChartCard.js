import React from 'react';
import Card from './Card';
import CandlestickChart from './CandlestickChart';

function ChartCard({ title, subtitle, data, meta, actions = null, showSignals = false }) {
  return (
    <Card className="p-6" interactive={false}>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">{subtitle}</p>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>

      <div className="h-[28rem] w-full rounded-xl border border-white/10 bg-[#111827] p-2">
        <CandlestickChart data={data} meta={meta} showSignals={showSignals} />
      </div>
    </Card>
  );
}

export default ChartCard;
