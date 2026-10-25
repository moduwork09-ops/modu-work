const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { calculateMonthSummary, calculateWeeklyBriefing, calculateLifeBriefing, moveBriefingMonth, getBestRecoveryGap } = require('./lifeBriefing.ts');
const shifts = [
  { id: 'day', name: '주간', abbreviation: '주', kind: 'work', startTime: '09:00', endTime: '18:00', color: '#fde', textColor: '#111' },
  { id: 'night', name: '야간', abbreviation: '야', kind: 'work', startTime: '19:00', endTime: '09:00', color: '#123', textColor: '#fff' },
  { id: 'duty', name: '당직', abbreviation: '당', kind: 'work', startTime: '09:00', endTime: '09:00', color: '#abc', textColor: '#111' },
  { id: 'off', name: '비번', abbreviation: '비', kind: 'rest', color: '#ded', textColor: '#111' },
  { id: 'rest', name: '휴무', abbreviation: '휴', kind: 'rest', color: '#ede', textColor: '#111' },
];
const entry = { id: 'oct', effectiveFrom: '2026-10-01', anchorDate: '2026-10-01', anchorPatternIndex: 0, createdAt: '2026-10-01T00:00:00Z', pattern: ['day', 'night', 'off', 'rest'] };
const schedule = { shiftTypes: shifts, shiftPattern: entry.pattern, anchorDate: entry.anchorDate, anchorPatternIndex: 0, patternHistory: [entry], shiftDateOverrides: {} };

test('monthly counts, night shifts, streaks and type mix use the existing resolver', () => {
  const summary = calculateMonthSummary('2026-10', schedule);
  assert.equal(summary.workDays, 16);
  assert.equal(summary.restDays, 15);
  assert.equal(summary.nightShifts, 8);
  assert.equal(summary.longestRest.days, 2);
  assert.equal(summary.longestWork.days, 2);
  assert.equal(summary.weekly.reduce((n, week) => n + week.work + week.rest + week.unknown, 0), 31);
  assert.deepEqual(summary.shiftTypes.map(item => [item.name, item.count]), [['야간', 8], ['주간', 8]]);
  assert.deepEqual(summary, calculateMonthSummary('2026-10', schedule));
});

test('override wins, no-schedule boundary remains unknown, previous month and next month are isolated', () => {
  const overridden = { ...schedule, shiftDateOverrides: { '2026-10-02': { shiftTypeId: 'rest' } } };
  const oct = calculateMonthSummary('2026-10', overridden);
  assert.equal(oct.workDays, 15);
  assert.equal(oct.restDays, 16);
  assert.equal(oct.nightShifts, 7);
  const september = calculateMonthSummary('2026-09', schedule);
  assert.equal(september.unknownDays, 30);
  assert.equal(september.workDays, 0);
  assert.equal(moveBriefingMonth('2026-12', 1), '2027-01');
  const all = calculateLifeBriefing('2026-12', '2026-12-31', schedule);
  assert.equal(all.next.month, '2027-01');
  assert.equal(all.next.workDays + all.next.restDays + all.next.unknownDays, 31);
});

test('overnight and 24-hour shifts count once while rest favors the day after night work', () => {
  const nightEntry = { ...entry, effectiveFrom: '2026-10-19', anchorDate: '2026-10-19', pattern: ['night', 'rest', 'rest', 'rest', 'day'] };
  const nightSchedule = { ...schedule, shiftPattern: nightEntry.pattern, anchorDate: nightEntry.anchorDate, patternHistory: [nightEntry] };
  const week = calculateWeeklyBriefing('2026-10-21', nightSchedule);
  assert.equal(week.start, '2026-10-19');
  assert.equal(require('../shifts/shiftSchedule.ts').getShiftForDate(require('./lifeBriefing.ts').addBriefingDays(week.rest.date, -1), nightSchedule).id, 'night');
  const dutySchedule = { ...schedule, shiftPattern: ['duty', 'off'], patternHistory: [{ ...entry, pattern: ['duty', 'off'] }] };
  assert.equal(calculateMonthSummary('2026-10', dutySchedule).nightShifts, 16);
  assert.equal(calculateMonthSummary('2026-10', dutySchedule).weekly.reduce((n, week) => n + week.duty, 0), 16);
  assert.equal(calculateMonthSummary('2026-10', nightSchedule).weekly.reduce((n, week) => n + week.night, 0), calculateMonthSummary('2026-10', nightSchedule).nightShifts);
});

test('multiple user shift types and history month boundary use their own effective segment', () => {
  const later = { ...entry, id: 'nov', effectiveFrom: '2026-11-01', anchorDate: '2026-11-01', pattern: ['duty', 'off'] };
  const mixed = { ...schedule, shiftPattern: later.pattern, anchorDate: later.anchorDate, patternHistory: [entry, later] };
  assert.equal(calculateMonthSummary('2026-10', mixed).shiftTypes.length, 2);
  assert.equal(calculateMonthSummary('2026-11', mixed).shiftTypes[0].name, '당직');
  assert.equal(calculateMonthSummary('2026-11', mixed).nightShifts, 15);
});

function scheduleStarting(pattern) {
  const startEntry = { ...entry, effectiveFrom: '2026-10-19', anchorDate: '2026-10-19', pattern };
  return { ...schedule, shiftPattern: pattern, anchorDate: startEntry.anchorDate, patternHistory: [startEntry] };
}

test('recovery gap measures actual work end to next work start', () => {
  const plan = scheduleStarting(['day', 'rest', 'rest', 'day']);
  assert.deepEqual(getBestRecoveryGap('2026-10', plan), { date: '2026-10-20', hours: 63 });
  assert.equal(getBestRecoveryGap('2026-09', plan), null);
});

test('the first day off after three workdays remains a rest recommendation', () => {
  const plan = scheduleStarting(['day', 'day', 'day', 'rest', 'day']);
  const week = calculateWeeklyBriefing('2026-10-22', plan);
  assert.equal(week.rest.date, '2026-10-22');
});

test('an all-night schedule has no rest recommendation', () => {
  const plan = scheduleStarting(['night']);
  const week = calculateWeeklyBriefing('2026-10-19', plan);
  assert.equal(week.rest, null);
});

test('weekend and holiday work are counted separately without treating unknown as rest', () => {
  const allWork = scheduleStarting(['day']);
  const summary = calculateMonthSummary('2026-10', allWork);
  assert.equal(summary.weekendWorkDays, 3);
  const fullMonth = { ...schedule, shiftPattern: ['day'], patternHistory: [{ ...entry, pattern: ['day'] }] };
  assert.equal(calculateMonthSummary('2026-10', fullMonth).weekendWorkDays, 9);
  assert.ok(calculateMonthSummary('2026-10', fullMonth).holidayWorkDays > 0);
  assert.equal(calculateMonthSummary('2026-09', allWork).unknownDays, 30);
  assert.equal(moveBriefingMonth('2026-12', 1), '2027-01');
  assert.equal(calculateMonthSummary('2028-01', fullMonth).holidayWorkDays, null);
});
