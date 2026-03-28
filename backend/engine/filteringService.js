/**
 * filteringService.js
 * 
 * Filters and ranks alerts based on user policy preferences
 * Policies: Risk profile, sector caps, time horizons, volatility tolerance
 */

/**
 * Check if alert matches risk profile
 */
function passesRiskProfileFilter(alert, riskProfile) {
  const riskLimits = {
    conservative: 0.12, // Max 12% annual volatility
    moderate: 0.18,     // Max 18%
    aggressive: 0.30,   // Max 30%
  };

  const maxVol = riskLimits[riskProfile] || riskLimits.moderate;
  const alertVol = alert.volatility || 0; // Assuming volatility data in alert

  return alertVol <= maxVol;
}

/**
 * Check sector concentration constraint - STRICT enforcement
 * Hard cap: Max 20% single sector, max 10% single stock
 */
function passesSectorFilter(alert, maxSectorCap, portfolio) {
  if (!portfolio || !portfolio.holdings) return true;

  // STRICT LIMITS for better diversification
  const MAX_SINGLE_SECTOR = 0.20; // Hard cap: 20% per sector
  const MAX_SINGLE_STOCK = 0.10;  // Hard cap: 10% per stock
  
  const sectorHoldings = portfolio.holdings.reduce((sum, h) => {
    return h.sector === alert.sector ? sum + h.weight : sum;
  }, 0);

  // Check if this symbol already exists
  const existingPosition = portfolio.holdings.find((h) => h.symbol === alert.symbol);
  const projectedStockWeight = (existingPosition?.weight || 0) + (alert.suggestedPositionSize || 0.04);

  const projectedSectorWeight = sectorHoldings + (alert.suggestedPositionSize || 0.04);
  
  // Reject if breaches hard limits
  if (projectedSectorWeight > MAX_SINGLE_SECTOR) {
    console.log(`[Filtering] Sector ${alert.sector} would exceed 20% cap (now: ${(sectorHoldings * 100).toFixed(1)}%)`);
    return false;
  }
  
  if (projectedStockWeight > MAX_SINGLE_STOCK) {
    console.log(`[Filtering] Stock ${alert.symbol} would exceed 10% cap (now: ${(projectedStockWeight * 100).toFixed(1)}%)`);
    return false;
  }

  return true;
}

/**
 * Check time horizon alignment
 */
function passesTimeHorizonFilter(alert, preferredHorizon) {
  const horizonMap = {
    '1': ['scalp', 'intraday'],
    '3': ['short', 'scalp', 'intraday'],
    '5': ['medium', 'short', 'momentum'],
    '10': ['intermediate', 'medium', 'swing'],
    '30': ['long', 'intermediate', 'trend'],
  };

  const validSignalTypes = horizonMap[String(preferredHorizon)] || horizonMap['5'];
  const signalType = String(alert.signalType || 'momentum').toLowerCase();

  return validSignalTypes.some((t) => signalType.includes(t));
}

/**
 * Check volatility tolerance filter
 */
function passesVolatilityFilter(alert, maxVolatility) {
  const alertVol = alert.volatility || 0;
  return alertVol <= (maxVolatility / 100);
}

/**
 * Filter alerts based on user policies
 */
function filterAlertsByPolicy(alerts, policies = {}, portfolio = {}) {
  const {
    riskProfile = 'moderate',
    maxSectorCap = 15,
    holdingPeriod = '5',
    volatilityTolerance = 18,
  } = policies;

  return alerts.filter((alert) => {
    const passesRisk = passesRiskProfileFilter(alert, riskProfile);
    const passesSector = passesSectorFilter(alert, maxSectorCap, portfolio);
    const passesHorizon = passesTimeHorizonFilter(alert, holdingPeriod);
    const passesVol = passesVolatilityFilter(alert, volatilityTolerance);

    return passesRisk && passesSector && passesHorizon && passesVol;
  });
}

/**
 * Calculate alert score based on policies
 * Higher score = better fit for user preferences
 */
