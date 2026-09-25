import assert from 'node:assert/strict';
import { selectActiveShiftTypes, selectShiftTypesForDate } from '../shifts/activeShiftTypes';
import { resolveConditionalShiftTypeId, UNSUPPORTED_HOLIDAY_SHIFT_TYPE } from '../shifts/conditionalShiftRule';
import { getShiftForDate, getPatternIndexForDate } from '../shifts/shiftSchedule';
import { getTeamStatusesForDate } from '../shifts/teamScheduleCalculator';
import { BUILTIN_PRESET_CATEGORIES, builtinShiftPresets, selectBuiltinShiftPresets } from './builtinShiftPresets';
import { configurePresetRestRules, getPresetRestRuleSettings } from './presetRestRuleSettings';
import { createShiftPresetApplication, type ShiftPresetApplicationState } from './shiftPresetApplication';
import { assertValidShiftPreset } from './shiftPreset';
import { cloneShiftPreset, createShiftPresetPreview, parseShiftPresetDraft } from './shiftPresetDraft';

assert.equal(builtinShiftPresets.length, 16);
assert.equal(new Set(builtinShiftPresets.map((preset) => preset.pattern.join(','))).size, builtinShiftPresets.length);
builtinShiftPresets.forEach(assertValidShiftPreset);
assert.deepEqual(BUILTIN_PRESET_CATEGORIES, ['전체', '주간형', '주·야', '주·석·야', '당직형', '기타']);
assert.deepEqual(BUILTIN_PRESET_CATEGORIES.map((category) => selectBuiltinShiftPresets(category).length), [16, 3, 9, 3, 1, 0]);
assert.equal(new Set(selectBuiltinShiftPresets('전체').map((preset) => preset.id)).size, 16);
const expectedCategories: Record<string, string> = {
  'builtin-fixed-day': '주간형', 'builtin-four-day-two-rest': '주간형', 'builtin-four-night-two-rest': '주간형',
  'builtin-two-shift-example': '주·야', 'builtin-day-night-off-rest-example': '주·야', 'builtin-day-night-rest-off': '주·야',
  'builtin-two-day-two-night-two-off': '주·야', 'builtin-two-day-two-night-off-rest': '주·야', 'builtin-two-day-off-two-night-off': '주·야',
  'builtin-two-day-two-night-two-off-two-rest': '주·야', 'builtin-two-day-two-night-off-two-rest': '주·야', 'builtin-three-day-three-night-three-rest': '주·야',
  'builtin-three-shift-example': '주·석·야', 'builtin-two-day-two-evening-two-night-two-rest': '주·석·야', 'builtin-two-day-two-evening-two-night-two-off': '주·석·야',
  'builtin-six-team-duty': '당직형',
};
assert.equal(Object.keys(expectedCategories).length, 16);
for (const preset of builtinShiftPresets) assert.equal(preset.category, expectedCategories[preset.id], `${preset.id}: category`);
assert.equal(resolveConditionalShiftTypeId('2026-09-19', 'day', [{ when: 'weekend', baseShiftTypeId: 'day', resolvedShiftTypeId: 'rest' }]), 'rest');
assert.equal(resolveConditionalShiftTypeId('2026-09-21', 'day', [{ when: 'weekend', baseShiftTypeId: 'day', resolvedShiftTypeId: 'rest' }]), 'day');
assert.equal(resolveConditionalShiftTypeId('2026-09-24', 'day', [{ when: 'koreanHoliday', baseShiftTypeId: 'day', resolvedShiftTypeId: 'rest' }]), 'rest');
assert.equal(resolveConditionalShiftTypeId('2026-09-23', 'day', [{ when: 'koreanHoliday', baseShiftTypeId: 'day', resolvedShiftTypeId: 'rest' }]), 'day');
assert.equal(resolveConditionalShiftTypeId('2027-09-15', 'day', [{ when: 'koreanHoliday', baseShiftTypeId: 'day', resolvedShiftTypeId: 'rest' }]), 'rest');
assert.equal(resolveConditionalShiftTypeId('2028-01-03', 'day', [{ when: 'koreanHoliday', baseShiftTypeId: 'day', resolvedShiftTypeId: 'rest' }]), null);
const dutyPreset = builtinShiftPresets.find((preset) => preset.id === 'builtin-six-team-duty')!;
assert.deepEqual(dutyPreset.pattern, ['duty-day', 'duty-day', 'duty-day', 'duty-day', 'duty', 'rest']);
assert.equal(dutyPreset.initialPatternIndex, 0);
assert(!dutyPreset.shiftTypes.some((type) => type.name === '후당직'));
assert.deepEqual(dutyPreset.teamRotationTemplate?.teams.map((team) => team.patternIndexOffset), [0, 5, 4, 3, 2, 1]);
const defaultRules = getPresetRestRuleSettings(dutyPreset)!;
assert.deepEqual([defaultRules.weekendEnabled, defaultRules.holidayEnabled, defaultRules.targetShiftKeys], [true, true, ['duty-day']]);
const noRules = configurePresetRestRules(dutyPreset, { ...defaultRules, weekendEnabled: false, holidayEnabled: false });
const weekendOnly = configurePresetRestRules(dutyPreset, { ...defaultRules, holidayEnabled: false });
const holidayOnly = configurePresetRestRules(dutyPreset, { ...defaultRules, weekendEnabled: false });
const bothWorkTypes = configurePresetRestRules(builtinShiftPresets[1], { weekendEnabled: true, holidayEnabled: false, targetShiftKeys: ['day', 'night'], restShiftKey: 'rest' });
assert.deepEqual(bothWorkTypes.conditionalRules?.map((rule) => rule.baseShiftKey), ['day', 'night']);
assert.equal(noRules.conditionalRules, undefined);
assert.equal(weekendOnly.conditionalRules?.[0].when, 'weekend');
assert.equal(holidayOnly.conditionalRules?.[0].when, 'koreanHoliday');
assert.throws(() => configurePresetRestRules(dutyPreset, { ...defaultRules, targetShiftKeys: [] }));
const original = JSON.stringify(dutyPreset);
const edited = cloneShiftPreset(dutyPreset);
edited.shiftTypes[0].name = '개인 일근무';
edited.pattern[0] = 'duty';
assert.equal(JSON.stringify(dutyPreset), original);
assert.equal(parseShiftPresetDraft(JSON.stringify(edited), 'builtin', dutyPreset.id).pattern[0], 'duty');
assert.throws(() => parseShiftPresetDraft(JSON.stringify(edited), 'public', dutyPreset.id));
assert.throws(() => parseShiftPresetDraft(JSON.stringify(edited), 'builtin', 'another-preset'));
const sharedDraft = { ...edited, source: 'shared' as const, id: 'server-preset-id' };
assert.equal(parseShiftPresetDraft(JSON.stringify(sharedDraft), 'shared').id, 'server-preset-id');
assert.throws(() => parseShiftPresetDraft(JSON.stringify(sharedDraft), 'public'));
assert.throws(() => parseShiftPresetDraft(JSON.stringify(sharedDraft), 'shared', 'MW-7K3P9Q'));
assert.equal(createShiftPresetPreview(edited, '2026-09-20', 'team-1')[0].shiftName, '당직');

