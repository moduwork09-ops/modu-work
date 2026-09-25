import assert from 'node:assert/strict';
import { builtinShiftPresets } from '../shift-presets/builtinShiftPresets';
import type { ShiftType } from '../shift-settings/mockData';
import { getShiftForDate } from './shiftSchedule';
import { getTeamStatusesForDate, orderTeamsForDisplay } from './teamScheduleCalculator';
import { createTeamRotationMetadata, DAY_NIGHT_OFF_REST_TEAM_ROTATION_TEMPLATE } from './teamRotation';

const shiftTypes: ShiftType[] = [
  { id: 'D', abbreviation: '주', name: '주간', kind: 'work', startTime: '09:00', endTime: '18:00', color: '#ffd', textColor: '#111' },
  { id: 'N', abbreviation: '야', name: '야간', kind: 'work', startTime: '19:00', endTime: '09:00', color: '#ddf', textColor: '#111' },
  { id: 'B', abbreviation: '비', name: '비번', kind: 'rest', color: '#eee', textColor: '#111' },
  { id: 'R', abbreviation: '휴', name: '휴무', kind: 'rest', color: '#efe', textColor: '#111' },
];
const pattern = ['D', 'N', 'B', 'R'];
const rotation = createTeamRotationMetadata(DAY_NIGHT_OFF_REST_TEAM_ROTATION_TEMPLATE, 'team-2', 'preset')!;
const schedule = { shiftTypes, shiftPattern: pattern, anchorDate: '2026-09-07', anchorPatternIndex: 0, patternHistory: [{ id: 'current', effectiveFrom: '2026-09-01', pattern, anchorDate: '2026-09-07', anchorPatternIndex: 0, createdAt: '2026-09-01T00:00:00Z', teamRotation: rotation }], shiftDateOverrides: {} };

const labels = (date: string, input = schedule) => {
  const result = getTeamStatusesForDate(date, input);
  assert.equal(result.status, 'available');
  return result.status === 'available' ? result.statuses.map((item) => item.shiftType.id) : [];
};
assert.deepEqual(orderTeamsForDisplay([...DAY_NIGHT_OFF_REST_TEAM_ROTATION_TEMPLATE.teams].reverse()).map((team) => team.id), ['team-1', 'team-2', 'team-3', 'team-4']);
const sixTeamTemplate = builtinShiftPresets.find((preset) => preset.id === 'builtin-six-team-duty')!.teamRotationTemplate!;
assert.deepEqual(orderTeamsForDisplay([...sixTeamTemplate.teams].reverse()).map((team) => team.id), ['team-1', 'team-2', 'team-3', 'team-4', 'team-5', 'team-6']);
assert.deepEqual(labels('2026-09-07'), ['B', 'D', 'R', 'N']);
assert.deepEqual(labels('2026-09-08'), ['R', 'N', 'D', 'B']);
for (const [myTeamId, anchorPatternIndex] of [
  ['team-1', 2],
  ['team-3', 3],
  ['team-4', 1],
] as const) {
  const nextRotation = createTeamRotationMetadata(DAY_NIGHT_OFF_REST_TEAM_ROTATION_TEMPLATE, myTeamId, 'preset')!;
  const next = {
    ...schedule,
    anchorPatternIndex,
    patternHistory: [{
      ...schedule.patternHistory[0],
      anchorPatternIndex,
      teamRotation: nextRotation,
    }],
  };
  assert.deepEqual(labels('2026-09-07', next), ['B', 'D', 'R', 'N']);
  const result = getTeamStatusesForDate('2026-09-07', next);
  assert(result.status === 'available' && result.statuses.find((item) => item.isMyTeam)?.teamId === myTeamId);
}
assert.equal(getTeamStatusesForDate('2026-09-07', { ...schedule, patternHistory: [] }).status, 'unavailable');
assert.equal(getTeamStatusesForDate('2026-09-07', { ...schedule, patternHistory: [{ ...schedule.patternHistory[0], teamRotation: { ...rotation, myTeamId: 'missing' } }] }).status, 'unavailable');
assert.deepEqual(labels('2026-09-07', { ...schedule, shiftDateOverrides: { '2026-09-07': { date: '2026-09-07', shiftTypeId: 'N', createdAt: '', updatedAt: '' } } }), ['B', 'D', 'R', 'N']);
const oldRotation = createTeamRotationMetadata(DAY_NIGHT_OFF_REST_TEAM_ROTATION_TEMPLATE, 'team-1', 'user_configured')!;
const historySchedule = { ...schedule, patternHistory: [{ ...schedule.patternHistory[0], effectiveFrom: '2026-08-01', teamRotation: oldRotation }, { ...schedule.patternHistory[0], id: 'new', effectiveFrom: '2026-09-01', teamRotation: rotation }] };
assert.equal(getTeamStatusesForDate('2026-08-31', historySchedule).status, 'available');
assert.equal((getTeamStatusesForDate('2026-08-31', historySchedule) as { status: 'available'; statuses: TeamShiftStatus[] }).statuses.find((item) => item.isMyTeam)?.teamId, 'team-1');
assert.equal((getTeamStatusesForDate('2026-09-01', historySchedule) as { status: 'available'; statuses: TeamShiftStatus[] }).statuses.find((item) => item.isMyTeam)?.teamId, 'team-2');
const before = getShiftForDate('2026-09-07', { ...schedule, patternHistory: [{ ...schedule.patternHistory[0], teamRotation: undefined }] });
assert.equal(getShiftForDate('2026-09-07', schedule).id, before.id);
assert.deepEqual(builtinShiftPresets.filter((preset) => preset.teamRotationTemplate).map((preset) => preset.id), ['builtin-day-night-off-rest-example', 'builtin-six-team-duty']);

type TeamShiftStatus = import('./teamScheduleCalculator').TeamShiftStatus;
console.log('team schedule fixtures passed');