function calculatePolicyScore(alert, policies = {}) {
  const {
    riskProfile = 'moderate',
    maxSectorCap = 15,
    holdingPeriod = '5',
    volatilityTolerance = 18,
  } = policies;

  let score = 100;

  // Volatility alignment (within comfort zone = +10)
  const volTolerance = volatilityTolerance / 100;
  const alertVol = alert.volatility || 0.02;
  if (alertVol <= volTolerance * 0.7) score += 10;
  if (alertVol > volTolerance) score -= 30; // Penalize exceeding tolerance

  // Time horizon alignment (perfect match = +15)
  const horizonMap = {
    '1': ['scalp'],
    '3': ['short'],
    '5': ['medium', 'momentum'],
    '10': ['intermediate'],
    '30': ['long'],
  };
  const validSignals = horizonMap[holdingPeriod] || [];
  const signalType = String(alert.signalType || 'momentum').toLowerCase();
  if (validSignals.some((v) => signalType.includes(v))) score += 15;

  // Risk profile fit (perfect match = +10)
  const riskMatch = alert.riskProfile === riskProfile;
  if (riskMatch) score += 10;

  // High confidence signals
  const confidence = alert.confidence || 0.5;
  if (confidence > 0.7) score += 20;
  if (confidence < 0.4) score -= 15;

  // Positive expected return
  if (alert.expectedReturn && alert.expectedReturn > 0.02) score += 10;

  return Math.max(0, score);
}

/**
 * Rank and sort alerts by policy fit + other metrics
 */
function rankAlerts(alerts, policies = {}, sortBy = 'policyScore') {
  const scoredAlerts = alerts.map((alert) => ({
    ...alert,
    policyScore: calculatePolicyScore(alert, policies),
  }));

  return scoredAlerts.sort((a, b) => {
    if (sortBy === 'policyScore') {
      return (b.policyScore || 0) - (a.policyScore || 0);
    }
    if (sortBy === 'confidence') {
      return (b.confidence || 0) - (a.confidence || 0);
    }
    if (sortBy === 'risk-adjusted-return') {
      const aScore = (a.expectedReturn || 0) / (a.volatility || 0.01);
      const bScore = (b.expectedReturn || 0) / (b.volatility || 0.01);
      return bScore - aScore;
    }
    return (b.priorityScore || 0) - (a.priorityScore || 0);
  });
}

/**
 * Get personalized recommendations
 * Returns: filtered + ranked alerts matching user policies
 */
function getPersonalizedRecommendations(alerts = [], policies = {}, portfolio = {}) {
  // Step 1: Filter by hard constraints
  const filtered = filterAlertsByPolicy(alerts, policies, portfolio);

  // Step 2: Score and rank by policy fit
  const ranked = rankAlerts(filtered, policies, 'policyScore');

  // Step 3: Calculate position sizes based on risk profile
  const withPositions = ranked.map((alert) => {
    const positionSizePercent = calculatePositionSizeForPolicy(
      alert.volatility || 0.02,
      policies.riskProfile || 'moderate'
    );

    return {
      ...alert,
      recommendedPositionSize: positionSizePercent,
      policyMatchExplanation: generateMatchExplanation(alert, policies),
    };
  });

  return withPositions;
}

/**
 * Calculate position size based on volatility and risk profile
 */
function calculatePositionSizeForPolicy(volatility, riskProfile) {
  const basePositions = {
    conservative: 0.02,
    moderate: 0.04,
    aggressive: 0.06,
  };

  const baseSize = basePositions[riskProfile] || basePositions.moderate;

  // Adjust for volatility: lower volatility = larger position
  const volAdjustment = Math.max(0.01, 1 - volatility);
  return Math.min(baseSize * volAdjustment, 0.08); // Cap at 8%
}

/**
 * Generate human-readable explanation of policy match
 */
function generateMatchExplanation(alert, policies) {
  const parts = [];

  if (alert.volatility && alert.volatility <= (policies.volatilityTolerance || 18) / 100) {
    parts.push('Within volatility tolerance');
  }

  if (alert.confidence > 0.6) {
    parts.push('High confidence signal');
  }

  if (alert.signalType) {
    const horizon = policies.holdingPeriod || '5';
    parts.push(`Matches your ${horizon}-day horizon preference`);
  }

  if (alert.riskProfile === policies.riskProfile) {
    parts.push(`Aligned with ${policies.riskProfile} risk profile`);
  }

  return parts.length > 0 ? parts.join('; ') : 'Meets your policy constraints';
}

module.exports = {
  filterAlertsByPolicy,
  calculatePolicyScore,
  rankAlerts,
  getPersonalizedRecommendations,
  calculatePositionSizeForPolicy,
  generateMatchExplanation,
};
