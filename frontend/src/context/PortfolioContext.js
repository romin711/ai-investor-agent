import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:3001';
const FALLBACK_API_BASE_URL = API_BASE_URL.includes('127.0.0.1')
  ? API_BASE_URL.replace('127.0.0.1', 'localhost')
  : API_BASE_URL.replace('localhost', '127.0.0.1');

const PortfolioContext = createContext(null);

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeRows(rows) {
  const normalized = rows
    .map((row) => ({
      symbol: String(row.symbol || '').trim().toUpperCase(),
      weight: Number(row.weight),
    }))
    .filter((row) => row.symbol && !Number.isNaN(row.weight));

  if (!normalized.length) {
    throw new Error('Please provide at least one valid symbol and weight.');
  }

  normalized.forEach((row, index) => {
    if (row.weight <= 0) {
      throw new Error(`Row ${index + 1}: weight must be greater than 0.`);
    }
  });

  return normalized;
}

function parseJsonRows(jsonText) {
  let parsedJson;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch (_error) {
    throw new Error('Invalid JSON file. Please upload valid JSON.');
  }

  const candidateRows = Array.isArray(parsedJson)
    ? parsedJson
    : (parsedJson?.portfolio || parsedJson?.rows || parsedJson?.holdings || []);

  if (!Array.isArray(candidateRows) || !candidateRows.length) {
    throw new Error('JSON must contain a non-empty array of rows.');
  }

  return candidateRows.map((row, index) => {
    const symbol = String(row?.symbol || row?.ticker || '').trim().toUpperCase();
    const weight = Number(row?.weight ?? row?.allocation ?? row?.percent);
    if (!symbol || Number.isNaN(weight)) {
      throw new Error(`JSON row ${index + 1} is invalid. Expected: { "symbol": "AAPL", "weight": 40 }`);
    }
    return { symbol, weight: String(weight) };
  });
}

function toMarketErrorMessage(error, fallback = 'Market analysis request failed.') {
  if (error?.code === 'ERR_NETWORK') {
    return `Cannot connect to backend at ${API_BASE_URL}. Start backend: cd backend && npm start`;
  }
  const detail = error?.response?.data?.error || error?.response?.data?.detail;
  return String(detail || error?.message || fallback);
}

async function requestWithHostFallback(method, path, payload = null) {
  try {
    if (method === 'GET') {
      const response = await axios.get(`${API_BASE_URL}${path}`);
      return response.data;
    }
    const response = await axios.post(`${API_BASE_URL}${path}`, payload);
    return response.data;
  } catch (error) {
    const shouldRetry = error?.code === 'ERR_NETWORK' && FALLBACK_API_BASE_URL !== API_BASE_URL;
    if (!shouldRetry) {
      throw error;
    }

    if (method === 'GET') {
      const response = await axios.get(`${FALLBACK_API_BASE_URL}${path}`);
      return response.data;
    }
    const response = await axios.post(`${FALLBACK_API_BASE_URL}${path}`, payload);
    return response.data;
  }
}

function rowsFromResults(results) {
  return (results || [])
    .map((item) => ({
      symbol: String(item.symbol || '').toUpperCase(),
      weight: Number(item.weight || 0),
    }))
    .filter((item) => item.symbol && item.weight > 0);
}

