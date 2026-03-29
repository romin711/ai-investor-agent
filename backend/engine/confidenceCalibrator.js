/**
 * ConfidenceCalibrator - Adjusts confidence based on historical accuracy
 * 
 * Takes base signal confidence and multiplies by:
 * - Historical win rate for this signal type
 * - Factor reliability based on past performance
 * - Data quality assessment
 */

const tradeLogger = require('./tradeLogger');

class ConfidenceCalibrator {
  /**
   * Calibrate confidence based on historical performance
   * 
   * Inputs:
   * - baseConfidence: raw signal confidence (0-1)
   * - signalType: "BUY" | "SELL" | "HOLD"
   * - symbol: stock symbol (to get symbol-specific history)
   * - factorWeights: which factors contributed most
   */
  calibrateConfidence(baseConfidence, signalType, symbol = null, factorWeights = null) {
    // Get trading history
    const trades = symbol 
      ? tradeLogger.getTradesBySymbol(symbol)
      : tradeLogger.getRecentTrades(100);

    // Calculate adjustments
    const signalAccuracy = this._getSignalAccuracy(signalType, trades);
    const factorReliability = this._getFactorReliability(factorWeights, trades);
    const dataQuality = this._assessDataQuality(trades);

    // Combine adjustments (multiplicative)
    const calibratedConfidence = baseConfidence 
      * signalAccuracy 
      * factorReliability 
      * dataQuality;

    return {
      baseConfidence,
      signalAccuracy: signalAccuracy.winRate,
      factorReliability,
      dataQuality,
      calibratedConfidence: Math.max(0, Math.min(1, calibratedConfidence)),
      adjustments: {
        signalType,
        symbolSpecific: symbol !== null,
        tradesUsed: trades.length,
      },
    };
  }

  /**
   * Get historical win rate for a signal type
   */
  _getSignalAccuracy(signalType, trades) {
    const closedTrades = trades.filter(t => t.status === 'closed' && t.outcome !== null);
    
    if (closedTrades.length === 0) {
      return {
        count: 0,
        wins: 0,
        losses: 0,
        winRate: 0.5, // Default neutral
      };
    }

    const signalTrades = closedTrades.filter(t => t.action === signalType);
    
    if (signalTrades.length === 0) {
      return {
        count: 0,
        wins: 0,
        losses: 0,
        winRate: 0.5,
      };
    }

    // Count wins (outcome > 2% for BUY, < -2% for SELL)
    let wins = 0;
    if (signalType === 'BUY') {
      wins = signalTrades.filter(t => t.outcome > 2).length;
    } else if (signalType === 'SELL') {
      wins = signalTrades.filter(t => t.outcome < -2).length;
    } else {
      // HOLD: neutral outcomes in [-2, 2]
      wins = signalTrades.filter(t => t.outcome >= -2 && t.outcome <= 2).length;
    }

    const winRate = wins / signalTrades.length;

    return {
      count: signalTrades.length,
      wins,
      losses: signalTrades.length - wins,
      winRate,
    };
  }

  /**
   * Assess reliability of the factors that contributed to this signal
   */
  _getFactorReliability(factorWeights, trades) {
    if (!factorWeights || trades.length < 10) {
      return 0.8; // Default: moderately reliable
    }

    // Calculate correlation between each factor and actual outcomes
    const correlations = this._calculateFactorCorrelations(trades);

    // Weight reliability by importance
    let weightedReliability = 0;
    let totalWeight = 0;

    for (const [factor, weight] of Object.entries(factorWeights)) {
      const correlation = correlations[factor] || 0.3;
      
      // Convert correlation [-1, 1] to reliability [0, 1]
      const reliability = Math.abs(correlation); 
      
      weightedReliability += reliability * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedReliability / totalWeight : 0.8;
  }

  /**
   * Calculate factor-outcome correlations
   */
  _calculateFactorCorrelations(trades) {
    const correlations = {
      trendScore: 0,
      momentumScore: 0,
      divergenceScore: 0,
      rsiScore: 0,
      volumeScore: 0,
      volatilityScore: 0,
    };

    const closedTrades = trades.filter(t => t.status === 'closed' && t.outcome !== null);
    if (closedTrades.length < 10) return correlations;

    // For each factor, calculate Pearson correlation with outcome
    for (const factor of Object.keys(correlations)) {
      const factorValues = closedTrades.map(t => t.features?.[factor] || 0);
      const outcomes = closedTrades.map(t => t.outcome);

      correlations[factor] = this._pearsonCorrelation(factorValues, outcomes);
    }

    return correlations;
  }

  /**
   * Simple Pearson correlation calculation
   */
  _pearsonCorrelation(x, y) {
    if (x.length !== y.length || x.length < 2) return 0;

    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let sumX2 = 0;
    let sumY2 = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      sumX2 += dx * dx;
      sumY2 += dy * dy;
    }

    const denominator = Math.sqrt(sumX2 * sumY2);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Assess quality of available data
   */
  _assessDataQuality(trades) {
    if (trades.length === 0) return 0.5; // No data = uncertain

    const closedTrades = trades.filter(t => t.status === 'closed');
    const completeTrades = closedTrades.filter(t => t.outcome !== null);

    if (closedTrades.length === 0) return 0.5; // No closed trades yet

    // Data quality based on:
    // 1. Completion rate (% of trades with outcomes)
    const completionRate = completeTrades.length / closedTrades.length;

    // 2. Data freshness (recent data more relevant)
    const now = Date.now();
    const recentTrades = trades.filter(
      t => (now - t.timestamp) < 30 * 24 * 60 * 60 * 1000 // Last 30 days
    );
    const freshness = Math.min(1, recentTrades.length / 20);

    // 3. Feature completeness (how many features are non-null)
    let featureCompleteness = 1;
    trades.slice(-10).forEach(t => {
      const features = Object.values(t.features || {});
      const nullFeatures = features.filter(f => f === null || f === undefined).length;
      if (nullFeatures > 0) {
        featureCompleteness -= 0.1;
      }
    });

    // Combine
    const quality = (completionRate + freshness + featureCompleteness) / 3;
    return Math.max(0.3, Math.min(1, quality)); // Between 0.3 and 1
  }

  /**
   * Get confidence limits by signal type
   * (Some markets/symbols are inherently harder to predict)
   */
  getConfidenceLimits(symbol = null) {
    const trades = symbol
      ? tradeLogger.getTradesBySymbol(symbol)
      : tradeLogger.getRecentTrades(100);

    const closedTrades = trades.filter(t => t.status === 'closed' && t.outcome !== null);
    
    if (closedTrades.length < 20) {
      return {
        BUY: { min: 0.5, max: 0.8 },
        SELL: { min: 0.5, max: 0.8 },
        HOLD: { min: 0.5, max: 0.7 },
      };
    }

    // Calculate based on actual win rates
    const stats = {};
    for (const action of ['BUY', 'SELL', 'HOLD']) {
      const actionTrades = closedTrades.filter(t => t.action === action);
      if (actionTrades.length === 0) {
        stats[action] = { min: 0.5, max: 0.8 };
        continue;
      }

      const winRate = actionTrades.filter(t => {
        if (action === 'BUY') return t.outcome > 2;
        if (action === 'SELL') return t.outcome < -2;
        return t.outcome >= -2 && t.outcome <= 2;
      }).length / actionTrades.length;

      stats[action] = {
        min: Math.max(0.4, winRate * 0.8),
        max: Math.min(1, winRate * 1.2 + 0.1),
      };
    }

    return stats;
  }
}

module.exports = new ConfidenceCalibrator();