const current: ShiftPresetApplicationState = {
  version: 2, isSetupComplete: true,
  shiftTypes: [{ id: 'old', abbreviation: '기', name: '기존 근무', kind: 'work', startTime: '08:00', endTime: '17:00', color: '#fff', textColor: '#111' }],
  shiftPattern: ['old'], anchorDate: '2026-08-01', anchorPatternIndex: 0,
  patternHistory: [{ id: 'old-history', effectiveFrom: '2026-08-01', pattern: ['old'], anchorDate: '2026-08-01', anchorPatternIndex: 0, createdAt: '2026-08-01T00:00:00Z' }],
  shiftDateOverrides: {},
};
const apply = (teamId: string, startDate = '2026-09-20', preset = dutyPreset) => createShiftPresetApplication({ current, preset, effectiveFrom: startDate, myTeamId: teamId, createdAt: '2026-09-18T00:00:00Z', createShiftTypeId: (key) => `new-${key}` });
function teamNames(date: string, schedule: ShiftPresetApplicationState) {
  const result = getTeamStatusesForDate(date, schedule);
  if (result.status !== 'available') throw new Error(`${date}: team statuses unavailable`);
  return result.statuses.map((status) => status.shiftType.name);
}
const one = apply('team-1');
assert.equal(getShiftForDate('2026-09-19', one).id, 'old');
assert.equal(getShiftForDate('2026-09-20', one).name, '휴무'); // Sunday day step
assert.equal(getShiftForDate('2026-09-21', one).name, '일근무');
assert.equal(getShiftForDate('2026-09-22', one).name, '일근무');
assert.equal(getShiftForDate('2026-09-23', one).name, '일근무');
assert.equal(getShiftForDate('2026-09-24', one).name, '당직');
assert.equal(getShiftForDate('2026-09-25', one).name, '휴무');
assert.equal(getShiftForDate('2026-09-26', one).name, '휴무'); // Saturday day step
assert.equal(getPatternIndexForDate('2026-09-20', one), 0);
assert.equal(getPatternIndexForDate('2026-09-21', one), 1); // Conditional display did not pause cycle
const baseCycle = apply('team-1', '2026-09-20', noRules);
assert.deepEqual(Array.from({ length: 7 }, (_, index) => getShiftForDate(new Date(Date.UTC(2026, 8, 20 + index)).toISOString().slice(0, 10), baseCycle).name), ['일근무', '일근무', '일근무', '일근무', '당직', '휴무', '일근무']);
assert.deepEqual(teamNames('2026-09-24', baseCycle), ['당직', '일근무', '일근무', '일근무', '일근무', '휴무']);
assert.deepEqual(teamNames('2026-09-25', baseCycle), ['휴무', '당직', '일근무', '일근무', '일근무', '일근무']);
assert.deepEqual(teamNames('2026-09-26', baseCycle), ['일근무', '휴무', '당직', '일근무', '일근무', '일근무']);
assert.equal(teamNames('2026-09-29', baseCycle)[5], '당직');
assert.equal(teamNames('2026-09-30', baseCycle)[0], '당직'); // 6 → 1 wrap
assert.deepEqual(teamNames('2026-09-26', one), ['휴무', '휴무', '당직', '휴무', '휴무', '휴무']);
assert.deepEqual(teamNames('2026-09-25', one), ['휴무', '당직', '휴무', '휴무', '휴무', '휴무']);
assert.deepEqual(teamNames('2026-09-25', apply('team-1', '2026-09-20', weekendOnly)), teamNames('2026-09-25', baseCycle));
assert.deepEqual(teamNames('2026-10-10', apply('team-1', '2026-09-20', holidayOnly)), teamNames('2026-10-10', baseCycle));
assert.deepEqual(teamNames('2026-09-25', apply('team-1', '2026-09-20', holidayOnly)), teamNames('2026-09-25', one));
const holidayDuty = apply('team-1', '2026-09-21');
assert.equal(getShiftForDate('2026-09-25', holidayDuty).name, '당직');
assert.equal(getShiftForDate('2026-09-26', holidayDuty).name, '휴무');
const holiday2027 = apply('team-1', '2027-09-15');
const holiday2027Teams = getTeamStatusesForDate('2027-09-15', holiday2027);
assert.equal(holiday2027Teams.status, 'available');
if (holiday2027Teams.status === 'available') {
  assert.deepEqual(holiday2027Teams.statuses.map((status) => status.shiftType.name).sort(), ['당직', '휴무', '휴무', '휴무', '휴무', '휴무'].sort());
}
const unsupported2028 = apply('team-1', '2028-01-03');
assert.equal(getShiftForDate('2028-01-04', unsupported2028).id, UNSUPPORTED_HOLIDAY_SHIFT_TYPE.id);
assert.equal(getShiftForDate('2028-01-04', apply('team-1', '2028-01-03', weekendOnly)).name, '일근무');
assert.equal(getShiftForDate('2028-01-04', { ...unsupported2028, shiftDateOverrides: { '2028-01-04': { date: '2028-01-04', shiftTypeId: 'old', createdAt: '', updatedAt: '' } } }).id, 'old');
assert(createShiftPresetPreview(dutyPreset, '2027-12-28', 'team-1').some((day) => day.shiftTypeId === UNSUPPORTED_HOLIDAY_SHIFT_TYPE.id));

