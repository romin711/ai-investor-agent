/**
 * Policy Engine (NEW)
 * Responsibility: Evaluate execution constraints and restrictions
 * CRITICAL: NEVER modifies signal; only restricts execution
 */

/**
 * Evaluate sector concentration constraints
 * @param {string} symbol - Stock symbol
 * @param {Object} portfolio - Current positions {symbol: weight}
 * @param {Object} sectorMap - Symbol to sector mapping
 * @returns {{allowed: true/false, sector: string, reason: string}}
 */
function evaluateSectorConstraint(symbol, portfolio = {}, sectorMap = {}) {
  const sector = sectorMap[symbol] || 'UNKNOWN';
  const sectorSymbols = Object.keys(sectorMap).filter((s) => sectorMap[s] === sector);

  // Calculate current sector weight
  const sectorWeight = sectorSymbols.reduce((sum, s) => sum + (portfolio[s] || 0), 0);

  // Max 30% sector concentration
  const maxSectorWeight = 0.3;

  if (sectorWeight >= maxSectorWeight) {
    return {
      allowed: false,
      sector,
      weight: sectorWeight,
      reason: `Sector concentration limit reached: ${sector} = ${(sectorWeight * 100).toFixed(1)}%`,
    };
  }

  return {
    allowed: true,
    sector,
    weight: sectorWeight,
    reason: `Sector OK: ${sector} = ${(sectorWeight * 100).toFixed(1)}%`,
  };
}

/**
 * Evaluate position size constraints
 * @param {string} symbol - Stock symbol
 * @param {Object} portfolio - Current positions
 * @returns {{allowed: true/false, currentWeight: number, reason: string}}
 */
function evaluatePositionConstraint(symbol, portfolio = {}) {
  const currentWeight = portfolio[symbol] || 0;
  const maxSymbolWeight = 0.1; // Max 10% per symbol for SELL

  // SELL operations can proceed even at max weight
  // BUY operations cannot exceed 10%
  if (currentWeight >= maxSymbolWeight) {
    return {
      allowed: false,
      currentWeight,
      reason: `Position size limit: ${symbol} = ${(currentWeight * 100).toFixed(1)}% (max 10%)`,
    };
  }

  return {
    allowed: true,
    currentWeight,
    reason: `Position OK: ${symbol} = ${(currentWeight * 100).toFixed(1)}%`,
  };
}

/**
 * Evaluate risk constraints
 * @param {string} action - 'BUY', 'SELL', 'HOLD'
 * @param {Object} riskMetrics - {currentDrawdown, maxDrawdown, volatility}
 * @returns {{allowed: true/false, reason: string}}
 */
function evaluateRiskConstraint(action, riskMetrics = {}) {
  const { currentDrawdown = 0, maxDrawdown = 0.15, volatility = 0 } = riskMetrics;

  // During high drawdown, restrict BUY orders
  if (action === 'BUY' && currentDrawdown > maxDrawdown) {
    return {
      allowed: false,
      reason: `High portfolio drawdown (${(currentDrawdown * 100).toFixed(1)}%); BUY restricted`,
    };
  }

  // During extreme volatility, restrict speculative trades
  if (volatility > 0.5 && action === 'BUY') {
    return {
      allowed: false,
      reason: `Extreme volatility (${(volatility * 100).toFixed(1)}%); BUY restricted`,
    };
  }

  return {
    allowed: true,
    reason: `Risk constraints OK`,
  };
}

/**
 * MASTER: Evaluate all execution constraints
 * Returns execution decision SEPARATE from signal
 * @param {string} rawSignal - BUY/SELL/HOLD
 * @param {Object} constraints - {portfolio, sectorMap, riskMetrics, symbol}
 * @returns {{finalAction, allowed, executionReason, violations: []}}
 */
function evaluateExecutionPolicy(rawSignal, constraints = {}) {
  if (!rawSignal) {
    return {
      rawSignal: null,
      finalAction: null,
      allowed: false,
      reason: 'No signal to evaluate',
      violations: ['No signal'],
    };
  }

  const { symbol, portfolio = {}, sectorMap = {}, riskMetrics = {} } = constraints;

  const violations = [];
  let finalAction = rawSignal; // Start with signal

  // Check sector constraint (applies only to BUY)
  if (rawSignal === 'BUY') {
    const sectorCheck = evaluateSectorConstraint(symbol, portfolio, sectorMap);
    if (!sectorCheck.allowed) {
      violations.push(sectorCheck.reason);
    }
  }

  // Check position size (applies only to BUY)
  if (rawSignal === 'BUY') {
    const positionCheck = evaluatePositionConstraint(symbol, portfolio);
    if (!positionCheck.allowed) {
      violations.push(positionCheck.reason);
    }
  }

  // Check risk constraints
  const riskCheck = evaluateRiskConstraint(rawSignal, riskMetrics);
  if (!riskCheck.allowed) {
    violations.push(riskCheck.reason);
  }

  // Decision: If constraints violated for BUY/SELL, restrict to HOLD
  // CRITICAL: Signal remains unchanged; only execution is restricted
  const allowed = violations.length === 0;

  if (!allowed) {
    if (rawSignal === 'BUY' || rawSignal === 'SELL') {
      finalAction = 'HOLD'; // Restrict risky actions
    }
  }

  return {
    rawSignal,
    finalAction,
    allowed,
    executionReason:
      violations.length > 0 ? `Execution restricted: ${violations.join('; ')}` : 'All constraints satisfied',
    violations,
  };
}

module.exports = {
  evaluateSectorConstraint,
  evaluatePositionConstraint,
  evaluateRiskConstraint,
  evaluateExecutionPolicy,
};
