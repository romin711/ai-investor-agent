import React from 'react';

function Card({ children, className = '', interactive = true }) {
  const interactiveClasses = interactive
    ? 'transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-lg'
    : '';

  return (
    <section
      className={`rounded-2xl border bg-[#111827] border-white/10 p-6 shadow-sm text-[#E5E7EB] ${interactiveClasses} ${className}`}
    >
      {children}
    </section>
  );
}

export default Card;
