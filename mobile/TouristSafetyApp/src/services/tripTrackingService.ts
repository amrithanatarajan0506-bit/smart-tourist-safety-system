import { locationService } from './locationService';
import { tripAPI, liveLocationAPI } from './api';
import { offlineLocationQueue, QueuedPoint } from './offlineLocationQueue';
import { TRACKING_CONFIG } from '../config';
import { LocationData } from '../types';

/**
 * tripTrackingService
 * Orchestrates Features 3, 4, 5 and 8 on top of the EXISTING LocationService
 * (GPS access is unchanged) and the existing api.ts axios client.
 *
 * Flow implemented here:
 *   START TRIP -> continuous GPS -> try LIVE send -> on failure, OFFLINE QUEUE
 *   -> periodic SYNC of the queue when connectivity returns -> STOP TRIP
 */
class TripTrackingService {
  private activeTripId: string | null = null;
  private syncIntervalHandle: ReturnType<typeof setInterval> | null = null;
  private getBattery: (() => Promise<number | undefined>) | null = null;
  private uiListener: ((location: LocationData) => void) | null = null;

  /** Optional hook: wire a real battery library (e.g. react-native-device-info)
   *  here later. Architecture already carries `battery` end-to-end without changes. */
  setBatteryProvider(fn: () => Promise<number | undefined>) {
    this.getBattery = fn;
  }

  /** Optional hook so a screen can mirror the raw GPS fixes for display
   *  purposes without opening a second, conflicting GPS watcher. */
  setUiListener(fn: ((location: LocationData) => void) | null) {
    this.uiListener = fn;
  }

  async startTrip(destination?: string, notes?: string): Promise<string> {
    const { trip } = await tripAPI.start({ destination, notes });
    this.activeTripId = trip.tripId;

    const hasPermission = await locationService.requestLocationPermission();
    if (!hasPermission) throw new Error('Location permission not granted');

    locationService.startLocationTracking(
      (location) => this.handleLocationUpdate(location),
      (error) => console.warn('Location tracking error (trip continues):', error)
    );

    this.syncIntervalHandle = setInterval(() => this.flushOfflineQueue(), TRACKING_CONFIG.offlineSyncRetryMs);

    return trip.tripId;
  }

  async stopTrip(): Promise<void> {
    locationService.stopLocationTracking();
    if (this.syncIntervalHandle) {
      clearInterval(this.syncIntervalHandle);
      this.syncIntervalHandle = null;
    }
    // One last attempt to flush anything still queued before ending the trip
    await this.flushOfflineQueue();

    if (this.activeTripId) {
      await tripAPI.stop(this.activeTripId);
    }
    this.activeTripId = null;
  }

  getActiveTripId(): string | null {
    return this.activeTripId;
  }

  private async handleLocationUpdate(location: LocationData) {
    if (this.uiListener) this.uiListener(location);
    if (!this.activeTripId) return;
    const battery = this.getBattery ? await this.getBattery().catch(() => undefined) : undefined;

    const payload = {
      tripId: this.activeTripId,
      latitude: location.latitude,
      longitude: location.longitude,
      timestamp: (location.timestamp instanceof Date ? location.timestamp : new Date(location.timestamp)).toISOString(),
      accuracy: location.accuracy,
      speed: location.speed,
      battery,
    };

    try {
      await liveLocationAPI.sendLive(payload);
      // Connectivity is back - opportunistically flush anything still queued
      const pending = await offlineLocationQueue.pendingCount();
      if (pending > 0) this.flushOfflineQueue();
    } catch (err) {
      // Feature 8: no internet (or a transient failure) - never lose the GPS fix
      await offlineLocationQueue.enqueue(payload);
    }
  }

  private flushing = false;
  async flushOfflineQueue(): Promise<void> {
    if (this.flushing) return;
    const pending = await offlineLocationQueue.getPending();
    if (pending.length === 0) return;

    this.flushing = true;
    try {
      const result = await liveLocationAPI.sync(
        pending.map((p) => ({
          clientPointId: p.clientPointId,
          tripId: p.tripId,
          latitude: p.latitude,
          longitude: p.longitude,
          timestamp: p.timestamp,
          accuracy: p.accuracy,
          speed: p.speed,
          heading: p.heading,
          battery: p.battery,
        }))
      );
      if (result.success) {
        await offlineLocationQueue.markSynced(pending.map((p: QueuedPoint) => p.clientPointId));
        await offlineLocationQueue.pruneSynced();
      }
    } catch (err) {
      // Still offline - leave the queue as-is, will retry on the next interval tick
      console.log('Offline sync retry failed, will try again later');
    } finally {
      this.flushing = false;
    }
  }
}

export const tripTrackingService = new TripTrackingService();
