/**
 * geoUtils.js
 * Pure-JS geospatial helper functions used by the Geo-Fence Engine.
 * No external geo library required - works directly with the project's
 * existing Mongoose/MongoDB stack (GeoJSON Point/Polygon).
 */

const EARTH_RADIUS_M = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Haversine distance in metres between two [lng, lat] points */
function haversineDistanceMeters([lng1, lat1], [lng2, lat2]) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/** Projects [lng,lat] points to a local flat XY plane (metres) centred on `origin`.
 *  Good approximation for the small distances involved in geofencing (<50km). */
function projectToLocalXY([lng, lat], [originLng, originLat]) {
  const x = toRad(lng - originLng) * Math.cos(toRad(originLat)) * EARTH_RADIUS_M;
  const y = toRad(lat - originLat) * EARTH_RADIUS_M;
  return [x, y];
}

function isPointInCircle(point, center, radiusMeters) {
  return haversineDistanceMeters(point, center) <= radiusMeters;
}

/** Ray-casting point-in-polygon. `polygon` = array of [lng,lat], first ring only. */
function isPointInPolygon(point, polygon) {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Shortest distance in metres from `point` to a line segment [a,b] (all [lng,lat]) */
function distancePointToSegmentMeters(point, a, b) {
  const origin = point;
  const p = [0, 0];
  const pa = projectToLocalXY(a, origin);
  const pb = projectToLocalXY(b, origin);
  const dx = pb[0] - pa[0];
  const dy = pb[1] - pa[1];
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((p[0] - pa[0]) * dx + (p[1] - pa[1]) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const closest = [pa[0] + t * dx, pa[1] + t * dy];
  return Math.sqrt((p[0] - closest[0]) ** 2 + (p[1] - closest[1]) ** 2);
}

/** Shortest distance in metres from a point to the boundary of a polygon */
function distanceToPolygonBoundaryMeters(point, polygon) {
  let min = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const d = distancePointToSegmentMeters(point, polygon[j], polygon[i]);
    if (d < min) min = d;
  }
  return min;
}

/** Distance from point to a circle's boundary. Negative = inside the circle. */
function distanceToCircleBoundaryMeters(point, center, radiusMeters) {
  return haversineDistanceMeters(point, center) - radiusMeters;
}

/**
 * Given a location and a zone (circle or polygon), return:
 *  { inside: boolean, distanceToBoundary: number (metres, 0 if inside/on boundary) }
 * distanceToBoundary is the distance to the nearest edge - used for WARNING proximity checks
 * for zones the tourist is currently OUTSIDE of (i.e. restricted zones).
 */
function analyzeZoneProximity(point, zone) {
  if (zone.geometry.type === 'Circle') {
    const center = zone.geometry.center.coordinates;
    const radius = zone.geometry.radiusMeters;
    const inside = isPointInCircle(point, center, radius);
    const d = distanceToCircleBoundaryMeters(point, center, radius);
    return { inside, distanceToBoundary: inside ? 0 : d };
  }
  // Polygon
  const ring = zone.geometry.polygon.coordinates[0];
  const inside = isPointInPolygon(point, ring);
  const d = inside ? 0 : distanceToPolygonBoundaryMeters(point, ring);
  return { inside, distanceToBoundary: d };
}

/** Initial bearing in degrees (0-360) from point A to point B, both [lng,lat] */
function bearingDegrees([lng1, lat1], [lng2, lat2]) {
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/** Smallest angle (0-180) between two bearings in degrees */
function angleDiffDegrees(b1, b2) {
  const diff = Math.abs(b1 - b2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** Distance in metres from a point to a polyline (array of [lng,lat]) */
function distanceToPolylineMeters(point, polylineCoords) {
  let min = Infinity;
  for (let i = 1; i < polylineCoords.length; i++) {
    const d = distancePointToSegmentMeters(point, polylineCoords[i - 1], polylineCoords[i]);
    if (d < min) min = d;
  }
  return min === Infinity ? null : min;
}

module.exports = {
  haversineDistanceMeters,
  isPointInCircle,
  isPointInPolygon,
  distanceToPolygonBoundaryMeters,
  distanceToCircleBoundaryMeters,
  analyzeZoneProximity,
  projectToLocalXY,
  bearingDegrees,
  angleDiffDegrees,
  distanceToPolylineMeters,
};
