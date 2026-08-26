import type { ShiftScheduleInput } from '../shifts/shiftSchedule';
import { createMonthlyShiftSchedule } from '../shifts/shiftSchedule';
import type { SalarySettings } from './salaryTypes';

export type SalaryShiftDetail = { date: string; shiftTypeId: string; name: string; color: string; timeLabel: string; amount: number };
export type SalaryCalculation = { month: string; baseSalary: number; shiftCounts: Record<string, number>; shiftAllowanceTotal: number; additionalAllowanceTotal: number; total: number; shiftDetails: SalaryShiftDetail[]; applicableAdditionalAllowances: SalarySettings['additionalAllowances'] };
export function isCalendarMonth(value: string) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
export function formatWon(value: number) { return `${Math.trunc(value).toLocaleString('ko-KR')}원`; }
export function calculateMonthlySalary(month: string, schedule: ShiftScheduleInput, settings: SalarySettings): SalaryCalculation {
  if (!isCalendarMonth(month)) throw new Error('Invalid salary month');
  const [year, monthNumber] = month.split('-').map(Number);
  const shiftCounts: Record<string, number> = {};
  const shiftDetails: SalaryShiftDetail[] = [];
  let shiftAllowanceTotal = 0;
  for (const day of createMonthlyShiftSchedule(year, monthNumber, schedule)) {
    shiftCounts[day.shift.id] = (shiftCounts[day.shift.id] ?? 0) + 1;
    const amount = settings.shiftAllowanceByShiftTypeId[day.shift.id]?.amount ?? 0;
    if (amount > 0) {
      shiftAllowanceTotal += amount;
      const overnight = Boolean(day.shift.startTime && day.shift.endTime && day.shift.endTime < day.shift.startTime);
      shiftDetails.push({ date: day.date, shiftTypeId: day.shift.id, name: day.shift.name, color: day.shift.color, timeLabel: day.shift.kind === 'rest' ? '근무 없음' : `${day.shift.startTime ?? '-'} ~ ${overnight ? '익일 ' : ''}${day.shift.endTime ?? '-'}`, amount });
    }
  }
  const applicableAdditionalAllowances = settings.additionalAllowances.filter((item) => item.applyMode === 'monthly' || item.applicableMonth === month);
  const additionalAllowanceTotal = applicableAdditionalAllowances.reduce((sum, item) => sum + item.amount, 0);
  return { month, baseSalary: settings.baseSalary, shiftCounts, shiftAllowanceTotal, additionalAllowanceTotal, total: settings.baseSalary + shiftAllowanceTotal + additionalAllowanceTotal, shiftDetails, applicableAdditionalAllowances };
}
