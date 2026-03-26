import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar, { navItems } from '../components/navigation/Sidebar';
import { MoonIcon, SparkIcon, SunIcon } from '../components/icons/AppIcons';
import { usePortfolio } from '../context/PortfolioContext';

const routeLabelMap = {
  '/dashboard': 'Decision Engine',
  '/portfolio': 'Portfolio Workspace',
  '/insights': 'Market Insights',
  '/settings': 'Workspace Settings',
};

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { analyzePortfolio, isAnalyzing, statusMessage } = usePortfolio();
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

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDark(prefersDark);
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
      await analyzePortfolio();
      navigate('/dashboard');
    } catch (_error) {
      navigate('/portfolio');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 dark:bg-[#0F172A] dark:text-slate-100">
      <div className="relative flex min-h-screen overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(79,70,229,0.14),_transparent_42%),radial-gradient(circle_at_80%_10%,_rgba(34,197,94,0.12),_transparent_35%)]" />

        <Sidebar />

        <div className="relative z-10 flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/85">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold">AI Investor Dashboard</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400">{sectionLabel}</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsDark((prev) => !prev)}
                  className="ripple-btn rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  aria-label="Toggle dark mode"
                >
                  {isDark ? <SunIcon /> : <MoonIcon />}
                </button>
                <button
                  type="button"
                  onClick={handleRunScan}
                  disabled={isAnalyzing}
                  className="ripple-btn inline-flex items-center gap-2 rounded-xl bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white shadow-md transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <SparkIcon />
                  {isAnalyzing ? 'Running Scan...' : 'Run AI Scan'}
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
                    `rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ease-in-out ${
                      isActive
                        ? 'bg-indigo-100 text-[#4F46E5] dark:bg-indigo-500/20 dark:text-indigo-200'
                        : 'bg-white text-slate-500 dark:bg-slate-900 dark:text-slate-300'
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
