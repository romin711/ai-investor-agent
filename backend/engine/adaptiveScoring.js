/**
 * AdaptiveScoring - Main engine that uses learned weights and market regime
 * 
 * This replaces the static scoring in indicatorService.js
 * It uses:
 * - Dynamically learned weights from WeightOptimizer
 * - Market regime-specific weights
 * - Confidence calibration based on historical accuracy
 */

const WeightOptimizer = require('./weightOptimizer');
const MarketRegimeDetector = require('./marketRegimeDetector');
const confidenceCalibrator = require('./confidenceCalibrator');
const tradeLogger = require('./tradeLogger');
const PerformanceLabeler = require('./performanceLabeler');

class AdaptiveScoring {
  constructor(options = {}) {
    this.weightOptimizer = new WeightOptimizer(options);
    this.regimeDetector = new MarketRegimeDetector(options);
    this.labeler = new PerformanceLabeler(options);
    
    this.factorNames = [
      'trend',
      'momentum',
      'divergence',
      'rsi',
      'volume',
      'volatility',
    ];
    
    // Configuration
    this.autoOptimize = options.autoOptimize !== false; // Auto-update weights every N trades
    this.optimizationInterval = options.optimizationInterval || 20; // Every 20 new trades
    this.explainMode = options.explainMode !== false; // Include explanation in output
    
    this.lastOptimizationTradeCount = 0;
  }

  /**
   * Score a signal adaptively using learned weights and market regime
   * 
   * Inputs:
   * - symbol: stock ticker
   * - features: [trend, momentum, divergence, rsi, volume, volatility]
   * - candles: price history (for regime detection)
   * - baseConfidence: raw signal confidence (0-1)
   * 
   * Outputs:
   * - finalScore: composite score
   * - probability: confidence-adjusted probability
   * - decision: "BUY" | "SELL" | "HOLD"
   * - explanation: human-readable reasoning
   */
  scoreSignal(signal) {
    const {
      symbol,
      features,
      candles,
      baseConfidence = 0.5,
    } = signal;

    // Validate inputs
    if (!Array.isArray(features) || features.length !== this.factorNames.length) {
      throw new Error(`Expected ${this.factorNames.length} features`);
    }

    // Run automatic weight optimization if threshold reached
    this._checkAndOptimizeWeights();

    // Step 1: Analyze market regime
    const marketAnalysis = this.regimeDetector.analyzeMarket(candles || []);
    
    // Step 2: Get weights (learned weights + regime adjustment)
    let weights = this.weightOptimizer.getWeights();
    
    // Apply regime-specific adjustment (blend)
    if (marketAnalysis.regime.regime !== 'SIDEWAYS') {
      const regimeWeights = this.regimeDetector.getWeightsForRegime(
        marketAnalysis.regime.regime
      );
      weights = this._blendWeights(weights, regimeWeights, 0.3); // 30% regime influence
    }

    // Step 3: Calculate score using adaptive weights
    let finalScore = 0;
    const contributions = [];

    for (let i = 0; i < this.factorNames.length; i++) {
      const contribution = weights[i] * features[i];
      finalScore += contribution;
      contributions.push({
        factor: this.factorNames[i],
        weight: weights[i],
        value: features[i],
        contribution,
      });
    }

    // Normalize score to [-1, 1] range
    const normalizedScore = Math.tanh(finalScore / 3); // Tanh squashes to [-1, 1]

    // Step 4: Make decision
    const decisionThreshold = 0.3;
    let decision = 'HOLD';
    if (normalizedScore > decisionThreshold) {
      decision = 'BUY';
    } else if (normalizedScore < -decisionThreshold) {
      decision = 'SELL';
    }

    // Step 5: Calibrate confidence
    const factorWeightsObject = {};
    this.factorNames.forEach((name, i) => {
      factorWeightsObject[name] = weights[i];
    });

    const calibration = confidenceCalibrator.calibrateConfidence(
      baseConfidence,
      decision,
      symbol,
      factorWeightsObject
    );

    // Step 6: Apply risk adjustment for regime
    const riskAdjustment = marketAnalysis.riskAdjustment;

    // Build response
    const response = {
      symbol,
      decision,
      finalScore: normalizedScore,
      baseConfidence,
      probability: calibration.calibratedConfidence,
      
      // Regime information
      regime: marketAnalysis.regime.regime,
      regimeConfidence: marketAnalysis.regime.confidence,
      marketVolatility: marketAnalysis.volatility,
      adx: marketAnalysis.adx,
      
      // Weights used
      weightsUsed: factorWeightsObject,
      
      // Top contributors
      topContributors: contributions
        .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
        .slice(0, 3)
        .map(c => c.factor),
      
      // Risk management
      positionSizeAdjustment: riskAdjustment.positionSize,
      stopLossPoints: riskAdjustment.stopLoss,
      
      // Explainability
      explanation: this._buildExplanation(decision, contributions, marketAnalysis),
      calibrationDetails: calibration,
    };

    // Only include verbose details if explainMode is on
    if (this.explainMode) {
      response.allContributions = contributions;
      response.weightOptimizationNeeded = 
        tradeLogger.getRecentTrades().length - this.lastOptimizationTradeCount 
        >= this.optimizationInterval;
    }

    return response;
  }

