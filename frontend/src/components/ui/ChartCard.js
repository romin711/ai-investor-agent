import React from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Card from './Card';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-md dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm text-gray-500 dark:text-slate-400">{label}</p>
      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">${payload[0].value.toFixed(2)}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, data }) {
  const hasData = Array.isArray(data) && data.length > 0;

  return (
    <Card className="p-6" interactive={false}>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>

      <div className="h-80 w-full">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="portfolioPriceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                </linearGradient>
              </defs>

              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94A3B8', fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94A3B8', fontSize: 12 }}
                tickFormatter={(value) => `$${value}`}
                width={68}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#CBD5E1', strokeDasharray: '4 4' }} />
              <Area
                type="monotone"
                dataKey="price"
                stroke="#4F46E5"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#portfolioPriceGradient)"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0, fill: '#4F46E5' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
            Not enough data to render the chart.
          </div>
        )}
      </div>
    </Card>
  );
}

export default ChartCard;
