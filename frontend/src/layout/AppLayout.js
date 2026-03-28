import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar, { navItems } from '../components/navigation/Sidebar';
import { MoonIcon, SparkIcon, SunIcon } from '../components/icons/AppIcons';
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
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('investai-theme');
    if (savedTheme === 'dark') {
      setIsDark(true);
      return;
    }

    if (savedTheme === 'light') {
      setIsDark(false);
      return;
    }

    // Default theme for first-time users.
    setIsDark(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    window.localStorage.setItem('investai-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

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
    <div className="min-h-screen bg-[#F2F6F5] text-slate-900 dark:bg-[#0B1418] dark:text-slate-100">
      <div className="app-atmosphere relative flex min-h-screen overflow-hidden">

        <Sidebar />

        <div className="relative z-10 flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 px-6 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-[#0F1D24]/80">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">AI Investor Dashboard</h1>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{sectionLabel}</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsDark((prev) => !prev)}
                  className="ripple-btn rounded-xl border border-slate-300 bg-white p-2 text-slate-700 transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  aria-label="Toggle dark mode"
                >
                  {isDark ? <SunIcon /> : <MoonIcon />}
                </button>
                <button
                  type="button"
                  onClick={handleRunScan}
                  disabled={isAnalyzing || isRunningOpportunityRadar}
                  className="ripple-btn inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white shadow-md transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <SparkIcon />
                  {isAnalyzing || isRunningOpportunityRadar ? 'Running Scan...' : 'Run AI Scan'}
                </button>
              </div>
            </div>
            {statusMessage ? (
              <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">{statusMessage}</p>
            ) : null}

            <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-xl border px-4 py-2 text-sm font-semibold transition-all duration-200 ease-in-out ${
                      isActive
                        ? 'border-emerald-200 bg-emerald-50 text-[#0F766E] dark:border-emerald-800/50 dark:bg-emerald-900/30 dark:text-emerald-200'
                        : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </header>

          <main className="relative z-10 flex-1 p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

export default AppLayout;
