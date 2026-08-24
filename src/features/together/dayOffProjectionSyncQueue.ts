import { isLocalCalendarDate, normalizeDirtyDates } from './dayOffProjection';

export const DAY_OFF_PROJECTION_SYNC_QUEUE_KEY = 'modu-work.day-off-projection-sync-queue.v1';
export const DAY_OFF_PROJECTION_SYNC_QUEUE_VERSION = 1 as const;

export type DayOffReplacementPhase = 'none' | 'clear_pending' | 'full_pending';

export type DayOffProjectionSyncQueue = {
  version: typeof DAY_OFF_PROJECTION_SYNC_QUEUE_VERSION;
  dirtyDates: string[];
  fullSyncPending: boolean;
  clearPending: boolean;
  replacementPhase: DayOffReplacementPhase;
  revision: number;
  retryCount: number;
  nextRetryAt: number | null;
};

export type QueueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export type DayOffProjectionSyncQueueStore = {
  load: (ownerUserId: string) => Promise<DayOffProjectionSyncQueue>;
  replace: (ownerUserId: string, queue: DayOffProjectionSyncQueue) => Promise<DayOffProjectionSyncQueue>;
  update: (
    ownerUserId: string,
    updater: (queue: DayOffProjectionSyncQueue) => DayOffProjectionSyncQueue,
  ) => Promise<DayOffProjectionSyncQueue>;
};

export class CorruptedDayOffProjectionSyncQueueError extends Error {
  constructor() {
    super('Invalid day off projection sync queue');
    this.name = 'CorruptedDayOffProjectionSyncQueueError';
  }
}

export function createEmptyDayOffProjectionSyncQueue(): DayOffProjectionSyncQueue {
  return {
    version: DAY_OFF_PROJECTION_SYNC_QUEUE_VERSION,
    dirtyDates: [],
    fullSyncPending: false,
    clearPending: false,
    replacementPhase: 'none',
    revision: 0,
    retryCount: 0,
    nextRetryAt: null,
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function parseDayOffProjectionSyncQueue(value: string): DayOffProjectionSyncQueue | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const queue = parsed as Record<string, unknown>;
    if (queue.version !== DAY_OFF_PROJECTION_SYNC_QUEUE_VERSION
      || !Array.isArray(queue.dirtyDates)
      || !queue.dirtyDates.every(isLocalCalendarDate)
      || typeof queue.fullSyncPending !== 'boolean'
      || typeof queue.clearPending !== 'boolean'
      || (queue.replacementPhase !== 'none'
        && queue.replacementPhase !== 'clear_pending'
        && queue.replacementPhase !== 'full_pending')
      || !isNonNegativeInteger(queue.revision)
      || !isNonNegativeInteger(queue.retryCount)
      || (queue.nextRetryAt !== null
        && (typeof queue.nextRetryAt !== 'number' || !Number.isFinite(queue.nextRetryAt) || queue.nextRetryAt < 0))) {
      return null;
    }
    const rawDirtyDates = queue.dirtyDates as string[];
    const dirtyDates = normalizeDirtyDates(rawDirtyDates);
    if (dirtyDates.length !== rawDirtyDates.length
      || dirtyDates.some((date, index) => date !== rawDirtyDates[index])) return null;
    return {
      version: DAY_OFF_PROJECTION_SYNC_QUEUE_VERSION,
      dirtyDates,
      fullSyncPending: queue.fullSyncPending,
      clearPending: queue.clearPending,
      replacementPhase: queue.replacementPhase,
      revision: queue.revision,
      retryCount: queue.retryCount,
      nextRetryAt: queue.nextRetryAt,
    };
  } catch {
    return null;
  }
}

export function mergeDayOffProjectionDirtyDates(
  queue: DayOffProjectionSyncQueue,
  dates: readonly string[],
): DayOffProjectionSyncQueue {
  const normalizedDates = normalizeDirtyDates(dates);
  if (normalizedDates.length === 0) return queue;
  if (queue.fullSyncPending || queue.replacementPhase === 'full_pending') {
    return {
      ...queue,
      revision: queue.revision + 1,
      retryCount: 0,
      nextRetryAt: null,
    };
  }
  if (queue.replacementPhase === 'clear_pending' || queue.clearPending) return queue;
  const dirtyDates = normalizeDirtyDates([...queue.dirtyDates, ...normalizedDates]);
  return {
    ...queue,
    dirtyDates,
    revision: queue.revision + 1,
    retryCount: 0,
    nextRetryAt: null,
  };
}

export function createDayOffProjectionSyncQueueStore(
  storage: QueueStorage,
  getKey: (ownerUserId: string) => string,
): DayOffProjectionSyncQueueStore {
  const locks = new Map<string, Promise<void>>();

  const withLock = async <T>(ownerUserId: string, action: () => Promise<T>) => {
    const previous = locks.get(ownerUserId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const chained = previous.then(() => current);
    locks.set(ownerUserId, chained);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (locks.get(ownerUserId) === chained) locks.delete(ownerUserId);
    }
  };

  const load = async (ownerUserId: string) => {
    const value = await storage.getItem(getKey(ownerUserId));
    if (value === null) return createEmptyDayOffProjectionSyncQueue();
    const queue = parseDayOffProjectionSyncQueue(value);
    if (!queue) throw new CorruptedDayOffProjectionSyncQueueError();
    return queue;
  };

  const replace: DayOffProjectionSyncQueueStore['replace'] = (ownerUserId, queue) => withLock(ownerUserId, async () => {
      const validated = parseDayOffProjectionSyncQueue(JSON.stringify(queue));
      if (!validated) throw new Error('Invalid replacement day off projection sync queue');
      await storage.setItem(getKey(ownerUserId), JSON.stringify(validated));
      return validated;
    });

  const update: DayOffProjectionSyncQueueStore['update'] = (ownerUserId, updater) => withLock(ownerUserId, async () => {
      const next = updater(await load(ownerUserId));
      await storage.setItem(getKey(ownerUserId), JSON.stringify(next));
      return next;
    });

  return { load, replace, update };
}
