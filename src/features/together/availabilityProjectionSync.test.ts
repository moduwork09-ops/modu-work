import { createAvailabilityProjectionSyncCoordinator, FullAvailabilitySyncRequiredError, getAvailabilityAffectedEventDates, getAvailabilityAffectedShiftDates, type AvailabilitySourceSnapshot } from './availabilityProjectionSyncCoordinator';
import { createAvailabilityProjectionSyncQueueStore, mergeAvailabilityDirtyDates, parseAvailabilityProjectionSyncQueue } from './availabilityProjectionSyncQueue';

const owner = 'A';
const date = '2026-09-15';
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function waitUntil(predicate: () => boolean) { for (let index = 0; index < 50 && !predicate(); index += 1) await tick(); }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const deferred = () => { let resolve!: () => void; let reject!: (error: Error) => void; const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; };

function readySource(overrides: Partial<AvailabilitySourceSnapshot> = {}): AvailabilitySourceSnapshot {
  return {
    hydrationStatus: 'ready', hasCompletedSetup: true, timezoneName: 'Asia/Seoul', personalEvents: [], dateMemos: {},
    schedule: {
      shiftTypes: [{ id: 'rest', abbreviation: '휴', name: '휴무', kind: 'rest', color: '#FFFFFF', textColor: '#000000' }],
      shiftPattern: ['rest'], anchorDate: date, anchorPatternIndex: 0,
      patternHistory: [{ id: 'p', effectiveFrom: '2026-01-01', pattern: ['rest'], anchorDate: date, anchorPatternIndex: 0, createdAt: new Date(0).toISOString() }],
      shiftDateOverrides: {},
    }, ...overrides,
  };
}

function harness(initialSession = owner, storageMap = new Map<string, string>()) {
  const storage = { getItem: async (key: string) => storageMap.get(key) ?? null, setItem: async (key: string, value: string) => { storageMap.set(key, value); } };
  const store = createAvailabilityProjectionSyncQueueStore(storage, (id) => `queue:${id}`);
  let session = initialSession;
  let fullCalls = 0; let replaceCalls = 0;
  let sawEmptyIntervals = false;
  let fullImpl: () => Promise<void> = async () => undefined;
  let replaceImpl: () => Promise<void> = async () => undefined;
  const coordinator = createAvailabilityProjectionSyncCoordinator({ queueStore: store,
    getCurrentUserId: async () => session, fullSync: async (range) => { fullCalls += 1; assert(range.days.length > 0, 'full must contain every day'); sawEmptyIntervals ||= range.days.some((day) => day.intervals.length === 0); await fullImpl(); },
    replaceDates: async (_timezone, days) => { replaceCalls += 1; await replaceImpl(); assert(days.every((day) => Array.isArray(day.intervals)), 'empty intervals must be explicit'); },
    clear: async () => undefined,
    setTimer: () => 1, clearTimer: () => undefined });
  return { coordinator, store, storageMap, setSession: (value: string) => { session = value; }, counts: () => ({ fullCalls, replaceCalls, sawEmptyIntervals }), setFull: (fn: () => Promise<void>) => { fullImpl = fn; }, setReplace: (fn: () => Promise<void>) => { replaceImpl = fn; } };
}

