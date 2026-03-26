function calculateTechnicalScore(price, ma50, rsi, momentumPercent, breakout) {
  let score = 0;
  let trendState = 'neutral';
  
  if (Number.isFinite(price) && Number.isFinite(ma50) && ma50 > 0) {
    const trendDiff = ((price - ma50) / ma50) * 100;
    if (trendDiff > 2) {
      score += 2;
      trendState = 'uptrend';
    } else if (trendDiff < -2) {
      score -= 2;
      trendState = 'downtrend';
    }
  }

  if (Number.isFinite(rsi) && rsi < 30) {
    score += 2;
  } else if (Number.isFinite(rsi) && rsi > 70) {
    score -= 2;
  }

  if (Number.isFinite(momentumPercent) && momentumPercent > 2) {
    score += 1;
  } else if (Number.isFinite(momentumPercent) && momentumPercent < -2) {
    score -= 1;
  }

  if (breakout === true) {
    score += 2;
  }

  const clampedScore = Math.max(-5, Math.min(5, score));

  return {
    score: clampedScore,
    trend: trendState
  };
}

module.exports = {
  calculateTechnicalScore
};
