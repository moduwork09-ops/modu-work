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
  markDayOffProjectionClearPending,
  markDayOffProjectionFullSyncPending,
  markDayOffProjectionReplacementPending,
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
  const lifecycleFull = markDayOffProjectionFullSyncPending(coalesced);
  assert(lifecycleFull.fullSyncPending && lifecycleFull.dirtyDates.length === 0 && lifecycleFull.revision === coalesced.revision + 1, 'onboarding full must absorb dirty dates');
  assert(markDayOffProjectionFullSyncPending(lifecycleFull) === lifecycleFull, 'duplicate onboarding full must be idempotent');
  const lifecycleReplacement = markDayOffProjectionReplacementPending(lifecycleFull);
  assert(!lifecycleReplacement.fullSyncPending && lifecycleReplacement.dirtyDates.length === 0 && lifecycleReplacement.replacementPhase === 'clear_pending', 'backup replacement must absorb full and dirty work');
  const lifecycleClear = markDayOffProjectionClearPending(lifecycleReplacement);
  assert(lifecycleClear.clearPending && lifecycleClear.replacementPhase === 'none' && !lifecycleClear.fullSyncPending && lifecycleClear.dirtyDates.length === 0, 'reset clear must absorb all stale work');

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

  const calendarBoundaryDirty = getChangedDayOffProjectionDates(
    { ...baseSchedule, patternHistory: [] }, { ...workBecomesRest, patternHistory: [] }, '2024-02-28', '2025-01-01');
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

  const onboardingGate = deferred();
  const onboardingStore = createDayOffProjectionSyncQueueStore(memoryStorage(), (owner) => `onboarding:${owner}`);
  let onboardingFullCalls = 0;
  const onboardingCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: onboardingStore,
    getCurrentUserId: async () => 'A',
    getCoverage: async () => null,
    upsert: async () => undefined,
    fullSync: async () => { onboardingFullCalls += 1; await onboardingGate.promise; },
    clear: async () => undefined,
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  onboardingCoordinator.setSchedule('A', readySchedule());
  onboardingCoordinator.activate('A');
  assert(await onboardingCoordinator.scheduleFullSync('A'), 'successful onboarding save must schedule full sync');
  assert(await onboardingCoordinator.scheduleFullSync('A'), 'duplicate onboarding completion must remain accepted');
  while (onboardingFullCalls === 0) await Promise.resolve();
  assert(onboardingFullCalls === 1 && (await onboardingStore.load('A')).revision === 1, 'duplicate onboarding completion must make one full request');
  onboardingGate.resolve();
  await onboardingCoordinator.drain('A', true);
  assert(!(await onboardingStore.load('A')).fullSyncPending, 'successful onboarding full must clear its queue');
  assert(await onboardingCoordinator.scheduleFullSync('A'), 'completed onboarding lifecycle duplicate must remain accepted');
  await onboardingCoordinator.drain('A', true);
  assert(onboardingFullCalls === 1, 'completed onboarding lifecycle duplicate must not make a second full request');

  const existingUserCalls = { value: 0 };
  const existingUserCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: createDayOffProjectionSyncQueueStore(memoryStorage(), (owner) => `existing:${owner}`),
    getCurrentUserId: async () => 'A',
    getCoverage: async () => null,
    upsert: async () => { existingUserCalls.value += 1; },
    fullSync: async () => { existingUserCalls.value += 1; },
    clear: async () => { existingUserCalls.value += 1; },
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  existingUserCoordinator.setSchedule('A', readySchedule());
  existingUserCoordinator.activate('A');
  await existingUserCoordinator.drain('A', true);
  assert(existingUserCalls.value === 0, 'existing user app entry must not schedule an unconditional full sync');

  const restoreStore = createDayOffProjectionSyncQueueStore(memoryStorage(), (owner) => `restore:${owner}`);
  let restoreUser = 'A';
  const restoreOperations: string[] = [];
  const getRestoreOperationCount = () => restoreOperations.length;
  const restoreCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: restoreStore,
    getCurrentUserId: async () => restoreUser,
    getCoverage: async () => null,
    upsert: async () => undefined,
    fullSync: async () => { restoreOperations.push('full'); },
    clear: async () => { restoreOperations.push('clear'); },
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  restoreCoordinator.setSchedule('A', { ...readySchedule(), hydrationStatus: 'error' });
  restoreCoordinator.activate('A');
  assert(await restoreCoordinator.scheduleReplacementSync('A'), 'completed local restore must persist replacement work');
  await restoreCoordinator.drain('A', true);
  assert(getRestoreOperationCount() === 0 && (await restoreStore.load('A')).replacementPhase === 'clear_pending', 'reload error must preserve replacement without RPC');
  restoreCoordinator.setSchedule('A', readySchedule());
  await restoreCoordinator.drain('A', true);
  assert(JSON.stringify(restoreOperations) === JSON.stringify(['clear', 'full']), 'ready restored schedule must run clear then full');
  restoreUser = 'B';
  assert(!await restoreCoordinator.scheduleReplacementSync('A'), 'replacement must not schedule under another account session');
  assert(getRestoreOperationCount() === 2, 'account switch must not run another account replacement RPC');

  const noSetupStore = createDayOffProjectionSyncQueueStore(memoryStorage(), (owner) => `no-setup:${owner}`);
  let noSetupClearCalls = 0;
  let noSetupFullCalls = 0;
  const noSetupCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: noSetupStore,
    getCurrentUserId: async () => 'A',
    getCoverage: async () => null,
    upsert: async () => undefined,
    fullSync: async () => { noSetupFullCalls += 1; },
    clear: async () => { noSetupClearCalls += 1; },
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  noSetupCoordinator.setSchedule('A', { ...readySchedule(), hasCompletedSetup: false });
  noSetupCoordinator.activate('A');
  assert(await noSetupCoordinator.scheduleReplacementSync('A'), 'ready backup without shift settings must schedule replacement clear');
  await noSetupCoordinator.drain('A', true);
  const noSetupQueue = await noSetupStore.load('A');
  assert(noSetupClearCalls === 1 && noSetupFullCalls === 0 && noSetupQueue.replacementPhase === 'none', 'backup without shift settings must clear without full and complete replacement');

  const staleClearGate = deferred();
  const staleClearStore = createDayOffProjectionSyncQueueStore(memoryStorage(), (owner) => `stale-clear:${owner}`);
  let staleClearCalls = 0;
  let staleFullCalls = 0;
  const staleClearCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: staleClearStore,
    getCurrentUserId: async () => 'A',
    getCoverage: async () => null,
    upsert: async () => undefined,
    fullSync: async () => { staleFullCalls += 1; },
    clear: async () => {
      staleClearCalls += 1;
      if (staleClearCalls === 1) await staleClearGate.promise;
    },
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  staleClearCoordinator.setSchedule('A', readySchedule());
  staleClearCoordinator.activate('A');
  assert(await staleClearCoordinator.scheduleReplacementSync('A'), 'replacement clear race fixture must schedule replacement');
  while (staleClearCalls === 0) await Promise.resolve();
  assert(await staleClearCoordinator.scheduleClearSync('A'), 'reset clear must supersede in-flight replacement clear');
  staleClearGate.resolve();
  await staleClearCoordinator.drain('A', true);
  const staleClearQueue = await staleClearStore.load('A');
  assert(staleClearCalls === 2 && staleFullCalls === 0 && !staleClearQueue.clearPending && staleClearQueue.replacementPhase === 'none' && !staleClearQueue.fullSyncPending, 'stale replacement completion must not revive full_pending after reset clear');

  const clearThenFullGate = deferred();
  const clearThenFullStore = createDayOffProjectionSyncQueueStore(memoryStorage(), (owner) => `clear-then-full:${owner}`);
  const clearThenFullOperations: string[] = [];
  const clearThenFullCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: clearThenFullStore,
    getCurrentUserId: async () => 'A',
    getCoverage: async () => null,
    upsert: async () => undefined,
    fullSync: async () => { clearThenFullOperations.push('full'); },
    clear: async () => {
      clearThenFullOperations.push('clear');
      await clearThenFullGate.promise;
    },
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  clearThenFullCoordinator.setSchedule('A', { ...readySchedule(), hasCompletedSetup: false });
  clearThenFullCoordinator.activate('A');
  assert(await clearThenFullCoordinator.scheduleClearSync('A'), 'reset must schedule clear before new onboarding');
  while (clearThenFullOperations.length === 0) await Promise.resolve();
  clearThenFullCoordinator.setSchedule('A', readySchedule());
  assert(await clearThenFullCoordinator.scheduleFullSync('A'), 'new onboarding must preserve full intent while reset clear is in flight');
  const clearThenFullPendingQueue = await clearThenFullStore.load('A');
  assert(clearThenFullPendingQueue.clearPending && clearThenFullPendingQueue.fullSyncPending, 'persistent queue must retain clear then full intent');
  clearThenFullGate.resolve();
  await clearThenFullCoordinator.drain('A', true);
  const clearThenFullQueue = await clearThenFullStore.load('A');
  assert(JSON.stringify(clearThenFullOperations) === JSON.stringify(['clear', 'full'])
    && !clearThenFullQueue.clearPending
    && !clearThenFullQueue.fullSyncPending
    && clearThenFullQueue.replacementPhase === 'none'
    && clearThenFullQueue.dirtyDates.length === 0,
  'reset clear followed by onboarding must run one clear then one full and finish cleanly');

  const persistedClearFullStorage = memoryStorage();
  const persistedClearFullWriter = createDayOffProjectionSyncQueueStore(persistedClearFullStorage, (owner) => `persisted-clear-full:${owner}`);
  await persistedClearFullWriter.replace('A', {
    ...createEmptyDayOffProjectionSyncQueue(),
    clearPending: true,
    fullSyncPending: true,
    revision: 2,
  });
  const persistedClearFullStore = createDayOffProjectionSyncQueueStore(persistedClearFullStorage, (owner) => `persisted-clear-full:${owner}`);
  const persistedClearFullOperations: string[] = [];
  const persistedClearFullCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: persistedClearFullStore,
    getCurrentUserId: async () => 'A',
    getCoverage: async () => null,
    upsert: async () => undefined,
    fullSync: async () => { persistedClearFullOperations.push('full'); },
    clear: async () => { persistedClearFullOperations.push('clear'); },
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  persistedClearFullCoordinator.setSchedule('A', readySchedule());
  persistedClearFullCoordinator.activate('A');
  await persistedClearFullCoordinator.drain('A', true);
  const persistedClearFullQueue = await persistedClearFullStore.load('A');
  assert(JSON.stringify(persistedClearFullOperations) === JSON.stringify(['clear', 'full'])
    && !persistedClearFullQueue.clearPending
    && !persistedClearFullQueue.fullSyncPending
    && persistedClearFullQueue.replacementPhase === 'none'
    && persistedClearFullQueue.dirtyDates.length === 0,
  'persisted clear and full intent must survive restart and finish in order');

  const retryClearFullGate = deferred();
  const retryClearFullStore = createDayOffProjectionSyncQueueStore(memoryStorage(), (owner) => `retry-clear-full:${owner}`);
  const retryClearFullOperations: string[] = [];
  let retryClearFullCalls = 0;
  const getRetryClearFullCalls = () => retryClearFullCalls;
  let retryClearFullShouldFail = true;
  const retryClearFullCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: retryClearFullStore,
    getCurrentUserId: async () => 'A',
    getCoverage: async () => null,
    upsert: async () => undefined,
    fullSync: async () => { retryClearFullOperations.push('full'); },
    clear: async () => {
      retryClearFullCalls += 1;
      if (retryClearFullCalls === 1) await retryClearFullGate.promise;
      if (retryClearFullShouldFail) {
        retryClearFullOperations.push('clear-failed');
        throw new Error('offline');
      }
      retryClearFullOperations.push('clear');
    },
    now: () => 1_000,
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  retryClearFullCoordinator.setSchedule('A', { ...readySchedule(), hasCompletedSetup: false });
  retryClearFullCoordinator.activate('A');
  assert(await retryClearFullCoordinator.scheduleClearSync('A'), 'retry fixture must schedule reset clear');
  while (getRetryClearFullCalls() === 0) await Promise.resolve();
  retryClearFullCoordinator.setSchedule('A', readySchedule());
  assert(await retryClearFullCoordinator.scheduleFullSync('A'), 'retry fixture must retain full intent during clear');
  const retryClearFullPendingQueue = await retryClearFullStore.load('A');
  assert(retryClearFullPendingQueue.clearPending && retryClearFullPendingQueue.fullSyncPending, 'retry fixture must persist both intents before clear failure');
  retryClearFullGate.resolve();
  await retryClearFullCoordinator.drain('A', true);
  const retryClearFullFailedQueue = await retryClearFullStore.load('A');
  assert(getRetryClearFullCalls() === 1
    && retryClearFullOperations.filter((operation) => operation === 'full').length === 0
    && retryClearFullFailedQueue.clearPending
    && retryClearFullFailedQueue.fullSyncPending,
  'failed clear must preserve clear and full intents without running full');
  retryClearFullShouldFail = false;
  await retryClearFullCoordinator.drain('A', true);
  const retryClearFullQueue = await retryClearFullStore.load('A');
  assert(getRetryClearFullCalls() === 2
    && JSON.stringify(retryClearFullOperations) === JSON.stringify(['clear-failed', 'clear', 'full'])
    && retryClearFullOperations.filter((operation) => operation === 'full').length === 1
    && !retryClearFullQueue.clearPending
    && !retryClearFullQueue.fullSyncPending
    && retryClearFullQueue.replacementPhase === 'none'
    && retryClearFullQueue.dirtyDates.length === 0,
  'clear failure retry must eventually run one successful clear then one full and finish cleanly');

  const clearFullClearGate = deferred();
  const clearFullClearStore = createDayOffProjectionSyncQueueStore(memoryStorage(), (owner) => `clear-full-clear:${owner}`);
  const clearFullClearOperations: string[] = [];
  const clearFullClearCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: clearFullClearStore,
    getCurrentUserId: async () => 'A',
    getCoverage: async () => null,
    upsert: async () => undefined,
    fullSync: async () => { clearFullClearOperations.push('full'); },
    clear: async () => {
      clearFullClearOperations.push('clear');
      await clearFullClearGate.promise;
    },
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  clearFullClearCoordinator.setSchedule('A', { ...readySchedule(), hasCompletedSetup: false });
  clearFullClearCoordinator.activate('A');
  assert(await clearFullClearCoordinator.scheduleClearSync('A'), 'ordering fixture must schedule initial clear');
  while (clearFullClearOperations.length === 0) await Promise.resolve();
  clearFullClearCoordinator.setSchedule('A', readySchedule());
  assert(await clearFullClearCoordinator.scheduleFullSync('A'), 'ordering fixture must retain intermediate full intent');
  assert(await clearFullClearCoordinator.scheduleClearSync('A'), 'new reset must absorb intermediate full intent');
  const clearFullClearPendingQueue = await clearFullClearStore.load('A');
  assert(clearFullClearPendingQueue.clearPending && !clearFullClearPendingQueue.fullSyncPending, 'latest reset must leave clear-only intent');
  clearFullClearGate.resolve();
  await clearFullClearCoordinator.drain('A', true);
  const clearFullClearQueue = await clearFullClearStore.load('A');
  assert(JSON.stringify(clearFullClearOperations) === JSON.stringify(['clear'])
    && !clearFullClearQueue.clearPending
    && !clearFullClearQueue.fullSyncPending
    && clearFullClearQueue.replacementPhase === 'none'
    && clearFullClearQueue.dirtyDates.length === 0,
  'clear then full then reset must finish as clear only without a duplicate clear');

  const restartStorage = memoryStorage();
  const restartStore = createDayOffProjectionSyncQueueStore(restartStorage, (owner) => `restart:${owner}`);
  await restartStore.replace('A', { ...createEmptyDayOffProjectionSyncQueue(), replacementPhase: 'full_pending', revision: 2 });
  const restartOperations: string[] = [];
  const restartCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: restartStore,
    getCurrentUserId: async () => 'A',
    getCoverage: async () => null,
    upsert: async () => undefined,
    fullSync: async () => { restartOperations.push('full'); },
    clear: async () => { restartOperations.push('clear'); },
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  restartCoordinator.setSchedule('A', readySchedule());
  restartCoordinator.activate('A');
  await restartCoordinator.drain('A', true);
  assert(JSON.stringify(restartOperations) === JSON.stringify(['full']), 'app restart must resume full_pending without repeating clear');

  const resetStore = createDayOffProjectionSyncQueueStore(memoryStorage(), (owner) => `reset:${owner}`);
  let resetUser = 'A';
  const resetClearCalls = { value: 0 };
  const getResetClearCalls = () => resetClearCalls.value;
  let failClear = true;
  const resetCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: resetStore,
    getCurrentUserId: async () => resetUser,
    getCoverage: async () => null,
    upsert: async () => { throw new Error('stale upsert must not run'); },
    fullSync: async () => { throw new Error('stale full must not run'); },
    clear: async () => { resetClearCalls.value += 1; if (failClear) throw new Error('offline'); },
    now: () => 1_000,
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  resetCoordinator.activate('A');
  assert(await resetCoordinator.scheduleClearSync('A'), 'local reset success must create a clear queue even when the key was absent');
  await resetCoordinator.drain('A', true);
  assert(getResetClearCalls() === 1 && (await resetStore.load('A')).clearPending, 'failed reset clear must remain queued for retry');
  failClear = false;
  await resetCoordinator.drain('A', true);
  const clearedResetQueue = await resetStore.load('A');
  assert(getResetClearCalls() === 2 && !clearedResetQueue.clearPending && !clearedResetQueue.fullSyncPending && clearedResetQueue.replacementPhase === 'none' && clearedResetQueue.dirtyDates.length === 0, 'successful reset clear must leave no stale projection work');
  resetUser = 'B';
  assert(!await resetCoordinator.scheduleClearSync('A'), 'reset clear must not schedule under another account session');
  assert(getResetClearCalls() === 2, 'account switch must not run another account clear RPC');

  const corruptedFullStorage = memoryStorage();
  await corruptedFullStorage.setItem('corrupted-full:A', '{');
  const corruptedFullStore = createDayOffProjectionSyncQueueStore(corruptedFullStorage, (owner) => `corrupted-full:${owner}`);
  let corruptedFullCalls = 0;
  const corruptedFullCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: corruptedFullStore,
    getCurrentUserId: async () => 'A',
    getCoverage: async () => null,
    upsert: async () => undefined,
    fullSync: async () => { corruptedFullCalls += 1; },
    clear: async () => undefined,
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  corruptedFullCoordinator.setSchedule('A', readySchedule());
  corruptedFullCoordinator.activate('A');
  assert(await corruptedFullCoordinator.scheduleFullSync('A'), 'corrupted queue must recover and schedule onboarding full');
  await corruptedFullCoordinator.drain('A', true);
  const corruptedFullQueue = await corruptedFullStore.load('A');
  assert(corruptedFullCalls === 1
    && !corruptedFullQueue.clearPending
    && !corruptedFullQueue.fullSyncPending
    && corruptedFullQueue.replacementPhase === 'none'
    && corruptedFullQueue.dirtyDates.length === 0,
  'corrupted queue full recovery must run one full and finish cleanly');

  const corruptedReplacementStorage = memoryStorage();
  await corruptedReplacementStorage.setItem('corrupted-replacement:A', '{');
  const corruptedReplacementStore = createDayOffProjectionSyncQueueStore(corruptedReplacementStorage, (owner) => `corrupted-replacement:${owner}`);
  const corruptedReplacementOperations: string[] = [];
  const corruptedReplacementCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: corruptedReplacementStore,
    getCurrentUserId: async () => 'A',
    getCoverage: async () => null,
    upsert: async () => undefined,
    fullSync: async () => { corruptedReplacementOperations.push('full'); },
    clear: async () => { corruptedReplacementOperations.push('clear'); },
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  corruptedReplacementCoordinator.setSchedule('A', readySchedule());
  corruptedReplacementCoordinator.activate('A');
  assert(await corruptedReplacementCoordinator.scheduleReplacementSync('A'), 'corrupted queue must recover and schedule replacement');
  await corruptedReplacementCoordinator.drain('A', true);
  const corruptedReplacementQueue = await corruptedReplacementStore.load('A');
  assert(JSON.stringify(corruptedReplacementOperations) === JSON.stringify(['clear', 'full'])
    && !corruptedReplacementQueue.clearPending
    && !corruptedReplacementQueue.fullSyncPending
    && corruptedReplacementQueue.replacementPhase === 'none'
    && corruptedReplacementQueue.dirtyDates.length === 0,
  'corrupted queue replacement recovery must run clear then full once and finish cleanly');

  const corruptedClearStorage = memoryStorage();
  await corruptedClearStorage.setItem('corrupted-clear:A', '{');
  const corruptedClearStore = createDayOffProjectionSyncQueueStore(corruptedClearStorage, (owner) => `corrupted-clear:${owner}`);
  let corruptedClearCalls = 0;
  let corruptedClearFullCalls = 0;
  const corruptedClearCoordinator = createDayOffProjectionSyncCoordinator({
    queueStore: corruptedClearStore,
    getCurrentUserId: async () => 'A',
    getCoverage: async () => null,
    upsert: async () => undefined,
    fullSync: async () => { corruptedClearFullCalls += 1; },
    clear: async () => { corruptedClearCalls += 1; },
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  corruptedClearCoordinator.setSchedule('A', { ...readySchedule(), hasCompletedSetup: false });
  corruptedClearCoordinator.activate('A');
  assert(await corruptedClearCoordinator.scheduleClearSync('A'), 'corrupted queue must recover and schedule clear');
  await corruptedClearCoordinator.drain('A', true);
  const corruptedClearQueue = await corruptedClearStore.load('A');
  assert(corruptedClearCalls === 1
    && corruptedClearFullCalls === 0
    && !corruptedClearQueue.clearPending
    && !corruptedClearQueue.fullSyncPending
    && corruptedClearQueue.replacementPhase === 'none'
    && corruptedClearQueue.dirtyDates.length === 0,
  'corrupted queue clear recovery must run one clear without full and finish cleanly');
}

void run().then(() => console.log('dayOffProjectionSync fixtures passed'));
