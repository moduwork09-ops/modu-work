const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
};

const { buildCurrentRestRuleHistory, readCurrentRestRules } = require('./currentRestRules.ts');
const { getShiftForDate } = require('./shiftSchedule.ts');

const shiftTypes = [
  { id: 'day', name: '일', abbreviation: '일', kind: 'work', color: '#fff', textColor: '#000' },
  { id: 'night', name: '야', abbreviation: '야', kind: 'work', color: '#fff', textColor: '#000' },
  { id: 'duty', name: '당', abbreviation: '당', kind: 'work', color: '#fff', textColor: '#000' },
  { id: 'rest', name: '휴', abbreviation: '휴', kind: 'rest', color: '#fff', textColor: '#000' },
];
const base = { id: 'old', effectiveFrom: '2026-01-01', pattern: ['day', 'night', 'duty', 'day', 'day', 'rest'], anchorDate: '2026-09-20', anchorPatternIndex: 0, createdAt: '2026-01-01T00:00:00Z' };
const settings = { weekendEnabled: true, holidayEnabled: true, targetShiftTypeIds: ['day'], restShiftTypeId: 'rest' };
const schedule = (history, overrides = {}) => ({ shiftTypes, shiftPattern: history.at(-1).pattern, anchorDate: base.anchorDate, anchorPatternIndex: 0, patternHistory: history, shiftDateOverrides: overrides });

test('new rest rules preserve prior dates, cycle phase, and override priority', () => {
  const old = [base];
  const history = buildCurrentRestRuleHistory({ effectiveFrom: '2026-09-24', patternHistory: old, shiftTypes, fallback: base, settings, createdAt: 'now' });
  assert.equal(old.length, 1);
  assert.equal(history.length, 2);
  assert.equal(getShiftForDate('2026-09-23', schedule(history)).id, getShiftForDate('2026-09-23', schedule(old)).id);
  assert.equal(getShiftForDate('2026-09-24', schedule(history)).id, 'rest');
  assert.equal(getShiftForDate('2026-09-26', schedule(history)).id, 'rest');
  assert.equal(getShiftForDate('2026-09-26', schedule(history, { '2026-09-26': { date: '2026-09-26', shiftTypeId: 'night' } })).id, 'night');
  assert.equal(history[1].anchorDate, base.anchorDate);
  assert.equal(history[1].anchorPatternIndex, base.anchorPatternIndex);
  assert.deepEqual(readCurrentRestRules(history[1].conditionalRules, shiftTypes, history[1].pattern), settings);
});

test('weekend/holiday switches, targets, and future schedule preservation', () => {
  const later = { ...base, id: 'later', effectiveFrom: '2026-10-01' };
  const history = buildCurrentRestRuleHistory({ effectiveFrom: '2026-09-24', patternHistory: [base, later], shiftTypes, fallback: base, settings: { ...settings, holidayEnabled: false }, createdAt: 'now' });
  assert.equal(history.length, 3);
  assert.equal(history[1].effectiveFrom, '2026-09-24');
  assert.equal(history[1].conditionalRules[0].when, 'weekend');
  assert.deepEqual(history[2], later);
  const noRules = buildCurrentRestRuleHistory({ effectiveFrom: '2026-09-24', patternHistory: history, shiftTypes, fallback: base, settings: { ...settings, weekendEnabled: false, holidayEnabled: false }, createdAt: 'later' });
  assert.equal(noRules.length, 3);
  assert.equal(noRules[1].conditionalRules, undefined);
  assert.deepEqual(noRules[2], later);
  assert.throws(() => buildCurrentRestRuleHistory({ effectiveFrom: '2026-09-24', patternHistory: history, shiftTypes, fallback: base, settings: { ...settings, targetShiftTypeIds: [] }, createdAt: 'now' }));
  assert.throws(() => buildCurrentRestRuleHistory({ effectiveFrom: '2028-01-01', patternHistory: history, shiftTypes, fallback: base, settings, createdAt: 'now' }));
});

