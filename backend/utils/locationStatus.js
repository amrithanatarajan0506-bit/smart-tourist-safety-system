/**
 * Feature 5: LIVE vs LAST-KNOWN vs OFFLINE vs UNKNOWN.
 * Threshold is configurable via env, not hard-coded.
 */
const LIVE_THRESHOLD_SECONDS = Number(process.env.LOCATION_LIVE_THRESHOLD_SECONDS || 120);
const OFFLINE_THRESHOLD_SECONDS = Number(process.env.LOCATION_OFFLINE_THRESHOLD_SECONDS || 900);

function computeLocationStatus(lastTimestamp) {
  if (!lastTimestamp) return 'UNKNOWN';
  const ageSeconds = (Date.now() - new Date(lastTimestamp).getTime()) / 1000;
  if (ageSeconds <= LIVE_THRESHOLD_SECONDS) return 'LIVE';
  if (ageSeconds <= OFFLINE_THRESHOLD_SECONDS) return 'LAST_KNOWN';
  return 'OFFLINE';
}

module.exports = { computeLocationStatus, LIVE_THRESHOLD_SECONDS, OFFLINE_THRESHOLD_SECONDS };
