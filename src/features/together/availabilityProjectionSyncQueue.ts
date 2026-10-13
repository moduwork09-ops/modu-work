import { isLocalCalendarDate, normalizeDirtyDates } from './dayOffProjection';

export const AVAILABILITY_PROJECTION_SYNC_QUEUE_KEY = 'modu-work.availability-projection-sync-queue.v1';
export const AVAILABILITY_PROJECTION_SYNC_QUEUE_VERSION = 2 as const;

export type AvailabilityProjectionSyncQueue = {
  version: typeof AVAILABILITY_PROJECTION_SYNC_QUEUE_VERSION;
  dirtyDates: string[];
  fullSyncPending: boolean;
  clearPending: boolean;
  revision: number;
  retryCount: number;
  nextRetryAt: number | null;
  lastSyncedTimezoneName: string | null;
};

export type AvailabilityQueueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export type AvailabilityProjectionSyncQueueStore = {
  load: (ownerUserId: string) => Promise<AvailabilityProjectionSyncQueue>;
  replace: (ownerUserId: string, queue: AvailabilityProjectionSyncQueue) => Promise<AvailabilityProjectionSyncQueue>;
  update: (ownerUserId: string, updater: (queue: AvailabilityProjectionSyncQueue) => AvailabilityProjectionSyncQueue) => Promise<AvailabilityProjectionSyncQueue>;
};

export class CorruptedAvailabilityProjectionSyncQueueError extends Error {
  constructor() { super('Invalid availability projection sync queue'); this.name = 'CorruptedAvailabilityProjectionSyncQueueError'; }
}

export function createEmptyAvailabilityProjectionSyncQueue(): AvailabilityProjectionSyncQueue {
  return { version: 2, dirtyDates: [], fullSyncPending: false, clearPending: false, revision: 0, retryCount: 0, nextRetryAt: null, lastSyncedTimezoneName: null };
}

export function parseAvailabilityProjectionSyncQueue(value: string): AvailabilityProjectionSyncQueue | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const queue = parsed as Record<string, unknown>;
    if ((queue.version !== 1 && queue.version !== 2) || !Array.isArray(queue.dirtyDates) || !queue.dirtyDates.every(isLocalCalendarDate)
      || typeof queue.fullSyncPending !== 'boolean'
      || (queue.clearPending !== undefined && typeof queue.clearPending !== 'boolean')
      || !Number.isInteger(queue.revision) || (queue.revision as number) < 0
      || !Number.isInteger(queue.retryCount) || (queue.retryCount as number) < 0
      || (queue.nextRetryAt !== null && (typeof queue.nextRetryAt !== 'number' || !Number.isFinite(queue.nextRetryAt) || queue.nextRetryAt < 0))
      || (queue.lastSyncedTimezoneName !== null && (typeof queue.lastSyncedTimezoneName !== 'string' || !queue.lastSyncedTimezoneName.trim()))) return null;
    const rawDirtyDates = queue.dirtyDates as string[];
    const dirtyDates = normalizeDirtyDates(rawDirtyDates);
    if (dirtyDates.length !== rawDirtyDates.length || dirtyDates.some((date, index) => date !== rawDirtyDates[index])) return null;
    return { version: 2, dirtyDates: queue.version === 1 ? [] : dirtyDates,
      fullSyncPending: queue.version === 1 && queue.clearPending !== true ? true : queue.fullSyncPending,
      clearPending: queue.clearPending === true, revision: queue.revision as number,
      retryCount: queue.retryCount as number, nextRetryAt: queue.version === 1 ? null : queue.nextRetryAt as number | null,
      lastSyncedTimezoneName: queue.version === 1 ? null : queue.lastSyncedTimezoneName as string | null };
  } catch { return null; }
}

export function markAvailabilityFullSyncPending(queue: AvailabilityProjectionSyncQueue) {
  if (queue.fullSyncPending) return { ...queue, revision: queue.revision + 1, retryCount: 0, nextRetryAt: null };
  return { ...queue, dirtyDates: [], fullSyncPending: true, revision: queue.revision + 1, retryCount: 0, nextRetryAt: null };
}

export function markAvailabilityClearPending(queue: AvailabilityProjectionSyncQueue) {
  if (queue.clearPending && !queue.fullSyncPending && queue.dirtyDates.length === 0) return queue;
  return { ...queue, dirtyDates: [], fullSyncPending: false, clearPending: true,
    revision: queue.revision + 1, retryCount: 0, nextRetryAt: null };
}

export function mergeAvailabilityDirtyDates(queue: AvailabilityProjectionSyncQueue, dates: readonly string[]) {
  const dirtyDates = normalizeDirtyDates(dates);
  if (dirtyDates.length === 0) return queue;
  if (queue.fullSyncPending || queue.clearPending) return { ...queue, dirtyDates: [], fullSyncPending: true,
    revision: queue.revision + 1, retryCount: 0, nextRetryAt: null };
  const merged = normalizeDirtyDates([...queue.dirtyDates, ...dirtyDates]);
  if (merged.length > 100) return markAvailabilityFullSyncPending(queue);
  return { ...queue, dirtyDates: merged, revision: queue.revision + 1, retryCount: 0, nextRetryAt: null };
}

export function createAvailabilityProjectionSyncQueueStore(storage: AvailabilityQueueStorage, getKey: (ownerUserId: string) => string): AvailabilityProjectionSyncQueueStore {
  const locks = new Map<string, Promise<void>>();
  const withLock = async <T>(ownerUserId: string, action: () => Promise<T>) => {
    const previous = locks.get(ownerUserId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const chained = previous.then(() => current);
    locks.set(ownerUserId, chained);
    await previous;
    try { return await action(); } finally { release(); if (locks.get(ownerUserId) === chained) locks.delete(ownerUserId); }
  };
  const load = async (ownerUserId: string) => {
    const raw = await storage.getItem(getKey(ownerUserId));
    if (raw === null) return createEmptyAvailabilityProjectionSyncQueue();
    const queue = parseAvailabilityProjectionSyncQueue(raw);
    if (!queue) throw new CorruptedAvailabilityProjectionSyncQueueError();
    return queue;
  };
  const replace: AvailabilityProjectionSyncQueueStore['replace'] = (ownerUserId, queue) => withLock(ownerUserId, async () => {
    const validated = parseAvailabilityProjectionSyncQueue(JSON.stringify(queue));
    if (!validated) throw new Error('Invalid availability projection sync queue replacement');
    await storage.setItem(getKey(ownerUserId), JSON.stringify(validated));
    return validated;
  });
  const update: AvailabilityProjectionSyncQueueStore['update'] = (ownerUserId, updater) => withLock(ownerUserId, async () => {
    const next = updater(await load(ownerUserId));
    const validated = parseAvailabilityProjectionSyncQueue(JSON.stringify(next));
    if (!validated) throw new Error('Invalid availability projection sync queue update');
    await storage.setItem(getKey(ownerUserId), JSON.stringify(validated));
    return validated;
  });
  return { load, replace, update };
}
