function calculateRiskScore(rsi, volatilityPercent, sectorExposure) {
  let riskScore = 0;
  
  if (Number.isFinite(rsi) && (rsi > 70 || rsi < 30)) {
    riskScore += 1;
  }
  if (Number.isFinite(volatilityPercent) && Math.abs(volatilityPercent) > 3) {
    riskScore += 1;
  }
  if (Number.isFinite(sectorExposure) && sectorExposure > 60) {
    riskScore += 1;
  }

  return Math.max(0, Math.min(3, riskScore));
}

module.exports = {
  calculateRiskScore
};
