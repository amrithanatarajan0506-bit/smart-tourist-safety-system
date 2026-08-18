const express = require('express');
const Trip = require('../models/Trip');
const Incident = require('../models/Incident');
const User = require('../models/User');
const { authorityOnly } = require('../middleware/auth');
const { computeLocationStatus } = require('../utils/locationStatus');

const router = express.Router();

// @route  GET /api/dashboard/overview
// @desc   Feature 10: summary counters for the Authority Dashboard
router.get('/overview', authorityOnly, async (req, res) => {
  const [activeTrips, totalTourists, openIncidents, incidentsByType] = await Promise.all([
    Trip.countDocuments({ status: 'ACTIVE' }),
    User.countDocuments({ role: 'tourist' }),
    Incident.countDocuments({ status: { $in: ['NEW', 'ACKNOWLEDGED', 'RESPONDING'] } }),
    Incident.aggregate([
      { $match: { status: { $in: ['NEW', 'ACKNOWLEDGED', 'RESPONDING'] } } },
      { $group: { _id: '$eventType', count: { $sum: 1 } } },
    ]),
  ]);

  res.json({
    success: true,
    overview: {
      activeTrips,
      totalTourists,
      openIncidents,
      incidentsByType: incidentsByType.reduce((acc, x) => ({ ...acc, [x._id]: x.count }), {}),
    },
  });
});

// @route  GET /api/dashboard/tourists
// @desc   Feature 10: live map / tourist-status panel data - one row per active trip
router.get('/tourists', authorityOnly, async (req, res) => {
  const trips = await Trip.find({ status: 'ACTIVE' }).populate('tourist', 'name digitalId phone role');

  const rows = trips.map((trip) => ({
    tripId: trip.tripId,
    tourist: trip.tourist,
    zoneStatus: trip.currentZoneStatus,
    locationState: computeLocationStatus(trip.lastLocation && trip.lastLocation.timestamp),
    lastLocation: trip.lastLocation || null,
    startedAt: trip.startedAt,
    pointCount: trip.pointCount,
  }));

  res.json({ success: true, tourists: rows });
});

// @route  GET /api/dashboard/safety-summary
// @desc   Module 15: AI Safety Summary - automatic, per-tourist safety
//         intelligence assembled entirely from live system data (User.safety
//         profile + active trip + open incidents), not hand-entered.
// @access Private (authority)
router.get('/safety-summary', authorityOnly, async (req, res) => {
  const trips = await Trip.find({ status: 'ACTIVE' }).populate('tourist', 'name digitalId phone safety');

  const summaries = await Promise.all(trips.map(async (trip) => {
    const openIncidents = await Incident.find({
      trip: trip._id,
      status: { $in: ['NEW', 'ACKNOWLEDGED', 'RESPONDING'] },
    }).sort({ createdAt: -1 }).select('eventType severity message createdAt');

    const safety = (trip.tourist && trip.tourist.safety) || {};
    return {
      tourist: trip.tourist ? { _id: trip.tourist._id, name: trip.tourist.name, digitalId: trip.tourist.digitalId, phone: trip.tourist.phone } : null,
      tripId: trip.tripId,
      safetyStatus: safety.status || 'SAFE',
      riskScore: safety.riskScore || 0,
      riskLevel: safety.riskLevel || 'LOW',
      locationStatus: computeLocationStatus(trip.lastLocation && trip.lastLocation.timestamp),
      lastUpdatedAt: safety.lastUpdatedAt || trip.lastLocation?.timestamp || null,
      contributingFactors: safety.contributingFactors || [],
      recommendedAction: safety.recommendedAction || 'Continue automated monitoring.',
      activeIncidentCount: openIncidents.length,
      activeIncidents: openIncidents,
    };
  }));

  // Most concerning tourists first
  const RISK_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  summaries.sort((a, b) => (RISK_RANK[b.riskLevel] - RISK_RANK[a.riskLevel]) || (b.riskScore - a.riskScore));

  res.json({ success: true, summaries });
});

module.exports = router;
