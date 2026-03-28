/**
 * Financial Data Analyzer
 * Converts financial events and patterns into actionable trading signals and alerts
 * Maps fundamental + sentiment data to execution recommendations
 */

const financialDataService = require('./financialDataService');

/**
 * Analyze financial data for a symbol and generate trading recommendations
 * Returns execution-grade recommendations with stops, targets, and position sizing
 */
async function analyzeFinancialSignal(symbol, currentPrice) {
  try {
    const healthScore = await financialDataService.getFinancialHealthScore(symbol);
    const events = await financialDataService.getFinancialEvents(symbol);

    // Derive recommendation from health score and patterns
    const recommendation = deriveRecommendation(healthScore, currentPrice);

    // Calculate execution parameters
    const executionPlan = calculateExecutionPlan(
      recommendation,
      healthScore,
      currentPrice
    );

    // Determine alert lifecycle and confidence
    const alert = {
      symbol,
      timestamp: new Date().toISOString(),
      financialHealthScore: healthScore.healthScore,
      interpretation: healthScore.interpretation,
      
      // PRIMARY TRADE SIGNAL
      decision: recommendation.decision,
      confidence: recommendation.confidence,
      timeHorizon: recommendation.timeHorizon,

      // EXECUTION DETAILS
      execution: executionPlan,

      // FUNDAMENTAL DRIVERS
      drivers: {
        topEvents: healthScore.topEvents.map((e) => ({
          type: e.type,
          title: e.title,
          date: e.date,
          impact: e.impactScore,
          credibility: e.credibility,
        })),
        aggregatedPatterns: healthScore.aggregatedPatterns,
      },

      // ALERT LIFECYCLE STATE
      lifecycle: {
        state: 'NEW',
        createdAt: new Date().toISOString(),
        triggerPrice: currentPrice,
        triggeredCount: 0,
        lastTriggeredAt: null,
        invalidatedAt: null,
        expiresAt: addDays(new Date(), getDaysToExpiry(recommendation.decision)),
      },

      // RISK PARAMETERS
      riskProfile: {
        maxDrawdown: executionPlan.maxDrawdownPercent,
        haltLevel: executionPlan.stopLoss,
        profitTarget: executionPlan.targetPrice,
        riskRewardRatio: (
          (executionPlan.targetPrice - currentPrice) /
          (currentPrice - executionPlan.stopLoss)
        ).toFixed(2),
      },

      // SUMMARY FOR DASHBOARD
      summary: generateAlertSummary(recommendation, healthScore, currentPrice),
    };

    return alert;
  } catch (error) {
    console.error(`Error analyzing financial signal for ${symbol}:`, error);
    return null;
  }
}

/**
 * Derive BUY/SELL/HOLD recommendation from health score and patterns
 */
function deriveRecommendation(healthScore, currentPrice) {
  const score = healthScore.healthScore;
  const patterns = healthScore.aggregatedPatterns || [];

  let decision = 'HOLD';
  let confidence = 50;
  let timeHorizon = '5D';
  let rationale = '';

  // Check for converged patterns first (highest confidence)
  const strongBullish = patterns.find((p) => p.pattern === 'CONVERGENT_BULLISH_INDICATORS');
  const strongBearish = patterns.find((p) => p.pattern === 'CONVERGENT_BEARISH_INDICATORS');
  const mixed = patterns.find((p) => p.pattern === 'MIXED_SIGNALS_EARNINGS_VS_GUIDANCE');

  if (strongBullish) {
    decision = 'BUY';
    confidence = Math.min(strongBullish.confidence, 90);
    timeHorizon = '10D'; // Extended holding period for fundamental strength
    rationale = strongBullish.reasoning;
  } else if (strongBearish) {
    decision = 'SELL';
    confidence = Math.min(strongBearish.confidence, 85);
    timeHorizon = '5D'; // Defensive exit
    rationale = strongBearish.reasoning;
  } else if (mixed) {
    decision = 'HOLD';
    confidence = 70;
    timeHorizon = '3D'; // Wait for clarity
    rationale = 'Mixed fundamental signals; waiting for confirmation';
  } else {
    // Fall back to health score thresholds
    if (score > 1.5) {
      decision = 'BUY';
      confidence = 70;
      timeHorizon = '7D';
      rationale = healthScore.interpretation;
    } else if (score > 0.5) {
      decision = 'BUY';
      confidence = 60;
      timeHorizon = '5D';
      rationale = healthScore.interpretation;
    } else if (score < -1.5) {
      decision = 'SELL';
      confidence = 75;
      timeHorizon = '5D';
      rationale = healthScore.interpretation;
    } else if (score < -0.5) {
      decision = 'SELL';
      confidence = 60;
      timeHorizon = '3D';
      rationale = healthScore.interpretation;
    } else {
      decision = 'HOLD';
      confidence = 55;
      timeHorizon = '3D';
      rationale = 'Neutral fundamental positioning; no clear directional bias';
    }
  }

  return {
    decision,
    confidence,
    timeHorizon,
    rationale,
  };
}

