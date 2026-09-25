import { getKoreanHolidayResolution } from '../calendar/koreanHolidays';
import type { ShiftType } from '../shift-settings/mockData';

/** An explicit unresolved result; it is never persisted as a user ShiftType. */
export const UNSUPPORTED_HOLIDAY_SHIFT_TYPE: ShiftType = {
  id: 'system-unsupported-korean-holiday', abbreviation: '확인', name: '공휴일 정보 확인 필요',
  note: '이 연도의 공휴일 자료가 없어 조건부 근무를 계산할 수 없습니다.',
  kind: 'work', color: '#DFE3E5', textColor: '#3E4A50',
};

export type ConditionalShiftRule = {
  when: 'weekend' | 'koreanHoliday' | 'weekendOrHoliday';
  baseShiftTypeId: string;
  resolvedShiftTypeId: string;
};

export function isValidConditionalShiftRules(value: unknown, shiftTypeIds: readonly string[]): value is ConditionalShiftRule[] {
  if (!Array.isArray(value)) return false;
  return value.every((rule) => rule && typeof rule === 'object'
    && ['weekend', 'koreanHoliday', 'weekendOrHoliday'].includes(rule.when)
    && typeof rule.baseShiftTypeId === 'string' && shiftTypeIds.includes(rule.baseShiftTypeId)
    && typeof rule.resolvedShiftTypeId === 'string' && shiftTypeIds.includes(rule.resolvedShiftTypeId));
}

export function resolveConditionalShiftTypeId(date: string, baseShiftTypeId: string, rules?: readonly ConditionalShiftRule[]) {
  if (!rules?.length) return baseShiftTypeId;
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekend = weekday === 0 || weekday === 6;
  for (const rule of rules) {
    if (rule.baseShiftTypeId !== baseShiftTypeId) continue;
    if (rule.when === 'weekend') {
      if (weekend) return rule.resolvedShiftTypeId;
      continue;
    }
    if (rule.when === 'weekendOrHoliday' && weekend) return rule.resolvedShiftTypeId;
    const holiday = getKoreanHolidayResolution(date);
    if (holiday.status === 'unsupported') return null;
    if (holiday.holiday) return rule.resolvedShiftTypeId;
  }
  return baseShiftTypeId;
}
