const express = require('express');
const { body, validationResult } = require('express-validator');
const Zone = require('../models/Zone');
const { auth, authorityOnly } = require('../middleware/auth');

const router = express.Router();

function validateGeometry(geometry) {
  if (!geometry || !geometry.type) return 'geometry.type is required (Circle or Polygon)';
  if (geometry.type === 'Circle') {
    if (!geometry.center || !Array.isArray(geometry.center.coordinates) || geometry.center.coordinates.length !== 2) {
      return 'geometry.center.coordinates [lng,lat] is required for a Circle zone';
    }
    if (!geometry.radiusMeters || geometry.radiusMeters <= 0) {
      return 'geometry.radiusMeters must be a positive number for a Circle zone';
    }
  } else if (geometry.type === 'Polygon') {
    if (!geometry.polygon || !Array.isArray(geometry.polygon.coordinates) || !geometry.polygon.coordinates[0] || geometry.polygon.coordinates[0].length < 4) {
      return 'geometry.polygon.coordinates must be a closed ring of at least 4 [lng,lat] points for a Polygon zone';
    }
  } else {
    return 'geometry.type must be Circle or Polygon';
  }
  return null;
}

// @route  POST /api/zone
// @desc   Feature 7: authority creates a zone (permitted, restricted, or risk)
// @access Private (authority)
router.post('/', authorityOnly, [
  body('name').trim().notEmpty().withMessage('name is required'),
  body('zoneType').isIn(['SAFE', 'RESTRICTED', 'RISK']).withMessage('zoneType must be SAFE, RESTRICTED or RISK'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const geomError = validateGeometry(req.body.geometry);
  if (geomError) return res.status(400).json({ success: false, message: geomError });

  try {
    const zone = await Zone.create({
      name: req.body.name,
      description: req.body.description,
      zoneType: req.body.zoneType,
      geometry: req.body.geometry,
      // Warning distance is configurable per zone - defaults to 250m (demo default), never hard-coded
      warningDistanceMeters: req.body.warningDistanceMeters || 250,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, zone });
  } catch (err) {
    console.error('Zone create error:', err);
    res.status(500).json({ success: false, message: 'Failed to create zone' });
  }
});

// @route  GET /api/zone
// @desc   List zones (any authenticated user can view, so the mobile app can render them too)
router.get('/', auth, async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.zoneType) filter.zoneType = req.query.zoneType;
  const zones = await Zone.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, zones });
});

router.get('/:id', auth, async (req, res) => {
  const zone = await Zone.findById(req.params.id);
  if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
  res.json({ success: true, zone });
});

// @route  PUT /api/zone/:id
router.put('/:id', authorityOnly, async (req, res) => {
  if (req.body.geometry) {
    const geomError = validateGeometry(req.body.geometry);
    if (geomError) return res.status(400).json({ success: false, message: geomError });
  }
  const zone = await Zone.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
  res.json({ success: true, zone });
});

// @route  PATCH /api/zone/:id/status
// @desc   Activate/deactivate a zone
router.patch('/:id/status', authorityOnly, async (req, res) => {
  const { status } = req.body;
  if (!['ACTIVE', 'INACTIVE'].includes(status)) {
    return res.status(400).json({ success: false, message: 'status must be ACTIVE or INACTIVE' });
  }
  const zone = await Zone.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
  res.json({ success: true, zone });
});

// @route  DELETE /api/zone/:id
router.delete('/:id', authorityOnly, async (req, res) => {
  const zone = await Zone.findByIdAndDelete(req.params.id);
  if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
  res.json({ success: true, message: 'Zone deleted' });
});

module.exports = router;
