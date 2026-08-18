const express = require('express');
const { body, validationResult } = require('express-validator');
const Trip = require('../models/Trip');
const LocationPoint = require('../models/LocationPoint');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const geofenceEngine = require('../services/geofenceEngine');
const riskEngine = require('../services/riskEngine');
const incidentService = require('../services/incidentService');
const decisionEngine = require('../services/decisionEngine');
const { computeLocationStatus } = require('../utils/locationStatus');

const router = express.Router();

const LOW_BATTERY_THRESHOLD = Number(process.env.LOW_BATTERY_THRESHOLD_PERCENT || 15);

const coordValidators = [
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('latitude must be between -90 and 90'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('longitude must be between -180 and 180'),
  body('tripId').notEmpty().withMessage('tripId is required'),
];

/**
 * Module 16: Event Processing Architecture.
 *   Validate -> Store -> Update Tourist Status -> Geofence -> Movement/Risk
 *   -> Battery -> Incident Decision -> (caller) Real-time broadcast
 * All business logic lives in services/*; this stays a thin orchestrator.
 */
async function applyEngines({ trip, tourist, coordinates, battery }) {
  const result = { geofence: null, risk: null, batteryIncident: null };

  // Module 4/6: Geo-fence check (also resolves/cools-down existing zone events)
  result.geofence = await geofenceEngine.evaluateLocation({ tourist, trip, coordinates });
  trip.currentZoneStatus = result.geofence.status;
  const nearRestrictedZone = result.geofence.status !== 'SAFE';

  // Module 9: Low battery automation - combined-condition severity escalation
  if (typeof battery === 'number' && battery <= LOW_BATTERY_THRESHOLD) {
    const baseSeverity = battery <= 5 ? 'HIGH' : 'MEDIUM';
    const severity = decisionEngine.escalateSeverity(baseSeverity, {
      priorRiskLevel: tourist.safety ? tourist.safety.riskLevel : 'LOW',
      nearRestrictedZone,
    });
    const { incident, deduped } = await incidentService.createIncident({
      eventType: 'LOW_BATTERY',
      severity,
      tourist: tourist._id,
      trip: trip._id,
      location: { type: 'Point', coordinates },
      message: `Tourist battery low: ${battery}%`,
      details: { batteryPercent: battery, thresholdPercent: LOW_BATTERY_THRESHOLD },
      dedupeKey: `low_battery:${trip._id}`,
    });
    if (!deduped) result.batteryIncident = incident;
  } else if (typeof battery === 'number' && battery > LOW_BATTERY_THRESHOLD) {
    await incidentService.resolveByDedupeKey(`low_battery:${trip._id}`, 'Battery level recovered');
  }

  // Module 8/5/19: AI / Risk Analysis Engine - runs on every update, per spec
  trip.pointCount += 1;
  result.risk = await riskEngine.evaluateTrip(trip, { battery });

  // Module 9: a live update arriving means the tourist is no longer offline -
  // auto-resolve any open "location updates stopped" incident.
  await incidentService.resolveByDedupeKey(`offline:${trip._id}`, 'Location updates resumed');

  // Module 1/15: keep the automatic Tourist Safety Profile in sync
  await decisionEngine.syncTouristSafety(tourist._id, {
    riskScore: result.risk ? result.risk.riskScore : (tourist.safety ? tourist.safety.riskScore : 0),
    riskLevel: result.risk ? result.risk.riskLevel : (tourist.safety ? tourist.safety.riskLevel : 'LOW'),
    factors: result.risk ? result.risk.contributingFactors : [],
    locationStatus: 'LIVE',
    tripStatus: 'ACTIVE',
    battery: typeof battery === 'number' ? battery : undefined,
    monitoringStatus: 'ACTIVE',
  });

  return result;
}

// @route  POST /api/location/live
// @desc   Feature 4: single live GPS point from the mobile app while online
// @access Private (tourist)
router.post('/live', auth, coordValidators, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { latitude, longitude, tripId, accuracy, speed, heading, battery, timestamp } = req.body;

    const trip = await Trip.findOne({ tripId, tourist: req.user._id, status: 'ACTIVE' });
    if (!trip) {
      return res.status(404).json({ success: false, message: 'No matching active trip for this tourist' });
    }

    const coordinates = [longitude, latitude];
    const deviceTimestamp = timestamp ? new Date(timestamp) : new Date();

    const point = await LocationPoint.create({
      tourist: req.user._id,
      trip: trip._id,
      location: { type: 'Point', coordinates },
      accuracy, speed, heading, battery,
      deviceTimestamp,
      source: 'LIVE',
    });

    const engineResult = await applyEngines({ trip, tourist: req.user, coordinates, battery });
    point.zoneStatus = engineResult.geofence.status;
    await point.save();

    trip.lastLocation = {
      type: 'Point', coordinates, timestamp: deviceTimestamp, accuracy, speed, heading, battery, source: 'LIVE',
    };
    await trip.save();

    await User.findByIdAndUpdate(req.user._id, {
      lastLocation: { type: 'Point', coordinates, timestamp: deviceTimestamp },
    });

    const socketHandler = req.app.get('socketHandler');
    if (socketHandler) {
      const payload = {
        touristId: req.user._id,
        digitalId: req.user.digitalId,
        tripId: trip.tripId,
        latitude, longitude, accuracy, speed, heading, battery,
        timestamp: deviceTimestamp,
        zoneStatus: engineResult.geofence.status,
        locationState: 'LIVE',
      };
      socketHandler.broadcastLiveLocation(payload);

      if (engineResult.geofence.changed) {
        socketHandler.broadcastGeofenceStatus(String(req.user._id), {
          touristId: req.user._id,
          tripId: trip.tripId,
          status: engineResult.geofence.status,
          previousStatus: engineResult.geofence.previousStatus,
          zone: engineResult.geofence.activeZone ? { id: engineResult.geofence.activeZone._id, name: engineResult.geofence.activeZone.name } : null,
        });
      }
      engineResult.geofence.createdIncidents.forEach((incident) => socketHandler.broadcastIncident(incident));
      if (engineResult.batteryIncident) socketHandler.broadcastIncident(engineResult.batteryIncident);
      if (engineResult.risk && !engineResult.risk.deduped) socketHandler.broadcastIncident(engineResult.risk.incident);
    }

    res.json({
      success: true,
      zoneStatus: engineResult.geofence.status,
      pointId: point._id,
    });
  } catch (err) {
    console.error('Live location error:', err);
    res.status(500).json({ success: false, message: 'Failed to process location update' });
  }
});