const sixDutyRotation = {
  version: 1, source: 'preset', myTeamId: 'team-1',
  teams: Array.from({ length: 6 }, (_, index) => ({ id: `team-${index + 1}`, label: `${index + 1}팀`, patternIndexOffset: index })),
};
const sixDuty = { id: 'six-duty', effectiveFrom: '2026-09-01', pattern: ['day', 'day', 'day', 'day', 'duty', 'rest'],
  anchorDate: '2026-09-01', anchorPatternIndex: 0, teamRotation: sixDutyRotation, teamPhaseFromOffset: true, createdAt: '2026-09-01T00:00:00Z' };
const futureFour = { id: 'four-shift', effectiveFrom: '2026-10-01', pattern: ['day', 'night', 'rest', 'rest'],
  anchorDate: '2026-10-01', anchorPatternIndex: 0, createdAt: '2026-09-25T00:00:00Z' };
const twoSegmentHistory = [sixDuty, futureFour];
const buildFixture = (effectiveFrom) => buildCurrentRestRuleHistory({ effectiveFrom, patternHistory: twoSegmentHistory,
  shiftTypes, fallback: sixDuty, settings, createdAt: '2026-09-29T00:00:00Z' });

test('rest rules on a future pattern boundary change only that entry rules', () => {
  const history = buildFixture('2026-10-01');
  assert.equal(history.length, 2);
  assert.deepEqual(history.map((entry) => entry.effectiveFrom), ['2026-09-01', '2026-10-01']);
  assert.deepEqual(history[0], sixDuty);
  assert.deepEqual({ ...history[1], conditionalRules: undefined }, { ...futureFour, conditionalRules: undefined });
  assert.equal(history[1].teamRotation, undefined, 'old six-duty team rotation must not leak into the new pattern');
  assert.equal(history[1].conditionalRules[0].resolvedShiftTypeId, 'rest');
  assert.deepEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((date) => getShiftForDate(date, schedule(history)).id), ['day', 'night', 'rest', 'rest']);
});

test('rule-only segment clones the applicable six-duty schedule without deleting the future pattern', () => {
  const history = buildFixture('2026-09-28');
  assert.deepEqual(history.map((entry) => entry.effectiveFrom), ['2026-09-01', '2026-09-28', '2026-10-01']);
  assert.deepEqual(history[0], sixDuty);
  assert.deepEqual(history[2], futureFour);
  assert.deepEqual(history[1].pattern, sixDuty.pattern);
  assert.equal(history[1].anchorDate, sixDuty.anchorDate);
  assert.equal(history[1].anchorPatternIndex, sixDuty.anchorPatternIndex);
  assert.deepEqual(history[1].teamRotation, sixDutyRotation);
  assert.equal(history[1].teamPhaseFromOffset, true);
  assert.equal(history[1].conditionalRules[0].when, 'weekendOrHoliday');
  assert.equal(getShiftForDate('2026-09-27', schedule(history)).id, getShiftForDate('2026-09-27', schedule(twoSegmentHistory)).id);
  assert.deepEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((date) => getShiftForDate(date, schedule(history)).id), ['day', 'night', 'rest', 'rest']);
  assert.equal(getShiftForDate('2026-10-03', schedule(history, { '2026-10-03': { date: '2026-10-03', shiftTypeId: 'duty' } })).id, 'duty', 'date override remains highest priority');
  assert.equal(history.at(-1).id, futureFour.id, 'the latest top-level mirror must remain the future pattern');
});

test('legacy top-level fallback keeps team metadata when history is initially empty', () => {
  const history = buildCurrentRestRuleHistory({ effectiveFrom: '2026-09-28', patternHistory: [], shiftTypes,
    fallback: { pattern: sixDuty.pattern, anchorDate: sixDuty.anchorDate, anchorPatternIndex: sixDuty.anchorPatternIndex, teamRotation: sixDutyRotation },
    settings, createdAt: '2026-09-29T00:00:00Z' });
  assert.equal(history.length, 1);
  assert.deepEqual(history[0].teamRotation, sixDutyRotation);
  assert.deepEqual(history[0].pattern, sixDuty.pattern);
});
