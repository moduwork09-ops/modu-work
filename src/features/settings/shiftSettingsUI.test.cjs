const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const react = require('react');
const routes = [], backs = [], replacements = [];
let setup, canGoBack = true;
const colors = { background: 'pastel', text: 'ink' };
const constants = {
  calendarShiftColors: { day: colors, night: colors, training: colors, annualLeave: colors, rest: colors, offDuty: colors },
  brandColors: { deepNavy: 'navy', white: 'white' },
  radius: { xl: 20, md: 12 },
  spacing: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32 },
  useAppTheme: () => ({ surface: 'white', border: 'border', textSecondary: 'gray', primary: 'navy' }),
};
const schedule = { hasCompletedSetup: true, shiftTypes: [], shiftPattern: [], patternHistory: [], shiftDateOverrides: {} };
const cache = {};
function load(relative) {
  const file = path.resolve(root, relative);
  if (cache[file]) return cache[file];
  const exports = cache[file] = {};
  const mockRequire = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return require(name);
    if (name.includes('MaterialCommunityIcons')) return 'Icon';
    if (name === 'expo-router') return { useLocalSearchParams: () => ({ setup }), useRouter: () => ({
      push: r => routes.push(JSON.parse(JSON.stringify(r))), canGoBack: () => canGoBack,
      back: () => backs.push(true), replace: r => replacements.push(r),
    }) };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 24 }) };
    if (name === 'react-native') return { Pressable: 'Pressable', View: 'View', ScrollView: 'ScrollView', StyleSheet: { create: s => s, hairlineWidth: 1 } };
    if (name.endsWith('/components')) return { AppText: 'Text', Screen: 'Screen', PrimaryButton: 'PrimaryButton' };
    if (name.endsWith('/constants')) return constants;
    if (name.endsWith('/ShiftScheduleContext')) return { useShiftSchedule: () => schedule };
    const resolved = path.resolve(path.dirname(file), name);
    const target = ['.tsx', '.ts', '/index.tsx'].map(s => resolved + s).find(fs.existsSync);
    if (!target) throw Error('Unexpected import ' + name);
    return load(target);
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, { exports, require: mockRequire }, { filename: file });
  return exports;
}
function descendants(n) {
  if (n == null || typeof n === 'boolean') return [];
  if (Array.isArray(n)) return n.flatMap(descendants);
  if (typeof n.type === 'function') return descendants(n.type(n.props));
  return [n, ...descendants(n.props?.children)];
}
const model = load('src/features/shift-settings/mockData.ts');
schedule.shiftTypes = model.mockShiftTypes.slice(0, 4);
schedule.shiftPattern = schedule.shiftTypes.map(t => t.id);
const types = load('app/shift-types/index.tsx').default;
const hub = load('app/shift-presets/index.tsx').default;
const render = screen => descendants(screen());
const rows = all => all.filter(n => n.type === 'Pressable' && n.props.accessibilityLabel !== '뒤로 가기');
const back = all => all.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === '뒤로 가기').props.onPress();
const original = JSON.stringify(schedule);
let all = render(types), list = rows(all);
assert.deepEqual(list.map(n => n.props.accessibilityLabel), [...schedule.shiftTypes.map(t => t.name + ' 수정'), '근무유형 추가']);
assert(!all.some(n => n.type === 'PrimaryButton'), 'normal MY must have no sequential CTA');
schedule.shiftTypes.forEach((t, i) => {
  assert(all.includes(t.abbreviation));
  assert(all.includes(model.formatShiftTime(t)));
  list[i].props.onPress();
  assert.deepEqual(routes.at(-1), { pathname: '/shift-types/[id]', params: { id: t.id } });
});
assert(all.includes('19:00 ~ 다음날 09:00'), 'overnight text unchanged');
assert(all.includes('근무 없음'));
list.at(-1).props.onPress(); assert.equal(routes.at(-1), '/shift-types/new');
assert.equal(all.filter(n => n.type === 'View' && n.props.style?.[0]?.height === 1).length, 3);
assert.equal(all.find(n => n.type === 'ScrollView').props.contentContainerStyle[1].paddingBottom, 56);
for (const row of list) assert.equal(row.props.style({ pressed: false })[0].minHeight, 74);
back(all); assert.equal(backs.length, 1);
canGoBack = false; back(all); assert.equal(replacements.at(-1), '/(tabs)/my');

setup = 'true'; all = render(types);
const next = all.find(n => n.type === 'PrimaryButton');
assert.equal(next.props.label, '다음: 근무패턴 설정');
assert.equal(next.props.disabled, false);
next.props.onPress(); assert.deepEqual(routes.at(-1), { pathname: '/shift-pattern', params: { setup: 'true' } });
back(all); assert.equal(replacements.at(-1), '/onboarding');
setup = undefined;
all = render(hub); list = rows(all);
assert(all.includes('근무표 찾기 · 공유'));
assert.deepEqual(list.map(n => n.props.accessibilityLabel), ['이 근무표 공유하기', '공유 코드로 근무표 받기', '기본 프리셋', '회사 · 기관에서 근무표 찾기']);
list.forEach(n => n.props.onPress());
assert.deepEqual(routes.slice(-4), ['/shift-presets/share', '/shift-presets/receive', '/shift-presets/builtin', '/shift-presets/search']);
back(all); assert.equal(replacements.at(-1), '/(tabs)/my');
canGoBack = true; back(all); assert.equal(backs.length, 2);
assert.equal(all.filter(n => n.type === 'View' && n.props.style?.[0]?.height === 1).length, 3);
assert.equal(JSON.stringify(schedule), original, 'presentation must not mutate schedule');

schedule.hasCompletedSetup = false;
all = render(hub); list = rows(all);
assert(all.includes('근무표 설정'));
assert.deepEqual(list.map(n => n.props.accessibilityLabel), ['회사·기관에서 찾기', '공유 코드로 받기', '기본 프리셋', '직접 만들기']);
list.forEach(n => n.props.onPress());
assert.deepEqual(routes.slice(-4), ['/shift-presets/search', '/shift-presets/receive', '/shift-presets/builtin', '/shift-types?setup=true']);
for (const route of routes) {
  const pathname = (typeof route === 'string' ? route : route.pathname).split('?')[0];
  assert(['app' + pathname + '.tsx', 'app' + pathname + '/index.tsx'].some(f => fs.existsSync(path.join(root, f))), pathname);
}
console.log('PASS: actual screen rows/edit/add/routes/back, setup CTA and 4 choices, normal 4-menu hub, grouped dividers, overnight labels, scroll padding, unchanged schedule.');
