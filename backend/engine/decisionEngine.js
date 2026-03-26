function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function evaluateDecision(input) {
  const technicalScore = toFiniteNumber(input?.technicalScore);
  const portfolioAdjustment = toFiniteNumber(input?.portfolioAdjustment);
  const rsi = toFiniteNumber(input?.rsi);
  const price = toFiniteNumber(input?.price);
  const ma50 = toFiniteNumber(input?.ma50);

  if (technicalScore === null || portfolioAdjustment === null || rsi === null || price === null || ma50 === null) {
    return {
      finalScore: null,
      decision: 'HOLD',
      confidence: 'low',
      reason: 'Insufficient data',
    };
  }

  const finalScore = technicalScore + portfolioAdjustment;
  
  let decision = 'HOLD';
  if (finalScore >= 3) {
    decision = 'BUY';
  } else if (finalScore <= -3) {
    decision = 'SELL';
  }

  let confidence = Math.abs(finalScore) * 20;
  
  if (rsi >= 40 && rsi <= 60) {
    confidence -= 15;
  }
  const trendDiff = ma50 > 0 ? Math.abs(((price - ma50) / ma50) * 100) : 100;
  if (trendDiff < 1) {
    confidence -= 15;
  }

  confidence = Math.max(10, Math.min(90, Math.round(confidence)));

  return {
    finalScore,
    decision,
    confidence,
    reason: null,
  };
}

module.exports = {
  evaluateDecision
};
