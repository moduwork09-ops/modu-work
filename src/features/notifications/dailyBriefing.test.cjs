const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const cache = new Map();
function load(relative) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const requireMock = name => {
    if (name === '../shifts/shiftSchedule') return { getShiftForDate: (date, source) => source.shifts[date], NO_ACTIVE_SCHEDULE_SHIFT_TYPE: { id: 'system-no-active-schedule' } };
    if (name === '../shifts/conditionalShiftRule') return { UNSUPPORTED_HOLIDAY_SHIFT_TYPE: { id: 'system-unsupported-korean-holiday' } };
    if (name === '../storage/userScopedStorageKey') return { getUserScopedStorageKey: (owner, key) => key.replace('modu-work.', `modu-work.user.${owner}.`) };
    return load(path.relative(root, path.resolve(path.dirname(file), name + '.ts')));
  };
  vm.runInNewContext(code, { exports, require: requireMock, Date, Map, Set, Number, console });
  return exports;
}
const { buildDailyBriefingPlan } = load('features/notifications/dailyBriefingPlan.ts');
const { createNotificationReconciler } = load('features/notifications/notificationReconciler.ts');
const { notificationCalendarParams } = load('features/notifications/notificationPlan.ts');
const { createNotificationSettingsStore, DEFAULT_NOTIFICATION_SETTINGS: defaults } = load('features/notifications/notificationSettings.ts');
const date = '2099-09-10';
const now = new Date(2099, 8, 10, 6);
const shift = { id: 'D', kind: 'work', name: '주간', startTime: '09:00', endTime: '18:00' };
const source = { shifts: { [date]: shift }, shiftTypes: [], shiftPattern: [], patternHistory: [], shiftDateOverrides: {}, dateMemos: {}, personalEvents: [], sharedEvents: [] };
const enabled = { ...defaults, briefingEnabled: true };

async function run() {
  assert.equal(buildDailyBriefingPlan('A', defaults, source, now).length, 0, 'OFF by default');
  const workOnly = buildDailyBriefingPlan('A', enabled, source, now)[0];
  assert.equal(workOnly.identifier, `daily-briefing:A:${date}`);
  assert.equal(workOnly.at, new Date(2099, 8, 10, 7).getTime());
  assert.match(workOnly.body, /주간 09:00~18:00/);
  assert.equal(workOnly.data.date, date);
  assert.equal(notificationCalendarParams(workOnly.data).notificationDate, date);
  assert.equal(notificationCalendarParams(workOnly.data).notificationOpenDetail, '1');
  assert.equal(buildDailyBriefingPlan('A', enabled, { ...source, shifts: {} }, now).length, 0, 'empty day skipped');
  assert.equal(buildDailyBriefingPlan('A', enabled, { ...source, shifts: { [date]: { id: 'system-no-active-schedule' } } }, now).length, 0, 'before first schedule is empty');
  assert.equal(buildDailyBriefingPlan('A', { ...enabled, briefingNotifyEmpty: true }, { ...source, shifts: {} }, now).length, 30);
  const rich = {
    ...source,
    dateMemos: { [date]: [
      { id: 'p', text: '병원', timeEnabled: true, startTime: '10:00' },
      { id: 'm', text: '준비물', timeEnabled: false, startTime: null },
    ] },
    personalEvents: [{ id: 'e', title: '운동', date, startTime: '20:00' }],
    sharedEvents: [
      { id: 's1', localDate: date, startTime: '18:30', title: '가족 외식' },
      { id: 's2', localDate: date, startTime: '19:00', title: '모임' },
    ],
  };
  const richPlan = buildDailyBriefingPlan('A', enabled, rich, now)[0];
  assert.match(richPlan.body, /병원/);
  assert.match(richPlan.body, /가족 외식/);
  assert.match(richPlan.body, /📝 준비물/);
  assert.match(richPlan.body, /외 2건/);
  assert(!richPlan.body.includes('운동'), 'overflow is collapsed');
  const filtered = buildDailyBriefingPlan('A', { ...enabled, briefingIncludeShift: false, briefingIncludePersonal: false, briefingIncludeShared: false }, rich, now)[0];
  assert(!filtered.body.includes('주간') && !filtered.body.includes('병원') && !filtered.body.includes('가족 외식'));
  assert.match(filtered.body, /준비물/);
  assert.equal(buildDailyBriefingPlan('A', { ...enabled, briefingIncludeShift: false, briefingIncludePersonal: false, briefingIncludeShared: false, briefingIncludeMemo: false }, rich, now).length, 0);
  const moved = buildDailyBriefingPlan('A', { ...enabled, briefingTime: '08:15' }, rich, now)[0];
  assert.equal(moved.at, new Date(2099, 8, 10, 8, 15).getTime());
  assert.notEqual(buildDailyBriefingPlan('A', enabled, { ...rich, sharedEvents: [] }, now)[0].body, richPlan.body);
  assert.equal(buildDailyBriefingPlan('B', enabled, rich, now)[0].data.userId, 'B');
  assert.equal(buildDailyBriefingPlan('A', enabled, rich, new Date(2099, 8, 10, 7, 1)).every(p => p.data.date !== date), true);

  const values = new Map();
  const store = createNotificationSettingsStore({ getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); } });
  await store.save('A', enabled);
  assert.equal((await store.load('A')).briefingEnabled, true);
  assert.equal((await store.load('B')).briefingEnabled, false);
  values.set('modu-work.user.C.notification-settings.v1', JSON.stringify({ version: 1, settings: { enabled: true } }));
  assert.equal((await store.load('C')).briefingEnabled, false, 'old settings remain OFF');

  const pending = new Map(); let schedules = 0;
  const reconcile = createNotificationReconciler({
    list: async () => [...pending.values()],
    cancel: async id => { pending.delete(id); },
    schedule: async plan => { schedules++; pending.set(plan.identifier, plan); },
  });
  await reconcile([richPlan]); await reconcile([richPlan]);
  assert.equal(schedules, 1, 'unchanged content is not rescheduled');
  await reconcile([moved]); assert.equal(schedules, 2, 'time change replaces alarm');
  const edited = buildDailyBriefingPlan('A', enabled, { ...rich, sharedEvents: [] }, now)[0];
  await reconcile([edited]); assert.equal(schedules, 3, 'content change replaces alarm');
  await reconcile([buildDailyBriefingPlan('B', enabled, rich, now)[0]]);
  assert(!pending.has(edited.identifier), 'account switch removes A briefing');
  await reconcile([]); assert.equal(pending.size, 0, 'logout/reset removes briefing');
  console.log('PASS: default OFF, 30-day time/window, work/personal/shared/memo, flags, empty day, overflow, account storage, rebooking and cleanup');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
