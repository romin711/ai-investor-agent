/**
 * TradeLogger - Tracks signals and outcomes for performance learning
 * 
 * Stores detailed information about every signal generated and its eventual outcome.
 * Used by WeightOptimizer to learn which factors predict real returns.
 */

const fs = require('fs');
const path = require('path');

const TRADE_LOG_FILE = path.join(__dirname, '../storage/trade_log.json');
const MAX_LOG_SIZE = 5000; // Keep most recent 5000 trades

class TradeLogger {
  constructor() {
    this.trades = this._loadTradeLog();
  }

  /**
   * Log a NEW signal that was executed
   * 
   * Call this when a BUY/SELL signal is acted upon
   */
  logSignal(signal) {
    const trade = {
      id: `${Date.now()}-${Math.random()}`,
      symbol: signal.symbol,
      timestamp: Date.now(),
      date: new Date().toISOString(),
      
      // The signal that triggered this trade
      action: signal.action, // "BUY" | "SELL" | "HOLD"
      confidence: signal.confidence || 0.5,
      
      // Individual factor scores at time of signal
      features: {
        trendScore: signal.trendScore || 0,
        momentumScore: signal.momentumScore || 0,
        divergenceScore: signal.divergenceScore || 0,
        rsiScore: signal.rsiScore || 0,
        volumeScore: signal.volumeScore || 0,
        volatilityScore: signal.volatilityScore || 0,
        breakoutScore: signal.breakoutScore || 0,
      },
      
      // Final composite score
      finalScore: signal.score || 0,
      
      // Price at entry
      entryPrice: signal.entryPrice,
      entryTime: Date.now(),
      
      // Will be updated later when position closes
      exitPrice: null,
      exitTime: null,
      outcome: null, // % return (positive or negative)
      holdingPeriod: null, // days
      
      // Market context
      regime: signal.regime || 'unknown',
      marketVolatility: signal.marketVolatility || 0,
      marketTrend: signal.marketTrend || 'unknown',
      
      // Status tracking
      status: 'open', // "open" | "closed" | "stopped_out"
      notes: signal.notes || '',
    };

    this.trades.push(trade);
    this._trimAndSave();
    
    return trade;
  }

  /**
   * Update a trade with outcome when position closes
   */
  updateTradeOutcome(tradeId, exitPrice, exitTime = Date.now()) {
    const trade = this.trades.find(t => t.id === tradeId);
    if (!trade) {
      console.warn(`Trade not found: ${tradeId}`);
      return null;
    }

    const holdingDays = (exitTime - trade.entryTime) / (1000 * 60 * 60 * 24);
    const outcome = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100;

    trade.exitPrice = exitPrice;
    trade.exitTime = exitTime;
    trade.outcome = outcome;
    trade.holdingPeriod = holdingDays;
    trade.status = 'closed';

    this._trimAndSave();
    return trade;
  }

  /**
   * Get recent N trades for analysis
   */
  getRecentTrades(count = 100) {
    return this.trades.slice(-count);
  }

  /**
   * Get trades by status
   */
  getTradesByStatus(status = 'closed') {
    return this.trades.filter(t => t.status === status);
  }

  /**
   * Get trades for a specific symbol
   */
  getTradesBySymbol(symbol) {
    return this.trades.filter(t => t.symbol === symbol);
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    const closedTrades = this.getTradesByStatus('closed');
    
    if (closedTrades.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        avgReturn: 0,
        maxReturn: 0,
        minReturn: 0,
        profitFactor: 0,
      };
    }

    const outcomes = closedTrades.map(t => t.outcome);
    const wins = outcomes.filter(o => o > 0).length;
    const losses = outcomes.filter(o => o < 0).length;
    const totalGains = outcomes.filter(o => o > 0).reduce((a, b) => a + b, 0);
    const totalLosses = Math.abs(
      outcomes.filter(o => o < 0).reduce((a, b) => a + b, 0)
    );

    return {
      totalTrades: closedTrades.length,
      winRate: (wins / closedTrades.length) * 100,
      wins,
      losses,
      avgReturn: outcomes.reduce((a, b) => a + b, 0) / outcomes.length,
      maxReturn: Math.max(...outcomes),
      minReturn: Math.min(...outcomes),
      profitFactor: totalLosses > 0 ? totalGains / totalLosses : totalGains,
    };
  }

  /**
   * Export trades as dataset for ML training
   * Returns array of {features, label} pairs
   */
  exportAsDataset() {
    const closedTrades = this.getTradesByStatus('closed').filter(
      t => t.outcome !== null
    );

    return closedTrades.map(trade => ({
      symbol: trade.symbol,
      timestamp: trade.timestamp,
      features: [
        trade.features.trendScore,
        trade.features.momentumScore,
        trade.features.divergenceScore,
        trade.features.rsiScore,
        trade.features.volumeScore,
        trade.features.volatilityScore,
      ],
      finalScore: trade.finalScore,
      outcome: trade.outcome,
      label: trade.outcome > 2 ? 1 : trade.outcome < -2 ? -1 : 0, // +1: good, -1: bad, 0: neutral
      confidence: trade.confidence,
      holdingPeriod: trade.holdingPeriod,
    }));
  }

  /**
   * Clear all trades (use with caution)
   */
  clearTradeLog() {
    this.trades = [];
    this._save();
  }

  // PRIVATE METHODS

  _loadTradeLog() {
    try {
      if (fs.existsSync(TRADE_LOG_FILE)) {
        const data = fs.readFileSync(TRADE_LOG_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('Error loading trade log:', err);
    }
    return [];
  }

  _trimAndSave() {
    // Keep only most recent trades
    if (this.trades.length > MAX_LOG_SIZE) {
      this.trades = this.trades.slice(-MAX_LOG_SIZE);
    }
    this._save();
  }

  _save() {
    try {
      fs.writeFileSync(TRADE_LOG_FILE, JSON.stringify(this.trades, null, 2));
    } catch (err) {
      console.error('Error saving trade log:', err);
    }
  }
}

module.exports = new TradeLogger();
