import React from 'react';

const toneStyles = {
  BUY: 'border border-[#22C55E]/40 bg-[#22C55E]/15 text-[#22C55E] shadow-[0_0_0_1px_rgba(34,197,94,0.18)]',
  HOLD: 'border border-[#F59E0B]/40 bg-[#F59E0B]/15 text-[#F59E0B] shadow-[0_0_0_1px_rgba(245,158,11,0.18)]',
  SELL: 'border border-[#EF4444]/40 bg-[#EF4444]/15 text-[#EF4444] shadow-[0_0_0_1px_rgba(239,68,68,0.18)]',
};

function Badge({ action = 'HOLD' }) {
  const normalized = String(action).toUpperCase();

  return (
    <span
      className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold tracking-wide ${toneStyles[normalized] || toneStyles.HOLD}`}
    >
      {normalized}
    </span>
  );
}

export default Badge;
