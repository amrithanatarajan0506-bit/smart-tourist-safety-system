const Zone = require('../models/Zone');
const { analyzeZoneProximity } = require('../utils/geoUtils');
const incidentService = require('./incidentService');

/**
 * geofenceEngine - Feature 6.
 * Evaluated on every incoming location update (routes/location.js).
 *
 * Status precedence for a single point-in-time evaluation:
 *   VIOLATION (inside a RESTRICTED zone)
 *   > WARNING  (within warningDistanceMeters of a RESTRICTED zone boundary)
 *   > SAFE     (no restricted-zone proximity issue)
 */
async function evaluateLocation({ tourist, trip, coordinates }) {
  const zones = await Zone.find({ status: 'ACTIVE' });
  const restrictedZones = zones.filter((z) => z.zoneType === 'RESTRICTED' || z.zoneType === 'RISK');

  let status = 'SAFE';
  let activeZone = null;
  let nearestDistance = Infinity;
  const zoneEvents = [];

  for (const zone of restrictedZones) {
    const { inside, distanceToBoundary } = analyzeZoneProximity(coordinates, zone);

    if (inside) {
      status = 'VIOLATION';
      activeZone = zone;
      zoneEvents.push({ zone, state: 'VIOLATION', distance: 0 });
    } else if (distanceToBoundary <= zone.warningDistanceMeters) {
      if (status !== 'VIOLATION') status = 'WARNING';
      if (distanceToBoundary < nearestDistance) {
        nearestDistance = distanceToBoundary;
        if (status === 'WARNING') activeZone = zone;
      }
      zoneEvents.push({ zone, state: 'WARNING', distance: distanceToBoundary });
    }
  }

  const previousStatus = trip.currentZoneStatus;
  const changed = previousStatus !== status;

  const createdIncidents = [];

  // Create incidents for each zone currently in WARNING/VIOLATION (deduped per zone+trip+type)
  for (const evt of zoneEvents) {
    const eventType = evt.state === 'VIOLATION' ? 'GEOFENCE_VIOLATION' : 'GEOFENCE_WARNING';
    const dedupeKey = `geofence:${trip._id}:${evt.zone._id}:${eventType}`;
    const { incident, deduped } = await incidentService.createIncident({
      eventType,
      severity: evt.state === 'VIOLATION' ? 'HIGH' : 'MEDIUM',
      tourist: tourist._id,
      trip: trip._id,
      zone: evt.zone._id,
      location: { type: 'Point', coordinates },
      message: evt.state === 'VIOLATION'
        ? `Tourist entered restricted zone "${evt.zone.name}"`
        : `Tourist within ${Math.round(evt.distance)}m of restricted zone "${evt.zone.name}" (warning threshold ${evt.zone.warningDistanceMeters}m)`,
      details: { zoneName: evt.zone.name, distanceMeters: Math.round(evt.distance) },
      dedupeKey,
    });
    if (!deduped) createdIncidents.push(incident);
  }

  // If the tourist is now SAFE, resolve any still-open geofence incidents for this trip
  if (status === 'SAFE' && previousStatus !== 'SAFE') {
    for (const zone of restrictedZones) {
      await incidentService.resolveByDedupeKey(
        `geofence:${trip._id}:${zone._id}:GEOFENCE_VIOLATION`,
        'Tourist returned to a safe area'
      );
      await incidentService.resolveByDedupeKey(
        `geofence:${trip._id}:${zone._id}:GEOFENCE_WARNING`,
        'Tourist moved away from restricted boundary'
      );
    }
  }

  return { status, changed, previousStatus, activeZone, createdIncidents };
}

module.exports = { evaluateLocation };
