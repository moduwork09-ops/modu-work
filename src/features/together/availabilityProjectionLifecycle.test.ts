import { createAvailabilityProjectionSyncCoordinator, type AvailabilitySourceSnapshot } from './availabilityProjectionSyncCoordinator';
import { createAvailabilityProjectionSyncQueueStore, markAvailabilityClearPending, type AvailabilityProjectionSyncQueue } from './availabilityProjectionSyncQueue';

const date = '2026-09-15';
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function waitUntil(predicate: () => boolean) { for (let index = 0; index < 100 && !predicate(); index += 1) await tick(); }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function deferred() { let resolve!: () => void; let reject!: (error: Error) => void; const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; }

function source(hasCompletedSetup = true, hydrationStatus: AvailabilitySourceSnapshot['hydrationStatus'] = 'ready'): AvailabilitySourceSnapshot {
  return { hydrationStatus, hasCompletedSetup, timezoneName: 'Asia/Seoul', personalEvents: [], dateMemos: {}, schedule: {
    shiftTypes: [{ id: 'rest', abbreviation: '휴', name: '휴무', kind: 'rest', color: '#fff', textColor: '#000' }],
    shiftPattern: ['rest'], anchorDate: date, anchorPatternIndex: 0,
    patternHistory: [{ id: 'p', effectiveFrom: '2026-01-01', pattern: ['rest'], anchorDate: date, anchorPatternIndex: 0, createdAt: new Date(0).toISOString() }], shiftDateOverrides: {},
  } };
}

function harness(storageMap = new Map<string, string>()) {
  const storage = { getItem: async (key: string) => storageMap.get(key) ?? null, setItem: async (key: string, value: string) => { storageMap.set(key, value); } };
  const store = createAvailabilityProjectionSyncQueueStore(storage, (owner) => `queue:${owner}`);
  let session = 'A'; let clearCalls = 0; let fullCalls = 0; const order: string[] = [];
  let clearImpl: () => Promise<void> = async () => undefined;
  let fullImpl: () => Promise<void> = async () => undefined;
  const coordinator = createAvailabilityProjectionSyncCoordinator({ queueStore: store, getCurrentUserId: async () => session,
    clear: async () => { clearCalls += 1; order.push(`clear:${session}`); await clearImpl(); },
    fullSync: async () => { fullCalls += 1; order.push(`full:${session}`); await fullImpl(); }, replaceDates: async () => undefined,
    setTimer: () => 1, clearTimer: () => undefined });
  return { coordinator, store, storageMap, counts: () => ({ clearCalls, fullCalls }), order,
    setSession: (value: string) => { session = value; }, setClear: (value: () => Promise<void>) => { clearImpl = value; }, setFull: (value: () => Promise<void>) => { fullImpl = value; } };
}

async function queueIsClean(queue: AvailabilityProjectionSyncQueue) {
  return !queue.clearPending && !queue.fullSyncPending && queue.dirtyDates.length === 0;
}

