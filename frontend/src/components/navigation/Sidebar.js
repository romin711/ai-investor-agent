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
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 overflow-y-auto border-r border-white/10 bg-[#0B1220] lg:block">
      <div className="p-4">
        <div className="mb-8 flex items-center gap-3 rounded-2xl border border-white/10 bg-[#111827] px-3 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F766E] text-white shadow-md">
            <span className="text-lg font-bold">AI</span>
          </div>
          <div>
            <p className="text-base font-semibold text-[#E5E7EB]">
              Arthasanket
            </p>
            <p className="text-xs whitespace-nowrap text-secondary">
              Decision Terminal
            </p>
          </div>
        </div>

        <nav className="space-y-2">
          {navItems.map((item) => (
            <SidebarItem key={item.to} to={item.to} label={item.label} Icon={item.Icon} />
          ))}
        </nav>
      </div>
    </aside>
  );
}

export default Sidebar;
