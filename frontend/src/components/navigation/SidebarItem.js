import React from 'react';
import { NavLink } from 'react-router-dom';

function SidebarItem({ to, label, Icon }) {
  return (
    <NavLink to={to} end className="group relative block">
      {({ isActive }) => (
        <div
          className={`relative flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 ease-in-out ${
            isActive
              ? 'text-[#4F46E5] dark:text-indigo-300'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
          }`}
        >
          <span
            className={`pointer-events-none absolute inset-0 rounded-2xl transition-all duration-200 ease-in-out ${
              isActive
                ? 'scale-100 bg-indigo-50 opacity-100 dark:bg-indigo-500/20'
                : 'scale-95 bg-indigo-50 opacity-0 dark:bg-indigo-500/0'
            }`}
          />
          <span
            className={`pointer-events-none absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-[#4F46E5] transition-all duration-200 ease-in-out ${
              isActive ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'
            }`}
          />
          <span className="relative z-10">
            <Icon />
          </span>
          <span className="relative z-10">{label}</span>
        </div>
      )}
    </NavLink>
  );
}

export default SidebarItem;
