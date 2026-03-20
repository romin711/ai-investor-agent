import { useState } from 'react';
import axios from 'axios';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const EXAMPLE_TEXT = `AAPL 40
MSFT 30
GOOGL 30`;

const SYMBOL_SECTOR_MAP = {
  AAPL: 'Technology',
  GOOGL: 'Technology',
  MSFT: 'Technology',
  NVDA: 'Technology',
  JPM: 'Financials',
  HDFCBANK: 'Financials',
  'HDFCBANK.NS': 'Financials',
  ICICIBANK: 'Financials',
  'ICICIBANK.NS': 'Financials',
  XOM: 'Energy',
  'RELIANCE.NS': 'Energy',
  ONGC: 'Energy',
  'ONGC.NS': 'Energy',
  JNJ: 'Healthcare',
  'SUNPHARMA.NS': 'Healthcare',
  DRREDDY: 'Healthcare',
  'DRREDDY.NS': 'Healthcare',
  ITC: 'Consumer',
  'ITC.NS': 'Consumer',
};

const FALLBACK_ALTERNATIVES = ['XOM', 'JNJ', 'JPM', 'MSFT'];

function normalizeSectorPercent(value) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return null;
  const asPercent = numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, asPercent));
}

function normalizeConfidence(value) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return 0;
  const asRatio = numeric > 1 ? numeric / 100 : numeric;
  return Math.max(0, Math.min(1, asRatio));
}

function sanitizeNextAction(text) {
  if (!text || typeof text !== 'string') {
    return 'Wait for confirmation before changing allocation.';
  }

  return text
    .replace(
      /wait for reliable live data and re-run analysis\.?/gi,
      'Wait for confirmation and re-run analysis.'
    )
    .replace(
      /wait for reliable live data before taking a position\.?/gi,
      'Wait for confirmation before taking a position.'
    )
    .replace(/reliable live data/gi, 'confirmation')
    .replace(/unreliable data/gi, 'weak signals')
    .replace(/\s+/g, ' ')
    .trim();
}

function getDecisionTone(action) {
  const normalized = String(action || '').toLowerCase();
  if (normalized.includes('buy')) return 'buy';
  if (normalized.includes('hold') || normalized.includes('no trade')) return 'hold';
  if (normalized.includes('reduce') || normalized.includes('avoid')) return 'reduce';
  return 'hold';
}

function formatAlternativeLabel(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  if (!normalized) return '';
  const sector = SYMBOL_SECTOR_MAP[normalized];
  return sector ? `${normalized} (${sector})` : normalized;
}

function normalizeItem(item) {
  const symbol = String(item.symbol || '').trim().toUpperCase();
  const weight = Number(item.weight);

  if (!symbol || Number.isNaN(weight)) {
    throw new Error('Each portfolio item needs a valid symbol and weight.');
  }

  return { symbol, weight };
}

function parsePortfolioInput(input) {
  const raw = input.trim();

  if (!raw) {
    throw new Error('Please enter portfolio data.');
  }

  const looksLikeJson = raw.startsWith('[') || raw.startsWith('{');

  if (looksLikeJson) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Invalid JSON format.');
    }

    if (!Array.isArray(parsed)) {
      throw new Error('JSON input must be an array of portfolio items.');
    }

    return parsed.map(normalizeItem);
  }

  const lines = raw
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items = lines.map((line) => {
    const match = line.match(/^([A-Za-z.]+)\s*[:-]?\s*([0-9]*\.?[0-9]+)$/);
    if (!match) {
      throw new Error(
        'Text format should be like "AAPL 40" (one entry per line).'
      );
    }
    return {
      symbol: match[1].toUpperCase(),
      weight: Number(match[2]),
    };
  });

  if (!items.length) {
    throw new Error('Please enter at least one portfolio item.');
  }

  return items;
}

