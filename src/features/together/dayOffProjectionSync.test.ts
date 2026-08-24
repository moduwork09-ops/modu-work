import type { ShiftType } from '../shift-settings/mockData';
import type { ShiftScheduleInput } from '../shifts/shiftSchedule';
import { parseStoredValue } from '../storage/storageLoadResult';
import { getUserScopedStorageKey } from '../storage/userScopedStorageKey';
import {
  addLocalCalendarDays,
  assertValidDayOffProjectionCoverage,
  createDayOffProjectionItem,
  getChangedDayOffProjectionDates,
} from './dayOffProjection';
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

function historyEntry(
  effectiveFrom: string,
  pattern: string[],
  anchorDate = effectiveFrom,
  anchorPatternIndex = 0,
) {
  return { id: `history-${effectiveFrom}`, effectiveFrom, pattern, anchorDate, anchorPatternIndex, createdAt: `${effectiveFrom}T00:00:00.000Z` };
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

  assert(getChangedDayOffProjectionDates(baseSchedule, baseSchedule, '2026-01-01', '2026-01-10').length === 0, 'identical schedules must have no dirty dates');
  const cosmeticSchedule = { ...baseSchedule, shiftTypes: [{ ...work, name: '새 이름', color: '#123456', startTime: '08:00', endTime: '17:00' }, rest] };
  assert(getChangedDayOffProjectionDates(baseSchedule, cosmeticSchedule, '2026-01-01', '2026-01-10').length === 0, 'cosmetic shift changes must have no dirty dates');
  const workBecomesRest = { ...baseSchedule, shiftTypes: [{ ...work, kind: 'rest' as const }, rest] };
  assert(getChangedDayOffProjectionDates(baseSchedule, workBecomesRest, '2026-01-01', '2026-01-03').length === 3, 'used work to rest kind change must dirty used dates');
  const unusedKindChange = { ...baseSchedule, shiftTypes: [work, { ...rest, kind: 'work' as const }] };
  assert(getChangedDayOffProjectionDates(baseSchedule, unusedKindChange, '2026-01-01', '2026-01-10').length === 0, 'unused shift kind change must have no dirty dates');

  const overrideWinsBefore = { ...baseSchedule, shiftDateOverrides: { '2026-01-03': { date: '2026-01-03', shiftTypeId: 'work', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' } } };
  const overrideWinsAfter = { ...overrideWinsBefore, shiftPattern: ['rest'], patternHistory: [historyEntry('2026-01-01', ['rest'])] };
  const overrideDirty = getChangedDayOffProjectionDates(overrideWinsBefore, overrideWinsAfter, '2026-01-01', '2026-01-05');
  assert(!overrideDirty.includes('2026-01-03') && overrideDirty.length === 4, 'override must win over changed pattern');

  const beforeHistory = { ...baseSchedule, patternHistory: [historyEntry('2026-01-01', ['work']), historyEntry('2026-01-08', ['work'])] };
  const afterNewHistory = { ...beforeHistory, patternHistory: [historyEntry('2026-01-01', ['work']), historyEntry('2026-01-05', ['rest']), historyEntry('2026-01-08', ['work'])] };
  assert(JSON.stringify(getChangedDayOffProjectionDates(beforeHistory, afterNewHistory, '2026-01-01', '2026-01-10')) === JSON.stringify(['2026-01-05', '2026-01-06', '2026-01-07']), 'new history must affect only its effective interval');
  const beforeReplacedHistory = { ...beforeHistory, patternHistory: [historyEntry('2026-01-01', ['work']), historyEntry('2026-01-05', ['work']), historyEntry('2026-01-08', ['work'])] };
  const afterReplacedHistory = { ...beforeHistory, patternHistory: [historyEntry('2026-01-01', ['work']), historyEntry('2026-01-05', ['rest']), historyEntry('2026-01-08', ['work'])] };
  assert(JSON.stringify(getChangedDayOffProjectionDates(beforeReplacedHistory, afterReplacedHistory, '2026-01-01', '2026-01-10')) === JSON.stringify(['2026-01-05', '2026-01-06', '2026-01-07']), 'same effective date replacement must affect its interval');

  const alternatingBase = { ...baseSchedule, shiftPattern: ['work', 'rest'], patternHistory: [historyEntry('2026-01-01', ['work', 'rest'], '2026-01-01', 0)] };
  const changedAnchorDate = { ...alternatingBase, anchorDate: '2026-01-02', patternHistory: [historyEntry('2026-01-01', ['work', 'rest'], '2026-01-02', 0)] };
  const changedAnchorIndex = { ...alternatingBase, anchorPatternIndex: 1, patternHistory: [historyEntry('2026-01-01', ['work', 'rest'], '2026-01-01', 1)] };
  assert(getChangedDayOffProjectionDates(alternatingBase, changedAnchorDate, '2026-01-01', '2026-01-04').length === 4, 'anchor date change must compare actual results');
  assert(getChangedDayOffProjectionDates(alternatingBase, changedAnchorIndex, '2026-01-01', '2026-01-04').length === 4, 'anchor index change must compare actual results');

  const calendarBoundaryDirty = getChangedDayOffProjectionDates(baseSchedule, workBecomesRest, '2024-02-28', '2025-01-01');
  assert(calendarBoundaryDirty.includes('2024-02-29') && calendarBoundaryDirty.includes('2024-12-31') && calendarBoundaryDirty.includes('2025-01-01'), 'leap, month, and year boundaries must be traversed');
  const maxCoverageEnd = addLocalCalendarDays('2024-01-01', 799);
  assert(assertValidDayOffProjectionCoverage('2026-01-01', '2026-01-01') === 1, 'one day coverage must be accepted');
  assert(getChangedDayOffProjectionDates(baseSchedule, baseSchedule, '2024-01-01', maxCoverageEnd).length === 0, '800 day coverage must be accepted');
  assert(assertValidDayOffProjectionCoverage('2024-02-28', '2024-03-01') === 3, 'coverage including leap day must be accepted');
  const rejectedCoverages: [string, string][] = [
    ['bad', '2026-01-01'],
    ['2026-01-01', 'bad'],
    ['', ''],
    ['2026-02-30', '2026-03-01'],
    ['2026-01-02', '2026-01-01'],
    ['2024-01-01', addLocalCalendarDays('2024-01-01', 800)],
  ];
  rejectedCoverages.forEach(([rangeStart, rangeEnd]) => {
    let rejected = false;
    try { assertValidDayOffProjectionCoverage(rangeStart, rangeEnd); } catch { rejected = true; }
    assert(rejected, `invalid coverage must be rejected: ${rangeStart}..${rangeEnd}`);
  });

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

  const bulkValues = new Map<string, string>();
  let bulkStorageWrites = 0;
  const bulkStore = createDayOffProjectionSyncQueueStore({
    getItem: async (key) => bulkValues.get(key) ?? null,
    setItem: async (key, value) => { bulkStorageWrites += 1; bulkValues.set(key, value); },
  }, (owner) => `bulk:${owner}`);
  const bulkGate = deferred();
  const bulkBatches: number[] = [];
  const bulkCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: bulkStore,
    getCurrentUserId: async () => 'A',
    getCoverage: async () => ({ rangeStart: '2026-01-01', rangeEnd: '2026-12-31' }),
    upsert: async (days) => { bulkBatches.push(days.length); if (bulkBatches.length === 1) await bulkGate.promise; },
    fullSync: async () => undefined,
    clear: async () => undefined,
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  bulkCoordinator.setSchedule('A', readySchedule());
  bulkCoordinator.activate('A');
  await bulkCoordinator.refreshCoverage('A');
  const bulkDates = Array.from({ length: 250 }, (_, index) => addLocalCalendarDays('2026-01-01', index));
  assert(!await bulkCoordinator.enqueueDirtyDates('A', []), 'zero dirty dates must not enqueue');
  assert(await bulkCoordinator.enqueueDirtyDates('A', [...bulkDates, bulkDates[0], bulkDates[1]]), 'valid bulk dates must enqueue');
  while (bulkBatches.length === 0) await Promise.resolve();
  const queuedBulk = await bulkStore.load('A');
  assert(bulkStorageWrites === 1 && queuedBulk.dirtyDates.length === 250 && queuedBulk.revision === 1, 'bulk enqueue must coalesce with one queue update and one revision');
  bulkGate.resolve();
  await bulkCoordinator.drain('A', true);
  assert(JSON.stringify(bulkBatches) === JSON.stringify([100, 100, 50]), '250 dirty dates must drain as 100+100+50');

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
  const gatedValues: boolean[] = [];
  const revisionStorage = memoryStorage();
  const revisionStore = createDayOffProjectionSyncQueueStore(revisionStorage, (owner) => `revision:${owner}`);
  const revisionCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: revisionStore,
    getCurrentUserId: async () => 'A',
    getCoverage: async () => ({ rangeStart: '2026-01-01', rangeEnd: '2026-12-31' }),
    upsert: async (days) => { gatedCalls += 1; gatedValues.push(days[0].isDayOff); if (gatedCalls === 1) await gate.promise; },
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
  const latestOverrideSchedule = {
    ...baseSchedule,
    shiftDateOverrides: { '2026-07-01': { date: '2026-07-01', shiftTypeId: 'rest', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' } },
  };
  revisionCoordinator.setSchedule('A', readySchedule(latestOverrideSchedule));
  await revisionCoordinator.enqueueDirtyDates('A', ['2026-07-01']);
  gate.resolve();
  await firstDrain;
  assert(gatedCalls === 2 && JSON.stringify(gatedValues) === JSON.stringify([false, true]) && (await revisionStore.load('A')).dirtyDates.length === 0, 'second mutation must resend the latest schedule value');
}

void run().then(() => console.log('dayOffProjectionSync fixtures passed'));
