import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card';
import { usePortfolio } from '../context/PortfolioContext';

function getCurrencySymbol(symbol = '') {
  return '₹';
}

function getAllocationTone(totalWeight) {
  if (totalWeight > 100) {
    return 'text-rose-400';
  }
  if (totalWeight < 100) {
    return 'text-amber-400';
  }
  return 'text-emerald-400';
}

function getAllocationStatus(totalWeight) {
  if (totalWeight > 100) {
    return `Over-allocated by ${(totalWeight - 100).toFixed(1)}%`;
  }
  if (totalWeight < 100) {
    return `Under-allocated by ${(100 - totalWeight).toFixed(1)}%`;
  }
  return 'Perfectly allocated';
}

function getAllocationSegmentTone(weight) {
  if (weight >= 30) {
    return 'bg-[#2563EB]';
  }
  if (weight >= 20) {
    return 'bg-[#3B82F6]';
  }
  if (weight >= 12) {
    return 'bg-[#06B6D4]';
  }
  if (weight >= 6) {
    return 'bg-[#14B8A6]';
  }
  return 'bg-[#64748B]';
}

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
  const [showImportHelp, setShowImportHelp] = useState(false);
  const [autoRefreshQuotes, setAutoRefreshQuotes] = useState(true);
  const [removingRowIndex, setRemovingRowIndex] = useState(null);

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

  const totalWeight = useMemo(
    () => cleanedRows.reduce((sum, row) => sum + row.weight, 0),
    [cleanedRows]
  );

  const highestWeight = useMemo(
    () => cleanedRows.reduce((max, row) => Math.max(max, row.weight), 0),
    [cleanedRows]
  );

  const allocationSegments = useMemo(() => {
    return cleanedRows
      .slice()
      .sort((left, right) => right.weight - left.weight)
      .map((row) => ({
      ...row,
      widthPct: Math.max(0, Math.min(row.weight, 100)),
      colorClass: getAllocationSegmentTone(row.weight),
      }));
  }, [cleanedRows]);

  const allocationIntensityLegend = useMemo(() => {
    const seen = new Set();
    return allocationSegments
      .map((segment) => ({
        key: String(segment.weight),
        label: Number.isInteger(segment.weight)
          ? `${segment.weight}%`
          : `${segment.weight.toFixed(1)}%`,
        colorClass: segment.colorClass,
      }))
      .filter((item) => {
        if (seen.has(item.key)) {
          return false;
        }
        seen.add(item.key);
        return true;
      });
  }, [allocationSegments]);

  const isOverAllocated = totalWeight > 100;
  const isUnderAllocated = totalWeight > 0 && totalWeight < 100;
  const isTooConcentrated = highestWeight > 35;
  const canRunAnalysis = cleanedRows.length > 0 && !isOverAllocated && !isAnalyzing;

  const coachingChecks = useMemo(() => [
    {
      title: 'Diversification status',
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
      healthy: totalWeight > 95 && totalWeight <= 100,
    },
    {
      title: 'Readiness',
      message: cleanedRows.length < 3
        ? 'Add at least 3 symbols to reduce binary decisions.'
        : `${cleanedRows.length} symbols entered. Setup supports broader comparison.`,
      healthy: cleanedRows.length >= 3,
    },
  ], [cleanedRows.length, highestWeight, totalWeight]);

  useEffect(() => {
    if (!autoRefreshQuotes || !normalizedSymbols.length) {
      return undefined;
    }

    const timer = setInterval(() => {
      refreshRealtimeQuotes(normalizedSymbols);
    }, 30000);

    return () => clearInterval(timer);
  }, [autoRefreshQuotes, normalizedSymbols, refreshRealtimeQuotes]);

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
    setRemovingRowIndex(null);
    updateRows([...rows, { symbol: '', weight: '' }]);
  };

  const handleRemoveRow = (index) => {
    setRemovingRowIndex(index);

    setTimeout(() => {
      if (rows.length === 1) {
        updateRows([{ symbol: '', weight: '' }]);
        setRemovingRowIndex(null);
        return;
      }

      updateRows(rows.filter((_, rowIndex) => rowIndex !== index));
      setRemovingRowIndex(null);
    }, 180);
  };

  const handleImportClick = () => {
    const input = document.getElementById('portfolio-import-file-input');
    if (input) {
      input.click();
    }
  };

  const handleJsonUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = await loadRowsFromJson(file);
      setRows(parsed);
      setLocalJsonMessage(`Portfolio imported: ${file.name}`);
    } catch (error) {
      setLocalJsonMessage(error?.message || 'Import failed. Please check file format.');
    }

    event.target.value = '';
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
      <Card className="overflow-hidden p-0" interactive={false}>
        <div style={{ backgroundColor: 'var(--banner-bg)' }} className="px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white">Guided Flow</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Interactive Portfolio Builder</h1>
          <p className="mt-2 text-sm text-white">
            Build your allocation, review portfolio health, and launch AI analysis with confidence.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2 text-xs font-semibold text-white md:grid-cols-3">
            <div className="rounded-lg bg-white/15 px-3 py-2">Step 1: Build Portfolio</div>
            <div className="rounded-lg bg-white/15 px-3 py-2">Step 2: Review Health</div>
            <div className="rounded-lg bg-white/15 px-3 py-2">Step 3: Run Analysis</div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="space-y-5 p-6 xl:col-span-8" interactive={false}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#F3F4F6]">Step 1: Build Portfolio</h2>
              <p className="mt-1 text-sm text-[#9CA3AF]">
                Add your stocks and set allocation weights.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleImportClick}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0F766E] hover:text-[#0F766E] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              >
                Import JSON
              </button>
              <button
                type="button"
                onClick={() => setShowImportHelp((prev) => !prev)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-all duration-200 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              >
                {showImportHelp ? 'Hide Import Help' : 'Import Help'}
              </button>
              <button
                type="button"
                onClick={handleAddRow}
                className="ripple-btn rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-md transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-lg"
                style={{
                  backgroundColor: 'var(--btn-success-bg)',
                }}
              >
                Add Stock
              </button>
            </div>
          </div>

          <input
            id="portfolio-import-file-input"
            type="file"
            accept=".json,application/json"
            onChange={handleJsonUpload}
            className="hidden"
          />

          {showImportHelp ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
              Upload a file with holdings like symbol and weight rows. Supported shapes include array formats and nested portfolio collections.
            </div>
          ) : null}

          {localJsonMessage ? (
            <p className="text-sm text-[#0F766E] dark:text-emerald-300">{localJsonMessage}</p>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/70">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Total Allocation: {totalWeight.toFixed(1)}%</p>
              <p className={`text-xs font-semibold ${getAllocationTone(totalWeight)}`}>{getAllocationStatus(totalWeight)}</p>
            </div>

            {allocationSegments.length ? (
              <div className="mt-3 h-4 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div className="flex h-full w-full">
                  {allocationSegments.map((segment) => (
                    <div
                      key={`${segment.symbol}-${segment.weight}`}
                      className={`${segment.colorClass} transition-all duration-500`}
                      style={{ width: `${segment.widthPct}%` }}
                      title={`${segment.symbol} ${segment.weight.toFixed(1)}%`}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {allocationSegments.length ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#CBD5E1]">
                  <span className="font-semibold">Allocation Intensity:</span>
                  {allocationIntensityLegend.map((item) => (
                    <span key={item.key} className="inline-flex items-center gap-1">
                      <span className={`h-2 w-2 rounded-full ${item.colorClass}`} />
                      {item.label}
                    </span>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {allocationSegments.map((segment) => (
                    <span
                      key={`label-${segment.symbol}-${segment.weight}`}
                      className="inline-flex items-center gap-1 rounded-full bg-[#111827] px-2 py-1 text-[#E5E7EB] shadow-sm border border-[#334155]"
                    >
                      <span className={`h-2 w-2 rounded-full ${segment.colorClass}`} />
                      {segment.symbol}: {segment.weight.toFixed(1)}%
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <div className="space-y-3">
            {rows.map((row, index) => (
              <div
                key={`row-${index}`}
                className={`grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 ease-out md:grid-cols-12 dark:border-slate-700 dark:bg-slate-900 ${
                  removingRowIndex === index ? 'scale-[0.98] opacity-0' : 'opacity-100'
                }`}
              >
                <div className="md:col-span-5">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Symbol</label>
                  <input
                    type="text"
                    value={row.symbol}
                    onChange={(event) => handleRowChange(index, 'symbol', event.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-all duration-200 ease-in-out focus:border-[#0F766E] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="RELIANCE"
                  />
                </div>

                <div className="md:col-span-5">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Weight %</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.weight}
                    onChange={(event) => handleRowChange(index, 'weight', event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-all duration-200 ease-in-out focus:border-[#0F766E] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="25"
                  />
                </div>

                <div className="md:col-span-2 md:self-end">
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(index)}
                    className="ripple-btn w-full rounded-xl bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-700 transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-lg dark:bg-rose-900/40 dark:text-rose-300"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {isOverAllocated ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-700/40 dark:bg-rose-900/20 dark:text-rose-200">
              Total allocation exceeds 100%. Reduce weights before running analysis.
            </div>
          ) : null}

          {isUnderAllocated ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
              Portfolio under-allocated. You can run analysis now, but filling toward 100% improves interpretation.
            </div>
          ) : null}

          {isTooConcentrated ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
              Too concentrated in one stock. Largest allocation is {highestWeight.toFixed(1)}%.
            </div>
          ) : null}
        </Card>

        <Card className="space-y-4 p-6 xl:col-span-4" interactive={false}>
          <h2 className="text-lg font-semibold text-[#F3F4F6]">Realtime Quote Strip</h2>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[#9CA3AF]">
              Last update: {lastQuoteTimestamp ? new Date(lastQuoteTimestamp).toLocaleTimeString() : 'Not fetched yet'}
            </p>
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#CBD5E1]">
                <input
                  type="checkbox"
                  checked={autoRefreshQuotes}
                  onChange={(event) => setAutoRefreshQuotes(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#0F766E] focus:ring-[#0F766E]"
                />
                Auto-refresh
              </label>

              <button
                type="button"
                onClick={handleRealtimeRefresh}
                disabled={isRefreshingQuotes || !normalizedSymbols.length}
                className="rounded-xl border border-white/10 bg-[#1F2937] px-3 py-2 text-xs font-semibold text-primary transition-all duration-200 hover:border-[#0F766E] hover:text-[#0F766E] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRefreshingQuotes ? 'Updating prices...' : 'Update now'}
              </button>
            </div>
          </div>

          <div className="max-h-80 divide-y divide-slate-200 overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-slate-50/60 dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900/40">
            {normalizedSymbols.length ? normalizedSymbols.map((symbol) => {
              const quote = realtimeQuotes[symbol];
              const currencySymbol = getCurrencySymbol(symbol);
              const rawChangePct = Number(quote?.changePercent);
              const hasChange = Number.isFinite(rawChangePct);
              const isPositive = hasChange && rawChangePct >= 0;
              return (
                <div
                  key={symbol}
                  className="flex w-full items-center justify-between px-4 py-3 text-sm transition-colors duration-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/60"
                >
                  <p className="font-bold text-[#E5E7EB]">{symbol}</p>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[#0F766E] dark:text-emerald-300">
                      {typeof quote?.price === 'number' ? `${currencySymbol}${quote.price.toFixed(2)}` : 'No quote yet'}
                    </p>
                    {hasChange ? (
                      <span
                        className={`text-xs font-semibold ${isPositive ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}
                      >
                        {isPositive ? '+' : ''}{rawChangePct.toFixed(2)}%
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            }) : (
              <p className="px-4 py-3 text-sm text-[#9CA3AF]">Add stocks to preview live prices here.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="space-y-4 p-6 xl:col-span-7" interactive={false}>
          <h2 className="text-lg font-semibold text-[#F3F4F6]">Step 2: Portfolio Health Check</h2>
          <p className="text-sm text-[#9CA3AF]">
            Quick AI-inspired checks before analysis.
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

        <Card className="space-y-4 p-6 xl:col-span-5" interactive={false}>
          <h2 className="text-lg font-semibold text-[#F3F4F6]">Step 3: Run Analysis</h2>
          <p className="text-sm text-[#9CA3AF]">
            Launch AI analysis with live market context and portfolio-aware signals.
          </p>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!canRunAnalysis}
              className="ripple-btn mx-auto block w-full rounded-2xl bg-[#0F766E] px-6 py-4 text-base font-semibold text-white shadow-lg transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAnalyzing ? 'Running AI Analysis...' : 'Run AI Analysis'}
            </button>
          </div>

          {!cleanedRows.length ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">Add at least one stock before running analysis.</p>
          ) : null}

          {isOverAllocated ? (
            <p className="text-sm text-rose-700 dark:text-rose-300">Total allocation must be 100% or less to continue.</p>
          ) : null}

          {statusMessage ? (
            <p className="text-sm text-[#0F766E]">{statusMessage}</p>
          ) : null}
          {apiError ? (
            <p className="text-sm text-[#DC2626]">{apiError}</p>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

export default PortfolioPage;