// @route  POST /api/location/sync
// @desc   Feature 8: batch-sync GPS points collected while the device was offline.
//         Idempotent - safe to retry, duplicates (same tripId+clientPointId) are ignored.
// @access Private (tourist)
router.post('/sync', auth, async (req, res) => {
  try {
    const { points } = req.body;
    if (!Array.isArray(points) || points.length === 0) {
      return res.status(400).json({ success: false, message: 'points array is required' });
    }

    // Chronological order, oldest first, so geofence/risk state evolves correctly
    const ordered = points.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const results = { synced: 0, duplicates: 0, rejected: 0, errors: [] };
    const affectedTrips = new Map();

    for (const p of ordered) {
      const { latitude, longitude, tripId, accuracy, speed, heading, battery, timestamp, clientPointId } = p;

      if (
        typeof latitude !== 'number' || latitude < -90 || latitude > 90 ||
        typeof longitude !== 'number' || longitude < -180 || longitude > 180 ||
        !tripId
      ) {
        results.rejected += 1;
        results.errors.push({ clientPointId, reason: 'invalid coordinates or missing tripId' });
        continue;
      }

      const trip = affectedTrips.get(tripId) || (await Trip.findOne({ tripId, tourist: req.user._id }));
      if (!trip) {
        results.rejected += 1;
        results.errors.push({ clientPointId, reason: 'trip not found for this tourist' });
        continue;
      }
      affectedTrips.set(tripId, trip);

      const coordinates = [longitude, latitude];
      const deviceTimestamp = new Date(timestamp);

      try {
        const point = await LocationPoint.create({
          tourist: req.user._id,
          trip: trip._id,
          location: { type: 'Point', coordinates },
          accuracy, speed, heading, battery,
          deviceTimestamp,
          source: 'OFFLINE_SYNC',
          clientPointId,
        });

        // Only advance geofence/risk state if this synced point is newer than what we already have
        if (!trip.lastLocation || !trip.lastLocation.timestamp || deviceTimestamp > trip.lastLocation.timestamp) {
          const engineResult = await applyEngines({ trip, tourist: req.user, coordinates, battery });
          point.zoneStatus = engineResult.geofence.status;
          await point.save();
          trip.lastLocation = { type: 'Point', coordinates, timestamp: deviceTimestamp, accuracy, speed, heading, battery, source: 'OFFLINE_SYNC' };
        } else {
          trip.pointCount += 1;
        }

        results.synced += 1;
      } catch (err) {
        if (err.code === 11000) {
          results.duplicates += 1; // already synced previously - safe to ignore
        } else {
          results.rejected += 1;
          results.errors.push({ clientPointId, reason: err.message });
        }
      }
    }

    for (const trip of affectedTrips.values()) {
      await trip.save();
    }

    const { incident } = await incidentService.createIncident({
      eventType: 'LOCATION_SYNCED',
      severity: 'LOW',
      tourist: req.user._id,
      trip: [...affectedTrips.values()][0] ? [...affectedTrips.values()][0]._id : undefined,
      message: `Synced ${results.synced} offline location point(s) (${results.duplicates} duplicate, ${results.rejected} rejected)`,
      details: results,
    });

    const socketHandler = req.app.get('socketHandler');
    if (socketHandler) {
      socketHandler.broadcastSyncStatus(String(req.user._id), {
        touristId: req.user._id,
        digitalId: req.user.digitalId,
        ...results,
        syncedAt: new Date(),
      });
      socketHandler.broadcastIncident(incident);
    }

    res.json({ success: true, ...results });
  } catch (err) {
    console.error('Location sync error:', err);
    res.status(500).json({ success: false, message: 'Failed to sync offline locations' });
  }
});

