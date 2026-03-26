import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card';
import { usePortfolio } from '../context/PortfolioContext';

function PortfolioPage() {
  const navigate = useNavigate();
  const {
    portfolioRows,
    setRowsFromManual,
    loadRowsFromJson,
    analyzePortfolio,
    refreshRealtimeQuotes,
    realtimeQuotes,
    lastQuoteTimestamp,
    apiError,
    statusMessage,
    isAnalyzing,
    isRefreshingQuotes,
  } = usePortfolio();

  const [rows, setRows] = useState(portfolioRows.length ? portfolioRows : [{ symbol: '', weight: '' }]);
  const [localJsonMessage, setLocalJsonMessage] = useState('');

  useEffect(() => {
    setRows(portfolioRows.length ? portfolioRows : [{ symbol: '', weight: '' }]);
  }, [portfolioRows]);

  const normalizedSymbols = useMemo(
    () => rows.map((row) => String(row.symbol || '').trim().toUpperCase()).filter(Boolean),
    [rows]
  );

  const cleanedRows = useMemo(
    () => rows
      .map((row) => ({
        symbol: String(row.symbol || '').trim().toUpperCase(),
        weight: Number(row.weight),
      }))
      .filter((row) => row.symbol && !Number.isNaN(row.weight) && row.weight > 0),
    [rows]
  );

  const coachingChecks = useMemo(() => {
    const totalWeight = cleanedRows.reduce((sum, row) => sum + row.weight, 0);
    const highestWeight = cleanedRows.reduce((max, row) => Math.max(max, row.weight), 0);

    return [
      {
        title: 'Diversification balance',
        message: highestWeight > 35
          ? `One position is ${highestWeight.toFixed(1)}%. Consider spreading risk to reduce concentration pressure.`
          : 'No single holding appears over-concentrated.',
        healthy: highestWeight <= 35,
      },
      {
        title: 'Allocation discipline',
        message: totalWeight === 0
          ? 'Set weights before analysis to create a clear execution plan.'
          : `${totalWeight.toFixed(1)}% allocated. Target near 100% for cleaner portfolio metrics.`,
        healthy: totalWeight > 95 && totalWeight < 105,
      },
      {
        title: 'Decision readiness',
        message: cleanedRows.length < 3
          ? 'Add at least 3 symbols to reduce binary decisions.'
          : `${cleanedRows.length} symbols entered. Setup supports broader comparison.`,
        healthy: cleanedRows.length >= 3,
      },
    ];
  }, [cleanedRows]);

  const updateRows = (nextRows) => {
    setRows(nextRows);
    setRowsFromManual(nextRows);
  };

  const handleRowChange = (index, key, value) => {
    const nextRows = rows.map((row, rowIndex) => {
      if (rowIndex !== index) {
        return row;
      }
      return { ...row, [key]: value };
    });
    updateRows(nextRows);
  };

  const handleAddRow = () => {
    updateRows([...rows, { symbol: '', weight: '' }]);
  };

  const handleRemoveRow = (index) => {
    if (rows.length === 1) {
      updateRows([{ symbol: '', weight: '' }]);
      return;
    }
    updateRows(rows.filter((_, rowIndex) => rowIndex !== index));
  };

  const handleJsonUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = await loadRowsFromJson(file);
      setRows(parsed);
      setLocalJsonMessage(`JSON uploaded: ${file.name}`);
    } catch (error) {
      setLocalJsonMessage(error?.message || 'JSON parsing failed.');
    }
  };

  const handleAnalyze = async () => {
    try {
      await analyzePortfolio(rows);
      navigate('/dashboard');
    } catch (_error) {
      // Context already exposes API errors.
    }
  };

  const handleRealtimeRefresh = async () => {
    await refreshRealtimeQuotes(normalizedSymbols);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="space-y-4 p-6 xl:col-span-5" interactive={false}>
          <h2 className="text-lg font-semibold">1) Upload JSON</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Upload a `.json` file with symbols and weights for faster portfolio input.
          </p>

          <input
            type="file"
            accept=".json,application/json"
            onChange={handleJsonUpload}
            className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />

          <div className="rounded-2xl bg-slate-50 p-3 text-sm text-gray-500 dark:bg-slate-800 dark:text-slate-300">
            <p>Supported JSON:</p>
            <pre className="mt-2 overflow-x-auto text-xs">[{`\n`}  {`{"symbol":"RELIANCE","weight":40},`}{`\n`}  {`{"symbol":"TCS","weight":30}`}{`\n`}]</pre>
            <p className="mt-2 text-xs">Alternative shape: {`{"portfolio": [...]}`}</p>
          </div>

          {localJsonMessage ? (
            <p className="text-sm text-[#2563EB] dark:text-blue-300">{localJsonMessage}</p>
          ) : null}
        </Card>

        <Card className="p-6 xl:col-span-7" interactive={false}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">2) Write Manually</h2>
            <button
              type="button"
              onClick={handleAddRow}
              className="ripple-btn rounded-xl bg-[#1D4ED8] px-4 py-2 text-sm font-semibold text-white shadow-md transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-xl"
            >
              Add Row
            </button>
          </div>

          <p className="mb-4 text-sm text-gray-500 dark:text-slate-400">
            Enter ticker and weight. Example: `RELIANCE, 40`.
          </p>

          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={`row-${index}`} className="grid grid-cols-1 gap-3 rounded-2xl bg-slate-50 p-3 md:grid-cols-12 dark:bg-slate-800">
                <div className="md:col-span-5">
                  <label className="mb-1 block text-sm text-gray-500 dark:text-slate-400">Symbol</label>
                  <input
                    type="text"
                    value={row.symbol}
                    onChange={(event) => handleRowChange(index, 'symbol', event.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-all duration-200 ease-in-out focus:border-[#1D4ED8] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="RELIANCE"
                  />
                </div>

                <div className="md:col-span-5">
                  <label className="mb-1 block text-sm text-gray-500 dark:text-slate-400">Weight</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.weight}
                    onChange={(event) => handleRowChange(index, 'weight', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-all duration-200 ease-in-out focus:border-[#1D4ED8] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="40"
                  />
                </div>

                <div className="md:col-span-2 md:self-end">
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(index)}
                    className="ripple-btn w-full rounded-xl bg-red-100 px-3 py-2 text-sm font-semibold text-red-700 transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-xl dark:bg-red-900/40 dark:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="space-y-4 p-6 xl:col-span-5" interactive={false}>
          <h2 className="text-lg font-semibold">Behavioral Risk Check</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Psychology-oriented checks before running live analysis.
          </p>

          <div className="space-y-3">
            {coachingChecks.map((item) => (
              <div
                key={item.title}
                className={`rounded-xl border px-4 py-3 text-sm ${
                  item.healthy
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700/40 dark:bg-emerald-900/20 dark:text-emerald-200'
                    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200'
                }`}
              >
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1">{item.message}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4 p-6 xl:col-span-7" interactive={false}>
          <h2 className="text-lg font-semibold">Run Live Analysis</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Pull current and historical market data, compute MA20, MA50, RSI(14), then generate decision and confidence.
          </p>

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="ripple-btn w-full rounded-xl bg-[#16A34A] px-4 py-3 text-sm font-semibold text-white shadow-md transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-xl disabled:opacity-70"
          >
            {isAnalyzing ? 'Analyzing Live Market Data...' : 'Analyze Portfolio and Open Dashboard'}
          </button>

          {statusMessage ? (
            <p className="text-sm text-[#16A34A]">{statusMessage}</p>
          ) : null}
          {apiError ? (
            <p className="text-sm text-[#DC2626]">{apiError}</p>
          ) : null}
        </Card>
      </div>

      <Card className="space-y-4 p-6" interactive={false}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Realtime Quote Snapshot</h2>
          <button
            type="button"
            onClick={handleRealtimeRefresh}
            disabled={isRefreshingQuotes}
            className="ripple-btn rounded-xl bg-[#EA580C] px-3 py-2 text-sm font-semibold text-white shadow-md transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-xl disabled:opacity-70"
          >
            {isRefreshingQuotes ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-slate-400">
          Last update: {lastQuoteTimestamp ? new Date(lastQuoteTimestamp).toLocaleString() : 'Not fetched yet'}
        </p>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {normalizedSymbols.length ? normalizedSymbols.map((symbol) => {
            const quote = realtimeQuotes[symbol];
            return (
              <div key={symbol} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                <span className="font-semibold text-slate-900 dark:text-slate-100">{symbol}</span>
                <span className="text-gray-500 dark:text-slate-400">
                  {typeof quote?.price === 'number' ? `$${quote.price.toFixed(2)}` : 'No quote'}
                </span>
              </div>
            );
          }) : (
            <p className="text-sm text-gray-500 dark:text-slate-400">Add symbols in manual section or upload JSON to fetch quotes.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

export default PortfolioPage;
