import React from 'react';

function Card({ children, className = '', interactive = true }) {
  const interactiveClasses = interactive
    ? 'transform transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-xl'
    : '';

  return (
    <section
      className={`rounded-2xl bg-white p-4 shadow-md dark:bg-[#1E293B] ${interactiveClasses} ${className}`}
    >
      {children}
    </section>
  );
}

export default Card;