/**
 * Calculate execution-grade recommendation: entry, stop, target, sizing
 */
function calculateExecutionPlan(recommendation, healthScore, currentPrice) {
  const { decision, confidence, timeHorizon } = recommendation;
  const volatilityFactor = 0.02; // 2% typical volatility
  const confidenceMultiplier = confidence / 100;

  let entryRange = {};
  let stopLoss = 0;
  let targetPrice = 0;
  let positionSize = 0;
  let rationale = '';

  if (decision === 'BUY') {
    // For BUY: Entry dip, stop below support, target based on risk/reward
    const entryBuffer = currentPrice * volatilityFactor * confidenceMultiplier;
    entryRange = {
      start: (currentPrice - entryBuffer * 1.5).toFixed(2),
      end: currentPrice.toFixed(2),
      avgPrice: currentPrice.toFixed(2),
    };

    // Stop loss 2-3% below current (tighter for higher confidence)
    stopLoss = (currentPrice * (1 - 0.03 + confidence / 5000)).toFixed(2);

    // Target setup: 1.5x risk/reward for fundamental plays, 1x for technical
    const riskAmount = currentPrice - stopLoss;
    const fundaMultiplier = healthScore.aggregatedPatterns?.length > 0 ? 1.5 : 1.2;
    targetPrice = (currentPrice + riskAmount * fundaMultiplier).toFixed(2);

    // Position sizing: confidence-based + volatility-adjusted
    // Higher volatility → smaller position; higher confidence → larger position
    let baseSizePercent = 2 + (confidence - 60) / 10; // 2-6% base
    // Adjust for volatility: if volatility is > 3%, reduce size proportionally
    const volatilityAdjustment = Math.max(0.5, 1 - (volatilityFactor * 100 - 2) / 2); // Reduce if vol > 2%
    positionSize = Math.round(Math.min(5, baseSizePercent * volatilityAdjustment)); // Cap at 5%
    rationale = `Entry: Wait for pull to ₹${entryRange.start} | Target: ₹${targetPrice} | Max loss: ${(((stopLoss - currentPrice) / currentPrice) * 100).toFixed(1)}%`;

  } else if (decision === 'SELL') {
    // For SELL: Aggressive exit, no re-entry until confirmation
    const exitBuffer = currentPrice * volatilityFactor * confidenceMultiplier;
    entryRange = {
      start: currentPrice.toFixed(2),
      end: (currentPrice + exitBuffer * 1.5).toFixed(2),
      avgPrice: (currentPrice + exitBuffer * 0.75).toFixed(2),
    };

    // Stop loss above recent high (prevent whipsaws)
    stopLoss = (currentPrice * (1 + 0.04 - confidence / 2500)).toFixed(2);

    // Target: Full exit or staged reduce
    targetPrice = (currentPrice * 0.95).toFixed(2); // Target 5% downside

    positionSize = 100; // Full exit recommendation
    rationale = `Exit: At market or ₹${entryRange.end} limit | Reentry stop: ₹${stopLoss} | Expect 5-10% downside`;

  } else {
    // HOLD: Maintain existing position, tighten stops
    entryRange = {
      start: currentPrice.toFixed(2),
      end: currentPrice.toFixed(2),
      avgPrice: currentPrice.toFixed(2),
    };

    stopLoss = (currentPrice * 0.96).toFixed(2); // Tight stop (4% loss)
    targetPrice = (currentPrice * 1.08).toFixed(2); // Modest upside (8%)
    positionSize = 0; // No action
    rationale = 'Hold existing positions; avoid new initiations until clarity improves';
  }

  // RISK MANAGEMENT: Validate risk/reward before execution
  const riskDistance = Math.abs(currentPrice - stopLoss);
  const rewardDistance = Math.abs(targetPrice - currentPrice);
  const riskRewardRatio = rewardDistance / (riskDistance || 0.01);
  
  // Reject BUY/SELL if risk/reward < 1.5:1 (protect capital)
  let finalDecision = decision;
  let executionReason = rationale;
  if ((decision === 'BUY' || decision === 'SELL') && riskRewardRatio < 1.5) {
    finalDecision = 'HOLD';
    executionReason = `Risk/reward ${riskRewardRatio.toFixed(2)}:1 below 1.5:1 minimum. ${rationale}`;
  }

  return {
    decision: finalDecision,
    confidence,
    entryRange,
    stopLoss,
    targetPrice,
    positionSize,
    maxDrawdownPercent: Math.abs(((stopLoss - currentPrice) / currentPrice) * 100).toFixed(1),
    riskRewardRatio: riskRewardRatio.toFixed(2),
    timeHorizon,
    rationale: executionReason,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Generate short summary for alert display
 */
function generateAlertSummary(recommendation, healthScore, currentPrice) {
  const topEvent = healthScore.topEvents?.[0];
  const pattern = healthScore.aggregatedPatterns?.[0];

  let summary = '';

  if (pattern) {
    summary = `${pattern.reasoning} (Confidence: ${recommendation.confidence}%)`;
  } else if (topEvent) {
    summary = `${topEvent.title} · ${topEvent.impact > 0 ? '📈' : '📉'} ${topEvent.type}`;
  } else {
    summary = recommendation.rationale;
  }

  return summary;
}

/**
 * Update alert lifecycle state based on market movement
 */
function updateAlertLifecycle(alert, currentPrice) {
  const lifecycle = alert.lifecycle;
  const execution = alert.execution;

  // Check if stop loss hit
  if (alert.decision === 'BUY' && currentPrice <= execution.stopLoss) {
    lifecycle.state = 'INVALIDATED';
    lifecycle.invalidatedAt = new Date().toISOString();
    return { ...alert, lifecycle };
  }

  // Check if target hit
  if (alert.decision === 'BUY' && currentPrice >= execution.targetPrice) {
    lifecycle.state = 'TRIGGERED';
    lifecycle.triggeredCount = (lifecycle.triggeredCount || 0) + 1;
    lifecycle.lastTriggeredAt = new Date().toISOString();
    return { ...alert, lifecycle };
  }

  // Check if expired
  if (new Date() > new Date(lifecycle.expiresAt)) {
    lifecycle.state = 'EXPIRED';
    lifecycle.invalidatedAt = new Date().toISOString();
    return { ...alert, lifecycle };
  }

  // Mark as actionable if created > 2 hours ago
  if (
    lifecycle.state === 'NEW' &&
    new Date() - new Date(lifecycle.createdAt) > 2 * 60 * 60 * 1000
  ) {
    lifecycle.state = 'ACTIONABLE';
  }

  return { ...alert, lifecycle };
}

/**
 * Filter/rank alerts by execution readiness
 */
function rankAlertsByReadiness(alerts) {
  const stateRanking = {
    ACTIONABLE: 1,
    TRIGGERED: 2,
    NEW: 3,
    EXPIRED: 4,
    INVALIDATED: 5,
  };

  return alerts
    .filter((a) => a.lifecycle.state !== 'EXPIRED' && a.lifecycle.state !== 'INVALIDATED')
    .sort((a, b) => {
      const stateCompare =
        stateRanking[a.lifecycle.state] - stateRanking[b.lifecycle.state];
      if (stateCompare !== 0) return stateCompare;
      // Secondary sort: by execution confidence
      return b.confidence - a.confidence;
    });
}

/**
 * utility: Add days to a date
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * utility: Get days to expiry based on timeHorizon
 */
function getDaysToExpiry(decision) {
  // SELL signals expire faster (clients need to act)
  if (decision === 'SELL') return 3;
  if (decision === 'BUY') return 10;
  return 5; // HOLD
}

module.exports = {
  analyzeFinancialSignal,
  updateAlertLifecycle,
  rankAlertsByReadiness,
  deriveRecommendation,
  calculateExecutionPlan,
  generateAlertSummary,
};
