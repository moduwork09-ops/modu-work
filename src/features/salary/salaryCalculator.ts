import { getSalaryShiftIdentity } from './salaryShiftIdentity';
import type { ShiftType } from '../shift-settings/mockData';
import type { ShiftScheduleInput } from '../shifts/shiftSchedule';
import { createMonthlyShiftSchedule } from '../shifts/shiftSchedule';
import { parseSalarySettings, type SalarySettings } from './salaryTypes';

export type SalaryShiftDetail = { date: string; shiftTypeId: string; name: string; color: string; timeLabel: string; amount: number };
export type SalaryShiftGroup = { shift: ShiftType; count: number; total: number; unitAmount: number | null };
export type SalaryCalculation = { month: string; baseSalary: number; shiftCounts: Record<string, number>; shiftGroups: SalaryShiftGroup[]; shiftAllowanceTotal: number; additionalAllowanceTotal: number; total: number; shiftDetails: SalaryShiftDetail[]; applicableAdditionalAllowances: SalarySettings['additionalAllowances'] };
export function isCalendarMonth(value: string) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
export function formatWon(value: number) { return Number.isSafeInteger(value) ? `${value.toLocaleString('ko-KR')}원` : '금액 확인 필요'; }
export function calculateMonthlySalary(month: string, schedule: ShiftScheduleInput, settings: SalarySettings): SalaryCalculation {
  if (!isCalendarMonth(month)) throw new Error('Invalid salary month');
  if (!parseSalarySettings(JSON.stringify(settings))) throw new Error('Invalid salary settings');
  const add = (left: number, right: number) => { const sum = left + right; if (!Number.isSafeInteger(sum)) throw new Error('Salary amount exceeds safe range'); return sum; };
  const [year, monthNumber] = month.split('-').map(Number);
  const shiftCounts: Record<string, number> = {};
  const groups = new Map<string, SalaryShiftGroup>();
  const shiftDetails: SalaryShiftDetail[] = [];
  let shiftAllowanceTotal = 0;
  for (const day of schedule.shiftTypes.length ? createMonthlyShiftSchedule(year, monthNumber, schedule) : []) {
    const { identity, amount } = getSalaryShiftIdentity(day.shift.id, schedule, settings);
    shiftCounts[identity.id] = (shiftCounts[identity.id] ?? 0) + 1;
    const group = groups.get(identity.id) ?? { shift: identity, count: 0, total: 0, unitAmount: amount };
    group.count += 1;
    group.total = add(group.total, amount);
    if (group.unitAmount !== amount) group.unitAmount = null;
    groups.set(identity.id, group);
    if (amount > 0) {
      shiftAllowanceTotal = add(shiftAllowanceTotal, amount);
      const overnight = Boolean(day.shift.startTime && day.shift.endTime && day.shift.endTime < day.shift.startTime);
      shiftDetails.push({ date: day.date, shiftTypeId: day.shift.id, name: day.shift.name, color: day.shift.color, timeLabel: day.shift.kind === 'rest' ? '근무 없음' : `${day.shift.startTime ?? '-'} ~ ${overnight ? '익일 ' : ''}${day.shift.endTime ?? '-'}`, amount });
    }
  }
  const applicableAdditionalAllowances = settings.additionalAllowances.filter((item) => item.applyMode === 'monthly' || item.applicableMonth === month);
  const additionalAllowanceTotal = applicableAdditionalAllowances.reduce((sum, item) => add(sum, item.amount), 0);
  return { month, baseSalary: settings.baseSalary, shiftCounts, shiftGroups: [...groups.values()], shiftAllowanceTotal, additionalAllowanceTotal, total: add(add(settings.baseSalary, shiftAllowanceTotal), additionalAllowanceTotal), shiftDetails, applicableAdditionalAllowances };
}

export function tryCalculateMonthlySalary(month: string, schedule: ShiftScheduleInput, settings: SalarySettings) {
  try { return calculateMonthlySalary(month, schedule, settings); } catch { return null; }
}
