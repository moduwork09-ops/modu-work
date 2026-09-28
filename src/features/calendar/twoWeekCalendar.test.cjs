const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../../..');
const cache = new Map();
function load(relative) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, Date, Set, console, require: (name) => {
    if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(file), name + '.ts')));
    throw new Error(`Unexpected dependency ${name}`);
  } }, { filename: file });
  return exports;
}

const { addCalendarDays, createTwoWeekDates, createTwoWeekAgendaItems } = load('src/features/calendar/twoWeekCalendar.ts');
const { getMemberShiftCalendarDatePresentation } = load('src/features/calendar/memberShiftCalendarPresentation.ts');

for (const [date, start, first, last] of [
  ['2026-09-24', 0, '2026-09-20', '2026-10-03'],
  ['2026-09-24', 1, '2026-09-21', '2026-10-04'],
  ['2026-12-31', 0, '2026-12-27', '2027-01-09'],
  ['2026-08-31', 1, '2026-08-31', '2026-09-13'],
]) {
  const dates = createTwoWeekDates(date, start);
  assert.equal(dates.length, 14);
  assert.equal(new Set(dates.map((item) => item.date)).size, 14);
  assert.equal(dates[0].date, first);
  assert.equal(dates[13].date, last);
  assert.equal(dates[0].weekday, start);
}
assert.equal(addCalendarDays('2026-12-31', 14), '2027-01-14');

const memo = (id, text, startTime = null) => ({ id, text, color: '#D7DCE2', timeEnabled: !!startTime,
  allDay: false, startTime, endTime: startTime ? '19:00' : null, reminderMinutes: null, notificationId: null });
const longText = '긴 메모 문장을 끝까지 보여주어야 합니다. '.repeat(4);
const input = {
  memos: [memo('one', longText), memo('two', '교육', '18:00')],
  personalEvents: [{ id: 'personal', date: '2026-09-24', title: '병원', allDay: false, startTime: '09:00', color: '#123456' },
    { id: 'shared', date: '2026-09-24', title: '공동 저녁', allDay: false, startTime: '12:00', kind: 'shared' }],
  sharedEvents: [{ id: 'shared', displayKey: 'shared-shared', title: '공동 저녁', startTime: '12:00' },
    { id: 'server', displayKey: 'shared-server', title: '가족 식사', startTime: '20:00' }],
  showPersonalEvents: true, showSharedEvents: true, showEventTime: true, sharedColor: '#F28C72',
};
const items = createTwoWeekAgendaItems(input);
assert.equal(items.length, 5, 'multiple items remain visible without a monthly cap and duplicate shared event');
assert.deepEqual(Array.from(items, (item) => item.title), ['병원', '공동 저녁', '교육', '가족 식사', longText]);
assert.equal(items.find((item) => item.title === longText).title, longText, 'memo text is not truncated');
assert.equal(items.find((item) => item.title === '교육').time, '18:00');
assert.equal(items.find((item) => item.title === '공동 저녁').kind, 'shared');
assert.equal(createTwoWeekAgendaItems({ ...input, showPersonalEvents: false }).length, 2);
assert.equal(createTwoWeekAgendaItems({ ...input, showSharedEvents: false }).length, 3);
assert(items.every((item) => createTwoWeekAgendaItems({ ...input, showEventTime: false }).find((other) => other.id === item.id)?.time === null));

assert.equal(getMemberShiftCalendarDatePresentation('2026-09-19').dateKind, 'saturday');
assert.equal(getMemberShiftCalendarDatePresentation('2026-09-20').dateKind, 'sunday');
assert.equal(getMemberShiftCalendarDatePresentation('2026-09-24').holidayName, '추석 연휴');
assert.equal(getMemberShiftCalendarDatePresentation('2026-09-25').holidayName, '추석');
assert.equal(getMemberShiftCalendarDatePresentation('2026-09-26').dateKind, 'holiday');
assert.equal(getMemberShiftCalendarDatePresentation('2026-09-26').holidayName, '추석 연휴');
assert.equal(getMemberShiftCalendarDatePresentation('2026-09-23').holidayName, null);

console.log('PASS two-week dates, boundaries, agenda sources/order/filters, member weekend and holiday context');
