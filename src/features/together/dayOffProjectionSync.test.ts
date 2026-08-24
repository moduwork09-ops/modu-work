import type { ShiftType } from '../shift-settings/mockData';
import type { ShiftScheduleInput } from '../shifts/shiftSchedule';
import { parseStoredValue } from '../storage/storageLoadResult';
import { getUserScopedStorageKey } from '../storage/userScopedStorageKey';
import { addLocalCalendarDays, createDayOffProjectionItem } from './dayOffProjection';
import { createDayOffProjectionSyncCoordinator } from './dayOffProjectionSyncCoordinator';
import {
  createDayOffProjectionSyncQueueStore,
  createEmptyDayOffProjectionSyncQueue,
  DAY_OFF_PROJECTION_SYNC_QUEUE_KEY,
  mergeDayOffProjectionDirtyDates,
  parseDayOffProjectionSyncQueue,
  type QueueStorage,
} from './dayOffProjectionSyncQueue';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((next) => { resolve = next; });
  return { promise, resolve };
}

function memoryStorage(): QueueStorage {
  const values = new Map<string, string>();
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
  };
}

const work: ShiftType = { id: 'work', abbreviation: '근', name: '근무', kind: 'work', color: '#FFFFFF', textColor: '#000000' };
const rest: ShiftType = { id: 'rest', abbreviation: '휴', name: '휴무', kind: 'rest', color: '#FFFFFF', textColor: '#000000' };
const baseSchedule: ShiftScheduleInput = {
  shiftTypes: [work, rest],
  shiftPattern: ['work'],
  anchorDate: '2026-01-01',
  anchorPatternIndex: 0,
  patternHistory: [{ id: 'base', effectiveFrom: '2026-01-01', pattern: ['work'], anchorDate: '2026-01-01', anchorPatternIndex: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
  shiftDateOverrides: {},
};

function readySchedule(schedule: ShiftScheduleInput = baseSchedule) {
  return { ...schedule, hydrationStatus: 'ready' as const, hasCompletedSetup: true };
}

async function run() {
  const parseJsonObject = (value: string) => {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  };
  assert(parseStoredValue(null, parseJsonObject).status === 'ready', 'null storage value must be ready');
  assert(parseStoredValue('', parseJsonObject).status === 'error', 'empty storage value must be an error');
  assert(parseStoredValue('{', parseJsonObject).status === 'error', 'malformed JSON must be an error');
  assert(parseStoredValue('{}', parseJsonObject).status === 'ready', 'valid JSON must be ready');
  assert(
    getUserScopedStorageKey('fixture-user', DAY_OFF_PROJECTION_SYNC_QUEUE_KEY)
      === 'modu-work.user.fixture-user.day-off-projection-sync-queue.v1',
    'queue storage key must use the user-scoped naming rule once',
  );

  const empty = createEmptyDayOffProjectionSyncQueue();
  const valid = JSON.stringify(empty);
  assert(parseDayOffProjectionSyncQueue(valid) !== null, 'valid queue must parse');
  assert(parseDayOffProjectionSyncQueue(JSON.stringify({ ...empty, dirtyDates: ['bad'] })) === null, 'invalid date must fail');
  assert(parseDayOffProjectionSyncQueue(JSON.stringify({ ...empty, dirtyDates: ['2026-01-01', '2026-01-01'] })) === null, 'duplicate date must fail');
  const coalesced = mergeDayOffProjectionDirtyDates(empty, ['2026-01-02', '2026-01-01', '2026-01-02']);
  assert(JSON.stringify(coalesced.dirtyDates) === JSON.stringify(['2026-01-01', '2026-01-02']), 'dirty dates must coalesce and sort');

  const overrideDate = '2026-02-03';
  assert(createDayOffProjectionItem(overrideDate, { ...baseSchedule, shiftDateOverrides: { [overrideDate]: { date: overrideDate, shiftTypeId: 'rest', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' } } }).isDayOff, 'override creation must use latest rest value');
  assert(!createDayOffProjectionItem(overrideDate, { ...baseSchedule, shiftDateOverrides: { [overrideDate]: { date: overrideDate, shiftTypeId: 'work', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' } } }).isDayOff, 'override change must use latest work value');
  assert(!createDayOffProjectionItem(overrideDate, baseSchedule).isDayOff, 'override deletion must restore pattern value');

  const malformedStorage = memoryStorage();
  await malformedStorage.setItem('malformed:A', '{');
  const malformedStore = createDayOffProjectionSyncQueueStore(malformedStorage, (owner) => `malformed:${owner}`);
  const malformedRpcCalls = { value: 0 };
  const getMalformedRpcCalls = () => malformedRpcCalls.value;
  const malformedCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: malformedStore,
    getCurrentUserId: async () => 'A',
    getCoverage: async () => ({ rangeStart: '2026-01-01', rangeEnd: '2026-12-31' }),
    upsert: async () => { malformedRpcCalls.value += 1; },
    fullSync: async () => { malformedRpcCalls.value += 1; },
    clear: async () => { malformedRpcCalls.value += 1; },
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  malformedCoordinator.setSchedule('A', readySchedule());
  malformedCoordinator.activate('A');
  await malformedCoordinator.drain('A', true);
  assert(getMalformedRpcCalls() === 0, 'malformed queue automatic drain must not call RPC');
  await malformedCoordinator.enqueueDirtyDate('A', '2026-02-01').catch(() => false);
  assert(getMalformedRpcCalls() === 0, 'malformed queue dirty enqueue must not call RPC');
  const recovered = await malformedCoordinator.requestFullSync('A');
  assert(recovered === 'success' && getMalformedRpcCalls() === 1, 'manual full sync must replace malformed queue and call full RPC once');
  assert((await malformedStore.load('A')).fullSyncPending === false, 'manual recovery must leave a valid completed queue');

  const failingValues = new Map<string, string>([['failing:A', '{']]);
  const failingStorage: QueueStorage = {
    getItem: async (key) => failingValues.get(key) ?? null,
    setItem: async () => { throw new Error('storage unavailable'); },
  };
  const failingStore = createDayOffProjectionSyncQueueStore(failingStorage, (owner) => `failing:${owner}`);
  let failingRpcCalls = 0;
  const failingCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: failingStore,
    getCurrentUserId: async () => 'A',
    getCoverage: async () => ({ rangeStart: '2026-01-01', rangeEnd: '2026-12-31' }),
    upsert: async () => { failingRpcCalls += 1; },
    fullSync: async () => { failingRpcCalls += 1; },
    clear: async () => { failingRpcCalls += 1; },
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  failingCoordinator.setSchedule('A', readySchedule());
  failingCoordinator.activate('A');
  await failingCoordinator.requestFullSync('A').catch(() => 'failed');
  assert(failingRpcCalls === 0, 'queue recovery storage failure must not call RPC');

  const storage = memoryStorage();
  const store = createDayOffProjectionSyncQueueStore(storage, (owner) => `queue:${owner}`);
  let currentUser = 'A';
  let upsertCalls: { localDate: string; isDayOff: boolean }[][] = [];
  let fullCalls = 0;
  let clearCalls = 0;
  let failUpsert = false;
  let failFull = false;
  const coordinator = createDayOffProjectionSyncCoordinator({
    queueStore: store,
    getCurrentUserId: async () => currentUser,
    getCoverage: async () => ({ rangeStart: '2026-01-01', rangeEnd: '2026-12-31' }),
    upsert: async (days) => {
      upsertCalls.push(days);
      if (failUpsert) throw new Error('offline');
    },
    fullSync: async () => {
      fullCalls += 1;
      if (failFull) throw new Error('offline');
    },
    clear: async () => { clearCalls += 1; },
    now: () => 1_000,
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  coordinator.setSchedule('A', readySchedule());
  coordinator.activate('A');
  await coordinator.refreshCoverage('A');

  const dates101 = Array.from({ length: 101 }, (_, index) => addLocalCalendarDays('2026-01-01', index));
  await store.update('A', (queue) => mergeDayOffProjectionDirtyDates(queue, dates101));
  upsertCalls = [];
  await coordinator.drain('A', true);
  assert(upsertCalls.length === 2 && upsertCalls[0].length === 100 && upsertCalls[1].length === 1, '101 dirty dates must split 100+1');

  currentUser = 'B';
  await store.update('A', (queue) => mergeDayOffProjectionDirtyDates(queue, ['2026-06-01']));
  upsertCalls = [];
  await coordinator.drain('A', true);
  assert(upsertCalls.length === 0, 'A queue must not run in B session');
  currentUser = 'A';
  await coordinator.drain('A', true);

  await store.update('A', (queue) => mergeDayOffProjectionDirtyDates(queue, ['2026-06-02']));
  coordinator.setSchedule('A', { ...readySchedule(), hydrationStatus: 'error' });
  upsertCalls = [];
  await coordinator.drain('A', true);
  assert(upsertCalls.length === 0, 'hydration error must block RPC');
  coordinator.setSchedule('A', readySchedule());
  await coordinator.drain('A', true);

  failUpsert = true;
  await store.update('A', (queue) => mergeDayOffProjectionDirtyDates(queue, ['2026-06-03']));
  const failed = await coordinator.drain('A', true);
  const failedQueue = await store.load('A');
  assert(failed === 'failed' && failedQueue.dirtyDates.includes('2026-06-03') && failedQueue.retryCount === 1, 'server failure must keep queue');
  failUpsert = false;
  await coordinator.drain('A', true);
  assert(!(await store.load('A')).dirtyDates.includes('2026-06-03'), 'retry success must clear dirty date');

  failFull = true;
  const replacementFailed = await coordinator.requestReplacementSync('A');
  assert(replacementFailed === 'failed' && clearCalls === 1 && (await store.load('A')).replacementPhase === 'full_pending', 'replacement must advance after clear');
  failFull = false;
  await coordinator.drain('A', true);
  assert(clearCalls === 1 && fullCalls === 2 && (await store.load('A')).replacementPhase === 'none', 'full retry must not repeat clear');

  const gate = deferred();
  let gatedCalls = 0;
  const revisionStorage = memoryStorage();
  const revisionStore = createDayOffProjectionSyncQueueStore(revisionStorage, (owner) => `revision:${owner}`);
  const revisionCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: revisionStore,
    getCurrentUserId: async () => 'A',
    getCoverage: async () => ({ rangeStart: '2026-01-01', rangeEnd: '2026-12-31' }),
    upsert: async () => { gatedCalls += 1; if (gatedCalls === 1) await gate.promise; },
    fullSync: async () => undefined,
    clear: async () => undefined,
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  revisionCoordinator.setSchedule('A', readySchedule());
  revisionCoordinator.activate('A');
  await revisionCoordinator.refreshCoverage('A');
  await revisionStore.update('A', (queue) => mergeDayOffProjectionDirtyDates(queue, ['2026-07-01']));
  const firstDrain = revisionCoordinator.drain('A', true);
  const duplicateDrain = revisionCoordinator.drain('A', true);
  assert(firstDrain === duplicateDrain, 'Strict Mode duplicate drain must share one promise');
  while (gatedCalls === 0) await Promise.resolve();
  await revisionStore.update('A', (queue) => mergeDayOffProjectionDirtyDates(queue, ['2026-07-02']));
  gate.resolve();
  await firstDrain;
  assert(gatedCalls === 2 && (await revisionStore.load('A')).dirtyDates.length === 0, 'revision change must remain for a second latest drain');
}

void run().then(() => console.log('dayOffProjectionSync fixtures passed'));
