/**
 * StatisticalRiskProvider
 *
 * Uses simple statistical anomaly detection.
 * It compares the latest movement against recent movement history.
 *
 * This is NOT a trained machine learning model.
 */

function calculateRisk(data) {
  const {
    chronologicalPoints = [],
  } = data;

  let riskScore = 0;
  const contributingFactors = [];

  // Need enough history for statistical comparison
  if (chronologicalPoints.length < 4) {
    return {
      riskScore: 0,
      contributingFactors: [],
      method: 'STATISTICAL_Z_SCORE',
      confidence: 'LOW',
    };
  }

  const movementDistances = [];

  // Calculate distance between consecutive points
  for (let i = 1; i < chronologicalPoints.length; i++) {
    const previous = chronologicalPoints[i - 1];
    const current = chronologicalPoints[i];

    if (
      !previous.location ||
      !current.location ||
      !previous.location.coordinates ||
      !current.location.coordinates
    ) {
      continue;
    }

    const [previousLng, previousLat] =
      previous.location.coordinates;

    const [currentLng, currentLat] =
      current.location.coordinates;

    const distance = getDistanceInMeters(
      previousLat,
      previousLng,
      currentLat,
      currentLng
    );

    movementDistances.push(distance);
  }

  // Not enough valid movement data
  if (movementDistances.length < 3) {
    return {
      riskScore: 0,
      contributingFactors: [],
      method: 'STATISTICAL_Z_SCORE',
      confidence: 'LOW',
    };
  }

  // Latest movement distance
  const latestMovement =
    movementDistances[movementDistances.length - 1];

  // Previous movements become the baseline
  const historicalMovements =
    movementDistances.slice(0, -1);

  const mean = calculateMean(historicalMovements);
  const standardDeviation =
    calculateStandardDeviation(
      historicalMovements,
      mean
    );

  // If historical movement is almost identical,
  // statistical anomaly cannot be reliably calculated
  if (standardDeviation < 0.0001) {
    return {
      riskScore: 0,
      contributingFactors: [],
      method: 'STATISTICAL_Z_SCORE',
      confidence: 'LOW',
    };
  }

  const zScore =
    Math.abs(latestMovement - mean) /
    standardDeviation;

  // Z-score anomaly threshold
  if (zScore >= 3) {
    riskScore += 25;

    contributingFactors.push(
      `Abnormal movement pattern detected (z-score: ${zScore.toFixed(2)})`
    );
  } else if (zScore >= 2) {
    riskScore += 15;

    contributingFactors.push(
      `Unusual movement pattern detected (z-score: ${zScore.toFixed(2)})`
    );
  }

  let confidence = 'LOW';

  if (historicalMovements.length >= 10) {
    confidence = 'HIGH';
  } else if (historicalMovements.length >= 5) {
    confidence = 'MEDIUM';
  }

  return {
    riskScore: Math.min(100, riskScore),
    contributingFactors,
    method: 'STATISTICAL_Z_SCORE',
    confidence,
  };
}


function calculateMean(values) {
  if (!values.length) return 0;

  const total = values.reduce(
    (sum, value) => sum + value,
    0
  );

  return total / values.length;
}


function calculateStandardDeviation(values, mean) {
  if (!values.length) return 0;

  const variance =
    values.reduce((sum, value) => {
      return sum + Math.pow(value - mean, 2);
    }, 0) / values.length;

  return Math.sqrt(variance);
}


function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadius * c;
}


function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}


module.exports = {
  calculateRisk,
};