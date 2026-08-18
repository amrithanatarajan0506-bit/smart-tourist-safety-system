const mongoose = require('mongoose');

/**
 * Incident
 * FEATURE 14: Unified alert/event architecture. Every important system event
 * (geofence warning/violation, SOS, AI risk, low battery, offline, location
 * synced) is recorded here so the Authority Dashboard has ONE feed to read
 * and ONE incident-management/audit-trail model to work with.
 */
const IncidentSchema = new mongoose.Schema({
  eventType: {
    type: String,
    enum: [
      'GEOFENCE_WARNING',
      'GEOFENCE_VIOLATION',
      'SOS',
      'AI_RISK',
      'LOW_BATTERY',
      'OFFLINE',
      'LOCATION_SYNCED',
    ],
    required: true,
    index: true,
  },
  severity: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM',
    index: true,
  },
  status: {
    type: String,
    enum: ['NEW', 'ACKNOWLEDGED', 'RESPONDING', 'RESOLVED'],
    default: 'NEW',
    index: true,
  },
  tourist: { type: mongoose.Schema.ObjectId, ref: 'User', required: true, index: true },
  trip: { type: mongoose.Schema.ObjectId, ref: 'Trip' },
  zone: { type: mongoose.Schema.ObjectId, ref: 'Zone' },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number] },
  },
  message: String,
  details: mongoose.Schema.Types.Mixed, // riskScore, reasons, batteryPct, etc.
  // Module 12: deterministic, automatically generated response recommendation
  recommendedAction: String,
  // Module 11: automatic priority score/level - recomputed on read for freshness (age),
  // this stored value is the score at creation time.
  priorityScore: { type: Number, default: 0 },
  priorityLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'LOW' },
  // De-duplication key: e.g. `tourist:zone:VIOLATION` - see incidentService.createOrUpdate
  dedupeKey: { type: String, index: true },
  // Audit trail of status changes
  history: [{
    status: String,
    by: { type: mongoose.Schema.ObjectId, ref: 'User' },
    note: String,
    at: { type: Date, default: Date.now },
  }],
  resolvedAt: Date,
  // Tamper-evident ledger linkage (Feature 13)
  ledgerHash: String,
}, { timestamps: true });

IncidentSchema.index({ tourist: 1, createdAt: -1 });

module.exports = mongoose.model('Incident', IncidentSchema);
