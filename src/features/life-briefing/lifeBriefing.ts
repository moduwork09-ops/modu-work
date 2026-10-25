import type { ShiftType } from '../shift-settings/mockData';
import { createMonthlyShiftSchedule, getShiftForDate, NO_ACTIVE_SCHEDULE_SHIFT_TYPE, type ShiftScheduleInput } from '../shifts/shiftSchedule';
import { UNSUPPORTED_HOLIDAY_SHIFT_TYPE } from '../shifts/conditionalShiftRule';
import { getKoreanHolidayResolution, isKoreanHoliday } from '../calendar/koreanHolidays';

export type BriefingDay = { date: string; shift: ShiftType; state: 'work' | 'rest' | 'unknown'; overnight: boolean };
export type DayRun = { start: string; end: string; days: number } | null;
export type MonthSummary = {
  month: string; workDays: number; restDays: number; nightShifts: number; unknownDays: number;
  longestRest: DayRun; longestWork: DayRun;
  weekendWorkDays: number; holidayWorkDays: number | null;
  weekly: { start: string; end: string; work: number; night: number; duty: number; rest: number; unknown: number; recovery: number }[];
  shiftTypes: { id: string; name: string; color: string; count: number }[];
};
export type WeeklyBriefing = {
  start: string; end: string; days: BriefingDay[];
  rest: { date: string; label: string } | null;
};

