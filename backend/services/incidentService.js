const Incident = require('../models/Incident');
const ledgerService = require('./ledgerService');
const recommendationService = require('./recommendationService');
const priorityService = require('./priorityService');

/**
 * incidentService - unified event/incident creation (Feature 14) with
 * de-duplication for unchanged, continuing conditions.
 *
 * Module 10/11/12: every incident automatically gets a deterministic
 * recommendedAction and an initial priorityScore/priorityLevel - the
 * administrator never has to set these manually.
 */

// Which event types get written to the tamper-evident ledger (Feature 13)
const LEDGER_EVENT_TYPES = new Set(['GEOFENCE_VIOLATION', 'SOS']);

async function createIncident({
  eventType, severity = 'MEDIUM', tourist, trip, zone, location, message, details, dedupeKey,
}) {
  // Avoid duplicate alerts for the same unchanged, still-open condition
  if (dedupeKey) {
    const existingOpen = await Incident.findOne({
      dedupeKey,
      status: { $in: ['NEW', 'ACKNOWLEDGED', 'RESPONDING'] },
    });
    if (existingOpen) {
      return { incident: existingOpen, deduped: true };
    }
  }

  const factors = (details && Array.isArray(details.reasons)) ? details.reasons : (message ? [message] : []);
  const recommendedAction = recommendationService.generateRecommendation({ severity, factors, eventType });

  const incident = await Incident.create({
    eventType, severity, tourist, trip, zone, location, message, details, dedupeKey,
    recommendedAction,
    history: [{ status: 'NEW', note: 'Incident created' }],
  });

  // Initial priority score (age contribution is ~0 at creation; recomputed live on read)
  const openCount = await Incident.countDocuments({
    tourist, status: { $in: ['NEW', 'ACKNOWLEDGED', 'RESPONDING'] },
  });
  const { priorityScore, priorityLevel } = priorityService.computePriority(incident, {
    openIncidentCountForTourist: openCount,
  });
  incident.priorityScore = priorityScore;
  incident.priorityLevel = priorityLevel;
  await incident.save();

  if (LEDGER_EVENT_TYPES.has(eventType)) {
    const ledgerRecordType = eventType === 'SOS' ? 'SOS' : 'GEOFENCE_VIOLATION';
    const ledgerRecord = await ledgerService.appendRecord(ledgerRecordType, incident._id, {
      incidentId: incident._id.toString(),
      tourist: tourist.toString(),
      eventType,
      location,
      message,
      createdAt: incident.createdAt.toISOString(),
    });
    incident.ledgerHash = ledgerRecord.hash;
    await incident.save();
  }

  return { incident, deduped: false };
}

/** Resolve a dedupe-tracked condition automatically (e.g. VIOLATION -> SAFE) */
async function resolveByDedupeKey(dedupeKey, note = 'Condition cleared') {
  const incident = await Incident.findOne({
    dedupeKey,
    status: { $in: ['NEW', 'ACKNOWLEDGED', 'RESPONDING'] },
  });
  if (!incident) return null;
  incident.status = 'RESOLVED';
  incident.resolvedAt = new Date();
  incident.history.push({ status: 'RESOLVED', note });
  await incident.save();
  return incident;
}

async function updateStatus(incidentId, status, userId, note) {
  const incident = await Incident.findById(incidentId);
  if (!incident) return null;
  incident.status = status;
  if (status === 'RESOLVED') incident.resolvedAt = new Date();
  incident.history.push({ status, by: userId, note });
  await incident.save();

  if (status === 'RESOLVED') {
    await ledgerService.appendRecord('INCIDENT_STATUS', incident._id, {
      incidentId: incident._id.toString(),
      status,
      by: userId ? userId.toString() : null,
      note: note || '',
      at: new Date().toISOString(),
    });
  }
  return incident;
}

module.exports = { createIncident, resolveByDedupeKey, updateStatus };
