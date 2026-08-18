const mongoose = require('mongoose');

/**
 * LocationPoint
 * FEATURE 4/8: Every GPS sample, whether sent live or synced later from the
 * mobile app's offline queue. Uses a GeoJSON Point with a 2dsphere index so
 * MongoDB's native geospatial queries can be used (Feature 6 uses its own
 * geoUtils for zone-shape flexibility, but the index is here for future
 * $near / $geoWithin queries and heatmaps).
 */
const LocationPointSchema = new mongoose.Schema({
  tourist: { type: mongoose.Schema.ObjectId, ref: 'User', required: true, index: true },
  trip: { type: mongoose.Schema.ObjectId, ref: 'Trip', required: true, index: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true, index: '2dsphere' }, // [lng, lat]
  },
  accuracy: Number,
  speed: Number,
  heading: Number,
  battery: Number,
  deviceTimestamp: { type: Date, required: true }, // when the phone captured the fix
  receivedAt: { type: Date, default: Date.now },   // when the backend received it
  source: { type: String, enum: ['LIVE', 'OFFLINE_SYNC'], default: 'LIVE' },
  clientPointId: { type: String, index: true }, // idempotency key from the mobile offline queue
  zoneStatus: { type: String, enum: ['SAFE', 'WARNING', 'VIOLATION', 'UNKNOWN'], default: 'UNKNOWN' },
}, { timestamps: true });

// Prevent duplicate sync of the same offline point for the same trip
LocationPointSchema.index({ trip: 1, clientPointId: 1 }, { unique: true, sparse: true });
LocationPointSchema.index({ trip: 1, deviceTimestamp: 1 });

module.exports = mongoose.model('LocationPoint', LocationPointSchema);