async function run() {
  assert(parseAvailabilityProjectionSyncQueue('{bad') === null, 'malformed queue rejected');
  const merged = mergeAvailabilityDirtyDates({ version: 1, dirtyDates: [], fullSyncPending: false, clearPending: false, revision: 0, retryCount: 0, nextRetryAt: null, lastSyncedTimezoneName: 'Asia/Seoul' }, [date, date]);
  assert(merged.dirtyDates.length === 1, 'same date coalesced');
  const many = Array.from({ length: 101 }, (_, index) => `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String(index % 28 + 1).padStart(2, '0')}`);
  assert(mergeAvailabilityDirtyDates(merged, many).fullSyncPending, 'over 100 dates promotes to full');
  assert(JSON.stringify(getAvailabilityAffectedShiftDates(date)) === JSON.stringify([date, '2026-09-16']), 'override includes D+1');
  assert(JSON.stringify(getAvailabilityAffectedEventDates(undefined, date)) === JSON.stringify([date]), 'event create affects new date');
  assert(JSON.stringify(getAvailabilityAffectedEventDates('2026-09-14', date)) === JSON.stringify(['2026-09-14', date]), 'event move affects old and new dates');
  assert(JSON.stringify(getAvailabilityAffectedEventDates(date, undefined)) === JSON.stringify([date]), 'event delete affects old date');

  const initial = harness(); initial.coordinator.activate(owner); initial.coordinator.setSource(owner, readySource()); await waitUntil(() => initial.counts().fullCalls > 0); await initial.coordinator.drain(owner, true);
  const initialQueue = await initial.store.load(owner);
  assert(initial.counts().fullCalls === 1, `trusted initial hydration full once (${initial.counts().fullCalls}, retry ${initialQueue.retryCount}, pending ${initialQueue.fullSyncPending})`);
  initial.coordinator.setSource(owner, readySource()); await tick(); await initial.coordinator.drain(owner, true);
  assert(initial.counts().fullCalls === 1, 'duplicate ready publication does not duplicate full');
  initial.coordinator.setSource(owner, readySource({ timezoneName: 'UTC' })); await waitUntil(() => initial.counts().fullCalls === 2);
  assert(initial.counts().fullCalls === 2, 'timezone change schedules full');

  for (const hydrationStatus of ['loading', 'error'] as const) {
    const blocked = harness(); blocked.coordinator.activate(owner); blocked.coordinator.setSource(owner, readySource({ hydrationStatus })); await tick();
    assert(blocked.counts().fullCalls === 0 && blocked.counts().replaceCalls === 0, hydrationStatus + ' must not call RPC');
  }

  const fullRace = harness(); const fullGate = deferred(); fullRace.setFull(() => fullGate.promise); fullRace.coordinator.activate(owner); fullRace.coordinator.setSource(owner, readySource()); await tick();
  await fullRace.coordinator.enqueueDates(owner, [date]); fullGate.resolve(); await tick(); await fullRace.coordinator.drain(owner, true);
  assert(fullRace.counts().fullCalls === 2, 'mutation during full is retained');

  const replaceRace = harness(); replaceRace.coordinator.activate(owner); replaceRace.coordinator.setSource(owner, readySource()); await tick(); await replaceRace.coordinator.drain(owner, true);
  const replaceGate = deferred(); replaceRace.setReplace(() => replaceGate.promise); await replaceRace.coordinator.enqueueDates(owner, [date]); await tick(); await replaceRace.coordinator.enqueueDates(owner, [date]); replaceGate.resolve(); await tick(); await replaceRace.coordinator.drain(owner, true);
  assert(replaceRace.counts().replaceCalls === 2, 'same date mutation during replace is retained');

  const network = harness(); network.coordinator.activate(owner); network.coordinator.setSource(owner, readySource()); await tick(); await network.coordinator.drain(owner, true);
  network.setReplace(async () => { throw new Error('offline'); }); await network.coordinator.enqueueDates(owner, [date]); await tick();
  assert((await network.store.load(owner)).dirtyDates.includes(date), 'network failure retains queue');

  const promotion = harness(); promotion.coordinator.activate(owner); promotion.coordinator.setSource(owner, readySource()); await tick(); await promotion.coordinator.drain(owner, true);
  let first = true; promotion.setReplace(async () => { if (first) { first = false; throw new FullAvailabilitySyncRequiredError(); } }); await promotion.coordinator.enqueueDates(owner, [date]); await tick(); await promotion.coordinator.drain(owner, true);
  assert(promotion.counts().fullCalls === 2, '55000 promotes incremental to full');

  const persisted = harness(); persisted.coordinator.activate(owner); persisted.coordinator.setSource(owner, readySource()); await tick(); await persisted.coordinator.drain(owner, true); persisted.setReplace(async () => { throw new Error('offline'); }); await persisted.coordinator.enqueueDates(owner, [date]); await tick();
  const restarted = harness(owner, persisted.storageMap); restarted.coordinator.activate(owner); restarted.coordinator.setSource(owner, readySource()); await tick(); await restarted.coordinator.drain(owner, true);
  assert(restarted.counts().replaceCalls === 1, 'restart restores persistent queue');

  const wrong = harness('B'); wrong.coordinator.activate(owner); wrong.coordinator.setSource(owner, readySource()); await tick();
  assert(wrong.counts().fullCalls === 0, 'wrong user cannot execute RPC');

  const corruptedStorage = new Map<string, string>([['queue:A', '{bad']]);
  const corrupted = harness(owner, corruptedStorage); corrupted.coordinator.activate(owner); corrupted.coordinator.setSource(owner, readySource()); await waitUntil(() => corrupted.counts().fullCalls === 1);
  assert(corrupted.counts().fullCalls === 1, 'trusted full bootstrap repairs a corrupted queue');

  const accountRace = harness(); accountRace.coordinator.activate(owner); accountRace.coordinator.setSource(owner, readySource()); await waitUntil(() => accountRace.counts().fullCalls === 1); await accountRace.coordinator.drain(owner, true);
  const accountGate = deferred(); accountRace.setReplace(() => accountGate.promise); await accountRace.coordinator.enqueueDates(owner, [date]); await waitUntil(() => accountRace.counts().replaceCalls === 1); accountRace.setSession('B'); accountGate.resolve(); await tick();
  assert((await accountRace.store.load(owner)).dirtyDates.includes(date), 'account change keeps A pending work');

  const invalidation = harness(); invalidation.coordinator.activate(owner); invalidation.coordinator.setSource(owner, readySource()); await waitUntil(() => invalidation.counts().fullCalls === 1); await invalidation.coordinator.drain(owner, true);
  const invalidationGate = deferred(); invalidation.setReplace(() => invalidationGate.promise); await invalidation.coordinator.enqueueDates(owner, [date]); await waitUntil(() => invalidation.counts().replaceCalls === 1); invalidation.coordinator.setSource(owner, readySource({ hydrationStatus: 'error' })); invalidationGate.resolve(); await tick();
  assert((await invalidation.store.load(owner)).dirtyDates.includes(date), 'source invalidation keeps pending work');

  const empty = harness(); empty.coordinator.activate(owner); empty.coordinator.setSource(owner, readySource({ personalEvents: [{ id: 'all', title: 'x', date, allDay: true, startTime: null, endTime: null, memo: '' }] })); await tick(); await empty.coordinator.drain(owner, true);
  await waitUntil(() => empty.counts().fullCalls === 1);
  assert(empty.counts().fullCalls === 1 && empty.counts().sawEmptyIntervals, 'trusted empty availability is uploaded explicitly');
}

void run().then(() => console.log('availabilityProjectionSync fixtures passed'));
