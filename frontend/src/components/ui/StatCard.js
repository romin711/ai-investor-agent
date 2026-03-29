import React from 'react';
import Card from './Card';

const tones = {
  neutral: 'text-slate-900 dark:text-slate-100',
  success: 'text-[#22C55E]',
  warning: 'text-[#F59E0B]',
  danger: 'text-[#EF4444]',
};

function StatCard({ label, value, helper, tone = 'neutral' }) {
  return (
    <Card className="space-y-2 p-4">
      <p className="text-sm text-secondary">{label}</p>
      <p className={`text-2xl font-bold ${tones[tone] || tones.neutral}`}>{value}</p>
      {helper ? <p className="text-sm text-secondary">{helper}</p> : null}
    </Card>
  );
}

export default StatCard;
