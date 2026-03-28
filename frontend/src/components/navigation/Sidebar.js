import React from 'react';
import SidebarItem from './SidebarItem';
import {
  ChatIcon,
  ChartIcon,
  CheckCircleIcon,
  DashboardIcon,
  InsightsIcon,
  PortfolioIcon,
  RadarIcon,
  SettingsIcon,
} from '../icons/AppIcons';

export const navItems = [
  { to: '/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { to: '/portfolio', label: 'Portfolio', Icon: PortfolioIcon },
  { to: '/charts', label: 'Charts', Icon: ChartIcon },
  { to: '/market-chat', label: 'Market Chat', Icon: ChatIcon },
  { to: '/opportunity-radar', label: 'Opportunity Radar', Icon: RadarIcon },
  { to: '/validation-dashboard', label: 'Validation', Icon: CheckCircleIcon },
  { to: '/insights', label: 'Insights', Icon: InsightsIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
];

function Sidebar() {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200/80 bg-white/75 p-6 backdrop-blur-md dark:border-slate-800 dark:bg-[#0F1D24]/70 lg:block">
      <div className="mb-8 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/75 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/45">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F766E] text-white shadow-md">
          <span className="text-lg font-bold">AI</span>
        </div>
        <div>
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">InvestAI Cloud</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Decision Terminal</p>
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
