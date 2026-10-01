const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { adjacentDailyDate, buildDailyItems, dailyWorkStatus, parseDailyDate } = require('./dailyPagePresentation.ts');
const { calculateDailyGaps } = require('../gaps/gapCalculator.ts');
const { notificationTapDestination } = require('../notifications/notificationPlan.ts');

assert.equal(parseDailyDate('2026-10-02'), '2026-10-02');
assert.equal(parseDailyDate('2026-02-30'), null);
assert.equal(parseDailyDate(['2026-10-02']), null);
assert.equal(adjacentDailyDate('2026-09-30', 1), '2026-10-01');
assert.equal(adjacentDailyDate('2026-01-01', -1), '2025-12-31');
assert.equal(adjacentDailyDate('2026-12-31', 1), '2027-01-01');

const day = '2026-10-02';
const work = { id: 'work', name: '주간', kind: 'work', color: '#FFAA00', textColor: '#111111', startTime: '09:00', endTime: '18:00' };
const rest = { id: 'rest', name: '휴무', kind: 'rest', color: '#CCCCCC', textColor: '#111111' };
const noSchedule = { ...rest, id: 'system-no-active-schedule', kind: 'work' };
const timedMemo = { id: 'mt', text: '병원', color: '#ABCDEF', timeEnabled: true, allDay: false, startTime: '10:30', endTime: '11:30' };
const untimedMemo = { id: 'mu', text: '보험 갱신', color: '#AAAAAA', timeEnabled: false, allDay: false, startTime: null, endTime: null };
const allDayMemo = { id: 'ma', text: '하루 행사', color: '#BBBBBB', timeEnabled: true, allDay: true, startTime: null, endTime: null };
const input = { date: day, shift: work, memos: [timedMemo, untimedMemo, allDayMemo], sharedColor: '#FF9988',
  personalEvents: [
    { id: 'p1', date: day, title: '운동', startTime: '19:00', endTime: '20:00', allDay: false, memo: 'PT', kind: 'personal' },
    { id: 'p2', date: day, title: '장보기', startTime: null, endTime: null, allDay: true, memo: '', kind: 'personal' },
    { id: 'legacy', date: day, title: '공동 행사', startTime: null, endTime: null, allDay: true, memo: '', source: 'together' },
    { id: 'other-day', date: '2026-10-03', title: '제외', startTime: '08:00', allDay: false },
  ],
  sharedEvents: [
    { id: 's1', displayKey: 'shared-s1', localDate: day, title: '점심', startTime: '12:30', endTime: '13:30', placeName: '서울' },
    { id: 'legacy', displayKey: 'shared-legacy', localDate: day, title: '중복', startTime: '13:00', endTime: '14:00' },
  ] };
const items = buildDailyItems(input);
assert.deepEqual(items.timed.map(item => item.id), ['work-start', 'memo:mt', 'shared-s1', 'work-end', 'event:p1']);
assert.deepEqual(items.untimed.map(item => item.id), ['memo:ma', 'event:p2', 'shared:legacy']);
assert.deepEqual(items.memos.map(memo => memo.id), ['mu']);
assert.equal(items.personalCount, 4);
assert.equal(items.sharedCount, 2);
assert.equal(items.timed.find(item => item.id === 'shared-s1').target.kind, 'shared');
assert.equal(items.untimed.find(item => item.id === 'memo:ma').target.kind, 'memo');
assert.equal(buildDailyItems({ ...input, shift: rest }).timed.some(item => item.kind === 'work'), false);
assert.equal(buildDailyItems({ ...input, shift: noSchedule }).timed.some(item => item.kind === 'work'), false);
const empty = buildDailyItems({ ...input, shift: noSchedule, memos: [], personalEvents: [], sharedEvents: [] });
assert.equal(empty.timed.length + empty.untimed.length + empty.memos.length, 0);
const tomorrow = buildDailyItems({ ...input, date: '2026-10-03', shift: rest, memos: [], sharedEvents: [] });
assert.equal(tomorrow.personalCount, 1);
assert.equal(dailyWorkStatus(day, rest, new Date(2026, 9, 2, 10)), '오늘은 휴무예요.');
assert.match(dailyWorkStatus(day, work, new Date(2026, 9, 2, 8)), /근무까지/);
assert.match(dailyWorkStatus(day, work, new Date(2026, 9, 2, 12)), /퇴근까지/);
assert.equal(calculateDailyGaps({ date: day, shifts: [{ date: day, kind: 'work', startTime: '09:00', endTime: '18:00' }], personalEvents: [{ date: day, allDay: false, startTime: '19:00', endTime: '20:00' }] }).totalGapMinutes, 360);

const page = fs.readFileSync(path.join(root, 'app/daily/[date].tsx'), 'utf8');
const calendar = fs.readFileSync(path.join(root, 'app/(tabs)/calendar.tsx'), 'utf8');
const provider = fs.readFileSync(path.join(root, 'src/features/notifications/NotificationProvider.tsx'), 'utf8');
const layout = fs.readFileSync(path.join(root, 'app/_layout.tsx'), 'utf8');
assert(page.indexOf('오늘의 근무') < page.indexOf('오늘의 타임라인'));
assert(page.indexOf('오늘의 타임라인') < page.indexOf('variant="heading">오늘의 틈'));
assert(page.indexOf('variant="heading">오늘의 틈') < page.indexOf('variant="heading">오늘의 메모'));
assert(page.indexOf('오늘의 메모') < page.indexOf('내일 미리보기'));
assert.match(page, /calculateDailyGaps\(/);
assert.match(page, /createMemoBusyEvents\(/);
assert.match(page, /sharedOwner === owner/);
assert.match(page, /dailyAction: action/);
assert.match(calendar, /dailyAction === 'choose'/);
assert.match(calendar, /dailyAction === 'memo'/);
assert.match(calendar, /dailyAction === 'editMemo'/);
assert.match(provider, /router\.push\(notificationTapDestination\(/);
assert.deepEqual(notificationTapDestination({ kind: 'dailyBriefing', date: day }, 'open-1'), { pathname: '/daily/[date]', params: { date: day } });
for (const kind of ['shift', 'personal']) {
  assert.deepEqual(notificationTapDestination({ kind, date: day }, 'open-1'), { pathname: '/(tabs)/calendar', params: { notificationDate: day, notificationOpenDetail: '0', notificationOpenId: 'open-1' } });
}
assert.match(layout, /Stack\.Screen name="daily\/\[date\]"/);
console.log('PASS daily page: date boundaries, work/rest/empty, timed/untimed personal/shared, memo, gap, tomorrow and notification routing');
