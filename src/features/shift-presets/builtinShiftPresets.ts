import type { PresetShiftType, ShiftPreset } from './shiftPreset';
import { DAY_NIGHT_OFF_REST_TEAM_ROTATION_TEMPLATE } from '../shifts/teamRotation';

const day: PresetShiftType = { key: 'day', abbreviation: '주', name: '주간근무', startTime: '09:00', endTime: '18:00', kind: 'work', color: '#FFF640', textColor: '#5C4100' };
const evening: PresetShiftType = { key: 'evening', abbreviation: '석', name: '오후근무', startTime: '14:00', endTime: '22:00', kind: 'work', color: '#F6C58D', textColor: '#7A3900' };
const night: PresetShiftType = { key: 'night', abbreviation: '야', name: '야간근무', startTime: '19:00', endTime: '09:00', kind: 'work', color: '#BFD9EF', textColor: '#214D74' };
const offDuty: PresetShiftType = { key: 'off-duty', abbreviation: '비', name: '비번', kind: 'rest', color: '#DFE3E5', textColor: '#3E4A50' };
const rest: PresetShiftType = { key: 'rest', abbreviation: '휴', name: '휴무', kind: 'rest', color: '#D6E3D1', textColor: '#3E5C43' };

function builtin(id: string, name: string, shiftTypes: PresetShiftType[], pattern: string[]): ShiftPreset { return { id, version: 1, name, source: 'builtin', shiftTypes, pattern }; }

export const builtinShiftPresets: ShiftPreset[] = [
  builtin('builtin-fixed-day', '주간 고정', [day, rest], ['day', 'day', 'day', 'day', 'day', 'rest', 'rest']),
  builtin('builtin-two-shift-example', '2교대 예시', [day, night, rest], ['day', 'day', 'night', 'night', 'rest', 'rest']),
  builtin('builtin-three-shift-example', '3교대 예시', [day, evening, night, rest], ['day', 'evening', 'night', 'rest']),
  { ...builtin('builtin-day-night-off-rest-example', '주·야·비·휴 예시', [day, night, offDuty, rest], ['day', 'night', 'off-duty', 'rest']), teamRotationTemplate: DAY_NIGHT_OFF_REST_TEAM_ROTATION_TEMPLATE },
];
