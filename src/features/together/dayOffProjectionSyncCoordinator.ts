import type { ShiftScheduleInput } from '../shifts/shiftSchedule';
import {
  createDayOffProjectionItem,
  createDayOffProjectionRange,
  isLocalCalendarDate,
  isLocalDateInRange,
  type DayOffProjectionItem,
  type DayOffProjectionRange,
} from './dayOffProjection';
import {
  CorruptedDayOffProjectionSyncQueueError,
  createEmptyDayOffProjectionSyncQueue,
  mergeDayOffProjectionDirtyDates,
  type DayOffProjectionSyncQueue,
  type DayOffProjectionSyncQueueStore,
} from './dayOffProjectionSyncQueue';

export type ProjectionHydrationStatus = 'loading' | 'ready' | 'error';

export type DayOffProjectionScheduleSnapshot = ShiftScheduleInput & {
  hydrationStatus: ProjectionHydrationStatus;
  hasCompletedSetup: boolean;
};

export type DayOffProjectionCoverage = {
  rangeStart: string;
  rangeEnd: string;
};

export type DayOffProjectionSyncResult = 'success' | 'failed' | 'blocked';

export type DayOffProjectionSyncCoordinatorDependencies = {
  queueStore: DayOffProjectionSyncQueueStore;
  getCurrentUserId: () => Promise<string | null>;
  getCoverage: () => Promise<DayOffProjectionCoverage | null>;
  upsert: (days: DayOffProjectionItem[]) => Promise<void>;
  fullSync: (range: DayOffProjectionRange) => Promise<void>;
  clear: () => Promise<void>;
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => unknown;
  clearTimer?: (timer: unknown) => void;
};

const RETRY_DELAYS = [5_000, 15_000, 60_000, 300_000] as const;

function hasPendingWork(queue: DayOffProjectionSyncQueue) {
  return queue.clearPending
    || queue.replacementPhase !== 'none'
    || queue.fullSyncPending
    || queue.dirtyDates.length > 0;
}

function resetRetry(queue: DayOffProjectionSyncQueue): DayOffProjectionSyncQueue {
  return { ...queue, retryCount: 0, nextRetryAt: null };
}

