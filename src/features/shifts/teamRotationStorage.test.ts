import assert from 'node:assert/strict';
import { parsePersistedShiftSettings } from './shiftSettingsStorage';
import { createTeamRotationMetadata, DAY_NIGHT_OFF_REST_TEAM_ROTATION_TEMPLATE } from './teamRotation';

const shiftTypes = [
  { id: 'D', abbreviation: '주', name: '주간', kind: 'work', startTime: '09:00', endTime: '18:00', color: '#ffd', textColor: '#111' },
  { id: 'N', abbreviation: '야', name: '야간', kind: 'work', startTime: '19:00', endTime: '09:00', color: '#ddf', textColor: '#111' },
  { id: 'B', abbreviation: '비', name: '비번', kind: 'rest', color: '#eee', textColor: '#111' },
  { id: 'R', abbreviation: '휴', name: '휴무', kind: 'rest', color: '#efe', textColor: '#111' },
];
const pattern = ['D', 'N', 'B', 'R'];
const base = { version: 2, isSetupComplete: true, shiftTypes, shiftPattern: pattern, anchorDate: '2026-09-01', anchorPatternIndex: 0, patternHistory: [{ id: 'p', effectiveFrom: '2026-09-01', pattern, anchorDate: '2026-09-01', anchorPatternIndex: 0, createdAt: '2026-09-01T00:00:00Z' }] };

assert(parsePersistedShiftSettings(JSON.stringify(base)), 'existing v2 settings without team metadata must remain valid');
const teamRotation = createTeamRotationMetadata(DAY_NIGHT_OFF_REST_TEAM_ROTATION_TEMPLATE, 'team-2', 'user_configured')!;
const parsed = parsePersistedShiftSettings(JSON.stringify({ ...base, teamRotation, patternHistory: [{ ...base.patternHistory[0], teamRotation }] }));
assert.equal(parsed?.teamRotation?.myTeamId, 'team-2');
assert.equal(parsed?.patternHistory[0]?.teamRotation?.teams.length, 4);
assert.equal(parsePersistedShiftSettings(JSON.stringify({ ...base, patternHistory: [{ ...base.patternHistory[0], teamRotation: { ...teamRotation, myTeamId: 'missing' } }] })), null);

console.log('team rotation storage fixtures passed');
