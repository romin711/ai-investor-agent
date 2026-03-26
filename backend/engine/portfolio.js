const { analyzePortfolioExposure, detectSector, getSectorExposure } = require('./portfolioService');

function portfolioInsightForSymbol(sector, portfolioContext) {
  const exposure = getSectorExposure(sector, portfolioContext);
  if (!Number.isFinite(exposure)) {
    return `${sector} sector exposure data unavailable.`;
  }

  if (exposure > 60) {
    return `${sector} sector exposure is ${exposure.toFixed(2)}% -> high risk concentration`;
  }
  return `${sector} sector exposure is ${exposure.toFixed(2)}% -> no major concentration warning`;
}

module.exports = {
  detectSector,
  analyzePortfolioExposure,
  portfolioInsightForSymbol,
};
