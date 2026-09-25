import type { PresetShiftType, ShiftPreset } from './shiftPreset';
import { DAY_NIGHT_OFF_REST_TEAM_ROTATION_TEMPLATE } from '../shifts/teamRotation';

const day: PresetShiftType = { key: 'day', abbreviation: '주', name: '주간근무', startTime: '09:00', endTime: '18:00', kind: 'work', color: '#FFF640', textColor: '#5C4100' };
const evening: PresetShiftType = { key: 'evening', abbreviation: '석', name: '오후근무', startTime: '14:00', endTime: '22:00', kind: 'work', color: '#F6C58D', textColor: '#7A3900' };
const night: PresetShiftType = { key: 'night', abbreviation: '야', name: '야간근무', startTime: '19:00', endTime: '09:00', kind: 'work', color: '#BFD9EF', textColor: '#214D74' };
const offDuty: PresetShiftType = { key: 'off-duty', abbreviation: '비', name: '비번', kind: 'rest', color: '#DFE3E5', textColor: '#3E4A50' };
const rest: PresetShiftType = { key: 'rest', abbreviation: '휴', name: '휴무', kind: 'rest', color: '#D6E3D1', textColor: '#3E5C43' };
const dutyDay: PresetShiftType = { ...day, key: 'duty-day', abbreviation: '일', name: '일근무' };
const duty: PresetShiftType = { key: 'duty', abbreviation: '당', name: '당직', note: '예시 시간입니다. 적용 전에 실제 당직 시간을 확인하세요.', startTime: '09:00', endTime: '09:00', kind: 'work', color: '#F6C58D', textColor: '#7A3900' };
export const BUILTIN_PRESET_CATEGORIES = ['전체', '주간형', '주·야', '주·석·야', '당직형', '기타'] as const;
export type BuiltinPresetCategory = Exclude<(typeof BUILTIN_PRESET_CATEGORIES)[number], '전체'>;

function builtin(id: string, name: string, description: string, shiftTypes: PresetShiftType[], pattern: string[], category: BuiltinPresetCategory): ShiftPreset { return { id, version: 1, name, description, category, source: 'builtin', shiftTypes, pattern }; }

export function selectBuiltinShiftPresets(category: (typeof BUILTIN_PRESET_CATEGORIES)[number]) {
  return category === '전체' ? builtinShiftPresets : builtinShiftPresets.filter((preset) => preset.category === category);
}

const sixTeamDutyTemplate = {
  version: 1 as const,
  teams: Array.from({ length: 6 }, (_, index) => ({ id: `team-${index + 1}`, label: `${index + 1}팀`, patternIndexOffset: (6 - index) % 6 })),
};

export const builtinShiftPresets: ShiftPreset[] = [
  builtin('builtin-fixed-day', '주×5 → 휴×2', '주간근무 5일 뒤 휴무 2일', [day, rest], ['day', 'day', 'day', 'day', 'day', 'rest', 'rest'], '주간형'),
  builtin('builtin-two-shift-example', '주×2 → 야×2 → 휴×2', '주간 2일, 야간 2일, 휴무 2일', [day, night, rest], ['day', 'day', 'night', 'night', 'rest', 'rest'], '주·야'),
  builtin('builtin-three-shift-example', '주 → 석 → 야 → 휴', '주간, 오후, 야간, 휴무 순환', [day, evening, night, rest], ['day', 'evening', 'night', 'rest'], '주·석·야'),
  { ...builtin('builtin-day-night-off-rest-example', '주 → 야 → 비 → 휴', '주야비휴 순환 · 4팀 선택 가능', [day, night, offDuty, rest], ['day', 'night', 'off-duty', 'rest'], '주·야'), teamRotationTemplate: DAY_NIGHT_OFF_REST_TEAM_ROTATION_TEMPLATE },
  builtin('builtin-day-night-rest-off', '주 → 야 → 휴 → 비', '주야휴비 순환', [day, night, rest, offDuty], ['day', 'night', 'rest', 'off-duty'], '주·야'),
  builtin('builtin-two-day-two-night-two-off', '주×2 → 야×2 → 비×2', '주간 2일, 야간 2일, 비번 2일', [day, night, offDuty], ['day', 'day', 'night', 'night', 'off-duty', 'off-duty'], '주·야'),
  builtin('builtin-two-day-two-night-off-rest', '주×2 → 야×2 → 비 → 휴', '주간 2일, 야간 2일, 비번, 휴무', [day, night, offDuty, rest], ['day', 'day', 'night', 'night', 'off-duty', 'rest'], '주·야'),
  builtin('builtin-two-day-off-two-night-off', '주×2 → 비 → 야×2 → 비', '주간 2일, 비번, 야간 2일, 비번', [day, night, offDuty], ['day', 'day', 'off-duty', 'night', 'night', 'off-duty'], '주·야'),
  builtin('builtin-two-day-two-night-two-off-two-rest', '주×2 → 야×2 → 비×2 → 휴×2', '8일 순환', [day, night, offDuty, rest], ['day', 'day', 'night', 'night', 'off-duty', 'off-duty', 'rest', 'rest'], '주·야'),
  builtin('builtin-two-day-two-night-off-two-rest', '주×2 → 야×2 → 비 → 휴×2', '7일 순환', [day, night, offDuty, rest], ['day', 'day', 'night', 'night', 'off-duty', 'rest', 'rest'], '주·야'),
  builtin('builtin-three-day-three-night-three-rest', '주×3 → 야×3 → 휴×3', '9일 순환', [day, night, rest], ['day', 'day', 'day', 'night', 'night', 'night', 'rest', 'rest', 'rest'], '주·야'),
  builtin('builtin-four-day-two-rest', '주×4 → 휴×2', '주간 4일 뒤 휴무 2일', [day, rest], ['day', 'day', 'day', 'day', 'rest', 'rest'], '주간형'),
  builtin('builtin-four-night-two-rest', '야×4 → 휴×2', '야간 4일 뒤 휴무 2일', [night, rest], ['night', 'night', 'night', 'night', 'rest', 'rest'], '주간형'),
  builtin('builtin-two-day-two-evening-two-night-two-rest', '주×2 → 석×2 → 야×2 → 휴×2', '8일 순환', [day, evening, night, rest], ['day', 'day', 'evening', 'evening', 'night', 'night', 'rest', 'rest'], '주·석·야'),
  builtin('builtin-two-day-two-evening-two-night-two-off', '주×2 → 석×2 → 야×2 → 비×2', '8일 순환', [day, evening, night, offDuty], ['day', 'day', 'evening', 'evening', 'night', 'night', 'off-duty', 'off-duty'], '주·석·야'),
  {
    ...builtin('builtin-six-team-duty', '6팀 일×4 → 당직 → 휴', '1~6팀 위상 선택 · 일근무만 주말·공휴일에 휴무로 표시', [dutyDay, duty, rest], ['duty-day', 'duty-day', 'duty-day', 'duty-day', 'duty', 'rest'], '당직형'),
    initialPatternIndex: 0,
    teamRotationTemplate: sixTeamDutyTemplate,
    teamPhaseFromOffset: true,
    conditionalRules: [{ when: 'weekendOrHoliday', baseShiftKey: 'duty-day', resolvedShiftKey: 'rest' }],
  },
];
