import { createMemoBusyEvents } from '../memos/memoBusyEvents';
import type { DateMemos } from '../memos/dateMemoStorage';
import type { PersonalEvent } from '../events/personalEventStorage';
import { getShiftForDate, getPreviousIsoDate, type ShiftScheduleInput } from '../shifts/shiftSchedule';
import { calculateDailyAvailabilityProjection, type DailyAvailabilityProjection } from './availabilityProjection';
import { addLocalCalendarDays, createDayOffProjectionRange, isLocalDateInRange, normalizeDirtyDates } from './dayOffProjection';
import { CorruptedAvailabilityProjectionSyncQueueError, createEmptyAvailabilityProjectionSyncQueue, markAvailabilityFullSyncPending, mergeAvailabilityDirtyDates, type AvailabilityProjectionSyncQueue, type AvailabilityProjectionSyncQueueStore } from './availabilityProjectionSyncQueue';

export type AvailabilityHydrationStatus = 'loading' | 'ready' | 'error';
export type AvailabilitySourceSnapshot = {
  hydrationStatus: AvailabilityHydrationStatus;
  hasCompletedSetup: boolean;
  schedule: ShiftScheduleInput;
  personalEvents: PersonalEvent[];
  dateMemos: DateMemos;
  timezoneName: string | null;
};
export type AvailabilityProjectionRange = { rangeStart: string; rangeEnd: string; timezoneName: string; days: DailyAvailabilityProjection[] };
export class FullAvailabilitySyncRequiredError extends Error {}

type Dependencies = {
  queueStore: AvailabilityProjectionSyncQueueStore;
  getCurrentUserId: () => Promise<string | null>;
  fullSync: (range: AvailabilityProjectionRange) => Promise<void>;
  replaceDates: (timezoneName: string, days: DailyAvailabilityProjection[]) => Promise<void>;
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  getTimezoneName?: () => string | null;
};

const RETRY_DELAYS = [5_000, 15_000, 60_000, 300_000] as const;

function createProjection(date: string, source: AvailabilitySourceSnapshot) {
  if (source.hydrationStatus !== 'ready' || !source.timezoneName) throw new Error('Availability source is not trusted');
  const previousDate = getPreviousIsoDate(date);
  const shifts = [previousDate, date].map((shiftDate) => {
    const shift = getShiftForDate(shiftDate, source.schedule);
    return { date: shiftDate, kind: shift.kind, startTime: shift.startTime, endTime: shift.endTime };
  });
  return calculateDailyAvailabilityProjection({
    date,
    timezoneName: source.timezoneName,
    shifts,
    personalEvents: createMemoBusyEvents(source.dateMemos, source.personalEvents),
  });
}

export function createAvailabilityProjectionRange(source: AvailabilitySourceSnapshot): AvailabilityProjectionRange {
  if (source.hydrationStatus !== 'ready' || !source.timezoneName) throw new Error('Availability source is not trusted');
  const coverage = createDayOffProjectionRange(source.schedule);
  return { rangeStart: coverage.rangeStart, rangeEnd: coverage.rangeEnd, timezoneName: source.timezoneName,
    days: coverage.days.map((day) => createProjection(day.localDate, source)) };
}

