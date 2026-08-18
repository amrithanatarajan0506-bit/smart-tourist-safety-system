const LocationPoint = require('../models/LocationPoint');
const Incident = require('../models/Incident');
const incidentService = require('./incidentService');
const decisionEngine = require('./decisionEngine');
const ruleBasedProvider = require('./risk/RuleBasedRiskProvider');
const statisticalProvider = require('./risk/StatisticalRiskProvider');

/**
 * riskEngine - Module 5/19: centralized AI / Risk Analysis Engine.
 *
 * ============================== IMPORTANT ==============================
 * Combines two DEMO-scope providers behind one calculateRisk(data)
 * interface (see services/risk/riskProviderInterface.js):
 *   - RuleBasedRiskProvider          (deterministic thresholds)
 *   - StatisticalRiskProvider        (z-score / statistical anomaly detection)
 * There is NO trained machine-learning model here and no labeled dataset -
 * the code does not claim otherwise. A MachineLearningRiskProvider can be
 * added later behind the same interface without touching any caller.
 * =========================================================================
 */

const HISTORY_POINTS = Number(process.env.RISK_HISTORY_POINTS || 30);
const BOUNDARY_APPROACH_WINDOW_MIN = Number(process.env.RISK_BOUNDARY_APPROACH_WINDOW_MIN || 60);

// Risk level bands exactly as specified: 0-29 LOW, 30-59 MEDIUM, 60-79 HIGH, 80-100 CRITICAL
function scoreToLevel(score) {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

/**
 * Pure combination function - Module 19's calculateRisk(data) contract at
 * the engine level. Does not touch the database; callers gather `data`.
 */
function calculateRisk(data) {
  const ruleResult = ruleBasedProvider.calculateRisk(data);
  const statResult = statisticalProvider.calculateRisk(data);

  const contributingFactors = [...ruleResult.contributingFactors, ...statResult.contributingFactors];
  const riskScore = Math.min(100, ruleResult.riskScore + statResult.riskScore);
  const riskLevel = scoreToLevel(riskScore);

  return {
    riskScore,
    riskLevel,
    contributingFactors,
    providers: {
      ruleBased: { riskScore: ruleResult.riskScore, factors: ruleResult.contributingFactors, method: ruleResult.method },
      statistical: {
        riskScore: statResult.riskScore, factors: statResult.contributingFactors,
        method: statResult.method, confidence: statResult.confidence,
      },
    },
  };
}

/**
 * Gathers a trip's recent history from the DB and runs calculateRisk().
 * Creates/dedupes an AI_RISK incident when the combined score is non-zero.
 */
async function evaluateTrip(trip, { battery } = {}) {
  const points = await LocationPoint.find({ trip: trip._id })
    .sort({ deviceTimestamp: -1 })
    .limit(HISTORY_POINTS)
    .lean();

  if (points.length < 3) return null; // not enough history yet

  const chronologicalPoints = points.slice().reverse(); // oldest -> newest
  const latest = chronologicalPoints[chronologicalPoints.length - 1];

  const approachWindowStart = new Date(Date.now() - BOUNDARY_APPROACH_WINDOW_MIN * 60000);
  const boundaryApproachCount = await Incident.countDocuments({
    trip: trip._id,
    eventType: 'GEOFENCE_WARNING',
    createdAt: { $gte: approachWindowStart },
  });

  const result = calculateRisk({
    trip,
    chronologicalPoints,
    latest,
    battery,
    boundaryApproachCount,
    plannedRoute: trip.plannedRoute && trip.plannedRoute.coordinates ? trip.plannedRoute.coordinates : null,
  });

  if (result.contributingFactors.length === 0) return { ...result, incident: null, deduped: false };

  const baseSeverity = result.riskLevel === 'LOW' ? 'LOW' : result.riskLevel === 'MEDIUM' ? 'MEDIUM' : result.riskLevel === 'HIGH' ? 'HIGH' : 'CRITICAL';
  const severity = decisionEngine.escalateSeverity(baseSeverity, {
    simultaneousFactorCount: result.contributingFactors.length,
  });

  const dedupeKey = `ai_risk:${trip._id}:${result.contributingFactors[0].split(' ')[0]}`; // coarse dedupe per reason family
  const { incident, deduped } = await incidentService.createIncident({
    eventType: 'AI_RISK',
    severity,
    tourist: trip.tourist,
    trip: trip._id,
    location: { type: 'Point', coordinates: latest.location.coordinates },
    message: `Risk engine flagged: ${result.contributingFactors.join('; ')}`,
    details: { riskScore: result.riskScore, riskLevel: result.riskLevel, reasons: result.contributingFactors, providers: result.providers },
    dedupeKey,
  });

  return { ...result, incident, deduped };
}

module.exports = { evaluateTrip, calculateRisk, scoreToLevel };
