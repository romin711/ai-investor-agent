import React from 'react';
import Card from '../components/ui/Card';
import { usePortfolio } from '../context/PortfolioContext';

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeConfidence(confidenceValue) {
  const numeric = toFiniteNumber(confidenceValue);
  if (numeric === null) {
    return null;
  }
  return numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
}

function InsightsPage() {
  const { analysisData } = usePortfolio();
  const results = analysisData?.results || [];

  const highlights = results.map((item) => {
    const decision = String(item?.decision || 'HOLD').toUpperCase();
    const confidence = normalizeConfidence(item?.confidence);
    const trend = item?.trend || item?.signals?.trend || 'neutral';
    const rsi = toFiniteNumber(item?.rsi);
    const confidenceText = confidence === null ? 'Not enough data' : `${confidence}%`;
    const rsiText = rsi === null ? 'Not enough data' : rsi.toFixed(2);
    return `${item?.symbol || 'Unknown'}: ${decision} (${confidenceText}) | ${trend} | RSI ${rsiText}`;
  });

  return (
    <div className="space-y-6">
      <Card className="p-6" interactive={false}>
        <h2 className="text-lg font-semibold">Market Intelligence Brief</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          Live signal summary generated from the latest API-backed analysis run.
        </p>

        <div className="mt-6 space-y-3">
          {highlights.length ? highlights.map((item) => (
            <div key={item} className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {item}
            </div>
          )) : (
            <p className="text-sm text-gray-500 dark:text-slate-400">
              No insights yet. Run an analysis from Portfolio Workspace to populate this page.
            </p>
          )}
        </div>
      </Card>

      <Card className="p-6" interactive={false}>
        <h3 className="text-lg font-semibold">Indicator Notes</h3>
        <div className="mt-4 space-y-2 text-sm text-gray-500 dark:text-slate-400">
          <p>MA20 and MA50 are computed manually from daily closes.</p>
          <p>RSI uses a 14-period gain/loss calculation.</p>
          <p>Confidence combines MA50 distance and RSI strength.</p>
        </div>
      </Card>
    </div>
  );
}

export default InsightsPage;