export function createDayOffProjectionSyncCoordinator(
  dependencies: DayOffProjectionSyncCoordinatorDependencies,
) {
  const now = dependencies.now ?? Date.now;
  const setTimer = dependencies.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = dependencies.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const schedules = new Map<string, DayOffProjectionScheduleSnapshot>();
  const coverages = new Map<string, DayOffProjectionCoverage | null>();
  const activeOwners = new Set<string>();
  const inFlight = new Map<string, Promise<DayOffProjectionSyncResult>>();
  const timers = new Map<string, unknown>();
  let isForeground = true;

  const cancelTimer = (ownerUserId: string) => {
    const timer = timers.get(ownerUserId);
    if (timer !== undefined) clearTimer(timer);
    timers.delete(ownerUserId);
  };

  const scheduleRetry = (ownerUserId: string, nextRetryAt: number | null) => {
    cancelTimer(ownerUserId);
    if (!isForeground || !activeOwners.has(ownerUserId) || nextRetryAt === null) return;
    const timer = setTimer(() => {
      timers.delete(ownerUserId);
      void drain(ownerUserId);
    }, Math.max(0, nextRetryAt - now()));
    timers.set(ownerUserId, timer);
  };

  const isCurrentOwner = async (ownerUserId: string) => (
    isForeground && activeOwners.has(ownerUserId) && await dependencies.getCurrentUserId() === ownerUserId
  );

  const recordFailure = async (ownerUserId: string) => {
    const queue = await dependencies.queueStore.update(ownerUserId, (current) => {
      const retryCount = current.retryCount + 1;
      const delay = RETRY_DELAYS[Math.min(retryCount - 1, RETRY_DELAYS.length - 1)];
      return { ...current, retryCount, nextRetryAt: now() + delay };
    });
    scheduleRetry(ownerUserId, queue.nextRetryAt);
  };

  const refreshCoverage = async (ownerUserId: string) => {
    if (!await isCurrentOwner(ownerUserId)) return null;
    const coverage = await dependencies.getCoverage();
    coverages.set(ownerUserId, coverage);
    return coverage;
  };

  const processQueue = async (ownerUserId: string, force: boolean): Promise<DayOffProjectionSyncResult> => {
    const initialSchedule = schedules.get(ownerUserId);
    if (!initialSchedule || initialSchedule.hydrationStatus !== 'ready' || !initialSchedule.hasCompletedSetup) return 'blocked';

    while (isForeground && activeOwners.has(ownerUserId)) {
      const queue = await dependencies.queueStore.load(ownerUserId);
      if (!hasPendingWork(queue)) {
        cancelTimer(ownerUserId);
        return 'success';
      }
      if (!force && queue.nextRetryAt !== null && queue.nextRetryAt > now()) {
        scheduleRetry(ownerUserId, queue.nextRetryAt);
        return 'blocked';
      }
      if (!await isCurrentOwner(ownerUserId)) return 'blocked';
      const schedule = schedules.get(ownerUserId);
      if (!schedule || schedule.hydrationStatus !== 'ready' || !schedule.hasCompletedSetup) return 'blocked';

      const snapshotRevision = queue.revision;
      try {
        if (queue.clearPending) {
          await dependencies.clear();
          coverages.set(ownerUserId, null);
          await dependencies.queueStore.update(ownerUserId, (current) => ({
            ...resetRetry(current),
            clearPending: false,
            dirtyDates: current.revision === snapshotRevision ? [] : current.dirtyDates,
          }));
          continue;
        }

        if (queue.replacementPhase === 'clear_pending') {
          await dependencies.clear();
          coverages.set(ownerUserId, null);
          await dependencies.queueStore.update(ownerUserId, (current) => ({
            ...resetRetry(current),
            replacementPhase: 'full_pending',
          }));
          continue;
        }

        if (queue.replacementPhase === 'full_pending' || queue.fullSyncPending) {
          const range = createDayOffProjectionRange(schedule);
          await dependencies.fullSync(range);
          coverages.set(ownerUserId, { rangeStart: range.rangeStart, rangeEnd: range.rangeEnd });
          await dependencies.queueStore.update(ownerUserId, (current) => {
            if (current.revision !== snapshotRevision) {
              return {
                ...resetRetry(current),
                replacementPhase: current.replacementPhase,
              };
            }
            return {
              ...resetRetry(current),
              dirtyDates: [],
              fullSyncPending: false,
              replacementPhase: 'none',
            };
          });
          continue;
        }

        const batchDates = queue.dirtyDates.slice(0, 100);
        const days = batchDates.map((date) => createDayOffProjectionItem(date, schedule));
        await dependencies.upsert(days);
        await dependencies.queueStore.update(ownerUserId, (current) => current.revision === snapshotRevision
          ? { ...resetRetry(current), dirtyDates: current.dirtyDates.filter((date) => !batchDates.includes(date)) }
          : resetRetry(current));
      } catch {
        await recordFailure(ownerUserId);
        return 'failed';
      }
    }
    return 'blocked';
  };

  const drain = (ownerUserId: string, force = false) => {
    const existing = inFlight.get(ownerUserId);
    if (existing) return existing;
    const promise = processQueue(ownerUserId, force)
      .catch((): DayOffProjectionSyncResult => 'failed')
      .finally(() => { inFlight.delete(ownerUserId); });
    inFlight.set(ownerUserId, promise);
    return promise;
  };

  return {
    setSchedule(ownerUserId: string, schedule: DayOffProjectionScheduleSnapshot) {
      schedules.set(ownerUserId, schedule);
      if (schedule.hydrationStatus === 'ready' && activeOwners.has(ownerUserId)) {
        void drain(ownerUserId);
      }
    },
    activate(ownerUserId: string) {
      activeOwners.add(ownerUserId);
      void refreshCoverage(ownerUserId).catch(() => undefined);
      void drain(ownerUserId);
    },
    deactivate(ownerUserId: string) {
      activeOwners.delete(ownerUserId);
      schedules.delete(ownerUserId);
      coverages.delete(ownerUserId);
      cancelTimer(ownerUserId);
    },
    setForeground(active: boolean) {
      isForeground = active;
      if (!active) {
        [...timers.keys()].forEach(cancelTimer);
        return;
      }
      activeOwners.forEach((ownerUserId) => { void drain(ownerUserId); });
    },
    async enqueueDirtyDate(ownerUserId: string, localDate: string) {
      if (!isLocalCalendarDate(localDate)) return false;
      const schedule = schedules.get(ownerUserId);
      if (!schedule || schedule.hydrationStatus !== 'ready' || !schedule.hasCompletedSetup) return false;
      let coverage = coverages.get(ownerUserId);
      if (coverage === undefined) {
        try {
          coverage = await refreshCoverage(ownerUserId);
        } catch {
          return false;
        }
      }
      if (!coverage || !isLocalDateInRange(localDate, coverage.rangeStart, coverage.rangeEnd)) return false;
      await dependencies.queueStore.update(ownerUserId, (queue) => mergeDayOffProjectionDirtyDates(queue, [localDate]));
      void drain(ownerUserId);
      return true;
    },
    async requestFullSync(ownerUserId: string) {
      const schedule = schedules.get(ownerUserId);
      if (!schedule || schedule.hydrationStatus !== 'ready' || !schedule.hasCompletedSetup) return 'blocked' as const;
      try {
        await dependencies.queueStore.update(ownerUserId, (queue) => ({
          ...queue,
          dirtyDates: [],
          fullSyncPending: true,
          revision: queue.revision + 1,
          retryCount: 0,
          nextRetryAt: null,
        }));
      } catch (error) {
        if (!(error instanceof CorruptedDayOffProjectionSyncQueueError)) throw error;
        await dependencies.queueStore.replace(ownerUserId, {
          ...createEmptyDayOffProjectionSyncQueue(),
          fullSyncPending: true,
          revision: 1,
        });
      }
      const result = await drain(ownerUserId, true);
      if (result !== 'success') return result;
      const queue = await dependencies.queueStore.load(ownerUserId);
      return queue.fullSyncPending ? 'failed' as const : 'success' as const;
    },
    async requestReplacementSync(ownerUserId: string) {
      await dependencies.queueStore.update(ownerUserId, (queue) => ({
        ...queue,
        dirtyDates: [],
        fullSyncPending: false,
        clearPending: false,
        replacementPhase: 'clear_pending',
        revision: queue.revision + 1,
        retryCount: 0,
        nextRetryAt: null,
      }));
      return drain(ownerUserId, true);
    },
    drain,
    refreshCoverage,
  };
}
