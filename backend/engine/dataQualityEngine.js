/**
 * Data Quality Engine (NEW)
 * Responsibility: Score data completeness and freshness
 * Output multiplies final confidence; NEVER used to fabricate signals or defaults
 */

/**
 * Score data completeness (0-1)
 * Measures: data points, bar continuity, recent data freshness
 * @param {Object} data - from marketDataService.getHistoricalData
 * @returns {{completeness: 0-1, points: count, continuity: 0-1, freshness: 0-1, reason: string}}
 */
function scoreDataCompleteness(data) {
  if (!data) {
    return {
      completeness: 0,
      points: 0,
      continuity: 0,
      freshness: 0,
      reason: 'No data available',
    };
  }

  const { dataPoints = 0, closes = [], historical = [], latestTimestamp } = data;

  // Point completeness: 0.5 @ 30 bars, 1.0 @ 90+ bars
  const pointScore = Math.min(dataPoints / 90, 1.0);

  // Continuity: Check for gaps in historical dates (working days should be ~1 day apart)
  let continuityScore = 1.0;
  if (historical.length >= 5) {
    const dates = historical.map((h) => new Date(h.date).getTime());
    let gaps = 0;
    for (let i = 1; i < Math.min(dates.length, 20); i++) {
      const daysApart = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
      if (daysApart > 2) gaps++; // More than 2 days = gap (accounts for weekends)
    }
    continuityScore = Math.max(0, 1.0 - gaps * 0.15);
  }

  // Freshness: Latest bar should be recent (not stale)
  let freshnessScore = 0;
  if (latestTimestamp) {
    const lastBarTime = new Date(latestTimestamp).getTime();
    const nowTime = new Date().getTime();
    const hoursSinceLatest = (nowTime - lastBarTime) / (1000 * 60 * 60);
    
    if (hoursSinceLatest <= 24) {
      freshnessScore = 1.0;
    } else if (hoursSinceLatest <= 48) {
      freshnessScore = 0.8;
    } else if (hoursSinceLatest <= 72) {
      freshnessScore = 0.5;
    } else {
      freshnessScore = 0.1;
    }
  }

  const completeness = (pointScore + continuityScore + freshnessScore) / 3;

  return {
    completeness: Math.max(0, Math.min(1.0, completeness)),
    points: dataPoints,
    continuity: continuityScore,
    freshness: freshnessScore,
    reason:
      dataPoints < 30
        ? 'Insufficient historical data'
        : pointScore < 1.0
          ? 'Moderate data points'
          : 'Good data completeness',
  };
}

/**
 * Score indicator reliability
 * Measures: feature availability and number of computed indicators
 * @param {Object} features - from featureEngine.computeFeatures
 * @returns {{reliability: 0-1, nullCount: number, computedCount: number, reason: string}}
 */
function scoreIndicatorReliability(features) {
  if (!features) {
    return {
      reliability: 0,
      nullCount: 4,
      computedCount: 0,
      reason: 'No features computed',
    };
  }

  const indicators = ['rsi', 'trendStrength', 'volatility', 'momentum'];
  const nullCount = indicators.filter((k) => features[k] === null).length;
  const computedCount = indicators.length - nullCount;

  // Reliability: 0.5 @ 2/4 indicators, 1.0 @ 4/4 indicators
  const reliability = Math.max(0, computedCount / 4);

  return {
    reliability,
    nullCount,
    computedCount,
    reason:
      nullCount === 0
        ? 'All indicators computed'
        : nullCount === 4
          ? 'No indicators available'
          : `${computedCount}/4 indicators computed`,
  };
}

/**
 * MASTER: Compute overall data quality multiplier
 * This multiplier is applied to signal confidence to reflect data quality
 * NEVER used to override or fabricate signals
 * @param {Object} marketData - from marketDataService
 * @param {Object} features - from featureEngine
 * @returns {{quality: 0-1, components: {completeness, reliability}, reason: string}}
 */
function computeDataQuality(marketData, features) {
  const completeness = scoreDataCompleteness(marketData);
  const reliability = scoreIndicatorReliability(features);

  // Quality = average of data completeness and indicator reliability
  const quality = (completeness.completeness + reliability.reliability) / 2;

  return {
    quality: Math.max(0, Math.min(1.0, quality)),
    components: {
      completeness: completeness.completeness,
      reliability: reliability.reliability,
    },
    details: {
      dataPoints: completeness.points,
      indicatorsComputed: reliability.computedCount,
      completenessReason: completeness.reason,
      reliabilityReason: reliability.reason,
    },
    reason:
      quality >= 0.8 ? 'High quality data' : quality >= 0.5 ? 'Moderate quality data' : 'Low quality data',
  };
}

module.exports = {
  scoreDataCompleteness,
  scoreIndicatorReliability,
  computeDataQuality,
};
