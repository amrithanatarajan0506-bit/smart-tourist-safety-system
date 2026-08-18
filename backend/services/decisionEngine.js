const User = require('../models/User');

/**
 * Automatically synchronizes the tourist safety profile.
 */
async function syncTouristSafety(touristId, updates = {}) {
  try {
    const setUpdates = {
      'safety.lastUpdatedAt': new Date()
    };

    // Update only the allowed safety fields
    if (updates.tripStatus !== undefined) {
      setUpdates['safety.tripStatus'] = updates.tripStatus;
    }

    if (updates.monitoringStatus !== undefined) {
      setUpdates['safety.monitoringStatus'] = updates.monitoringStatus;
    }

    if (updates.locationStatus !== undefined) {
      setUpdates['safety.locationStatus'] = updates.locationStatus;
    }

    if (updates.batteryPercent !== undefined) {
      setUpdates['safety.batteryPercent'] = updates.batteryPercent;
    }

    if (updates.riskScore !== undefined) {
      setUpdates['safety.riskScore'] = updates.riskScore;
    }

    if (updates.riskLevel !== undefined) {
      setUpdates['safety.riskLevel'] = updates.riskLevel;
    }

    if (updates.status !== undefined) {
      setUpdates['safety.status'] = updates.status;
    }

    if (updates.contributingFactors !== undefined) {
      setUpdates['safety.contributingFactors'] = updates.contributingFactors;
    }

    if (updates.recommendedAction !== undefined) {
      setUpdates['safety.recommendedAction'] = updates.recommendedAction;
    }

    const user = await User.findByIdAndUpdate(
      touristId,
      { $set: setUpdates },
      { new: true, runValidators: true }
    );

    if (!user) {
      console.warn(`Decision Engine: Tourist not found: ${touristId}`);
      return null;
    }

    console.log(
      `Decision Engine: Safety profile updated for ${user.digitalId}`
    );

    return user.safety;
  } catch (error) {
    console.error('Decision Engine syncTouristSafety error:', error);
    throw error;
  }
}

module.exports = {
  syncTouristSafety
};