const mongoose = require('mongoose');

/**
 * Trip
 * FEATURE 3: Trip Start/Stop management.
 * A tourist may only have ONE active trip at a time (enforced in routes/trip.js).
 */
const TripSchema = new mongoose.Schema({
  tripId: { type: String, required: true, unique: true, index: true },
  tourist: { type: mongoose.Schema.ObjectId, ref: 'User', required: true, index: true },
  status: {
    type: String,
    enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
    default: 'ACTIVE',
    index: true,
  },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date },
  // Optional planned route, used by the AI risk engine for route-deviation detection
  plannedRoute: {
    type: {
      type: String,
      enum: ['LineString'],
      default: undefined,
    },
    coordinates: { type: [[Number]], default: undefined }, // [ [lng,lat], ... ]
  },
  destination: { type: String },
  notes: { type: String },
  // Denormalised trackers, updated as location points arrive - avoids re-scanning LocationPoint
  lastLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number] },
    timestamp: Date,
    accuracy: Number,
    speed: Number,
    heading: Number,
    battery: Number,
    source: { type: String, enum: ['LIVE', 'OFFLINE_SYNC'], default: 'LIVE' },
  },
  currentZoneStatus: {
    type: String,
    enum: ['SAFE', 'WARNING', 'VIOLATION', 'UNKNOWN'],
    default: 'UNKNOWN',
  },
  pointCount: { type: Number, default: 0 },
}, { timestamps: true });

TripSchema.index({ tourist: 1, status: 1 });

module.exports = mongoose.model('Trip', TripSchema);