  /**
   * Get current learned weights
   */
  getWeights() {
    return this.weightOptimizer.getWeightsNamed();
  }

  /**
   * Manually trigger weight optimization
   */
  optimizeWeights() {
    const trades = tradeLogger.getRecentTrades(200);
    const result = this.weightOptimizer.optimizeWeights(trades);
    
    if (result.success) {
      this.lastOptimizationTradeCount = trades.length;
    }
    
    return result;
  }

  /**
   * Get weight optimization history
   */
  getOptimizationHistory(limit = 10) {
    return this.weightOptimizer.getHistory(limit);
  }

  /**
   * Get performance analysis
   */
  getPerformanceAnalysis() {
    const trades = tradeLogger.getRecentTrades(100);
    const closedTrades = trades.filter(t => t.status === 'closed');
    
    return {
      totalTrades: trades.length,
      closedTrades: closedTrades.length,
      openTrades: trades.length - closedTrades.length,
      stats: tradeLogger.getPerformanceStats(),
      weights: this.getWeights(),
      optimalWeights: this.weightOptimizer.getImportance(),
    };
  }

  /**
   * Export trades as ML dataset
   */
  exportDataset() {
    const dataset = tradeLogger.exportAsDataset();
    return {
      count: dataset.length,
      features: this.factorNames,
      data: dataset,
    };
  }

  // PRIVATE METHODS

  _checkAndOptimizeWeights() {
    if (!this.autoOptimize) return;

    const totalTrades = tradeLogger.getRecentTrades().length;
    const newTrades = totalTrades - this.lastOptimizationTradeCount;

    if (newTrades >= this.optimizationInterval) {
      try {
        this.optimizeWeights();
      } catch (err) {
        console.error('Weight optimization error:', err);
      }
    }
  }

  _blendWeights(learnedWeights, regimeWeights, regimeInfluence = 0.3) {
    const blended = learnedWeights.map((learned, i) => {
      const regimeWeight = Object.values(regimeWeights)[i] || 0;
      return (learned * (1 - regimeInfluence)) + (regimeWeight * regimeInfluence);
    });

    // Normalize to sum to 1
    const sum = blended.reduce((a, b) => a + b, 0);
    return sum > 0 ? blended.map(w => w / sum) : learnedWeights;
  }

  _buildExplanation(decision, contributions, marketAnalysis) {
    const topPositive = contributions
      .filter(c => c.contribution > 0)
      .sort((a, b) => b.contribution - a.contribution)[0];
    
    const topNegative = contributions
      .filter(c => c.contribution < 0)
      .sort((a, b) => a.contribution - b.contribution)[0];

    let explanation = `${decision} signal driven by `;
    const factors = [];

    if (topPositive) {
      factors.push(`${topPositive.factor} (+${topPositive.contribution.toFixed(2)})`);
    }
    if (topNegative) {
      factors.push(`${topNegative.factor} (${topNegative.contribution.toFixed(2)})`);
    }

    explanation += factors.join(' and ');
    explanation += ` in ${marketAnalysis.regime.regime} market`;

    return explanation;
  }
}

module.exports = AdaptiveScoring;
