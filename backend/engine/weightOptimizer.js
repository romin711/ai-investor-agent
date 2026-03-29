/**
 * WeightOptimizer - Learns optimal factor weights from historical trade data
 * 
 * Uses gradient-based learning (similar to logistic regression) to find weights
 * that best predict actual outcomes from historical factors.
 * 
 * Formula:
 *   predictedScore = w1*trend + w2*momentum + w3*divergence + w4*rsi + w5*volume + w6*volatility
 *   error = actualOutcome - predictedScore
 *   w_i = w_i + learningRate * error * feature_i
 */

const PerformanceLabeler = require('./performanceLabeler');
const fs = require('fs');
const path = require('path');

const WEIGHTS_STORAGE = path.join(__dirname, '../storage/learned_weights.json');

class WeightOptimizer {
  constructor(options = {}) {
    // Learning configuration
    this.learningRate = options.learningRate || 0.01;
    this.minTradesRequired = options.minTradesRequired || 30; // Don't update with <30 data points
    this.maxWeightChange = options.maxWeightChange || 0.05; // Limit per-update change
    this.regularization = options.regularization || 0.001; // Prevent overfitting
    
    // Factor names (must match tradeLogger.js features order)
    this.factorNames = [
      'trend',
      'momentum',
      'divergence',
      'rsi',
      'volume',
      'volatility',
    ];

    // Initialize with equal weights
    this.weights = this._loadWeights() || this._initializeWeights();
    
    // Track optimization history
    this.history = [];
    
    // Performance labeler for converting outcomes to labels
    this.labeler = new PerformanceLabeler();
  }

  /**
   * Optimize weights using recent trades
   * 
   * @param {array} trades - Trade objects with features, outcome, action
   * @returns {object} - Updated weights and improvement metrics
   */
  optimizeWeights(trades) {
    // Safety checks
    if (trades.length < this.minTradesRequired) {
      return {
        success: false,
        reason: `Need ${this.minTradesRequired} trades minimum, have ${trades.length}`,
        weights: this.weights,
      };
    }

    // Label the outcomes
    const labeledTrades = this.labeler.labelDataset(trades);
    
    // Filter to labeled (not neutral) trades only
    const strongSignals = labeledTrades.filter(t => t.labeled.label !== 0);
    
    if (strongSignals.length < this.minTradesRequired / 2) {
      return {
        success: false,
        reason: `Need ${this.minTradesRequired / 2} labeled signals, have ${strongSignals.length}`,
        weights: this.weights,
      };
    }

    // Calculate current prediction error
    const beforeError = this._calculateMeanSquaredError(strongSignals);
    
    // Update weights using gradient descent
    const oldWeights = { ...this.weights };
    this._updateWeights(strongSignals);
    
    // Check improvement
    const afterError = this._calculateMeanSquaredError(strongSignals);
    const improvement = beforeError - afterError;

    // Log history
    this.history.push({
      timestamp: Date.now(),
      tradeCount: trades.length,
      strongSignalCount: strongSignals.length,
      beforeError,
      afterError,
      improvement,
      oldWeights,
      newWeights: { ...this.weights },
      distribution: this.labeler.getLabelDistribution(strongSignals),
    });

    // Save to file
    this._saveWeights();

    return {
      success: true,
      improvement,
      beforeError,
      afterError,
      weights: this.weights,
      stats: this.labeler.getLabelDistribution(strongSignals),
    };
  }

  /**
   * Get current weights
   */
  getWeights() {
    return { ...this.weights };
  }

  /**
   * Get weights as object with factor names
   */
  getWeightsNamed() {
    const named = {};
    this.factorNames.forEach((name, i) => {
      named[name] = this.weights[i];
    });
    return named;
  }

  /**
   * Predict outcome based on features and current weights
   */
  predictOutcome(features) {
    if (!Array.isArray(features) || features.length !== this.weights.length) {
      throw new Error(
        `Expected ${this.weights.length} features, got ${features?.length}`
      );
    }

    let prediction = 0;
    for (let i = 0; i < this.weights.length; i++) {
      prediction += this.weights[i] * features[i];
    }
    return prediction;
  }

  /**
   * Get which factors are most important
   */
  getImportance() {
    const importance = this.factorNames.map((name, i) => ({
      factor: name,
      weight: this.weights[i],
      absoluteWeight: Math.abs(this.weights[i]),
    }));
    
    return importance.sort((a, b) => b.absoluteWeight - a.absoluteWeight);
  }

