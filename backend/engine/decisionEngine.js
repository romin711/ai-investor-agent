// Signal quality thresholds for improved hit rate
const CONFIDENCE_THRESHOLDS = {
  BUY: 65,   // Reject BUY signals below 65% confidence
  SELL: 65,  // Reject SELL signals below 65% confidence
  HOLD: 40,  // HOLD can be lower confidence
};

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

  // FILTER: Reject signals below confidence threshold
  // This improves hit rate by filtering out weak signals
  const threshold = CONFIDENCE_THRESHOLDS[decision] || 40;
  let reason = null;
  if (decision !== 'HOLD' && confidence < threshold) {
    reason = `Signal confidence ${confidence}% below ${threshold}% threshold for ${decision}`;
    decision = 'HOLD';
    confidence = Math.min(confidence, 50); // Force to neutral confidence
  }

  return {
    finalScore,
    decision,
    confidence,
    reason,
  };
}

module.exports = {
  evaluateDecision,
  CONFIDENCE_THRESHOLDS,
};
