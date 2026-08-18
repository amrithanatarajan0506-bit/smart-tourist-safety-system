const { distanceToPolylineMeters } = require('../../utils/geoUtils');

/**
 * RuleBasedRiskProvider
 *
 * Deterministic risk detection using predefined safety rules.
 * This provider does not use a trained machine learning model.
 */

// A point further than this from every segment of the planned route counts as a deviation.
const ROUTE_DEVIATION_THRESHOLD_METERS = Number(process.env.RISK_ROUTE_DEVIATION_METERS || 500);
// Ignore isolated deviations - require this many of the most recent points to
// all be off-route before flagging, so a single bad GPS fix doesn't trigger it.
const ROUTE_DEVIATION_CONSECUTIVE_POINTS = Number(process.env.RISK_ROUTE_DEVIATION_CONSECUTIVE || 3);

function calculateRisk(data) {
  const {
    chronologicalPoints = [],
    latest,
    battery,
    boundaryApproachCount = 0,
    plannedRoute = null,
  } = data;

  let riskScore = 0;
  const contributingFactors = [];

  // ---------------------------------------------------
  // 1. Low battery detection
  // ---------------------------------------------------
  if (typeof battery === 'number' && battery >= 0 && battery <= 15) {
    riskScore += 25;
    contributingFactors.push(`Low battery detected (${battery}%)`);
  }

  // ---------------------------------------------------
  // 2. Repeated boundary approach detection
  // ---------------------------------------------------
  if (boundaryApproachCount >= 3) {
    riskScore += 25;
    contributingFactors.push(
      `Repeated approach to restricted boundary (${boundaryApproachCount} times)`
    );
  }

  // ---------------------------------------------------
  // 3. Long unusual stop detection
  // Checks whether recent points remain very close together
  // for a significant duration.
  // ---------------------------------------------------
  if (chronologicalPoints.length >= 3) {
    const first = chronologicalPoints[0];
    const last = chronologicalPoints[chronologicalPoints.length - 1];

    if (
      first.location &&
      last.location &&
      first.location.coordinates &&
      last.location.coordinates
    ) {
      const [lng1, lat1] = first.location.coordinates;
      const [lng2, lat2] = last.location.coordinates;

      const distance = getDistanceInMeters(lat1, lng1, lat2, lng2);

      const firstTime = new Date(
        first.deviceTimestamp || first.createdAt
      ).getTime();

      const lastTime = new Date(
        last.deviceTimestamp || last.createdAt
      ).getTime();

      const durationMinutes =
        (lastTime - firstTime) / (1000 * 60);

      // Less than 30 meters movement for 20+ minutes
      if (distance < 30 && durationMinutes >= 20) {
        riskScore += 20;
        contributingFactors.push(
          `Unusual prolonged stop detected for approximately ${Math.round(
            durationMinutes
          )} minutes`
        );
      }
    }
  }

  // ---------------------------------------------------
  // 4. Poor location accuracy
  // ---------------------------------------------------
  if (latest && typeof latest.accuracy === 'number') {
    if (latest.accuracy > 100) {
      riskScore += 10;
      contributingFactors.push(
        `Poor GPS accuracy detected (${Math.round(latest.accuracy)} meters)`
      );
    }
  }

  // ---------------------------------------------------
  // 5. Route deviation detection
  // Flags when the tourist's recent points sit consistently far from every
  // segment of their declared plannedRoute (a Trip-level LineString).
  // Requires several consecutive off-route points so a single noisy GPS fix,
  // a short detour, or a planned rest stop near the route doesn't trigger it.
  // ---------------------------------------------------
  if (Array.isArray(plannedRoute) && plannedRoute.length >= 2 && chronologicalPoints.length > 0) {
    const recentPoints = chronologicalPoints.slice(-ROUTE_DEVIATION_CONSECUTIVE_POINTS);
    const recentDistances = recentPoints
      .filter((p) => p.location && Array.isArray(p.location.coordinates))
      .map((p) => distanceToPolylineMeters(p.location.coordinates, plannedRoute));

    const allOffRoute =
      recentDistances.length === ROUTE_DEVIATION_CONSECUTIVE_POINTS &&
      recentDistances.every((d) => d !== null && d > ROUTE_DEVIATION_THRESHOLD_METERS);

    if (allOffRoute) {
      const maxDeviation = Math.round(Math.max(...recentDistances));
      riskScore += 20;
      contributingFactors.push(
        `Route deviation detected - ${recentDistances.length} consecutive points up to ${maxDeviation}m from the planned route`
      );
    }
  }

  return {
    riskScore: Math.min(100, riskScore),
    contributingFactors,
    method: 'RULE_BASED',
  };
}


// Calculate distance between two GPS coordinates
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

  const c = 2 * Math.atan2(
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