export function PortfolioProvider({ children }) {
  const [portfolioRows, setPortfolioRows] = useState([]);
  const [analysisData, setAnalysisData] = useState(null);
  const [realtimeQuotes, setRealtimeQuotes] = useState({});
  const [lastQuoteTimestamp, setLastQuoteTimestamp] = useState('');
  const [apiError, setApiError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRefreshingQuotes, setIsRefreshingQuotes] = useState(false);

  const setRowsFromManual = useCallback((rows) => {
    setPortfolioRows(rows);
  }, []);

  const loadRowsFromJson = useCallback(async (file) => {
    if (!file) {
      throw new Error('Please select a JSON file.');
    }

    const fileText = await file.text();
    const parsedRows = parseJsonRows(fileText);
    setPortfolioRows(parsedRows);
    setStatusMessage(`Loaded ${parsedRows.length} rows from JSON.`);
    setApiError('');
    return parsedRows;
  }, []);

  const analyzePortfolio = useCallback(async (rowsOverride = null) => {
    setIsAnalyzing(true);
    setApiError('');
    setStatusMessage('');

    try {
      const normalized = normalizeRows(rowsOverride || portfolioRows);
      const payload = normalized.map((row) => ({ symbol: row.symbol, weight: row.weight }));
      const data = await requestWithHostFallback('POST', '/api/portfolio/analyze', payload);

      const mergedResults = (data?.results || []).map((item) => {
        const weight = normalized.find((row) => row.symbol === item.symbol)?.weight || item.weight || 0;
        return { ...item, weight };
      });

      const quoteMap = Object.fromEntries(
        mergedResults.map((item) => [item.symbol, { price: toFiniteNumber(item.price) }])
      );

      const nowIso = new Date().toISOString();
      setAnalysisData({
        ...data,
        results: mergedResults,
        generated_at: nowIso,
      });
      setRealtimeQuotes(quoteMap);
      setLastQuoteTimestamp(nowIso);
      setStatusMessage(`Analyzed ${mergedResults.length} symbols with live Yahoo market data.`);
      return mergedResults;
    } catch (error) {
      const message = toMarketErrorMessage(error, 'Portfolio analysis failed.');
      setApiError(message);
      throw error;
    } finally {
      setIsAnalyzing(false);
    }
  }, [portfolioRows]);

  const refreshRealtimeQuotes = useCallback(async (explicitSymbols = null) => {
    setIsRefreshingQuotes(true);
    setApiError('');

    try {
      let sourceRows = rowsFromResults(analysisData?.results);
      if (portfolioRows.length) {
        try {
          sourceRows = normalizeRows(portfolioRows);
        } catch (_error) {
          // Keep latest analyzed rows when manual table still has incomplete edits.
        }
      }
      const filteredRows = explicitSymbols && explicitSymbols.length
        ? sourceRows.filter((row) => explicitSymbols.includes(row.symbol))
        : sourceRows;

      if (!filteredRows.length) {
        return null;
      }

      const payload = filteredRows.map((row) => ({ symbol: row.symbol, weight: row.weight }));
      const data = await requestWithHostFallback('POST', '/api/portfolio/analyze', payload);
      const mergedResults = (data?.results || []).map((item) => {
        const weight = filteredRows.find((row) => row.symbol === item.symbol)?.weight || item.weight || 0;
        return { ...item, weight };
      });

      const quoteMap = Object.fromEntries(
        mergedResults.map((item) => [item.symbol, { price: toFiniteNumber(item.price) }])
      );

      const nowIso = new Date().toISOString();
      setRealtimeQuotes((prev) => ({ ...prev, ...quoteMap }));
      setLastQuoteTimestamp(nowIso);

      setAnalysisData((prev) => {
        if (!prev?.results?.length) {
          return { ...data, results: mergedResults, generated_at: nowIso };
        }
        const refreshedBySymbol = Object.fromEntries(mergedResults.map((item) => [item.symbol, item]));
        return {
          ...prev,
          portfolioInsight: data?.portfolioInsight || prev.portfolioInsight,
          sectorAllocation: data?.sectorAllocation || prev.sectorAllocation,
          overexposedSectors: data?.overexposedSectors || prev.overexposedSectors,
          generated_at: nowIso,
          results: prev.results.map((item) => refreshedBySymbol[item.symbol] || item),
        };
      });

      setStatusMessage(`Refreshed live quotes for ${mergedResults.length} symbols.`);
      return mergedResults;
    } catch (error) {
      const message = toMarketErrorMessage(error, 'Failed to refresh realtime quotes.');
      setApiError(message);
      return null;
    } finally {
      setIsRefreshingQuotes(false);
    }
  }, [analysisData, portfolioRows]);

  const value = useMemo(() => ({
    apiBaseUrl: API_BASE_URL,
    portfolioRows,
    setRowsFromManual,
    loadRowsFromJson,
    analysisData,
    realtimeQuotes,
    lastQuoteTimestamp,
    refreshRealtimeQuotes,
    analyzePortfolio,
    apiError,
    statusMessage,
    isAnalyzing,
    isRefreshingQuotes,
  }), [
    portfolioRows,
    setRowsFromManual,
    loadRowsFromJson,
    analysisData,
    realtimeQuotes,
    lastQuoteTimestamp,
    refreshRealtimeQuotes,
    analyzePortfolio,
    apiError,
    statusMessage,
    isAnalyzing,
    isRefreshingQuotes,
  ]);

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error('usePortfolio must be used inside PortfolioProvider.');
  }
  return context;
}