  /**
   * Explain a decision using current weights
   */
  explainDecision(features, action = 'BUY') {
    const contributions = this.factorNames.map((name, i) => ({
      factor: name,
      weight: this.weights[i],
      featureValue: features[i],
      contribution: this.weights[i] * features[i],
    }));

    contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    const topContributors = contributions.slice(0, 2);
    const topPositive = contributions.filter(c => c.contribution > 0)[0];
    const topNegative = contributions.filter(c => c.contribution < 0)[0];

    return {
      action,
      topContributors: topContributors.map(c => c.factor),
      reasoning: this._buildExplanation(topPositive, topNegative),
      allContributions: contributions,
    };
  }

  /**
   * Reset to default equal weights
   */
  resetWeights() {
    this.weights = this._initializeWeights();
    this._saveWeights();
  }

  /**
   * Get optimization history
   */
  getHistory(limit = 10) {
    return this.history.slice(-limit);
  }

  // PRIVATE METHODS

  _initializeWeights() {
    // Start with equal weights (1/n for each factor)
    const n = this.factorNames.length;
    return Array(n).fill(1 / n);
  }

  _updateWeights(trades) {
    const gradients = Array(this.weights.length).fill(0);
    const n = trades.length;

    // Calculate gradients
    for (const trade of trades) {
      const features = trade.features; // Assume [trend, momentum, divergence, rsi, volume, volatility]
      const actual = trade.labeled.label; // -1, 0, or 1
      const strength = trade.labeled.strength; // 0-1 confidence
      
      const predicted = this.predictOutcome(features);
      const error = actual - predicted;

      // Accumulate gradient: error * feature * strength (weighted by confidence)
      for (let i = 0; i < this.weights.length; i++) {
        gradients[i] += (error * features[i] * strength) / n;
      }
    }

    // Apply regularization (L2 penalty to prevent overfitting)
    for (let i = 0; i < this.weights.length; i++) {
      gradients[i] -= this.regularization * this.weights[i];
    }

    // Update weights with gradient clipping
    for (let i = 0; i < this.weights.length; i++) {
      const clipped = Math.clip(gradients[i], -this.maxWeightChange, this.maxWeightChange);
      this.weights[i] += this.learningRate * clipped;
    }

    // Normalize weights (sum to 1)
    this._normalizeWeights();
  }

  _normalizeWeights() {
    const sum = this.weights.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      this.weights = this.weights.map(w => w / sum);
    }

    // Clamp to [0, 1]
    this.weights = this.weights.map(w => Math.max(0, Math.min(1, w)));
  }

  _calculateMeanSquaredError(trades) {
    let totalError = 0;
    for (const trade of trades) {
      const predicted = this.predictOutcome(trade.features);
      const actual = trade.labeled.label;
      const strength = trade.labeled.strength;
      totalError += Math.pow(actual - predicted, 2) * strength;
    }
    return totalError / trades.length;
  }

  _buildExplanation(topPositive, topNegative) {
    let explanation = 'Decision driven by';
    const factors = [];

    if (topPositive) {
      factors.push(`${topPositive.factor} (+${topPositive.contribution.toFixed(2)})`);
    }
    if (topNegative) {
      factors.push(`${topNegative.factor} (${topNegative.contribution.toFixed(2)})`);
    }

    return explanation + ' ' + factors.join(' and ');
  }

  _loadWeights() {
    try {
      if (fs.existsSync(WEIGHTS_STORAGE)) {
        const data = JSON.parse(fs.readFileSync(WEIGHTS_STORAGE, 'utf8'));
        return data.weights || null;
      }
    } catch (err) {
      console.error('Error loading weights:', err);
    }
    return null;
  }

  _saveWeights() {
    try {
      const data = {
        timestamp: Date.now(),
        weights: this.weights,
        named: this.getWeightsNamed(),
        importance: this.getImportance(),
      };
      fs.writeFileSync(WEIGHTS_STORAGE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error saving weights:', err);
    }
  }
}

// Helper: Math.clip not available in older Node
if (!Math.clip) {
  Math.clip = (value, min, max) => Math.max(min, Math.min(max, value));
}

module.exports = WeightOptimizer;