for (let offset = 0; offset < 6; offset++) {
  const teamId = `team-${offset + 1}`;
  const schedule = apply(teamId);
  assert.equal(schedule.patternHistory.at(-1)?.anchorPatternIndex, 0);
  const statuses = getTeamStatusesForDate('2026-09-20', schedule);
  assert.equal(statuses.status, 'available');
  if (statuses.status === 'available') {
    assert.equal(statuses.statuses.length, 6);
    assert.deepEqual(statuses.statuses.map((status) => status.teamId), ['team-1', 'team-2', 'team-3', 'team-4', 'team-5', 'team-6']);
    assert.equal(statuses.statuses.find((status) => status.teamId === teamId)?.shiftType.id, getShiftForDate('2026-09-20', schedule).id);
    assert.deepEqual(statuses.statuses.map((status) => status.patternIndex), Array.from({ length: 6 }, (_, index) => (offset - index + 6) % 6));
  }
  const preview = createShiftPresetPreview(dutyPreset, '2026-09-20', teamId);
  assert.equal(preview.length, 14);
  preview.forEach((day) => { const actual = getShiftForDate(day.date, schedule); assert.equal(day.shiftName, actual.name); assert.equal(day.color, actual.color); });
  const later = getTeamStatusesForDate('2026-10-03', schedule);
  assert.equal(later.status, 'available');
  if (later.status === 'available') assert.deepEqual(later.statuses.map((status) => status.patternIndex), Array.from({ length: 6 }, (_, index) => (offset + 1 - index + 6) % 6));
}
const two = apply('team-2');
assert.deepEqual(Array.from({ length: 6 }, (_, index) => getShiftForDate(new Date(Date.UTC(2026, 8, 20 + index)).toISOString().slice(0, 10), apply('team-2', '2026-09-20', noRules)).name), ['일근무', '일근무', '일근무', '일근무', '당직', '휴무']);
assert.deepEqual(teamNames('2026-09-24', two), ['휴무', '당직', '휴무', '휴무', '휴무', '휴무']);
for (let day = 24; day <= 30; day++) {
  const date = `2026-09-${day}`;
  const dutyTeam = teamNames(date, baseCycle).findIndex((name) => name === '당직');
  const nextDate = new Date(Date.UTC(2026, 8, day + 1)).toISOString().slice(0, 10);
  const nextDutyTeam = teamNames(nextDate, baseCycle).findIndex((name) => name === '당직');
  assert.equal(nextDutyTeam, (dutyTeam + 1) % 6, `${date}: duty must move toward the next team`);
}

