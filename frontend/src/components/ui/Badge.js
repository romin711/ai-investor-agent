import React from 'react';

const toneStyles = {
  BUY: 'bg-[#DCFCE7] text-[#166534] dark:bg-[#14532D] dark:text-[#86EFAC]',
  HOLD: 'bg-[#FEF3C7] text-[#92400E] dark:bg-[#78350F] dark:text-[#FCD34D]',
  SELL: 'bg-[#FEE2E2] text-[#991B1B] dark:bg-[#7F1D1D] dark:text-[#FCA5A5]',
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