// @route  GET /api/location/status/:touristId
// @desc   Feature 5: LIVE / LAST_KNOWN / OFFLINE / UNKNOWN for a tourist
router.get('/status/:touristId', auth, async (req, res) => {
  const trip = await Trip.findOne({ tourist: req.params.touristId, status: 'ACTIVE' })
    .sort({ createdAt: -1 });
  const lastLocation = trip ? trip.lastLocation : null;
  const state = computeLocationStatus(lastLocation && lastLocation.timestamp);
  res.json({
    success: true,
    state,
    lastLocation: lastLocation || null,
    tripId: trip ? trip.tripId : null,
    zoneStatus: trip ? trip.currentZoneStatus : 'UNKNOWN',
  });
});

// @route  GET /api/location/trip/:tripId/history
router.get('/trip/:tripId/history', auth, async (req, res) => {
  const trip = await Trip.findOne({ tripId: req.params.tripId });
  if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

  const isOwner = String(trip.tourist) === String(req.user._id);
  const isAuthority = ['admin', 'authority', 'police', 'tourism_official'].includes(req.user.role);
  if (!isOwner && !isAuthority) return res.status(403).json({ success: false, message: 'Not authorized' });

  const points = await LocationPoint.find({ trip: trip._id }).sort({ deviceTimestamp: 1 });
  res.json({ success: true, points });
});

module.exports = router;