function PortfolioAnalyzer() {
  const [theme, setTheme] = useState('light');
  const [input, setInput] = useState(EXAMPLE_TEXT);
  const [responseData, setResponseData] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const results = responseData?.results || [];
  const selectedResult =
    results.find((item) => item.symbol === selectedSymbol) || results[0] || null;
  const portfolioInsight = responseData?.portfolio_insight || {};
  const sectorExposure = portfolioInsight.sector_exposure || {};
  const sectorEntries = Object.entries(sectorExposure)
    .map(([sector, weight]) => [sector, normalizeSectorPercent(weight)])
    .filter(([, weight]) => weight !== null);
  const topSector = [...sectorEntries].sort((a, b) => b[1] - a[1])[0] || null;
  const chartData = (selectedResult?.stock_data?.price_history || [])
    .map((price, index) => ({
      day: index + 1,
      price: Number(price),
    }))
    .filter((point) => !Number.isNaN(point.price));
  const chartStats = chartData.length
    ? (() => {
        const prices = chartData.map((item) => item.price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const range = Math.max(max - min, 1);
        const padding = range * 0.12;
        return {
          min: Math.max(0, Number((min - padding).toFixed(2))),
          max: Number((max + padding).toFixed(2)),
        };
      })()
    : null;
  const confidenceRatio = normalizeConfidence(selectedResult?.confidence);
  const confidencePercent = Math.round(confidenceRatio * 100);
  const decisionTone = getDecisionTone(selectedResult?.decision);
  const nextActionText = sanitizeNextAction(selectedResult?.next_action);
  const alternativeLabels = (() => {
    const currentSymbol = String(selectedResult?.symbol || '').trim().toUpperCase();
    const fromApi = Array.isArray(selectedResult?.alternatives)
      ? selectedResult.alternatives
          .map((item) => formatAlternativeLabel(item))
          .filter(Boolean)
      : [];

    const uniqueFromApi = [...new Set(fromApi)];
    if (uniqueFromApi.length > 0) return uniqueFromApi;

    const fallback = FALLBACK_ALTERNATIVES.find((item) => item !== currentSymbol) || 'XOM';
    return [formatAlternativeLabel(fallback)];
  })();

  const handleAnalyze = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const portfolio = parsePortfolioInput(input);
      const response = await axios.post('http://localhost:8000/analyze', portfolio);
      setResponseData(response.data);
      setSelectedSymbol(response.data?.results?.[0]?.symbol || '');
    } catch (err) {
      setResponseData(null);
      setSelectedSymbol('');
      if (err.response?.data) {
        setError(
          typeof err.response.data === 'string'
            ? err.response.data
            : JSON.stringify(err.response.data)
        );
      } else {
        setError(err.message || 'Request failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatPercent = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A';
    return `${value.toFixed(2)}%`;
  };

  const formatCurrency = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A';
    return `$${value.toFixed(2)}`;
  };

  const formatScore = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A';
    return value.toFixed(2);
  };

  const portfolioInsightLine = topSector
    ? `${topSector[0]} ${Math.round(topSector[1])}% ${
        portfolioInsight.overexposure ? '(Overexposed)' : '(Balanced)'
      }`
    : 'No portfolio insight available';

  return (
    <div className={`dashboard theme-${theme}`}>
      <div className="dashboard-shell compact-shell">
        <header className="dashboard-header compact-header">
          <div>
            <h1>AI Investor Dashboard</h1>
            <p>Simple portfolio snapshot with action-focused output.</p>
          </div>
          <button
            type="button"
            className="theme-button"
            onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
          >
            {theme === 'light' ? 'Switch to Dark' : 'Switch to Light'}
          </button>
        </header>

        <section className="panel compact-input">
          <h2>[ Portfolio Input ]</h2>
          <form onSubmit={handleAnalyze}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={8}
              placeholder='[{"symbol":"AAPL","weight":40}]'
            />
            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? '[ Analyzing... ]' : '[ Analyze Button ]'}
            </button>
          </form>
          {error && <p className="error">{error}</p>}
        </section>

        <div className="compact-divider" />

        <section className="panel compact-report">
          {results.length > 1 && (
            <div className="symbol-tabs">
              {results.map((item) => (
                <button
                  key={item.symbol}
                  type="button"
                  className={`symbol-tab ${
                    selectedResult?.symbol === item.symbol ? 'active' : ''
                  }`}
                  onClick={() => setSelectedSymbol(item.symbol)}
                >
                  {item.symbol}
                </button>
              ))}
            </div>
          )}

          {selectedResult ? (
            <>
              <h2>📊 {selectedResult.symbol} Card</h2>
              <p className="metrics-inline">
                <span>Price {formatCurrency(selectedResult.stock_data?.price)}</span>
                <span className="metrics-sep">|</span>
                <span>Trend {selectedResult.signals?.trend || 'N/A'}</span>
                <span className="metrics-sep">|</span>
                <span>
                  Momentum {formatPercent(selectedResult.signals?.momentum_percent)}
                </span>
              </p>

              <div className="compact-block">
                <h3>📈 Chart</h3>
                {chartData.length > 0 ? (
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartData}
                        margin={{ top: 10, right: 14, left: 6, bottom: 16 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                        <XAxis
                          dataKey="day"
                          label={{ value: 'Day', position: 'insideBottom', offset: -8 }}
                          tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                        />
                        <YAxis
                          width={80}
                          domain={
                            chartStats
                              ? [chartStats.min, chartStats.max]
                              : ['auto', 'auto']
                          }
                          label={{
                            value: 'Price ($)',
                            angle: -90,
                            position: 'insideLeft',
                          }}
                          tickFormatter={(value) => `$${Number(value).toFixed(2)}`}
                          tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                        />
                        <Tooltip
                          formatter={(value) => `$${Number(value).toFixed(2)}`}
                          labelFormatter={(label) => `Day ${label}`}
                          contentStyle={{
                            borderRadius: '10px',
                            border: '1px solid var(--card-border)',
                            backgroundColor: 'var(--card-bg)',
                            color: 'var(--text-main)',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="price"
                          stroke="var(--accent)"
                          strokeWidth={2.5}
                          dot={false}
                          connectNulls
                          strokeLinecap="round"
                          activeDot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="placeholder">No price history available.</p>
                )}
              </div>

              <div className="compact-block">
                <h3>🧠 Decision</h3>
                <div className="decision-row">
                  <span className={`decision-badge ${decisionTone}`}>
                    {(selectedResult.decision || 'N/A').toString()}
                  </span>
                  <span className="compact-value">({formatScore(confidenceRatio)})</span>
                </div>
                <div className="confidence-bar">
                  <div
                    className={`confidence-fill ${decisionTone}`}
                    style={{ width: `${confidencePercent}%` }}
                  />
                </div>
                <p className="confidence-caption">{confidencePercent}% confidence</p>
              </div>

              <div className="compact-block">
                <h3>📉 Portfolio Insight</h3>
                <p className="compact-value">{portfolioInsightLine}</p>
              </div>

              <div className="compact-block">
                <h3>💡 Next Action</h3>
                <p className="compact-value">{nextActionText}</p>
              </div>

              <div className="compact-block">
                <h3>🔄 Alternatives</h3>
                <ul className="list compact-list">
                  {alternativeLabels.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="placeholder">Run analysis to view stock details.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export default PortfolioAnalyzer;