const replacedHistory = createShiftPresetApplication({
  current: { ...current, patternHistory: [current.patternHistory[0],
    { id: 'same-day', effectiveFrom: '2026-09-19', pattern: ['old'], anchorDate: '2026-09-19', anchorPatternIndex: 0, createdAt: '' },
    { id: 'future', effectiveFrom: '2026-10-01', pattern: ['old'], anchorDate: '2026-10-01', anchorPatternIndex: 0, createdAt: '' }] },
  preset: dutyPreset, effectiveFrom: '2026-09-19', myTeamId: 'team-1', createdAt: '2026-09-18T00:00:00Z', createShiftTypeId: (key) => `replacement-${key}`,
});
assert.deepEqual(replacedHistory.patternHistory.map((entry) => entry.effectiveFrom), ['2026-08-01', '2026-09-19']);

const active = selectActiveShiftTypes(one);
assert(active.some((item) => item.name === '휴무'));
assert(!active.some((item) => item.id === 'old'));
assert(selectShiftTypesForDate('2026-09-18', one).some((item) => item.id === 'old'));
assert(selectShiftTypesForDate('2026-09-20', one).some((item) => item.name === '휴무'));
const override = { date: '2026-09-20', shiftTypeId: 'old', createdAt: '', updatedAt: '' };
assert.equal(getShiftForDate('2026-09-20', { ...one, shiftDateOverrides: { '2026-09-20': override } }).id, 'old');
assert.equal(JSON.stringify(dutyPreset), original);
console.log('conditional preset fixtures passed');
