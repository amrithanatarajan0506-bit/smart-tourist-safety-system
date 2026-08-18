function generateRecommendation({ severity, factors = [], eventType }) {
  const text = factors.join(' ').toLowerCase();

  if (eventType === 'SOS') {
    return 'Emergency response required immediately. Notify nearby authorities and emergency contacts.';
  }

  if (severity === 'CRITICAL') {
    return 'Immediate intervention required. Dispatch the nearest response team and continuously monitor the tourist.';
  }

  if (severity === 'HIGH') {
    return 'High-risk situation detected. Contact the tourist immediately and alert the responsible authority.';
  }

  if (eventType === 'GEOFENCE_VIOLATION') {
    return 'Tourist entered or approached a restricted area. Send a warning and guide the tourist toward a safe route.';
  }

  if (text.includes('battery')) {
    return 'Low battery detected. Ask the tourist to charge the device and preserve battery for emergency communication.';
  }

  if (text.includes('offline') || text.includes('location')) {
    return 'Monitor the last known location and automatically resume live tracking when connectivity returns.';
  }

  if (severity === 'MEDIUM') {
    return 'Continue automated monitoring and notify the tourist to follow the recommended safety instructions.';
  }

  return 'No immediate action is required. Continue automated safety monitoring.';
}

module.exports = {
  generateRecommendation,
};