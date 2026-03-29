/**
 * AdaptiveDecisionIntegration - Shows how to integrate adaptive scoring
 * into the existing decision engine while maintaining backward compatibility
 * 
 * USAGE:
 * 1. Replace calls to indicatorService with adaptiveScoring
 * 2. Log outcomes using tradeLogger
 * 3. System automatically learns and improves weights
 */

const AdaptiveScoring = require('./adaptiveScoring');
const tradeLogger = require('./tradeLogger');

class AdaptiveDecisionIntegration {
  constructor() {
    this.adaptiveScoring = new AdaptiveScoring({
      autoOptimize: true,
      optimizationInterval: 20,
      explainMode: true,
    });
  }

  /**
   * Generate a decision signal (replaces current indicatorService)
   * 
   * Takes: same inputs as current scoreIndicators()
   * Returns: backward-compatible response
   */
  generateAdaptiveSignal(symbol, indicators, candles, analysis) {
    // Map indicators to feature vector
    const features = [
      indicators.trendScore || 0,      // trend
      indicators.momentumScore || 0,   // momentum
      indicators.divergenceScore || 0, // divergence
      indicators.rsiScore || 0,        // rsi
      indicators.volumeScore || 0,     // volume
      indicators.volatilityScore || 0, // volatility
    ];

    // Get adaptive score
    const adaptiveResponse = this.adaptiveScoring.scoreSignal({
      symbol,
      features,
      candles,
      baseConfidence: analysis.confidence || 0.5,
    });

    // Return in format compatible with existing code
    return {
      // Adaptive decision
      decision: adaptiveResponse.decision,
      score: adaptiveResponse.finalScore,
      confidence: adaptiveResponse.probability,
      
      // Backward compatible fields
      explanation: adaptiveResponse.explanation,
      regime: adaptiveResponse.regime,
      weights: adaptiveResponse.weightsUsed,
      
      // Enhanced with adaptive benefits
      positionSizeAdjustment: adaptiveResponse.positionSizeAdjustment,
      stopLossPoints: adaptiveResponse.stopLossPoints,
      topFactors: adaptiveResponse.topContributors,
      
      // Explainability
      calibrationDetails: adaptiveResponse.calibrationDetails,
    };
  }

  /**
   * Log a signal execution (call when signal is acted upon)
   */
  logSignalExecution(symbol, signal, entryPrice) {
    const tradeId = tradeLogger.logSignal({
      symbol,
      action: signal.decision,
      confidence: signal.confidence,
      score: signal.score,
      trendScore: signal.weights?.trend || 0,
      momentumScore: signal.weights?.momentum || 0,
      divergenceScore: signal.weights?.divergence || 0,
      rsiScore: signal.weights?.rsi || 0,
      volumeScore: signal.weights?.volume || 0,
      volatilityScore: signal.weights?.volatility || 0,
      entryPrice,
      regime: signal.regime,
      marketVolatility: signal.marketVolatility || 0,
      notes: signal.explanation,
    }).id;

    return tradeId;
  }

  /**
   * Update trade when position closes
   */
  logTradeOutcome(tradeId, exitPrice, exitTime) {
    return tradeLogger.updateTradeOutcome(tradeId, exitPrice, exitTime);
  }

  /**
   * Trigger weight optimization
   */
  optimizeWeights() {
    return this.adaptiveScoring.optimizeWeights();
  }

  /**
   * Get performance metrics
   */
  getSystemMetrics() {
    return {
      weights: this.adaptiveScoring.getWeights(),
      performance: this.adaptiveScoring.getPerformanceAnalysis(),
      recentHistory: this.adaptiveScoring.getOptimizationHistory(5),
    };
  }

  /**
   * Export for ML training
   */
  exportTrainingData() {
    return this.adaptiveScoring.exportDataset();
  }

  /**
   * Get recent trade outcomes (for validation dashboard)
   */
  getRecentOutcomes(limit = 20) {
    return tradeLogger.getRecentTrades(limit);
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    return tradeLogger.getPerformanceStats();
  }
}

module.exports = new AdaptiveDecisionIntegration();
