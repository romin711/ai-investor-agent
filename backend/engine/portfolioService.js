const fs = require('fs');
const path = require('path');

function normalizeBaseSymbol(symbol) {
  return String(symbol || '')
    .toUpperCase()
    .replace(/\.NS$/, '')
    .replace(/\.BO$/, '')
    .replace(/\.NSE$/, '')
    .replace(/\.BSE$/, '')
    .trim();
}

function loadStocksMetadata() {
  const stocksPath = path.join(__dirname, 'stocks.json');
  if (!fs.existsSync(stocksPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(stocksPath, 'utf8');
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) {
      return {};
    }

    return rows.reduce((acc, row) => {
      const symbol = normalizeBaseSymbol(row?.symbol);
      if (!symbol) {
        return acc;
      }
      acc[symbol] = {
        symbol,
        yahooSymbol: String(row?.yahooSymbol || symbol).trim().toUpperCase(),
        sector: String(row?.sector || 'Other').trim() || 'Other',
      };
      return acc;
    }, {});
  } catch (_error) {
    return {};
  }
}

const STOCKS_BY_SYMBOL = loadStocksMetadata();

function listStocksMetadata() {
  return Object.values(STOCKS_BY_SYMBOL);
}

function detectSector(symbol) {
  const base = normalizeBaseSymbol(symbol);
  return STOCKS_BY_SYMBOL[base]?.sector || 'Other';
}

function rowsFromPortfolioInput(input) {
  if (Array.isArray(input)) {
    return input;
  }

  if (input && typeof input === 'object') {
    return Object.entries(input).map(([symbol, weight]) => ({ symbol, weight }));
  }

  return [];
}

function analyzePortfolioExposure(portfolioInput) {
  const rows = rowsFromPortfolioInput(portfolioInput);
  const normalizedRows = rows
    .map((row) => ({
      symbol: normalizeBaseSymbol(row?.resolvedSymbol || row?.symbol),
      weight: Number(row?.weight),
    }))
    .filter((row) => row.symbol && Number.isFinite(row.weight) && row.weight > 0);

  const totalWeight = normalizedRows.reduce((sum, row) => sum + row.weight, 0);
  const sectorAllocation = {};

  if (totalWeight > 0) {
    normalizedRows.forEach((row) => {
      const sector = detectSector(row.symbol);
      const percent = (row.weight / totalWeight) * 100;
      sectorAllocation[sector] = (sectorAllocation[sector] || 0) + percent;
    });
  }

  Object.keys(sectorAllocation).forEach((sector) => {
    sectorAllocation[sector] = Number(sectorAllocation[sector].toFixed(2));
  });

  const overexposedSectors = Object.entries(sectorAllocation)
    .filter(([, percent]) => percent > 60)
    .map(([sector]) => sector);

  const [topSector, topPercent = 0] = Object.entries(sectorAllocation)
    .sort((a, b) => b[1] - a[1])[0] || ['Other', 0];

  const summary = totalWeight > 0
    ? `${topSector} sector exposure is ${topPercent.toFixed(2)}%`
    : 'No portfolio data provided for exposure analysis.';

  return {
    sectorAllocation,
    overexposedSectors,
    summary,
  };
}

function getSectorExposure(sector, portfolioContext) {
  if (!portfolioContext || !portfolioContext.sectorAllocation) {
    return null;
  }
  return Number(portfolioContext.sectorAllocation[sector] || 0);
}

function calculatePortfolioAdjustment(technicalScore, sectorExposure) {
  if (!Number.isFinite(sectorExposure)) {
    return 0;
  }

  if (sectorExposure > 70) {
    return -2;
  }
  if (sectorExposure > 50) {
    return -1;
  }
  if (sectorExposure < 20 && technicalScore > 0) {
    return 1;
  }
  return 0;
}

module.exports = {
  analyzePortfolioExposure,
  calculatePortfolioAdjustment,
  detectSector,
  getSectorExposure,
  listStocksMetadata,
  normalizeBaseSymbol,
};
