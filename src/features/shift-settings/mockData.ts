import { brandColors, calendarShiftColors } from '../../constants';

export type ShiftKind = 'work' | 'rest';

export type ShiftType = {
  id: string;
  abbreviation: string;
  name: string;
  startTime?: string;
  endTime?: string;
  kind: ShiftKind;
  color: string;
  textColor: string;
};

export const mockShiftTypes: ShiftType[] = [
  { id: 'shift-day', abbreviation: '주', name: '주간근무', startTime: '09:00', endTime: '18:00', kind: 'work', color: calendarShiftColors.day.background, textColor: calendarShiftColors.day.text },
  { id: 'shift-night', abbreviation: '야', name: '야간근무', startTime: '19:00', endTime: '09:00', kind: 'work', color: calendarShiftColors.night.background, textColor: calendarShiftColors.night.text },
  { id: 'shift-off-duty', abbreviation: '비', name: '비번', kind: 'rest', color: calendarShiftColors.offDuty.background, textColor: calendarShiftColors.offDuty.text },
  { id: 'shift-rest', abbreviation: '휴', name: '휴무', kind: 'rest', color: calendarShiftColors.rest.background, textColor: calendarShiftColors.rest.text },
];

export type ShiftColorOption = {
  name: string;
  color: string;
  textColor: string;
};

export const colorPalette: ShiftColorOption[] = [
  { name: 'Amber', color: '#F3E2B8', textColor: '#6B4A00' },
  { name: 'Orange', color: '#F6C58D', textColor: '#7A3900' },
  { name: 'Coral', color: '#F28C72', textColor: '#5B2115' },
  { name: 'Red', color: '#E69A9A', textColor: '#651F1F' },
  { name: 'Pink', color: '#F1C6D5', textColor: '#702742' },
  { name: 'Purple', color: '#D6C4E8', textColor: '#493761' },
  { name: 'Lavender', color: '#ECEAF4', textColor: '#5E5A75' },
  { name: 'Blue', color: '#BFD9EF', textColor: '#214D74' },
  { name: 'Deep Navy', color: brandColors.deepNavy, textColor: brandColors.white },
  { name: 'Teal', color: '#B9DDD5', textColor: '#1C5B54' },
  { name: 'Sage', color: '#D6E3D1', textColor: '#3E5C43' },
  { name: 'Gray', color: '#DFE3E5', textColor: '#3E4A50' },
] as const;

export const defaultPattern = ['주', '주', '야', '야', '비', '휴', '휴'];

export function getShiftType(abbreviation: string) {
  return mockShiftTypes.find((shiftType) => shiftType.abbreviation === abbreviation) ?? mockShiftTypes[0];
}

export function formatShiftTime(shiftType: ShiftType) {
  if (shiftType.kind === 'rest') {
    return '근무 없음';
  }

  const endsNextDay = shiftType.startTime && shiftType.endTime && shiftType.endTime < shiftType.startTime;
  return endsNextDay ? `${shiftType.startTime} ~ 다음날 ${shiftType.endTime}` : `${shiftType.startTime} ~ ${shiftType.endTime}`;
}
