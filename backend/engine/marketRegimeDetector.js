/**
 * MarketRegimeDetector - Identifies current market conditions
 * 
 * Detects:
 * - TRENDING (strong directional bias)
 * - SIDEWAYS (consolidation, range-bound)
 * - VOLATILE (high swings, uncertain direction)
 * 
 * This determines which weight set to use for scoring
 */

class MarketRegimeDetector {
  constructor(options = {}) {
    this.adxThreshold = options.adxThreshold || 30; // ADX > 30 = trending
    this.volatilityThreshold = options.volatilityThreshold || 20; // volatility > 20% = volatile
    this.atrPeriod = options.atrPeriod || 14;
  }

  /**
   * Detect current regime based on market data
   * 
   * Expects: { adx, volatility, trend, priceStructure }
   */
  detectRegime(marketData) {
    const { adx = 0, volatility = 0, trend = 0, priceStructure = 'unknown' } = marketData;

    // Decision tree
    if (volatility > this.volatilityThreshold) {
      return {
        regime: 'VOLATILE',
        confidence: Math.min(1, (volatility - this.volatilityThreshold) / 20),
        description: `High volatility (${volatility.toFixed(1)}%) - expect wide swings`,
      };
    }

    if (adx > this.adxThreshold) {
      return {
        regime: 'TRENDING',
        confidence: Math.min(1, adx / 60),
        direction: trend > 0 ? 'UP' : 'DOWN',
        description: `Strong ${trend > 0 ? 'uptrend' : 'downtrend'} (ADX: ${adx.toFixed(1)})`,
      };
    }

    return {
      regime: 'SIDEWAYS',
      confidence: 0.5,
      description: 'Range-bound/consolidating market (ADX: ' + adx.toFixed(1) + ')',
    };
  }

  /**
   * Get optimal weights for each regime
   * 
   * Each regime has different factor importance:
   * - TRENDING: Trend matters most, volume confirms
   * - SIDEWAYS: Divergence and RSI work better
   * - VOLATILE: Volatility and risk management matter
   */
  getWeightsForRegime(regime) {
    const weights = {
      TRENDING: {
        trend: 0.35,
        momentum: 0.25,
        divergence: 0.10,
        rsi: 0.10,
        volume: 0.15,
        volatility: 0.05,
      },
      SIDEWAYS: {
        trend: 0.10,
        momentum: 0.15,
        divergence: 0.30,
        rsi: 0.30,
        volume: 0.10,
        volatility: 0.05,
      },
      VOLATILE: {
        trend: 0.20,
        momentum: 0.10,
        divergence: 0.15,
        rsi: 0.15,
        volume: 0.10,
        volatility: 0.30,
      },
    };

    return weights[regime] || weights.SIDEWAYS;
  }

  /**
   * Get risk adjustment for regime
   * In volatile markets, reduce position size or tighter stops
   */
  getRiskAdjustment(regime) {
    return {
      TRENDING: { positionSize: 1.0, stopLoss: 2.0 }, // Normal
      SIDEWAYS: { positionSize: 0.8, stopLoss: 1.5 }, // Slightly reduced
      VOLATILE: { positionSize: 0.5, stopLoss: 3.0 }, // Half size, wider stop
    }[regime] || { positionSize: 0.8, stopLoss: 2.0 };
  }

  /**
   * Calculate ADX (Average Directional Index) from price data
   * 
   * Simplified version: measures trend strength
   * ADX > 30: Strong trend
   * ADX < 20: Weak/no trend
   */
  calculateADX(candles) {
    if (!candles || candles.length < 14) return 20; // Default: no strong trend

    // Simplified ADX: use range and direction changes
    let trendStrength = 0;
    let directionChanges = 0;

    for (let i = 1; i < candles.length; i++) {
      const prevClose = candles[i - 1].close;
      const currClose = candles[i].close;
      
      const high = Math.max(candles[i].high, candles[i - 1].high);
      const low = Math.min(candles[i].low, candles[i - 1].low);
      const range = high - low;

      if (range > 0) {
        const direction = currClose > prevClose ? 1 : -1;
        trendStrength += Math.abs(currClose - prevClose) / range;
      }

      if (i > 1) {
        const prevClose2 = candles[i - 2].close;
        if ((currClose > prevClose && prevClose < prevClose2) ||
            (currClose < prevClose && prevClose > prevClose2)) {
          directionChanges++;
        }
      }
    }

    // ADX based on trend strength and change frequency
    const baseADX = (trendStrength / candles.length) * 100;
    const changeAdjustment = (directionChanges / candles.length) * 20;
    
    return Math.max(5, Math.min(100, baseADX - changeAdjustment));
  }

  /**
   * Calculate historical volatility
   */
  calculateVolatility(candles) {
    if (!candles || candles.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < candles.length; i++) {
      const ret = (candles[i].close - candles[i - 1].close) / candles[i - 1].close;
      returns.push(ret);
    }

    if (returns.length === 0) return 0;

    // Standard deviation of returns
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, ret) => a + Math.pow(ret - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Convert to annualized volatility
    return stdDev * Math.sqrt(252) * 100; // 252 trading days per year
  }

  /**
   * Detect trend direction
   */
  detectTrend(candles) {
    if (!candles || candles.length < 10) return 0;

    const closes = candles.map(c => c.close);
    const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, closes.length);
    const currentPrice = closes[closes.length - 1];

    return currentPrice > sma20 ? 1 : currentPrice < sma20 ? -1 : 0;
  }

  /**
   * Complete market analysis
   */
  analyzeMarket(candles) {
    const adx = this.calculateADX(candles);
    const volatility = this.calculateVolatility(candles);
    const trend = this.detectTrend(candles);

    const regime = this.detectRegime({ adx, volatility, trend });

    return {
      adx,
      volatility,
      trend,
      regime,
      weights: this.getWeightsForRegime(regime.regime),
      riskAdjustment: this.getRiskAdjustment(regime.regime),
    };
  }
}

module.exports = MarketRegimeDetector;
