/**
 * AdaptiveScoring API Routes
 * 
 * Exposes the adaptive learning system to the frontend for:
 * - Displaying current learned weights
 * - Showing optimization history
 * - Viewing trade outcomes and performance
 * - Exporting data for ML analysis
 */

const express = require('express');
const adaptiveIntegration = require('./adaptiveDecisionIntegration');

const router = express.Router();

/**
 * GET /api/adaptive/weights
 * 
 * Get current learned weights
 */
router.get('/weights', (req, res) => {
  try {
    const weights = adaptiveIntegration.adaptiveScoring.getWeights();
    const importance = adaptiveIntegration.adaptiveScoring.weightOptimizer.getImportance();
    
    res.json({
      success: true,
      weights,
      importance,
      timestamp: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/adaptive/performance
 * 
 * Get comprehensive performance metrics
 */
router.get('/performance', (req, res) => {
  try {
    const metrics = adaptiveIntegration.getSystemMetrics();
    const stats = adaptiveIntegration.getPerformanceStats();
    
    res.json({
      success: true,
      metrics,
      stats,
      timestamp: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/adaptive/trades
 * 
 * Get recent trade outcomes
 * 
 * Query params:
 * - limit: number of trades (default 50)
 * - status: "open" | "closed" | all
 */
router.get('/trades', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status; // optional filter
    
    let trades = adaptiveIntegration.getRecentOutcomes(limit);
    
    if (status) {
      trades = trades.filter(t => t.status === status);
    }
    
    res.json({
      success: true,
      trades,
      count: trades.length,
      timestamp: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/adaptive/optimization-history
 * 
 * Get weight optimization history
 * 
 * Query params:
 * - limit: number of updates (default 10)
 */
router.get('/optimization-history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = adaptiveIntegration.adaptiveScoring.getOptimizationHistory(limit);
    
    res.json({
      success: true,
      history,
      count: history.length,
      timestamp: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/adaptive/optimize
 * 
 * Manually trigger weight optimization
 */
router.post('/optimize', (req, res) => {
  try {
    const result = adaptiveIntegration.optimizeWeights();
    
    res.json({
      success: result.success,
      result,
      timestamp: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/adaptive/dataset
 * 
 * Export trades as ML training dataset
 * 
 * Returns:
 * - Array of {features, label, symbol, outcome, ...}
 * - Formatted for ML model training
 */
router.get('/dataset', (req, res) => {
  try {
    const dataset = adaptiveIntegration.exportTrainingData();
    
    res.json({
      success: true,
      dataset,
      count: dataset.count,
      timestamp: Date.now(),
      instructions: {
        format: 'Each item has features array and label (-1, 0, 1)',
        features: 'trend, momentum, divergence, rsi, volume, volatility',
        label: '+1 = correct signal, -1 = wrong signal, 0 = neutral',
        nextStep: 'Export as CSV and train XGBoost or Logistic Regression',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/adaptive/analysis
 * 
 * Get full adaptive system analysis
 */
router.get('/analysis', (req, res) => {
  try {
    const weights = adaptiveIntegration.adaptiveScoring.getWeights();
    const importance = adaptiveIntegration.adaptiveScoring.weightOptimizer.getImportance();
    const performance = adaptiveIntegration.getSystemMetrics();
    const stats = adaptiveIntegration.getPerformanceStats();
    
    res.json({
      success: true,
      summary: {
        totalTrades: stats.totalTrades,
        winRate: stats.winRate,
        profitFactor: stats.profitFactor,
        avgReturn: stats.avgReturn,
      },
      weights,
      importance,
      performance,
      timestamp: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/adaptive/reset-weights
 * 
 * Reset learned weights to initial state (use with caution)
 */
router.post('/reset-weights', (req, res) => {
  try {
    adaptiveIntegration.adaptiveScoring.weightOptimizer.resetWeights();
    
    res.json({
      success: true,
      message: 'Weights reset to default equal distribution',
      weights: adaptiveIntegration.adaptiveScoring.getWeights(),
      timestamp: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
