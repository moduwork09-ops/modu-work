import assert from 'node:assert/strict';
import { buildNotificationPlan, LOCAL_NOTIFICATION_MARKER, MAX_LOCAL_NOTIFICATIONS, type NotificationSource, type NotificationPlan } from './notificationPlan';
import { createNotificationSettingsStore, normalizeNotificationSettings, DEFAULT_NOTIFICATION_SETTINGS as defaults } from './notificationSettings';
import { createNotificationReconciler, type PendingNotification } from './notificationReconciler';
const source: NotificationSource = {
  shiftTypes: [
    { id: 'D', kind: 'work', name: '주간', abbreviation: '주', startTime: '09:00', endTime: '18:00', color: '#fff', textColor: '#000' },
    { id: 'N', kind: 'work', name: '야간', abbreviation: '야', startTime: '22:00', endTime: '07:00', color: '#000', textColor: '#fff' },
    { id: 'R', kind: 'rest', name: '휴무', abbreviation: '휴', color: '#fff', textColor: '#000' },
  ], shiftPattern: ['D'], anchorDate: '2099-09-01', anchorPatternIndex: 0,
  patternHistory: [
    { id: 'history-D', createdAt: '', effectiveFrom: '2099-09-01', anchorDate: '2099-09-01', anchorPatternIndex: 0, pattern: ['D'] },
    { id: 'history-N', createdAt: '', effectiveFrom: '2099-09-12', anchorDate: '2099-09-12', anchorPatternIndex: 0, pattern: ['N'] },
  ], shiftDateOverrides: { '2099-09-11': { date: '2099-09-11', shiftTypeId: 'R', createdAt: '', updatedAt: '' } },
  dateMemos: { '2099-09-10': [
    { id: 'timed', text: '병원', timeEnabled: true, allDay: false, startTime: '18:00', endTime: '19:00', reminderMinutes: 60, notificationId: 'legacy-id', color: '#fff' },
    { id: 'untimed', text: '등산', timeEnabled: false, allDay: false, startTime: null, endTime: null, reminderMinutes: null, notificationId: null, color: '#fff' },
  ] },
  personalEvents: [
    { id: 'p', title: '개인', date: '2099-09-10', allDay: false, startTime: '19:00', endTime: '20:00', memo: '' },
    { id: 'shared', kind: 'shared', source: 'together', title: '공동', date: '2099-09-10', allDay: false, startTime: '18:00', endTime: '19:00', memo: '' },
    { id: 'source-only', source: 'together', title: '공동', date: '2099-09-10', allDay: false, startTime: '18:00', endTime: '19:00', memo: '' },
    { id: 'all-day', title: '종일', date: '2099-09-10', allDay: true, startTime: null, endTime: null, memo: '' },
  ],
};
const now = new Date(2099, 8, 10, 8); const snapshot = JSON.stringify(source);
async function run() {
  assert.deepEqual(normalizeNotificationSettings(null), defaults);
  assert.deepEqual(normalizeNotificationSettings([]), defaults);
  assert.deepEqual(normalizeNotificationSettings({ enabled: false, shiftLeadMinutes: 11, personalEventLeadMinutes: 1440 }), { ...defaults, enabled: false, personalEventLeadMinutes: 1440 });
  const values = new Map<string, string>(); const io = { getItem: async (k: string) => values.get(k) ?? null, setItem: async (k: string, v: string) => { values.set(k, v); } };
  const store = createNotificationSettingsStore(io); await store.save('A', { ...defaults, enabled: false });
  assert.equal((await store.load('A')).enabled, false); assert.equal((await store.load('B')).enabled, true);
  assert(values.has('modu-work.user.A.notification-settings.v1'));
  assert.equal((await createNotificationSettingsStore(io).load('A')).enabled, false);
  values.set('modu-work.user.C.notification-settings.v1', '{broken'); assert.deepEqual(await store.load('C'), defaults);
  const plans = buildNotificationPlan('A', defaults, source, now);
  assert.equal(plans.find(p => p.data.kind === 'shift' && p.data.date === '2099-09-10')?.at, new Date(2099, 8, 10, 8, 30).getTime());
  assert(!plans.some(p => p.data.kind === 'shift' && p.data.date === '2099-09-11'));
  assert.equal(plans.find(p => p.data.kind === 'shift' && p.data.date === '2099-09-12')?.at, new Date(2099, 8, 12, 21, 30).getTime());
  assert.equal(plans.find(p => p.data.sourceId === 'memo:timed')?.at, new Date(2099, 8, 10, 17, 50).getTime());
  assert.equal(plans.filter(p => p.data.kind === 'personal').length, 2);
  assert(plans.every(p => p.data.date <= '2099-09-23'));
  assert(!buildNotificationPlan('A', defaults, source, new Date(2099, 8, 10, 18, 1)).some(p => p.data.sourceId === 'memo:timed'));
  assert.deepEqual(buildNotificationPlan('A', { ...defaults, enabled: false }, source, now), []);
  assert(buildNotificationPlan('A', { ...defaults, shiftEnabled: false }, source, now).every(p => p.data.kind === 'personal'));
  assert(buildNotificationPlan('A', { ...defaults, personalEventEnabled: false }, source, now).every(p => p.data.kind === 'shift'));
  assert.equal(new Set(plans.map(p => p.identifier)).size, plans.length);
  assert.equal(JSON.stringify(source), snapshot);
  assert.deepEqual(Object.keys(plans[0].data).sort(), ['managedBy', 'userId', 'kind', 'date', 'sourceId'].sort());
  const dense = { ...source, personalEvents: Array.from({ length: 100 }, (_, i) => ({ ...source.personalEvents[0], id: String(i) })) };
  assert.equal(buildNotificationPlan('A', defaults, dense, now).length, MAX_LOCAL_NOTIFICATIONS);

  const pending = new Map<string, PendingNotification>(); let schedules = 0;
  pending.set('unrelated', { identifier: 'unrelated', at: 1, title: 'Other', body: '', data: {} });
  pending.set('legacy', { identifier: 'legacy', at: 1, title: '일정 알림', body: 'old', data: { date: '2099-09-10', memoId: 'x' } });
  const adapter = { list: async () => [...pending.values()], cancel: async (id: string) => { pending.delete(id); }, schedule: async (p: NotificationPlan) => { schedules++; pending.set(p.identifier, p); } };
  const reconcile = createNotificationReconciler(adapter);
  await reconcile(plans); const firstCount = schedules; await reconcile(plans); assert.equal(schedules, firstCount);
  assert(!pending.has('legacy') && pending.has('unrelated'));
  const changed = buildNotificationPlan('A', { ...defaults, shiftLeadMinutes: 60, personalEventLeadMinutes: 30 }, source, new Date(2099, 8, 10, 7));
  await reconcile(changed); assert.equal(pending.get(changed[0].identifier)?.at, changed[0].at);
  const deleted = buildNotificationPlan('A', defaults, { ...source, dateMemos: {}, personalEvents: [], shiftPattern: ['R'], patternHistory: [] }, now);
  await reconcile(deleted); assert.equal(pending.size, 1);
  await reconcile(plans); const bPlans = buildNotificationPlan('B', defaults, source, now); await reconcile(bPlans);
  assert([...pending.values()].every(p => p.identifier === 'unrelated' || p.data.userId === 'B'));
  await reconcile([]); assert.deepEqual([...pending.keys()], ['unrelated']);


  // Native metadata survives JS process/reconciler recreation; no separate account setting.
  await reconcile(plans, false);
  let exactSchedules = schedules;
  const restarted = createNotificationReconciler(adapter);
  await restarted(plans, false);
  assert.equal(schedules, exactSchedules, 'cold start with same capability keeps reservations');
  await restarted(plans, true);
  assert.equal(schedules, exactSchedules + plans.length, 'cold start sees persisted false and upgrades');
  exactSchedules = schedules;
  await restarted(plans, true);
  assert.equal(schedules, exactSchedules);
  await restarted(plans, false);
  assert.equal(schedules, exactSchedules + plans.length);
  const untagged = { ...plans[0], data: { ...plans[0].data } };
  pending.set(untagged.identifier, untagged);
  exactSchedules = schedules;
  await restarted(plans, false);
  assert.equal(schedules, exactSchedules + 1, 'pre-upgrade reservation without marker replaced once');
  await restarted([]);

  let release!: () => void; let entered!: () => void; const started = new Promise<void>(r => { entered = r; });
  const gate = new Promise<void>(r => { release = r; });
  let first = true;
  const racing = createNotificationReconciler({ ...adapter, schedule: async p => { if (first) { first = false; entered(); await gate; } await adapter.schedule(p); } });
  const a = racing(plans); await started; const b = racing(bPlans); release(); await Promise.all([a, b]);
  assert([...pending.values()].every(p => p.identifier === 'unrelated' || p.data.userId === 'B'));
  await racing([]);
  assert.equal(LOCAL_NOTIFICATION_MARKER, plans[0].data.managedBy);
  console.log('PASS: defaults/fallback/isolation, actual history/override/overnight schedule, personal-only/lead/window/cap/payload, flags, idempotence, changes/deletion/logout, in-flight account race');
}
void run();
