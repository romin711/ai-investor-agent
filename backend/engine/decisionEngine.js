/**
 * Decision Engine (Refactored)
 * Responsibility: Unified orchestration of all decision pathways
 * Input: Symbol + market context
 * Output: Complete decision structure with raw signal, final action, quality score, execution reason
 */

const marketDataService = require('./marketDataService');
const featureEngine = require('./featureEngine');
const signalEngine = require('./signalEngine');
const dataQualityEngine = require('./dataQualityEngine');
const policyEngine = require('./policyEngine');
const patternIntelligence = require('./patternIntelligence');
const { generateMockSignal, buildMockMarketData, SCENARIO_MAP } = require('./mockSignalGenerator');

const USE_MOCK_SIGNALS = String(process.env.USE_MOCK_SIGNALS || '').toLowerCase() === 'true';
const DECISION_TRACE_LOGS = String(process.env.DECISION_TRACE_LOGS || 'false').toLowerCase() === 'true';

/**
 * MASTER: Make complete decision for a symbol
 * @param {string} symbol - Stock symbol
 * @param {Object} options - {portfolio, sectorMap, riskMetrics, marketContext}
 * @returns {Promise<{symbol, rawSignal, finalAction, confidence, dataQuality, executionThreshold, policyReason, rawReason, warning-signals}>}
 */
async function makeDecision(symbol, options = {}) {
  const startTime = Date.now();
  const useMockSignals = options.useMockSignals ?? (USE_MOCK_SIGNALS && !options.marketData);

  try {
    // Step 1: Fetch market data (NO processing, NO defaults) OR build deterministic mock market state.
    let marketData = null;
    let features = null;
    let patterns = null;
    let mockSignal = null;

    if (useMockSignals) {
      mockSignal = generateMockSignal(symbol);
      marketData = buildMockMarketData(symbol, mockSignal);

      if (DECISION_TRACE_LOGS) {
        // eslint-disable-next-line no-console
        console.log('MOCK INPUT:', symbol, mockSignal);
      }

      features = {
        rsi: mockSignal.rsi,
        trendStrength: mockSignal.trendScore,
        volatility: mockSignal.volatility,
        momentum: mockSignal.momentum,
        divergence: mockSignal.divergence,
        volume: mockSignal.volume,
        confidence: 1,
        hasInsufficientData: false,
        availablePoints: marketData.dataPoints,
      };

      if (mockSignal.scenario === 'CONFLICT_REVERSAL') {
        patterns = {
          type: 'bullish-divergence',
          label: 'Bullish Divergence',
          breakoutDetected: false,
        };
      } else if (mockSignal.scenario === 'BREAKOUT') {
        patterns = {
          type: 'bullish-breakout',
          label: 'Bullish Breakout',
          breakoutDetected: true,
        };
      } else {
        patterns = {
          type: 'none',
          label: '',
          breakoutDetected: false,
        };
      }
    } else {
      marketData = options.marketData || await marketDataService.getHistoricalData(symbol);
    }

    // Step 2: Check data sufficiency (determines if we can proceed)
    const dataSufficiency = marketDataService.evaluateDataSufficiency(marketData);
    if (!dataSufficiency.hasMinData) {
      return {
        symbol,
        rawSignal: null,
        finalAction: null,
        confidence: null,
        dataQuality: {
          quality: 0,
          reason: `Insufficient data (${dataSufficiency.dataPoints}/${dataSufficiency.minBarsRequired} bars)`,
        },
        executionThreshold: 'REJECT',
        policyReason: 'Cannot proceed without minimum data',
        warning: true,
        warningSignals: [`Only ${dataSufficiency.dataPoints} bars available (need ${dataSufficiency.minBarsRequired})`],
        processingMs: Date.now() - startTime,
      };
    }

    // Step 3: Compute technical features (returns NULLs if data quality issues exist)
    if (!features) {
      features = featureEngine.computeFeatures(marketData.closes, dataSufficiency.dataPoints);
    }

    // Step 4: Detect patterns
    if (!patterns) {
      const patternAnalysis = patternIntelligence.analyzePatternIntelligence(
        marketData.historical || [],
        marketData.latestPrice
      );
      const detectedPattern = Array.isArray(patternAnalysis?.detectedPatterns)
        ? patternAnalysis.detectedPatterns.find((item) => item?.detected)
        : null;
      patterns = {
        type: String(detectedPattern?.pattern || 'none'),
        label: String(detectedPattern?.label || ''),
        breakoutDetected: Boolean(patternAnalysis?.breakoutDetected),
      };
    }

    // Step 5: Data quality assessment (quality multiplier 0-1)
    const dataQuality = dataQualityEngine.computeDataQuality(marketData, features);

    if (DECISION_TRACE_LOGS) {
      // eslint-disable-next-line no-console
      console.log('FINAL FEATURES:', symbol, {
        trendScore: features?.trendStrength ?? null,
        rsi: features?.rsi ?? null,
        divergence: features?.divergence ?? null,
        volume: features?.volume ?? null,
        volatility: features?.volatility ?? null,
      });
    }

    // Step 6: Generate raw signal (pure technical, no constraints)
    const rawSignalResult = signalEngine.generateRawSignal(features, marketData.closes, patterns, {
      dataQualityScore: dataQuality.quality,
      historical: marketData.historical,
    });

    if (DECISION_TRACE_LOGS) {
      // eslint-disable-next-line no-console
      console.log('FINAL SCORE:', symbol, rawSignalResult.score, rawSignalResult.probability);
    }

    // Step 7: Apply data quality to confidence (reduces confidence if data quality low)
    const qualityAdjustedConfidence = rawSignalResult.confidence;

    // Step 8: Evaluate execution policies (sector, position, risk)
    const policyResult = policyEngine.evaluateExecutionPolicy(rawSignalResult.rawSignal, {
      symbol,
      portfolio: options.portfolio || {},
      sectorMap: options.sectorMap || {},
      riskMetrics: options.riskMetrics || {},
    });

    // Step 9: Determine execution threshold
    let executionThreshold = 'ACCEPT';
    let warningSignals = [];

    // Low data quality warning
    if (dataQuality.quality < 0.5) {
      warningSignals.push(`Low data quality (${(dataQuality.quality * 100).toFixed(0)}%)`);
      executionThreshold = 'CAUTION';
    }

    // Low confidence warning
    if (qualityAdjustedConfidence !== null && qualityAdjustedConfidence < 0.4) {
      warningSignals.push(`Low confidence signal (${(qualityAdjustedConfidence * 100).toFixed(0)}%)`);
      executionThreshold = 'CAUTION';
    }

    // No clear signal warning
    if (rawSignalResult.signalType === 'no-clear-signal' || rawSignalResult.signalType === 'insufficient-data') {
      warningSignals.push('No clear technical signal');
      executionThreshold = 'CAUTION';
    }

    // Policy rejection
    if (!policyResult.allowed) {
      warningSignals.push('Policy constraints violated');
      executionThreshold = 'REJECT';
    }

    return {
      symbol,
      rawSignal: rawSignalResult.rawSignal,
      finalAction: policyResult.finalAction,
      confidence: qualityAdjustedConfidence, // Quality-adjusted confidence
      rawConfidence: rawSignalResult.confidence, // Original signal confidence (for transparency)
      dataQuality: {
        quality: dataQuality.quality,
        components: dataQuality.components,
        reason: dataQuality.reason,
      },
      signalDetails: {
        type: rawSignalResult.signalType,
        factors: rawSignalResult.factors,
        agreement: rawSignalResult.signalAgreement || null,
      },
      weightedModel: {
        label: rawSignalResult.label,
        score: rawSignalResult.score,
        probability: rawSignalResult.probability,
        hasConflict: rawSignalResult.hasConflict,
        warnings: rawSignalResult.warnings,
        explanation: rawSignalResult.explanation,
      },
      executionThreshold,
      policyReason: policyResult.executionReason,
      rawReason: rawSignalResult.reason,
      warning: warningSignals.length > 0,
      warningSignals,
      marketData: {
        latestPrice: marketData.latestPrice,
        latestTimestamp: marketData.latestTimestamp,
        dataPoints: marketData.dataPoints,
      },
      mockSignal: useMockSignals
        ? {
            enabled: true,
            scenario: mockSignal?.scenario || SCENARIO_MAP[String(symbol || '').toUpperCase()] || null,
            factors: {
              trendScore: mockSignal?.trendScore ?? null,
              rsi: mockSignal?.rsi ?? null,
              divergence: mockSignal?.divergence ?? null,
              volume: mockSignal?.volume ?? null,
              volatility: mockSignal?.volatility ?? null,
            },
          }
        : {
            enabled: false,
            scenario: null,
            factors: null,
          },
      processingMs: Date.now() - startTime,
    };
  } catch (err) {
    console.error(`DecisionEngine error for ${symbol}:`, err.message);
    return {
      symbol,
      rawSignal: null,
      finalAction: null,
      confidence: null,
      dataQuality: { quality: 0, reason: 'Error computing data quality' },
      executionThreshold: 'REJECT',
      policyReason: 'Error during decision',
      error: err.message,
      processingMs: Date.now() - startTime,
    };
  }
}

