const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
};

const { createMonthlyShiftSchedule, getPatternIndexForDate, getShiftForDate, getPatternShiftForDate } = require('./shiftSchedule.ts');
const { getTeamStatusesForDate } = require('./teamScheduleCalculator.ts');
const { createDayOffProjectionItem, createDayOffProjectionRange } = require('../together/dayOffProjection.ts');
const { createMonthlyWidgetSnapshot } = require('../widget/monthlyWidgetSnapshot.ts');
const { calculateMonthlySalary } = require('../salary/salaryCalculator.ts');

const shiftTypes = [
  { id: 'old', name: '과거', abbreviation: '과', kind: 'work', startTime: '08:00', endTime: '17:00', color: '#eee', textColor: '#111' },
  { id: 'day', name: '주간', abbreviation: '주', kind: 'work', startTime: '09:00', endTime: '18:00', color: '#ffd', textColor: '#111' },
  { id: 'night', name: '야간', abbreviation: '야', kind: 'work', startTime: '19:00', endTime: '09:00', color: '#ddf', textColor: '#111' },
  { id: 'off', name: '비번', abbreviation: '비', kind: 'rest', color: '#eee', textColor: '#111' },
  { id: 'rest', name: '휴무', abbreviation: '휴', kind: 'rest', color: '#efe', textColor: '#111' },
  { id: 'duty', name: '당직', abbreviation: '당', kind: 'work', startTime: '09:00', endTime: '09:00', color: '#fed', textColor: '#111' },
];
const teamRotation = { version: 1, source: 'preset', myTeamId: 'team-1', teams: Array.from({ length: 6 }, (_, index) => ({ id: `team-${index + 1}`, label: `${index + 1}팀`, patternIndexOffset: index })) };
const old = { id: 'old-entry', effectiveFrom: '2026-09-01', pattern: ['old'], anchorDate: '2026-09-01', anchorPatternIndex: 0, createdAt: '2026-09-01T00:00:00Z' };
const first = { id: 'first', effectiveFrom: '2026-10-01', pattern: ['day', 'night', 'off', 'rest'], anchorDate: '2026-10-01', anchorPatternIndex: 0,
  conditionalRules: [{ when: 'weekend', baseShiftTypeId: 'day', resolvedShiftTypeId: 'rest' }], createdAt: '2026-09-30T00:00:00Z' };
const second = { id: 'six-team', effectiveFrom: '2026-10-08', pattern: ['day', 'day', 'day', 'day', 'duty', 'rest'], anchorDate: '2026-10-08', anchorPatternIndex: 0,
  teamRotation, createdAt: '2026-10-01T00:00:00Z' };
const withHistory = (patternHistory, shiftDateOverrides = {}) => ({ shiftTypes, shiftPattern: patternHistory.at(-1).pattern,
  anchorDate: patternHistory.at(-1).anchorDate, anchorPatternIndex: 0, patternHistory, shiftDateOverrides, teamRotation: patternHistory.at(-1).teamRotation });
const fresh = withHistory([first, second]);

test('fresh first effective date is a real boundary, not a latest-pattern backfill', () => {
  assert.equal(getPatternIndexForDate('2026-09-30', fresh), null);
  assert.equal(getPatternShiftForDate('2026-09-30', fresh).id, 'system-no-active-schedule');
  assert.equal(getShiftForDate('2026-09-30', fresh).id, 'system-no-active-schedule');
  assert.deepEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']
    .map((date) => getShiftForDate(date, fresh).id), ['day', 'night', 'off', 'rest', 'day', 'night', 'off']);
  assert.deepEqual(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']
    .map((date) => getShiftForDate(date, fresh).id), ['day', 'day', 'day', 'day', 'duty', 'rest']);
});

test('earlier real history survives later patterns and conditional rules', () => {
  const historical = withHistory([old, first, second]);
  assert.equal(getShiftForDate('2026-08-31', historical).id, 'system-no-active-schedule');
  assert.equal(getShiftForDate('2026-09-01', historical).id, 'old');
  assert.equal(getShiftForDate('2026-09-30', historical).id, 'old');
  assert.equal(getShiftForDate('2026-10-01', historical).id, 'day');
  assert.equal(getShiftForDate('2026-10-08', historical).id, 'day');
  assert.equal(getShiftForDate('2026-09-30', withHistory([first])).id, getShiftForDate('2026-09-30', fresh).id);
  assert.equal(first.conditionalRules[0].when, 'weekend');
});

test('conditional rest replacement does not erase the initial boundary or later six-team segment', () => {
  const weekendDay = { ...first, anchorPatternIndex: 1 };
  const withRestRule = withHistory([weekendDay, second]);
  assert.equal(getShiftForDate('2026-09-30', withRestRule).id, 'system-no-active-schedule');
  assert.equal(getShiftForDate('2026-10-04', withRestRule).id, 'rest');
  assert.equal(getShiftForDate('2026-10-04', withHistory([{ ...weekendDay, conditionalRules: undefined }, second])).id, 'day');
  assert.equal(getShiftForDate('2026-10-08', withRestRule).id, 'day');
});

test('legacy top-level schedule still calculates backwards when history is empty', () => {
  const legacy = { ...fresh, patternHistory: [] };
  assert.equal(typeof getPatternIndexForDate('2026-09-30', legacy), 'number');
  assert.notEqual(getShiftForDate('2026-09-30', legacy).id, 'system-no-active-schedule');
  assert.equal(getShiftForDate('2026-10-08', legacy).id, 'day');
});

test('explicit date override remains higher priority before the first schedule', () => {
  const overridden = withHistory([first, second], { '2026-09-30': { date: '2026-09-30', shiftTypeId: 'night' } });
  assert.equal(getShiftForDate('2026-09-30', overridden).id, 'night');
  assert.equal(getPatternShiftForDate('2026-09-30', overridden).id, 'system-no-active-schedule');
});

test('projection, team view, widget snapshot, and salary safely consume no-schedule days', () => {
  const preStart = createDayOffProjectionItem('2026-09-30', fresh);
  assert.equal(preStart.isDayOff, false);
  assert.equal(preStart.shiftName, '근무 없음');
  assert.equal(preStart.startTime, null);
  assert.equal(getTeamStatusesForDate('2026-09-30', fresh).status, 'unavailable');
  assert.equal(getTeamStatusesForDate('2026-10-08', fresh).status, 'available');
  assert.equal(createDayOffProjectionRange(fresh, new Date(2026, 9, 15)).rangeStart, '2026-10-01');
  assert.equal(createMonthlyShiftSchedule(2026, 9, fresh)[29].shift.id, 'system-no-active-schedule');
  const widget = createMonthlyWidgetSnapshot({ ...fresh, dateMemos: {}, personalEvents: [] }, new Date(2026, 9, 15));
  assert.equal(widget.months[11].cells.find((cell) => cell.date === '2026-09-30')?.shift.name, '근무 없음');
  const salary = calculateMonthlySalary('2026-09', fresh, { version: 1, isConfigured: true, baseSalary: 0,
    shiftAllowanceByShiftTypeId: {}, additionalAllowances: [], salaryVisible: false });
  assert.deepEqual(salary.shiftGroups, []);
  assert.deepEqual(salary.shiftCounts, {});
});
