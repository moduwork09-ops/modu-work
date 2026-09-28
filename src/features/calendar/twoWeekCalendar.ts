import type { PersonalEvent } from '../events/personalEventStorage';
import { DEFAULT_PERSONAL_EVENT_COLOR } from '../events/personalEventPresentation';
import type { DateMemo } from '../memos/dateMemoStorage';
import type { SharedEventCalendarItem } from '../together/sharedEventCalendarPresentation';

function localDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addCalendarDays(iso: string, count: number) {
  const date = localDate(iso);
  date.setDate(date.getDate() + count);
  return isoDate(date);
}

export function createTwoWeekDates(selectedDate: string, weekStartsOn: 0 | 1) {
  const selected = localDate(selectedDate);
  const weekday = selected.getDay();
  selected.setDate(selected.getDate() - ((weekday - weekStartsOn + 7) % 7));
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(selected);
    date.setDate(selected.getDate() + index);
    return { date: isoDate(date), day: date.getDate(), weekday: date.getDay() };
  });
}

export type TwoWeekAgendaItem = {
  id: string;
  title: string;
  time: string | null;
  kind: 'personal' | 'shared' | 'memo';
  color: string;
};

export function createTwoWeekAgendaItems(input: {
  memos: DateMemo[];
  personalEvents: PersonalEvent[];
  sharedEvents: SharedEventCalendarItem[];
  showPersonalEvents: boolean;
  showSharedEvents: boolean;
  showEventTime: boolean;
  sharedColor: string;
}): TwoWeekAgendaItem[] {
  const candidates: (TwoWeekAgendaItem & { priority: number; order: number; sortTime: string })[] = [];
  const seenShared = new Set<string>();
  let order = 0;
  if (input.showPersonalEvents) {
    for (const memo of input.memos) {
      const timed = memo.timeEnabled && !memo.allDay && !!memo.startTime;
      candidates.push({ id: `memo-${memo.id}`, title: memo.text, time: timed && input.showEventTime ? memo.startTime : null,
        kind: timed || memo.allDay ? 'personal' : 'memo', color: memo.color, priority: timed ? 0 : memo.allDay ? 1 : 2,
        order: order++, sortTime: timed ? memo.startTime ?? '' : '' });
    }
  }
  for (const event of input.personalEvents) {
    const shared = event.kind === 'shared' || event.source === 'together';
    if (shared ? !input.showSharedEvents : !input.showPersonalEvents) continue;
    if (shared) seenShared.add(event.id);
    const timed = !event.allDay && !!event.startTime;
    candidates.push({ id: `${shared ? 'shared' : 'event'}-${event.id}`, title: event.title,
      time: timed && input.showEventTime ? event.startTime : null, kind: shared ? 'shared' : 'personal',
      color: shared ? input.sharedColor : event.color ?? DEFAULT_PERSONAL_EVENT_COLOR,
      priority: timed ? 0 : 1, order: order++, sortTime: timed ? event.startTime ?? '' : '' });
  }
  if (input.showSharedEvents) for (const event of input.sharedEvents) {
    if (seenShared.has(event.id)) continue;
    seenShared.add(event.id);
    candidates.push({ id: event.displayKey, title: event.title, time: input.showEventTime ? event.startTime : null,
      kind: 'shared', color: input.sharedColor, priority: event.startTime ? 0 : 1,
      order: order++, sortTime: event.startTime });
  }
  return candidates.sort((left, right) => left.priority - right.priority || left.sortTime.localeCompare(right.sortTime) || left.order - right.order)
    .map(({ priority: _priority, order: _order, sortTime: _sortTime, ...item }) => item);
}
