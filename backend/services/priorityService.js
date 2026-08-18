function computePriority(incident, options = {}) {
  const openIncidentCountForTourist =
    options.openIncidentCountForTourist || 0;

  let priorityScore = 0;

  const severityScores = {
    LOW: 20,
    MEDIUM: 50,
    HIGH: 75,
    CRITICAL: 100,
  };

  priorityScore += severityScores[incident.severity] || 30;

  // SOS always receives very high priority
  if (incident.eventType === 'SOS') {
    priorityScore += 30;
  }

  // Multiple open incidents increase priority
  priorityScore += Math.min(
    openIncidentCountForTourist * 5,
    15
  );

  // Limit score between 0 and 100
  priorityScore = Math.min(100, Math.max(0, priorityScore));

  let priorityLevel;

  if (priorityScore >= 90) {
    priorityLevel = 'CRITICAL';
  } else if (priorityScore >= 70) {
    priorityLevel = 'HIGH';
  } else if (priorityScore >= 40) {
    priorityLevel = 'MEDIUM';
  } else {
    priorityLevel = 'LOW';
  }

  return {
    priorityScore,
    priorityLevel,
  };
}

module.exports = {
  computePriority,
};