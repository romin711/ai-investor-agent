import React from 'react';
import { NavLink } from 'react-router-dom';

function SidebarItem({ to, label, Icon }) {
  return (
    <NavLink to={to} end className="group relative block">
      {({ isActive }) => (
        <div
          className="relative flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 ease-in-out"
          style={{
            color: isActive ? '#93C5FD' : '#9CA3AF',
            opacity: isActive ? 1 : 0.7,
          }}
        >
          <span
            className="pointer-events-none absolute inset-0 rounded-2xl transition-all duration-200 ease-in-out"
            style={{
              backgroundColor: isActive ? '#1F2937' : 'transparent',
              transform: isActive ? 'scale(1)' : 'scale(0.95)',
              opacity: isActive ? 1 : 0,
            }}
          />
          <span
            className="pointer-events-none absolute bottom-2 left-0 top-2 w-1 rounded-r-full transition-all duration-200 ease-in-out"
            style={{
              backgroundColor: '#3B82F6',
              transform: isActive ? 'translateX(0)' : 'translateX(-8px)',
              opacity: isActive ? 1 : 0,
            }}
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
