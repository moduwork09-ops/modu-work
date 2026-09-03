const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const cache = new Map(), pending = new Map(), values = new Map();
let permission = true, requests = 0, scheduleCalls = 0, failRemove = false;
let exact = false, settingsOpens = 0;
let beforeSchedule = async () => {};
const notifications = {
  setNotificationHandler() {}, AndroidImportance: { HIGH: 4 }, SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationChannelAsync: async () => {},
  getPermissionsAsync: async () => ({ granted: permission, canAskAgain: true }),
  requestPermissionsAsync: async () => { requests++; return { granted: permission }; },
  getAllScheduledNotificationsAsync: async () => [...pending.values()],
  cancelScheduledNotificationAsync: async id => { pending.delete(id); },
  scheduleNotificationAsync: async n => { await beforeSchedule(); scheduleCalls++; pending.set(n.identifier, { ...n, trigger: { type: 'date', value: n.trigger.date.getTime() } }); return n.identifier; },
};
const storage = {
  multiGet: async keys => keys.map(k => [k, values.get(k) ?? null]),
  multiRemove: async keys => { for (const k of keys) { values.delete(k); if (failRemove) { failRemove = false; throw Error('partial delete failed'); } } },
  multiSet: async entries => { for (const [k,v] of entries) values.set(k,v); },
};
const constants = { CALENDAR_DATE_TIP_STORAGE_KEY:'modu-work.calendar-date-tip.v1', RECENT_COLORS_STORAGE_KEY:'modu-work.recent-colors.v1', PERSONAL_EVENTS_STORAGE_KEY:'modu-work.personal-events.v1', DATE_MEMOS_STORAGE_KEY:'modu-work.date-memos.v1', MONTHLY_MEMOS_STORAGE_KEY:'modu-work.monthly-memos.v1', SHIFT_DATE_OVERRIDES_STORAGE_KEY:'modu-work.shift-date-overrides.v1', SHIFT_SETTINGS_STORAGE_KEY:'modu-work.shift-settings.v1', SALARY_SETTINGS_STORAGE_KEY:'modu-work.salary-settings.v1', OVERTIME_ENTRIES_STORAGE_KEY:'modu-work.overtime-entries.v1' };
function load(relative) {
  const file = path.resolve(root, relative); if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const requireMock = name => {
    if (name === 'expo-notifications') return notifications;
    if (name === 'react-native') return { Platform: { OS:'android', Version:36 } };
    if (name === 'expo') return { requireOptionalNativeModule: () => ({ canScheduleExactAlarms: () => exact, openExactAlarmSettings: async () => { settingsOpens++; return true; } }) };
    if (name === '@react-native-async-storage/async-storage') return storage;
    if (file.endsWith('resetAllUserData.ts') && !name.includes('notificationRuntime') && !name.includes('userScopedStorageKey')) return constants;
    return load(path.relative(root, path.resolve(path.dirname(file), name + '.ts')));
  };
  vm.runInNewContext(code, { exports, require: requireMock, console, Date, setTimeout }); return exports;
}
const runtime = load('features/notifications/notificationRuntime.ts');
const reset = load('features/data/resetAllUserData.ts');
const plan = owner => ({ identifier:'modu-work.local.v1:' + owner + ':personal:test', at:Date.now()+3600000, title:'곧 일정이 있어요', body:'18:00 일정', data:{managedBy:'modu-work.local.v1',userId:owner,kind:'personal',date:'2099-01-01',sourceId:'event:test'} });
async function run() {
  await runtime.setNotificationOwner('A'); await runtime.reconcileLocalNotifications('A',[plan('A')]); const first=scheduleCalls;
  const stable=[...pending.values()][0]; const a={...plan('A'),at:stable.trigger.value};
  await runtime.reconcileLocalNotifications('A',[a]); assert.equal(scheduleCalls,first); assert.equal(requests,0,'loading/reconcile must not prompt');
  permission=false; await runtime.reconcileLocalNotifications('A',[a]); assert.equal(pending.size,0); assert.equal(requests,0);
  assert.equal(await runtime.requestLocalNotificationPermission(),false); assert.equal(requests,1);
  permission=true; assert.equal(await runtime.requestLocalNotificationPermission(),true); assert.equal(requests,1);
  await runtime.reconcileLocalNotifications('A',[a]);
  pending.set('legacy',{identifier:'legacy',content:{title:'일정 알림',body:'old',data:{memoId:'old-id',date:'2099-01-01'}},trigger:{value:a.at}});
  pending.set('unrelated',{identifier:'unrelated',content:{title:'Other',body:'',data:{}},trigger:{value:a.at}});
  for(const key of reset.USER_SCOPED_LEGACY_STORAGE_KEYS) values.set(key.replace('modu-work.','modu-work.user.A.'),'original-'+key);
  values.set('modu-work.user.A.notification-settings.v1','A preference'); values.set('modu-work.user.B.date-memos.v1','B data'); values.set('modu-work.user.B.notification-settings.v1','B preference');
  const before = JSON.stringify([...values]); failRemove=true;
  await assert.rejects(reset.resetAllUserData('A'),/partial delete failed/);
  assert.deepEqual([...values].sort(),JSON.parse(before).sort()); assert(pending.has(a.identifier),'rollback restores previous plan'); assert(!pending.has('legacy')); assert(pending.has('unrelated'));
  await reset.resetAllUserData('A',async()=>{ await runtime.reconcileLocalNotifications('A',[a]); });
  assert.deepEqual([...pending.keys()],['unrelated'],'reset must suppress racing old-state reconciliation');
  assert.equal(values.get('modu-work.user.A.notification-settings.v1'),'A preference'); assert.equal(values.get('modu-work.user.B.date-memos.v1'),'B data');
  await runtime.reconcileLocalNotifications('A',[a]);
  await assert.rejects(reset.resetAllUserData('A',async()=>{throw Error('reload failed');}),/reload failed/);
  assert(!pending.has(a.identifier),'committed reset cannot restore stale notifications after reload failure');
  await runtime.setNotificationOwner('B'); await runtime.reconcileLocalNotifications('A',[a]); assert(!pending.has(a.identifier));
  await runtime.reconcileLocalNotifications('B',[plan('B')]); assert([...pending.values()].some(n=>n.content.data.userId==='B'));
  await assert.rejects(reset.resetAllUserData('A'),/Account changed/); assert.equal(values.get('modu-work.user.B.date-memos.v1'),'B data');
  await runtime.setNotificationOwner(null); assert.deepEqual([...pending.keys()],['unrelated']);

  // Exact capability is persisted per native reservation, independent of account preferences.
  let exactA = plan('A');
  await runtime.setNotificationOwner('A');
  exact = false;
  await runtime.reconcileLocalNotifications('A', [exactA]);
  assert.equal(pending.get(exactA.identifier).content.data.exactAlarmCapability, false, 'denied exact still schedules fallback');
  let count = scheduleCalls;
  await runtime.reconcileLocalNotifications('A', [exactA]);
  assert.equal(scheduleCalls, count, 'unchanged false does not replace');

  exact = true;
  await runtime.reconcileLocalNotifications('A', [exactA]);
  assert.equal(scheduleCalls, ++count, 'false -> true replaces unchanged schedule');
  assert.equal(pending.get(exactA.identifier).content.data.exactAlarmCapability, true);
  assert.equal([...pending.values()].filter(n => n.content.data.userId === 'A').length, 1);
  await runtime.reconcileLocalNotifications('A', [exactA]);
  assert.equal(scheduleCalls, count, 'unchanged true does not replace');

  exact = false;
  await runtime.reconcileLocalNotifications('A', [exactA]);
  assert.equal(scheduleCalls, ++count, 'true -> false replaces retained Expo request');
  pending.delete(exactA.identifier); // OS revocation may also remove the native request.
  await runtime.reconcileLocalNotifications('A', [exactA]);
  assert.equal(pending.get(exactA.identifier).content.data.exactAlarmCapability, false, 'missing alarm restored as fallback');

  function gate() {
    let enter, release;
    return { entered: new Promise(r => enter = r), wait: new Promise(r => release = r), enter: () => enter(), release: () => release() };
  }
  // Switch owner while the exact replacement is inside the native schedule call.
  exact = true;
  const switching = gate();
  beforeSchedule = async () => { beforeSchedule = async () => {}; switching.enter(); await switching.wait; };
  const oldWork = runtime.reconcileLocalNotifications('A', [exactA]);
  await switching.entered;
  const newOwner = runtime.setNotificationOwner('B');
  const bPlan = plan('B');
  const newWork = runtime.reconcileLocalNotifications('B', [bPlan]);
  switching.release();
  await Promise.all([oldWork, newOwner, newWork]);
  assert(!pending.has(exactA.identifier), 'stale exact completion cannot revive A');
  assert(pending.has(bPlan.identifier));
  assert([...pending.values()].every(n => n.identifier === 'unrelated' || n.content.data.userId === 'B'));

  // Reset invalidates an in-flight capability replacement.
  exact = false;
  const resetGate = gate();
  beforeSchedule = async () => { beforeSchedule = async () => {}; resetGate.enter(); await resetGate.wait; };
  const replacing = runtime.reconcileLocalNotifications('B', [bPlan]);
  await resetGate.entered;
  const resetting = runtime.withLocalNotificationReset('B', async () => {
    exact = true;
    await runtime.reconcileLocalNotifications('B', [bPlan]);
  });
  resetGate.release();
  await Promise.all([replacing, resetting]);
  assert(!pending.has(bPlan.identifier), 'successful reset leaves no stale completion');

  // Rollback uses the current capability, not the pre-reset value.
  exact = false;
  await runtime.reconcileLocalNotifications('B', [bPlan]);
  await assert.rejects(runtime.withLocalNotificationReset('B', async () => {
    exact = true;
    await runtime.reconcileLocalNotifications('B', [bPlan]);
    throw Error('rollback exact change');
  }), /rollback exact change/);
  assert.equal(pending.get(bPlan.identifier).content.data.exactAlarmCapability, true);
  count = scheduleCalls;
  await runtime.reconcileLocalNotifications('B', [bPlan]);
  assert.equal(scheduleCalls, count);

  // Owner changes while rollback waits for POST_NOTIFICATIONS must not resurrect B.
  const rollbackGate = gate();
  const normalPermission = notifications.getPermissionsAsync;
  const rollback = runtime.withLocalNotificationReset('B', async () => {
    notifications.getPermissionsAsync = async () => { rollbackGate.enter(); await rollbackGate.wait; return { granted: true }; };
    throw Error('rollback account race');
  });
  const rejectedRollback = assert.rejects(rollback, /rollback account race/);
  await rollbackGate.entered;
  await runtime.setNotificationOwner('C');
  notifications.getPermissionsAsync = normalPermission;
  const cPlan = plan('C');
  await runtime.reconcileLocalNotifications('C', [cPlan]);
  rollbackGate.release();
  await rejectedRollback;
  assert(!pending.has(bPlan.identifier), 'rollback cannot restore previous account');
  assert(pending.has(cPlan.identifier));
  await runtime.setNotificationOwner(null);
  assert.deepEqual([...pending.keys()], ['unrelated']);
  assert.equal(settingsOpens, 0, 'reconcile/reset/owner never opens system settings');
  console.log('PASS: exact false/true transitions, unchanged capability, OS cancellation fallback, owner and reset in-flight races, rollback capability/owner safety');

  console.log('PASS: native adapter idempotence, denied/granted/no-prompt policy, reset partial-failure rollback + reschedule, successful reset race, committed reload failure, legacy cleanup, account switch/logout/preferences/unrelated notifications');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
