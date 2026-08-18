const mongoose = require('mongoose');

/**
 * Zone
 * FEATURE 6/7: Geo-fence zone, authority-managed.
 * Supports two geometry shapes for practicality:
 *  - Circle:  centre point + radius (metres)  -> simplest for authorities to draw/configure
 *  - Polygon: GeoJSON polygon ring             -> arbitrary boundary shapes
 */
const ZoneSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  zoneType: {
    type: String,
    enum: ['SAFE', 'RESTRICTED', 'RISK'],
    required: true,
    index: true,
  },
  geometry: {
    type: {
      type: String, // 'Circle' | 'Polygon'
      enum: ['Circle', 'Polygon'],
      required: true,
    },
    center: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number] }, // required for Circle
    },
    radiusMeters: { type: Number }, // required for Circle
    polygon: {
      type: { type: String, enum: ['Polygon'], default: 'Polygon' },
      coordinates: { type: [[[Number]]] }, // required for Polygon: [ [ [lng,lat], ... ] ]
    },
  },
  // Configurable warning distance - NOT hard-coded. Default 250m per spec, but authority can override per zone.
  warningDistanceMeters: { type: Number, default: 250 },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
  createdBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Zone', ZoneSchema);
