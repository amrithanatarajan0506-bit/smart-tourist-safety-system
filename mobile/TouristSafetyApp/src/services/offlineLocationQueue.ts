import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * offlineLocationQueue
 * Feature 8: Offline Location Storage.
 *
 * When the device has GPS but no internet, points are pushed here instead of
 * being lost. They are kept in chronological order with a `synced` flag and
 * a locally-generated `clientPointId` so the backend can safely de-duplicate
 * if the same point is retried after a partial network failure.
 */

const STORAGE_KEY = '@offline_location_queue';

export interface QueuedPoint {
  clientPointId: string;
  tripId: string;
  latitude: number;
  longitude: number;
  timestamp: string; // ISO string
  accuracy?: number;
  speed?: number;
  heading?: number;
  battery?: number;
  synced: boolean;
}

function makeClientPointId(): string {
  return `pt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function readAll(): Promise<QueuedPoint[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function writeAll(points: QueuedPoint[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(points));
}

export const offlineLocationQueue = {
  /** Store a point locally because sending it live failed / there's no connectivity. */
  async enqueue(point: Omit<QueuedPoint, 'clientPointId' | 'synced'>): Promise<QueuedPoint> {
    const queued: QueuedPoint = { ...point, clientPointId: makeClientPointId(), synced: false };
    const all = await readAll();
    all.push(queued);
    await writeAll(all);
    return queued;
  },

  /** All points not yet confirmed as synchronised, oldest first. */
  async getPending(): Promise<QueuedPoint[]> {
    const all = await readAll();
    return all.filter((p) => !p.synced).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  },

  async pendingCount(): Promise<number> {
    return (await this.getPending()).length;
  },

  /** Mark a batch as synced (called after a successful backend sync call). */
  async markSynced(clientPointIds: string[]): Promise<void> {
    const ids = new Set(clientPointIds);
    const all = await readAll();
    const updated = all.map((p) => (ids.has(p.clientPointId) ? { ...p, synced: true } : p));
    await writeAll(updated);
  },

  /** Drop already-synced points to keep local storage small. Call after a successful sync. */
  async pruneSynced(): Promise<void> {
    const all = await readAll();
    await writeAll(all.filter((p) => !p.synced));
  },

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
  },
};