/**
 * BACKWARD COMPATIBILITY: Legacy evaluateDecision for pipeline.js
 * This is a simplified synchronous version for the existing pipeline
 * NEW CODE should use makeDecision() instead
 */
function evaluateDecision(input) {
  const technicalScore = Number.isFinite(input?.technicalScore) ? input.technicalScore : null;
  const portfolioAdjustment = Number.isFinite(input?.portfolioAdjustment) ? input.portfolioAdjustment : null;
  const rsi = Number.isFinite(input?.rsi) ? input.rsi : null;
  const price = Number.isFinite(input?.price) ? input.price : null;
  const ma50 = Number.isFinite(input?.ma50) ? input.ma50 : null;

  if (technicalScore === null || portfolioAdjustment === null) {
    return {
      finalScore: null,
      decision: 'HOLD',
      confidence: 'low',
      reason: 'Insufficient data',
    };
  }

  const finalScore = technicalScore + portfolioAdjustment;

  let decision = 'HOLD';
  if (finalScore >= 2.2) {
    decision = 'BUY';
  } else if (finalScore <= -2.2) {
    decision = 'SELL';
  }

  let confidence = Math.abs(finalScore) * 20;

  if (rsi !== null && rsi >= 42 && rsi <= 58) {
    confidence -= 10;
  }
  if (price !== null && ma50 !== null && ma50 > 0) {
    const trendDiff = Math.abs((price - ma50) / ma50) * 100;
    if (trendDiff < 0.8) {
      confidence -= 10;
    }
  }

  confidence = Math.max(10, Math.min(90, Math.round(confidence)));

  return {
    finalScore,
    decision,
    confidence,
    reason: null,
  };
}

module.exports = {
  makeDecision,
  evaluateDecision,
};
