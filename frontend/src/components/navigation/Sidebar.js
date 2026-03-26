import React from 'react';
import SidebarItem from './SidebarItem';
import {
  DashboardIcon,
  InsightsIcon,
  PortfolioIcon,
  SettingsIcon,
} from '../icons/AppIcons';

export const navItems = [
  { to: '/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { to: '/portfolio', label: 'Portfolio', Icon: PortfolioIcon },
  { to: '/insights', label: 'Insights', Icon: InsightsIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
];

function Sidebar() {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 lg:block">
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4F46E5] text-white shadow-md">
          <span className="text-lg font-bold">AI</span>
        </div>
        <div>
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">InvestAI Cloud</p>
          <p className="text-sm text-gray-500 dark:text-slate-400">Fintech Intelligence Suite</p>
        </div>
      </div>

      <nav className="space-y-2">
        {navItems.map((item) => (
          <SidebarItem key={item.to} to={item.to} label={item.label} Icon={item.Icon} />
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