async function run() {
  const restore = harness(); restore.coordinator.activate('A'); restore.coordinator.setSource('A', source(true)); await waitUntil(() => restore.counts().fullCalls === 1);
  assert(await restore.coordinator.scheduleFull('A'), 'successful restored trusted source schedules full'); await waitUntil(() => restore.counts().fullCalls === 2);
  assert(restore.counts().fullCalls === 2, 'backup restore performs full coverage replacement');

  const restoreBlocked = harness(); restoreBlocked.coordinator.activate('A'); restoreBlocked.coordinator.setSource('A', source(true, 'loading'));
  assert(!await restoreBlocked.coordinator.scheduleFull('A'), 'restore reload loading blocks full'); restoreBlocked.coordinator.setSource('A', source(true, 'error'));
  assert(!await restoreBlocked.coordinator.scheduleFull('A') && restoreBlocked.counts().fullCalls === 0, 'restore reload error blocks full');

  const reset = harness(); reset.coordinator.activate('A'); reset.coordinator.setSource('A', source(false));
  assert(await reset.coordinator.scheduleClear('A'), 'reset success schedules clear'); await waitUntil(() => reset.counts().clearCalls === 1); await reset.coordinator.drain('A', true);
  assert(reset.counts().clearCalls === 1 && await queueIsClean(await reset.store.load('A')), 'reset clear completes');

  const failedLocal = harness(); failedLocal.coordinator.activate('A'); failedLocal.coordinator.setSource('A', source(false)); await tick();
  assert(failedLocal.counts().clearCalls === 0, 'local reset failure schedules no clear');

  const clearFailure = harness(); clearFailure.coordinator.activate('A'); clearFailure.coordinator.setSource('A', source(false)); clearFailure.setClear(async () => { throw new Error('offline'); });
  await clearFailure.coordinator.scheduleClear('A'); await tick(); assert((await clearFailure.store.load('A')).clearPending, 'clear network failure remains pending');

  const restartMap = new Map<string, string>(); const beforeRestart = harness(restartMap); beforeRestart.coordinator.activate('A'); beforeRestart.coordinator.setSource('A', source(false));
  beforeRestart.setClear(() => new Promise(() => undefined)); await beforeRestart.coordinator.scheduleClear('A'); await waitUntil(() => beforeRestart.counts().clearCalls === 1);
  const restarted = harness(restartMap); restarted.coordinator.activate('A'); restarted.coordinator.setSource('A', source(false)); await waitUntil(() => restarted.counts().clearCalls === 1); await restarted.coordinator.drain('A', true);
  assert(restarted.counts().clearCalls === 1, 'clear pending restores after restart');

  const race = harness(); const clearGate = deferred(); race.setClear(() => clearGate.promise); race.coordinator.activate('A'); race.coordinator.setSource('A', source(false));
  await race.coordinator.scheduleClear('A'); await waitUntil(() => race.counts().clearCalls === 1); race.coordinator.setSource('A', source(true)); await race.coordinator.scheduleFull('A');
  const duringClear = await race.store.load('A'); assert(duringClear.clearPending && duringClear.fullSyncPending, 're-onboarding full is persisted during clear');
  clearGate.resolve(); await waitUntil(() => race.counts().fullCalls === 1); await race.coordinator.drain('A', true);
  assert(race.order.join(',') === 'clear:A,full:A' && await queueIsClean(await race.store.load('A')), 'clear then full ordering');

  const mutationRace = harness(); const mutationClearGate = deferred(); mutationRace.setClear(() => mutationClearGate.promise); mutationRace.coordinator.activate('A'); mutationRace.coordinator.setSource('A', source(false));
  await mutationRace.coordinator.scheduleClear('A'); await waitUntil(() => mutationRace.counts().clearCalls === 1); mutationRace.coordinator.setSource('A', source(true)); await mutationRace.coordinator.enqueueDates('A', [date]);
  assert((await mutationRace.store.load('A')).fullSyncPending, 'mutation during clear promotes to full'); mutationClearGate.resolve(); await waitUntil(() => mutationRace.counts().fullCalls === 1);

  const duplicate = harness(); duplicate.coordinator.activate('A'); duplicate.coordinator.setSource('A', source(true)); await waitUntil(() => duplicate.counts().fullCalls === 1); duplicate.coordinator.setSource('A', source(true)); await tick();
  assert(duplicate.counts().fullCalls === 1, 'duplicate onboarding completion does not duplicate full');

  const account = harness(); const aFullGate = deferred(); account.setFull(() => aFullGate.promise); account.coordinator.activate('A'); account.coordinator.setSource('A', source(true)); await waitUntil(() => account.counts().fullCalls === 1);
  account.coordinator.deactivate('A'); account.setSession('B'); account.setFull(async () => undefined); account.coordinator.activate('B'); account.coordinator.setSource('B', source(true)); await waitUntil(() => account.counts().fullCalls === 2); aFullGate.resolve(); await tick();
  assert((await account.store.load('B')).fullSyncPending === false, 'A completion does not remove B completion');
  assert((await account.store.load('A')).fullSyncPending, 'A completion after logout remains owned by A');

  account.coordinator.deactivate('B'); account.setSession('A'); account.coordinator.activate('A'); account.coordinator.setSource('A', source(true)); await waitUntil(() => account.counts().fullCalls === 3);
  assert(account.counts().fullCalls === 3, 'same user login resumes pending queue');

  const blocked = harness(); blocked.coordinator.activate('A'); blocked.coordinator.setSource('A', source(true, 'loading')); await tick(); blocked.coordinator.setSource('A', source(true, 'error')); await tick();
  assert(blocked.counts().fullCalls === 0, 'loading and error source call no RPC');

  const legacy = JSON.stringify({ version: 1, dirtyDates: [], fullSyncPending: false, revision: 0, retryCount: 0, nextRetryAt: null, lastSyncedTimezoneName: null });
  const legacyStore = harness(new Map([['queue:A', legacy]])); assert((await legacyStore.store.load('A')).clearPending === false, 'v1 queue without clearPending remains compatible');

  const fullThenReset = markAvailabilityClearPending({ ...(await legacyStore.store.load('A')), fullSyncPending: true, revision: 1 });
  assert(fullThenReset.clearPending && !fullThenReset.fullSyncPending, 'reset absorbs older full');
}

void run().then(() => console.log('availabilityProjectionLifecycle fixtures passed'));
