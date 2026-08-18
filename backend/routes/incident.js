const express = require('express');
const Trip = require('../models/Trip');
const Incident = require('../models/Incident');
const { auth, authorityOnly } = require('../middleware/auth');
const incidentService = require('../services/incidentService');
const ledgerService = require('../services/ledgerService');
const priorityService = require('../services/priorityService');
const decisionEngine = require('../services/decisionEngine');
const User = require('../models/User');
const { computeLocationStatus } = require('../utils/locationStatus');

const router = express.Router();

// @route  POST /api/incident/sos
// @desc   Feature 9: SOS / emergency button. Uses the tourist's latest known
//         location (active trip, or the last location on file if between updates).
// @access Private (tourist)
router.post('/sos', auth, async (req, res) => {
  try {
    const { latitude, longitude, message } = req.body;
    const trip = await Trip.findOne({ tourist: req.user._id, status: 'ACTIVE' });

    let coordinates;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      coordinates = [longitude, latitude];
    } else if (trip && trip.lastLocation && trip.lastLocation.coordinates) {
      coordinates = trip.lastLocation.coordinates;
    } else if (req.user.lastLocation && req.user.lastLocation.coordinates) {
      coordinates = req.user.lastLocation.coordinates;
    } else {
      return res.status(400).json({ success: false, message: 'No location available - provide latitude/longitude' });
    }

    const { incident } = await incidentService.createIncident({
      eventType: 'SOS',
      severity: 'CRITICAL',
      tourist: req.user._id,
      trip: trip ? trip._id : undefined,
      location: { type: 'Point', coordinates },
      message: message || 'Emergency SOS triggered by tourist',
      details: { accuracy: req.body.accuracy },
      // No dedupeKey: every SOS press is a distinct, real emergency event.
    });

    const socketHandler = req.app.get('socketHandler');
    if (socketHandler) socketHandler.broadcastIncident(incident);

    // Module 13: automatically mark the tourist as requiring attention -
    // no administrator action needed to flag this.
    await User.findByIdAndUpdate(req.user._id, { $set: { 'safety.status': 'CRITICAL', 'safety.lastUpdatedAt': new Date() } });

    res.status(201).json({ success: true, incident });
  } catch (err) {
    console.error('SOS error:', err);
    res.status(500).json({ success: false, message: 'Failed to create SOS incident' });
  }
});

// @route  GET /api/incident
// @desc   Module 11: incident feed for the Authority Dashboard, automatically
//         sorted by a freshly-recomputed priority score (age keeps accruing
//         even for incidents nobody has touched since creation).
// @access Private (authority)
router.get('/', authorityOnly, async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.eventType) filter.eventType = req.query.eventType;
  if (req.query.severity) filter.severity = req.query.severity;
  if (req.query.tourist) filter.tourist = req.query.tourist;

  const incidents = await Incident.find(filter)
    .populate('tourist', 'name digitalId phone safety')
    .populate('zone', 'name zoneType')
    .sort({ createdAt: -1 })
    .limit(Number(req.query.limit) || 200)
    .lean();

  // Recompute priority live so incident age and "multiple open incidents for
  // this tourist" always reflect the current moment, not just creation time.
  const openCountByTourist = {};
  for (const inc of incidents) {
    if (!['NEW', 'ACKNOWLEDGED', 'RESPONDING'].includes(inc.status)) continue;
    const key = String(inc.tourist && inc.tourist._id ? inc.tourist._id : inc.tourist);
    openCountByTourist[key] = (openCountByTourist[key] || 0) + 1;
  }

  const enriched = incidents.map((inc) => {
    const touristId = String(inc.tourist && inc.tourist._id ? inc.tourist._id : inc.tourist);
    const locationStatus = inc.tourist && inc.tourist.safety ? inc.tourist.safety.locationStatus : undefined;
    const { priorityScore, priorityLevel } = priorityService.computePriority(inc, {
      openIncidentCountForTourist: openCountByTourist[touristId] || 1,
      locationStatus,
    });
    return { ...inc, priorityScore, priorityLevel };
  });

  enriched.sort((a, b) => b.priorityScore - a.priorityScore);

  res.json({ success: true, incidents: enriched });
});

// @route  GET /api/incident/mine
// @desc   Tourist's own incident history
router.get('/mine', auth, async (req, res) => {
  const incidents = await Incident.find({ tourist: req.user._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ success: true, incidents });
});

router.get('/:id', auth, async (req, res) => {
  const incident = await Incident.findById(req.params.id).populate('tourist', 'name digitalId phone').populate('zone', 'name zoneType');
  if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
  res.json({ success: true, incident });
});

// @route  POST /api/incident/:id/acknowledge
router.post('/:id/acknowledge', authorityOnly, async (req, res) => {
  const incident = await incidentService.updateStatus(req.params.id, 'ACKNOWLEDGED', req.user._id, req.body.note);
  if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
  const socketHandler = req.app.get('socketHandler');
  if (socketHandler) socketHandler.broadcastIncident(incident);
  res.json({ success: true, incident });
});

// @route  POST /api/incident/:id/respond
router.post('/:id/respond', authorityOnly, async (req, res) => {
  const incident = await incidentService.updateStatus(req.params.id, 'RESPONDING', req.user._id, req.body.note);
  if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
  const socketHandler = req.app.get('socketHandler');
  if (socketHandler) socketHandler.broadcastIncident(incident);
  res.json({ success: true, incident });
});

// @route  POST /api/incident/:id/resolve
router.post('/:id/resolve', authorityOnly, async (req, res) => {
  const incident = await incidentService.updateStatus(req.params.id, 'RESOLVED', req.user._id, req.body.note);
  if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
  const socketHandler = req.app.get('socketHandler');
  if (socketHandler) socketHandler.broadcastIncident(incident);
  res.json({ success: true, incident });
});

module.exports = router;
