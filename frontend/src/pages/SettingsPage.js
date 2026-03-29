import React, { useEffect, useState } from 'react';
import Card from '../components/ui/Card';

const SETTINGS_STORAGE_KEY = 'investai-behavioral-settings';

const defaultSettings = {
  riskProfile: 'moderate',
  maxPositionSize: 30,
  reflectionPauseEnabled: true,
  autoRefreshEnabled: true,
};

function SettingsPage() {
  const [settings, setSettings] = useState(defaultSettings);

  useEffect(() => {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      setSettings((prev) => ({ ...prev, ...parsed }));
    } catch (_error) {
      // Ignore invalid local storage payload and keep defaults.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  return (
    <div className="space-y-6">
      <Card className="p-6" interactive={false}>
        <h2 className="text-lg font-semibold text-[#F3F4F6]">Decision Psychology Preferences</h2>
        <p className="mt-1 text-sm text-[#9CA3AF]">
          Tune guardrails that help reduce impulsive and overconfident trading decisions.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-[#334155] bg-[#0F172A] p-4">
            <label className="mb-2 block text-sm text-[#94A3B8]">Risk Profile</label>
            <select
              value={settings.riskProfile}
              onChange={(event) => setSettings((prev) => ({ ...prev, riskProfile: event.target.value }))}
              className="w-full rounded-lg border border-[#334155] bg-[#111827] px-3 py-2 text-sm text-[#E5E7EB] outline-none focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/25"
            >
              <option value="conservative">Conservative</option>
              <option value="moderate">Moderate</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </div>

          <div className="rounded-xl border border-[#334155] bg-[#0F172A] p-4">
            <label className="mb-2 block text-sm text-[#94A3B8]">
              Max Single Position: {settings.maxPositionSize}%
            </label>
            <input
              type="range"
              min="10"
              max="60"
              step="1"
              value={settings.maxPositionSize}
              onChange={(event) => setSettings((prev) => ({ ...prev, maxPositionSize: Number(event.target.value) }))}
              className="w-full"
            />
          </div>
        </div>
      </Card>

      <Card className="p-6" interactive={false}>
        <h3 className="text-lg font-semibold text-[#F3F4F6]">Execution Controls</h3>
        <div className="mt-4 space-y-3">
          <label className="flex items-center justify-between rounded-xl border border-[#334155] bg-[#0F172A] px-4 py-3">
            <span className="text-sm text-[#CBD5E1]">Enable reflection pause before acting on AI signal</span>
            <input
              type="checkbox"
              checked={settings.reflectionPauseEnabled}
              onChange={(event) => setSettings((prev) => ({ ...prev, reflectionPauseEnabled: event.target.checked }))}
            />
          </label>

          <label className="flex items-center justify-between rounded-xl border border-[#334155] bg-[#0F172A] px-4 py-3">
            <span className="text-sm text-[#CBD5E1]">Auto-refresh realtime quotes when dashboard is active</span>
            <input
              type="checkbox"
              checked={settings.autoRefreshEnabled}
              onChange={(event) => setSettings((prev) => ({ ...prev, autoRefreshEnabled: event.target.checked }))}
            />
          </label>
        </div>
      </Card>
    </div>
  );
}

export default SettingsPage;