export function createAvailabilityProjectionSyncCoordinator(dependencies: Dependencies) {
  const now = dependencies.now ?? Date.now;
  const setTimer = dependencies.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = dependencies.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const sources = new Map<string, AvailabilitySourceSnapshot>();
  const activeOwners = new Set<string>();
  const inFlight = new Map<string, Promise<'success' | 'failed' | 'blocked'>>();
  const timers = new Map<string, unknown>();
  const bootstrapRequests = new Map<string, Promise<void>>();
  let foreground = true;

  const cancelTimer = (owner: string) => { const timer = timers.get(owner); if (timer !== undefined) clearTimer(timer); timers.delete(owner); };
  const isCurrentOwner = async (owner: string) => foreground && activeOwners.has(owner) && await dependencies.getCurrentUserId() === owner;
  const scheduleRetry = (owner: string, at: number | null) => {
    cancelTimer(owner);
    if (!foreground || !activeOwners.has(owner) || at === null) return;
    timers.set(owner, setTimer(() => { timers.delete(owner); void drain(owner); }, Math.max(0, at - now())));
  };
  const recordFailure = async (owner: string) => {
    const queue = await dependencies.queueStore.update(owner, (current) => {
      const retryCount = current.retryCount + 1;
      return { ...current, retryCount, nextRetryAt: now() + RETRY_DELAYS[Math.min(retryCount - 1, RETRY_DELAYS.length - 1)] };
    });
    scheduleRetry(owner, queue.nextRetryAt);
  };
  const resetRetry = (queue: AvailabilityProjectionSyncQueue) => ({ ...queue, retryCount: 0, nextRetryAt: null });
  const updateWithFullRecovery = async (owner: string, updater: (queue: AvailabilityProjectionSyncQueue) => AvailabilityProjectionSyncQueue) => {
    try { return await dependencies.queueStore.update(owner, updater); }
    catch (error) {
      if (!(error instanceof CorruptedAvailabilityProjectionSyncQueueError)) throw error;
      return dependencies.queueStore.replace(owner, updater(createEmptyAvailabilityProjectionSyncQueue()));
    }
  };

  const processQueue = async (owner: string, force = false): Promise<'success' | 'failed' | 'blocked'> => {
    while (foreground && activeOwners.has(owner)) {
      const queue = await dependencies.queueStore.load(owner);
      if (!queue.fullSyncPending && queue.dirtyDates.length === 0) { cancelTimer(owner); return 'success'; }
      if (!force && queue.nextRetryAt !== null && queue.nextRetryAt > now()) { scheduleRetry(owner, queue.nextRetryAt); return 'blocked'; }
      if (!await isCurrentOwner(owner)) return 'blocked';
      const source = sources.get(owner);
      if (!source || source.hydrationStatus !== 'ready' || !source.hasCompletedSetup || !source.timezoneName) return 'blocked';
      const currentTimezoneName = dependencies.getTimezoneName?.() ?? source.timezoneName;
      if (!currentTimezoneName) return 'blocked';
      if (currentTimezoneName !== source.timezoneName) {
        sources.set(owner, { ...source, timezoneName: currentTimezoneName });
        await updateWithFullRecovery(owner, markAvailabilityFullSyncPending);
        continue;
      }
      const revision = queue.revision;
      try {
        if (queue.fullSyncPending || queue.lastSyncedTimezoneName !== source.timezoneName) {
          const range = createAvailabilityProjectionRange(source);
          if (!await isCurrentOwner(owner) || sources.get(owner) !== source || source.hydrationStatus !== 'ready') return 'blocked';
          await dependencies.fullSync(range);
          if (!await isCurrentOwner(owner) || sources.get(owner) !== source || source.hydrationStatus !== 'ready') return 'blocked';
          await dependencies.queueStore.update(owner, (current) => current.revision === revision
            ? { ...resetRetry(current), dirtyDates: [], fullSyncPending: false, lastSyncedTimezoneName: source.timezoneName }
            : resetRetry(current));
          continue;
        }
        const coverage = createDayOffProjectionRange(source.schedule);
        if (!queue.dirtyDates.every((date) => isLocalDateInRange(date, coverage.rangeStart, coverage.rangeEnd))) {
          await dependencies.queueStore.update(owner, markAvailabilityFullSyncPending);
          continue;
        }
        const dates = queue.dirtyDates.slice(0, 100);
        const days = dates.map((date) => createProjection(date, source));
        if (!await isCurrentOwner(owner) || sources.get(owner) !== source || source.hydrationStatus !== 'ready') return 'blocked';
        await dependencies.replaceDates(source.timezoneName, days);
        if (!await isCurrentOwner(owner) || sources.get(owner) !== source || source.hydrationStatus !== 'ready') return 'blocked';
        await dependencies.queueStore.update(owner, (current) => current.revision === revision
          ? { ...resetRetry(current), dirtyDates: current.dirtyDates.filter((date) => !dates.includes(date)) }
          : resetRetry(current));
      } catch (error) {
        if (error instanceof FullAvailabilitySyncRequiredError) {
          await dependencies.queueStore.update(owner, markAvailabilityFullSyncPending);
          continue;
        }
        await recordFailure(owner);
        return 'failed';
      }
    }
    return 'blocked';
  };
  const drain = (owner: string, force = false) => {
    const current = inFlight.get(owner);
    if (current) return current;
    const promise = processQueue(owner, force).catch(() => 'failed' as const).finally(() => { inFlight.delete(owner); });
    inFlight.set(owner, promise);
    return promise;
  };
  const kick = (owner: string) => { void drain(owner).then(() => drain(owner)); };
  const ensureBootstrap = (owner: string) => {
    const source = sources.get(owner);
    if (!source || source.hydrationStatus !== 'ready' || !source.hasCompletedSetup || !source.timezoneName) return Promise.resolve();
    const current = bootstrapRequests.get(owner);
    if (current) return current;
    const request = (async () => {
      if (!await isCurrentOwner(owner)) return;
      const queue = await updateWithFullRecovery(owner, (existing) => existing.fullSyncPending || existing.lastSyncedTimezoneName === source.timezoneName
        ? existing : markAvailabilityFullSyncPending(existing));
      if (queue.fullSyncPending) kick(owner);
    })().finally(() => { bootstrapRequests.delete(owner); });
    bootstrapRequests.set(owner, request);
    return request;
  };
  return {
    setSource(owner: string, source: AvailabilitySourceSnapshot) { sources.set(owner, source); if (activeOwners.has(owner)) { void ensureBootstrap(owner); kick(owner); } },
    activate(owner: string) { activeOwners.add(owner); void ensureBootstrap(owner); kick(owner); },
    deactivate(owner: string) { activeOwners.delete(owner); sources.delete(owner); cancelTimer(owner); },
    setForeground(active: boolean) { foreground = active; if (!active) [...timers.keys()].forEach(cancelTimer); else activeOwners.forEach((owner) => { void ensureBootstrap(owner); kick(owner); }); },
    async enqueueDates(owner: string, values: readonly unknown[]) {
      const dates = normalizeDirtyDates(values);
      const source = sources.get(owner);
      if (!dates.length || !source || source.hydrationStatus !== 'ready' || !source.hasCompletedSetup || !source.timezoneName || !await isCurrentOwner(owner)) return false;
      try {
        await dependencies.queueStore.update(owner, (queue) => queue.lastSyncedTimezoneName !== source.timezoneName
          ? markAvailabilityFullSyncPending(queue) : mergeAvailabilityDirtyDates(queue, dates));
      } catch (error) {
        if (!(error instanceof CorruptedAvailabilityProjectionSyncQueueError)) throw error;
        await dependencies.queueStore.replace(owner, markAvailabilityFullSyncPending(createEmptyAvailabilityProjectionSyncQueue()));
      }
      kick(owner); return true;
    },
    async scheduleFull(owner: string) {
      const source = sources.get(owner);
      if (!source || source.hydrationStatus !== 'ready' || !source.hasCompletedSetup || !source.timezoneName || !await isCurrentOwner(owner)) return false;
      await updateWithFullRecovery(owner, markAvailabilityFullSyncPending); kick(owner); return true;
    },
    drain,
  };
}

export function getAvailabilityAffectedShiftDates(date: string) {
  return normalizeDirtyDates([date, addLocalCalendarDays(date, 1)]);
}

export function getAvailabilityAffectedEventDates(previousDate: string | undefined, nextDate: string | undefined) {
  return normalizeDirtyDates([previousDate, nextDate].filter((date): date is string => Boolean(date)));
}
