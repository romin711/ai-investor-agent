import React, { useMemo } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar, { navItems } from '../components/navigation/Sidebar';
import { SparkIcon } from '../components/icons/AppIcons';
import { usePortfolio } from '../context/PortfolioContext';

const routeLabelMap = {
  '/dashboard': 'Decision Engine',
  '/portfolio': 'Portfolio Workspace',
  '/charts': 'Price Charts',
  '/market-chat': 'Market ChatGPT Next',
  '/opportunity-radar': 'Opportunity Radar',
  '/validation-dashboard': 'Validation Dashboard',
  '/insights': 'Market Insights',
  '/settings': 'Workspace Settings',
};

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    analyzePortfolio,
    runOpportunityRadar,
    isAnalyzing,
    isRunningOpportunityRadar,
    statusMessage,
  } = usePortfolio();

  const sectionLabel = useMemo(
    () => routeLabelMap[location.pathname] || 'Decision Engine',
    [location.pathname]
  );

  const handleRunScan = async () => {
    try {
      await runOpportunityRadar();
      navigate('/insights');
    } catch (_error) {
      try {
        await analyzePortfolio();
        navigate('/dashboard');
      } catch (_innerError) {
        navigate('/portfolio');
      }
    }
  };

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-[#0B1220] text-[#E5E7EB]">
      <div className="app-atmosphere relative flex h-full overflow-hidden">
        <Sidebar />

        <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="z-20 border-b border-white/10 px-6 py-2 backdrop-blur-xl bg-[#111827]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-[#E5E7EB]">
                  Arthasanket
                </h1>
                <p className="text-sm font-medium mt-1 text-secondary">
                  {sectionLabel}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleRunScan}
                  disabled={isAnalyzing || isRunningOpportunityRadar}
                  className="ripple-btn inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-md transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70 bg-[#3B82F6] text-white hover:bg-[#2563EB]"
                >
                  <SparkIcon />
                  {isAnalyzing || isRunningOpportunityRadar ? 'Running Scan...' : 'Run AI Scan'}
                </button>
              </div>
            </div>
            {statusMessage ? (
              <p className="mt-2 text-xs text-secondary">
                {statusMessage}
              </p>
            ) : null}

            <nav className="mt-2 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-xl border px-4 py-2 text-sm font-semibold transition-all duration-200 ease-in-out ${
                      isActive
                        ? 'bg-[#3B82F6] text-white border-[#3B82F6]'
                        : 'bg-[#1F2937] border-white/10 text-secondary'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </header>

          <main className="relative z-10 flex-1 overflow-y-auto p-6 bg-[#0B1220]">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

export default AppLayout;
