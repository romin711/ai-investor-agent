/**
 * PerformanceLabeler - Converts outcomes into learning labels
 * 
 * Transforms continuous outcome values into discrete labels:
 * +1 (correct signal), -1 (wrong signal), 0 (neutral/noise)
 * 
 * Using thresholds helps the learning algorithm focus on meaningful hits/misses
 */

class PerformanceLabeler {
  constructor(options = {}) {
    // Thresholds for what counts as a "good" or "bad" outcome
    this.positiveThreshold = options.positiveThreshold || 2.0; // Need +2% to count as good BUY
    this.negativeThreshold = options.negativeThreshold || -2.0; // Need -2% to count as good SELL
    this.neutralZone = options.neutralZone || [-2.0, 2.0]; // Between these = noise
  }

  /**
   * Convert outcome % to label
   * 
   * @param {number} outcome - Percentage return (positive or negative)
   * @param {string} action - The action taken ("BUY", "SELL", "HOLD")
   * @returns {object} - { label, strength, reasoning }
   */
  labelOutcome(outcome, action = 'HOLD') {
    let label = 0;
    let strength = 0; // How confident in the label (0-1)
    let reasoning = 'Neutral outcome - likely noise';

    if (action === 'BUY') {
      if (outcome > this.positiveThreshold) {
        label = 1; // Correct bullish call
        strength = Math.min(1, (outcome - this.positiveThreshold) / 5); // Stronger if bigger gains
        reasoning = `Correct BUY signal: +${outcome.toFixed(2)}%`;
      } else if (outcome < this.negativeThreshold) {
        label = -1; // Wrong bullish call
        strength = Math.min(1, Math.abs(outcome - this.negativeThreshold) / 5);
        reasoning = `Failed BUY signal: ${outcome.toFixed(2)}%`;
      }
    } else if (action === 'SELL') {
      if (outcome < this.negativeThreshold) {
        label = 1; // Correct bearish call
        strength = Math.min(1, (Math.abs(outcome) - Math.abs(this.negativeThreshold)) / 5);
        reasoning = `Correct SELL signal: ${outcome.toFixed(2)}%`;
      } else if (outcome > this.positiveThreshold) {
        label = -1; // Wrong bearish call
        strength = Math.min(1, (outcome - this.positiveThreshold) / 5);
        reasoning = `Failed SELL signal: +${outcome.toFixed(2)}%`;
      }
    }

    return {
      label, // -1 | 0 | +1
      strength, // 0-1 confidence in label
      reasoning,
      thresholdInfo: {
        positiveThreshold: this.positiveThreshold,
        negativeThreshold: this.negativeThreshold,
      },
    };
  }

  /**
   * Batch label a dataset
   */
  labelDataset(trades) {
    return trades.map(trade => ({
      ...trade,
      labeled: this.labelOutcome(trade.outcome, trade.action),
    }));
  }

  /**
   * Get statistics about label distribution
   */
  getLabelDistribution(trades) {
    const labeled = this.labelDataset(trades);
    const counts = { '-1': 0, '0': 0, '1': 0 };
    let totalStrength = 0;

    labeled.forEach(t => {
      const label = t.labeled.label;
      counts[label]++;
      totalStrength += t.labeled.strength;
    });

    return {
      correct: counts['1'],
      incorrect: counts['-1'],
      neutral: counts['0'],
      totalTrades: trades.length,
      distribution: {
        correctPercent: (counts['1'] / trades.length) * 100,
        incorrectPercent: (counts['-1'] / trades.length) * 100,
        neutralPercent: (counts['0'] / trades.length) * 100,
      },
      avgSignalStrength: totalStrength / trades.length,
    };
  }

  /**
   * Set custom thresholds (for market regime adaptation)
   */
  setThresholds(positiveThreshold, negativeThreshold) {
    this.positiveThreshold = positiveThreshold;
    this.negativeThreshold = negativeThreshold;
  }

  /**
   * Get healthy thresholds based on market volatility
   * 
   * In high volatility markets, you need bigger moves to count as "correct"
   */
  static getThresholdsForVolatility(volatility) {
    // volatility: 0-100
    if (volatility < 15) {
      // Low volatility - tight signals
      return { positive: 1.0, negative: -1.0 };
    } else if (volatility < 30) {
      // Normal
      return { positive: 2.0, negative: -2.0 };
    } else {
      // High volatility - need bigger moves to count
      return { positive: 4.0, negative: -4.0 };
    }
  }
}

module.exports = PerformanceLabeler;
