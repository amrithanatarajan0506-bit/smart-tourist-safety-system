const Trip = require('../models/Trip');
const User = require('../models/User');
const incidentService = require('./incidentService');

let watcherInterval = null;

const OFFLINE_THRESHOLD_MINUTES = Number(
  process.env.OFFLINE_THRESHOLD_MINUTES || 5
);

async function checkOfflineTourists(socketHandler) {
  try {
    const activeTrips = await Trip.find({
      status: 'ACTIVE'
    });

    const now = new Date();

    for (const trip of activeTrips) {
      const tourist = await User.findById(trip.tourist);

      if (!tourist || !tourist.lastLocation?.timestamp) {
        continue;
      }

      const lastLocationTime = new Date(
        tourist.lastLocation.timestamp
      );

      const differenceMinutes =
        (now - lastLocationTime) / (1000 * 60);

      if (differenceMinutes >= OFFLINE_THRESHOLD_MINUTES) {

        const dedupeKey = `offline:${trip._id}`;

        const result = await incidentService.createIncident({
          eventType: 'OFFLINE',
          severity: 'HIGH',
          tourist: trip.tourist,
          trip: trip._id,
          location: tourist.lastLocation,
          message: `Tourist location has not been updated for ${Math.floor(differenceMinutes)} minutes`,
          details: {
            reasons: [
              `No location update for ${Math.floor(differenceMinutes)} minutes`
            ],
            offlineMinutes: Math.floor(differenceMinutes)
          },
          dedupeKey
        });

        await User.findByIdAndUpdate(trip.tourist, {
          'safety.locationStatus': 'OFFLINE',
          'safety.status': 'ATTENTION_REQUIRED',
          'safety.lastUpdatedAt': new Date()
        });

        if (socketHandler && socketHandler.io) {
          socketHandler.io.emit('tourist_offline', {
            touristId: trip.tourist,
            tripId: trip._id,
            offlineMinutes: Math.floor(differenceMinutes),
            incidentId: result.incident._id
          });
        }

        console.log(
          `📡 Offline tourist detected: ${trip.tourist}`
        );
      }
    }

  } catch (error) {
    console.error(
      '❌ Offline watcher error:',
      error.message
    );
  }
}

function start(socketHandler) {
  if (watcherInterval) {
    console.log('📡 Offline watcher already running');
    return;
  }

  console.log(
    `📡 Offline watcher started. Checking every 60 seconds. Threshold: ${OFFLINE_THRESHOLD_MINUTES} minutes`
  );

  checkOfflineTourists(socketHandler);

  watcherInterval = setInterval(() => {
    checkOfflineTourists(socketHandler);
  }, 60 * 1000);
}

function stop() {
  if (watcherInterval) {
    clearInterval(watcherInterval);
    watcherInterval = null;
    console.log('📡 Offline watcher stopped');
  }
}

module.exports = {
  start,
  stop,
  checkOfflineTourists
};