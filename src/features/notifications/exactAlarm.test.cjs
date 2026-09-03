const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');

function fixture(os = 'android', version = 36, available = true) {
  let allowed = false, opens = 0, reads = 0, refreshes = 0, failOpen = false, failRead = false;
  const platform = { OS: os, Version: version };
  const bridge = {
    canScheduleExactAlarms() { reads++; if (failRead) throw Error('native failed'); return allowed; },
    async openExactAlarmSettings() { if (failOpen) throw Error('no activity'); opens++; return true; },
  };
  const state = {
    settings: { enabled: true, shiftEnabled: true, personalEventEnabled: true, shiftLeadMinutes: 30, personalEventLeadMinutes: 10 },
    ready: true, saving: false, permission: true, exactCapability: false, error: null,
    refresh() { refreshes++; }, async update() {}, async requestPermission() {},
  };
  const jsx = (type, props) => ({ type, props: props || {} });
  let exact;
  function evaluate(file) {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const requireMock = name => {
      if (name === 'expo') return { requireOptionalNativeModule: () => available ? bridge : null };
      if (name === 'react') return { useState: value => [value, () => {}], useCallback: cb => cb };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === 'react-native') return { Platform: platform, StyleSheet: { create: s => s, hairlineWidth: 1 }, Alert: { alert() {} }, Linking: { openSettings: async () => {} }, ...Object.fromEntries(['Modal','Pressable','ScrollView','Switch','View'].map(n => [n,n])) };
      if (name === 'expo-router') return { useRouter: () => ({}), useFocusEffect: cb => cb() };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 0 }) };
      if (name.includes('MaterialCommunityIcons')) return 'Icon';
      if (name.endsWith('/components')) return { AppText: 'AppText', Screen: 'Screen' };
      if (name.endsWith('/constants')) return { calendarShiftColors: { annualLeave: {}, training: {} }, radius: {}, spacing: {}, useAppTheme: () => ({}) };
      if (name === './shift-types') return { Header: 'Header' };
      if (name.endsWith('/NotificationProvider')) return { useNotificationSettings: () => state };
      if (name.endsWith('/notificationSettings')) return { notificationLeadLabel: String, SHIFT_LEADS: [30], PERSONAL_LEADS: [10] };
      if (name.endsWith('/exactAlarm')) return exact;
      throw Error('Unexpected import: ' + name);
    };
    vm.runInNewContext(code, { exports, require: requireMock, console });
    return exports;
  }
  exact = evaluate('src/features/notifications/exactAlarm.ts');
  const screen = evaluate('app/notification-settings.tsx').default;
  return { exact, state, render: () => screen(), allow: value => { allowed = value; state.exactCapability = exact.getExactAlarmCapability(); },
    failOpen: () => { failOpen = true; }, failRead: () => { failRead = true; },
    counts: () => ({ opens, reads, refreshes }) };
}
function descendants(node) {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(descendants);
  return [node, ...descendants(node.props?.children)];
}
const text = tree => descendants(tree).filter(n => typeof n === 'string').join(' ');
const button = tree => descendants(tree).find(n => n?.type === 'Pressable' && text(n).includes('알람 및 리마인더 허용'));

async function run() {
  const android = fixture();
  android.allow(false);
  let tree = android.render();
  assert(text(tree).includes('설정 필요'));
  assert(text(tree).includes('늦을 수 있어요'));
  assert(button(tree));
  assert.equal(android.counts().opens, 0, 'screen mount/focus must not open settings');
  assert.equal(android.counts().refreshes, 1);
  button(tree).props.onPress();
  await new Promise(setImmediate);
  assert.equal(android.counts().opens, 1, 'explicit button opens settings once');
  android.allow(true);
  tree = android.render();
  assert(text(tree).includes('허용됨'));
  assert(!button(tree), 'granted access does not emphasize a settings button');
  assert.equal(android.counts().opens, 1);

  const ios = fixture('ios', 18);
  assert.equal(ios.exact.getExactAlarmCapability(), null);
  assert(!text(ios.render()).includes('정확한 시간에 알림 받기'));
  await ios.exact.openExactAlarmSettings();
  assert.equal(ios.counts().opens, 0);
  assert.equal(ios.counts().reads, 0);

  const oldAndroid = fixture('android', 30);
  assert.equal(oldAndroid.exact.getExactAlarmCapability(), true);
  assert(!button(oldAndroid.render()));
  await oldAndroid.exact.openExactAlarmSettings();
  assert.equal(oldAndroid.counts().opens, 0);

  const oldBuild = fixture('android', 36, false);
  assert.equal(oldBuild.exact.getExactAlarmCapability(), null);
  await assert.rejects(oldBuild.exact.openExactAlarmSettings(), /새 앱 빌드/);
  android.failRead();
  assert.equal(android.exact.getExactAlarmCapability(), null);
  android.failOpen();
  await assert.rejects(android.exact.openExactAlarmSettings(), /설정 화면을 열지 못했어요/);
  console.log('PASS: exact native wrapper + actual settings render, Android denied/granted, explicit-button only, iOS/Android <=30 excluded, old build/native failure handling');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
