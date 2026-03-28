import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PortfolioProvider } from './context/PortfolioContext';
import AppLayout from './layout/AppLayout';
import ChartsPage from './pages/ChartsPage';
import DashboardPage from './pages/DashboardPage';
import InsightsPage from './pages/InsightsPage';
import MarketChatPage from './pages/MarketChatPage';
import OpportunityRadarPage from './pages/OpportunityRadarPage';
import PortfolioPage from './pages/PortfolioPage';
import SettingsPage from './pages/SettingsPage';
import ValidationDashboard from './pages/ValidationDashboard';

function App() {
  return (
    <PortfolioProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/charts" element={<ChartsPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/market-chat" element={<MarketChatPage />} />
            <Route path="/opportunity-radar" element={<OpportunityRadarPage />} />
            <Route path="/validation-dashboard" element={<ValidationDashboard />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PortfolioProvider>
  );
}

export default App;