const DAY = 86_400_000;
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
const utc = (date: string) => { const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const addBriefingDays = (date: string, count: number) => iso(utc(date) + count * DAY);
export function moveBriefingMonth(month: string, count: number) {
  const [y, m] = month.split('-').map(Number);
  return iso(Date.UTC(y, m - 1 + count, 1)).slice(0, 7);
}
const isUnknown = (shift: ShiftType) => shift.id === NO_ACTIVE_SCHEDULE_SHIFT_TYPE.id || shift.id === UNSUPPORTED_HOLIDAY_SHIFT_TYPE.id;
function minutes(time?: string): number | null {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  const hours = Number(time.slice(0, 2));
  const minute = Number(time.slice(3));
  return hours <= 24 && minute < 60 && (hours < 24 || minute === 0) ? hours * 60 + minute : null;
}
export function isNightShift(shift: ShiftType) {
  if (shift.kind !== 'work' || isUnknown(shift)) return false;
  const start = minutes(shift.startTime);
  const end = minutes(shift.endTime);
  return (start !== null && end !== null && end <= start) || (start !== null && start >= 18 * 60)
    || /야간|심야|당직|24시간/.test(shift.name);
}
export function isDutyShift(shift: ShiftType) {
  const start = minutes(shift.startTime);
  const end = minutes(shift.endTime);
  return shift.kind === 'work' && !isUnknown(shift)
    && (/당직|24시간/.test(shift.name) || (start !== null && end !== null && start === end));
}
export function getBriefingDay(date: string, schedule: ShiftScheduleInput): BriefingDay {
  const shift = getShiftForDate(date, schedule);
  return { date, shift, state: isUnknown(shift) ? 'unknown' : shift.kind, overnight: isNightShift(shift) };
}
function longestRun(days: BriefingDay[], state: 'work' | 'rest'): DayRun {
  let best: DayRun = null;
  let start = '';
  let length = 0;
  days.forEach((day, index) => {
    if (day.state === state) {
      if (!length) start = day.date;
      length += 1;
    }
    if (day.state !== state || index === days.length - 1) {
      if (length && (!best || length > best.days)) best = { start, end: days[index - (day.state === state ? 0 : 1)].date, days: length };
      if (day.state !== state) length = 0;
    }
  });
  return best;
}
export function nextWorkGapHours(date: string, schedule: ShiftScheduleInput) {
  const current = getBriefingDay(date, schedule);
  const end = current.state === 'work' ? minutes(current.shift.endTime) : null;
  const start = current.state === 'work' ? minutes(current.shift.startTime) : null;
  if (current.state === 'work' && (start === null || end === null)) return null;
  const fromMinute = current.state === 'work' ? end! + (end! <= start! ? 1440 : 0) : 1440;
  // No measured next shift means no inferred free-time duration.
  for (let offset = 1; offset <= 14; offset++) {
    const next = getBriefingDay(addBriefingDays(date, offset), schedule);
    if (next.state === 'unknown') return null;
    if (next.state !== 'work') continue;
    const nextStart = minutes(next.shift.startTime);
    return nextStart === null ? null : Math.max(0, (offset * 1440 + nextStart - fromMinute) / 60);
  }
  return null;
}
function isRecoveryDay(date: string, schedule: ShiftScheduleInput) {
  const current = getBriefingDay(date, schedule);
  if (current.state !== 'rest') return false;
  const previous = getBriefingDay(addBriefingDays(date, -1), schedule);
  const previousLong = [1, 2, 3].every(offset => getBriefingDay(addBriefingDays(date, -offset), schedule).state === 'work');
  return previous.overnight || previousLong || (nextWorkGapHours(date, schedule) ?? 0) >= 24;
}
export function getBestRecoveryGap(month: string, schedule: ShiftScheduleInput) {
  const [year, monthNumber] = month.split('-').map(Number);
  const days = createMonthlyShiftSchedule(year, monthNumber, schedule).map(({ date }) => getBriefingDay(date, schedule));
  let best: { date: string; hours: number } | null = null;
  for (const day of days) {
    if (day.state !== 'rest') continue;
    let previous: BriefingDay | null = null;
    let next: BriefingDay | null = null;
    for (let offset = 1; offset <= 45; offset++) {
      const candidate = getBriefingDay(addBriefingDays(day.date, -offset), schedule);
      if (candidate.state === 'unknown') break;
      if (candidate.state === 'work') { previous = candidate; break; }
    }
    for (let offset = 1; offset <= 45; offset++) {
      const candidate = getBriefingDay(addBriefingDays(day.date, offset), schedule);
      if (candidate.state === 'unknown') break;
      if (candidate.state === 'work') { next = candidate; break; }
    }
    if (!previous || !next) continue;
    const previousStart = minutes(previous.shift.startTime);
    const previousEnd = minutes(previous.shift.endTime);
    const nextStart = minutes(next.shift.startTime);
    if (previousStart === null || previousEnd === null || nextStart === null) continue;
    const previousEndAt = utc(previous.date) + (previousEnd + (previousEnd <= previousStart ? 1440 : 0)) * 60_000;
    const nextStartAt = utc(next.date) + nextStart * 60_000;
    const hours = Math.floor((nextStartAt - previousEndAt) / 3_600_000);
    if (hours > 0 && (!best || hours > best.hours || (hours === best.hours && day.date < best.date))) best = { date: day.date, hours };
  }
  return best;
}
export function calculateMonthSummary(month: string, schedule: ShiftScheduleInput): MonthSummary {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid briefing month');
  const [year, monthNumber] = month.split('-').map(Number);
  const days = createMonthlyShiftSchedule(year, monthNumber, schedule).map(({ date }) => getBriefingDay(date, schedule));
  const groups = new Map<string, MonthSummary['shiftTypes'][number]>();
  const weekly: MonthSummary['weekly'] = [];
  let current: MonthSummary['weekly'][number] | null = null;
  for (const day of days) {
    const weekday = new Date(utc(day.date)).getUTCDay();
    if (!current || weekday === 1) { current = { start: day.date, end: day.date, work: 0, night: 0, duty: 0, rest: 0, unknown: 0, recovery: 0 }; weekly.push(current); }
    current.end = day.date;
    current[day.state] += 1;
    if (isRecoveryDay(day.date, schedule)) current.recovery += 1;
    if (day.state === 'work') {
      if (isDutyShift(day.shift)) current.duty += 1;
      else if (day.overnight) current.night += 1;
      const group = groups.get(day.shift.id) ?? { id: day.shift.id, name: day.shift.name, color: day.shift.color, count: 0 };
      group.count += 1; groups.set(group.id, group);
    }
  }
  return {
    month, workDays: days.filter(day => day.state === 'work').length,
    restDays: days.filter(day => day.state === 'rest').length,
    nightShifts: days.filter(day => day.overnight).length,
    unknownDays: days.filter(day => day.state === 'unknown').length,
    weekendWorkDays: days.filter(day => day.state === 'work' && [0, 6].includes(new Date(utc(day.date)).getUTCDay())).length,
    holidayWorkDays: days.some(day => getKoreanHolidayResolution(day.date).status === 'unsupported') ? null
      : days.filter(day => day.state === 'work' && isKoreanHoliday(day.date)).length,
    longestRest: longestRun(days, 'rest'), longestWork: longestRun(days, 'work'), weekly,
    shiftTypes: [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id)),
  };
}
export function calculateWeeklyBriefing(today: string, schedule: ShiftScheduleInput): WeeklyBriefing {
  const weekday = new Date(utc(today)).getUTCDay();
  const start = addBriefingDays(today, -((weekday + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => getBriefingDay(addBriefingDays(start, index), schedule));
  const scored = days.map(day => {
    const previous = getBriefingDay(addBriefingDays(day.date, -1), schedule);
    const gap = nextWorkGapHours(day.date, schedule) ?? 0;
    let workStreak = 0;
    for (let offset = 1; offset <= 3; offset++) { if (getBriefingDay(addBriefingDays(day.date, -offset), schedule).state !== 'work') break; workStreak += 1; }
    return { day, rest: day.state === 'rest' ? 100 + (previous.overnight ? 50 : 0) + workStreak * 6 + Math.min(gap, 48) : -1 };
  });
  const restDate = scored.filter(item => item.rest >= 100).sort((a, b) => b.rest - a.rest || a.day.date.localeCompare(b.day.date))[0]?.day.date ?? null;
  return { start, end: days[6].date, days,
    rest: restDate ? { date: restDate, label: '휴식 여유가 있는 날' } : null };
}
export function calculateLifeBriefing(month: string, today: string, schedule: ShiftScheduleInput) {
  return { month: calculateMonthSummary(month, schedule), previous: calculateMonthSummary(moveBriefingMonth(month, -1), schedule),
    next: calculateMonthSummary(moveBriefingMonth(month, 1), schedule), week: calculateWeeklyBriefing(today, schedule) };
}
