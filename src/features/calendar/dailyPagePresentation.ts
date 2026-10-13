import type { PersonalEvent } from '../events/personalEventStorage';
import { DEFAULT_PERSONAL_EVENT_COLOR } from '../events/personalEventPresentation';
import type { DateMemo } from '../memos/dateMemoStorage';
import type { ShiftType } from '../shift-settings/mockData';
import type { SharedEventCalendarItem } from '../together/sharedEventCalendarPresentation';
import { addCalendarDays } from './twoWeekCalendar';

export type DailyItem = {
  id: string;
  title: string;
  detail?: string;
  time: string | null;
  kind: 'work' | 'personal' | 'shared';
  color: string;
  target?: { kind: 'memo' | 'event' | 'shared'; id: string; spaceId?: string };
};

export function parseDailyDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day, 12);
  return parsed.getFullYear() === year && parsed.getMonth() + 1 === month && parsed.getDate() === day ? value : null;
}

export function adjacentDailyDate(date: string, offset: -1 | 1) {
  return addCalendarDays(date, offset);
}

export function buildDailyItems(input: {
  date: string;
  shift: ShiftType;
  previousShift?: ShiftType;
  memos: DateMemo[];
  personalEvents: PersonalEvent[];
  sharedEvents: SharedEventCalendarItem[];
  sharedColor: string;
}): { untimed: DailyItem[]; timed: DailyItem[]; memos: DateMemo[]; personalCount: number; sharedCount: number } {
  const untimed: DailyItem[] = [];
  const timed: DailyItem[] = [];
  const memos = input.memos.filter(memo => !memo.timeEnabled);
  const add = (item: DailyItem) => (item.time ? timed : untimed).push(item);
  const seenShared = new Set<string>();

  for (const memo of input.memos) {
    if (!memo.timeEnabled) continue;
    add({ id: `memo:${memo.id}`, title: memo.text, time: memo.allDay ? null : memo.startTime,
      kind: 'personal', color: memo.color, target: { kind: 'memo', id: memo.id } });
  }
  for (const event of input.personalEvents) {
    if (event.date !== input.date) continue;
    const shared = event.kind === 'shared' || event.source === 'together';
    if (shared) seenShared.add(event.id);
    add({ id: `${shared ? 'shared' : 'event'}:${event.id}`, title: event.title, detail: event.memo || undefined,
      time: event.allDay ? null : event.startTime, kind: shared ? 'shared' : 'personal',
      color: shared ? input.sharedColor : event.color ?? DEFAULT_PERSONAL_EVENT_COLOR,
      target: { kind: shared ? 'shared' : 'event', id: event.id } });
  }
  for (const event of input.sharedEvents) {
    if (event.localDate !== input.date || seenShared.has(event.id)) continue;
    seenShared.add(event.id);
    add({ id: event.displayKey, title: event.title, detail: event.placeName ?? undefined,
      time: event.startTime || null, kind: 'shared', color: input.sharedColor,
      target: { kind: 'shared', id: event.id, spaceId: event.spaceId } });
  }

  if (input.previousShift?.kind === 'work' && input.previousShift.startTime && input.previousShift.endTime
    && input.previousShift.endTime < input.previousShift.startTime) {
    timed.push({ id: 'previous-work-end', title: '퇴근', detail: `${input.previousShift.name} 근무 종료`,
      time: input.previousShift.endTime, kind: 'work', color: input.previousShift.color });
  }
  if (input.shift.kind === 'work' && input.shift.startTime && input.shift.endTime) {
    timed.push({ id: 'work-start', title: '출근', detail: `${input.shift.name} 근무 시작`,
      time: input.shift.startTime, kind: 'work', color: input.shift.color });
    if (input.shift.endTime >= input.shift.startTime) {
      timed.push({ id: 'work-end', title: '퇴근', detail: `${input.shift.name} 근무 종료`,
        time: input.shift.endTime, kind: 'work', color: input.shift.color });
    }
  }
  timed.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || a.id.localeCompare(b.id));
  return {
    untimed, timed, memos,
    personalCount: [...untimed, ...timed].filter(item => item.kind === 'personal').length,
    sharedCount: [...untimed, ...timed].filter(item => item.kind === 'shared').length,
  };
}

export function dailyWorkStatus(date: string, shift: ShiftType, now: Date): string {
  if (shift.kind === 'rest') return '오늘은 휴무예요.';
  if (!shift.startTime || !shift.endTime) return '근무시간이 설정되지 않았어요.';
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (date !== today) return `${shift.startTime} ~ ${shift.endTime}`;
  const [year, month, day] = date.split('-').map(Number);
  const [startHour, startMinute] = shift.startTime.split(':').map(Number);
  const [endHour, endMinute] = shift.endTime.split(':').map(Number);
  const start = new Date(year, month - 1, day, startHour, startMinute).getTime();
  const end = new Date(year, month - 1, day + (shift.endTime < shift.startTime ? 1 : 0), endHour, endMinute).getTime();
  const remaining = now.getTime() < start ? start - now.getTime() : end - now.getTime();
  if (remaining <= 0) return '오늘 근무를 마쳤어요.';
  const minutes = Math.ceil(remaining / 60_000);
  const duration = `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
  return now.getTime() < start ? `근무까지 ${duration}` : `퇴근까지 ${duration}`;
}
