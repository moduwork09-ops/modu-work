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

test('weekend/holiday switches, targets, and future truncation', () => {
  const later = { ...base, id: 'later', effectiveFrom: '2026-10-01' };
  const history = buildCurrentRestRuleHistory({ effectiveFrom: '2026-09-24', patternHistory: [base, later], shiftTypes, fallback: base, settings: { ...settings, holidayEnabled: false }, createdAt: 'now' });
  assert.equal(history.length, 2);
  assert.equal(history[1].effectiveFrom, '2026-09-24');
  assert.equal(history[1].conditionalRules[0].when, 'weekend');
  const noRules = buildCurrentRestRuleHistory({ effectiveFrom: '2026-09-24', patternHistory: history, shiftTypes, fallback: base, settings: { ...settings, weekendEnabled: false, holidayEnabled: false }, createdAt: 'later' });
  assert.equal(noRules.length, 2);
  assert.equal(noRules[1].conditionalRules, undefined);
  assert.throws(() => buildCurrentRestRuleHistory({ effectiveFrom: '2026-09-24', patternHistory: history, shiftTypes, fallback: base, settings: { ...settings, targetShiftTypeIds: [] }, createdAt: 'now' }));
  assert.throws(() => buildCurrentRestRuleHistory({ effectiveFrom: '2028-01-01', patternHistory: history, shiftTypes, fallback: base, settings, createdAt: 'now' }));
});
