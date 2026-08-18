const express = require('express');
const crypto = require('crypto');
const Trip = require('../models/Trip');
const { auth } = require('../middleware/auth');
const ledgerService = require('../services/ledgerService');
const decisionEngine = require('../services/decisionEngine');

const router = express.Router();

function generateTripId() {
  return `TRIP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

// @route  POST /api/trip/start
// @desc   Start a new trip (Feature 3). Rejects if the tourist already has an ACTIVE trip.
// @access Private (tourist)
router.post('/start', auth, async (req, res) => {
  try {
    const existingActive = await Trip.findOne({ tourist: req.user._id, status: 'ACTIVE' });
    if (existingActive) {
      return res.status(409).json({
        success: false,
        message: 'You already have an active trip. Stop it before starting a new one.',
        activeTrip: existingActive,
      });
    }

    const { destination, notes, plannedRoute } = req.body;

    const trip = await Trip.create({
      tripId: generateTripId(),
      tourist: req.user._id,
      destination,
      notes,
      plannedRoute: plannedRoute && plannedRoute.coordinates ? { type: 'LineString', coordinates: plannedRoute.coordinates } : undefined,
      status: 'ACTIVE',
      startedAt: new Date(),
    });

    await ledgerService.appendRecord('TRIP', trip._id, {
      tripId: trip.tripId,
      tourist: req.user._id.toString(),
      event: 'TRIP_STARTED',
      startedAt: trip.startedAt.toISOString(),
    });

    // Module 1: automatic safety profile update - monitoring begins now, no admin action needed
    await decisionEngine.syncTouristSafety(req.user._id, { tripStatus: 'ACTIVE', monitoringStatus: 'ACTIVE' });

    const socketHandler = req.app.get('socketHandler');
    if (socketHandler) {
      socketHandler.broadcastTripEvent({
        type: 'TRIP_STARTED',
        tripId: trip.tripId,
        touristId: req.user._id,
        digitalId: req.user.digitalId,
        startedAt: trip.startedAt,
      });
    }

    res.status(201).json({ success: true, trip });
  } catch (err) {
    console.error('Trip start error:', err);
    res.status(500).json({ success: false, message: 'Failed to start trip' });
  }
});

// @route  POST /api/trip/:tripId/stop
// @desc   Stop the tourist's active trip (Feature 3)
// @access Private (tourist, owner only)
router.post('/:tripId/stop', auth, async (req, res) => {
  try {
    const trip = await Trip.findOne({ tripId: req.params.tripId, tourist: req.user._id });
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
    if (trip.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: `Trip is already ${trip.status}` });
    }

    trip.status = 'COMPLETED';
    trip.endedAt = new Date();
    await trip.save();

    await ledgerService.appendRecord('TRIP', trip._id, {
      tripId: trip.tripId,
      tourist: req.user._id.toString(),
      event: 'TRIP_STOPPED',
      endedAt: trip.endedAt.toISOString(),
      pointCount: trip.pointCount,
    });

    // Module 1: monitoring stops automatically when the trip stops
    await decisionEngine.syncTouristSafety(req.user._id, { tripStatus: 'COMPLETED', monitoringStatus: 'INACTIVE' });

    const socketHandler = req.app.get('socketHandler');
    if (socketHandler) {
      socketHandler.broadcastTripEvent({
        type: 'TRIP_STOPPED',
        tripId: trip.tripId,
        touristId: req.user._id,
        digitalId: req.user.digitalId,
        endedAt: trip.endedAt,
      });
    }

    res.json({ success: true, trip });
  } catch (err) {
    console.error('Trip stop error:', err);
    res.status(500).json({ success: false, message: 'Failed to stop trip' });
  }
});

// @route  GET /api/trip/active
// @desc   Get the tourist's current active trip, if any
router.get('/active', auth, async (req, res) => {
  const trip = await Trip.findOne({ tourist: req.user._id, status: 'ACTIVE' });
  res.json({ success: true, trip: trip || null });
});

// @route  GET /api/trip
// @desc   List the tourist's own trip history
router.get('/', auth, async (req, res) => {
  const trips = await Trip.find({ tourist: req.user._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ success: true, trips });
});

// @route  GET /api/trip/:tripId
router.get('/:tripId', auth, async (req, res) => {
  const trip = await Trip.findOne({ tripId: req.params.tripId });
  if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

  const isOwner = String(trip.tourist) === String(req.user._id);
  const isAuthority = ['admin', 'authority', 'police', 'tourism_official'].includes(req.user.role);
  if (!isOwner && !isAuthority) {
    return res.status(403).json({ success: false, message: 'Not authorized to view this trip' });
  }
  res.json({ success: true, trip });
});

module.exports = router;
