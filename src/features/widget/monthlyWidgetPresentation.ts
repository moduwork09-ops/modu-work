import type { PersonalEvent } from '../events/personalEventStorage';
import { DEFAULT_PERSONAL_EVENT_COLOR } from '../events/personalEventPresentation';
import type { DateMemo } from '../memos/dateMemoStorage';
import type { SharedEventCalendarItem } from '../together/sharedEventCalendarPresentation';

export type MonthlyWidgetInfoRow = { kind: 'personalEvent' | 'sharedEvent' | 'memo'; text: string; dotColor: string; highlightColor: string };

export function limitMonthlyWidgetInfoRows(rows: MonthlyWidgetInfoRow[], totalCount = rows.length) {
  const visible = rows.slice(0, 2).map((row) => ({ ...row }));
  const hiddenCount = totalCount - visible.length;
  if (hiddenCount > 0 && visible[1]) visible[1] = { ...visible[1], text: `${visible[1].text} +${hiddenCount}` };
  return visible;
}

export function formatPersonalEventForMonthlyWidget(event: PersonalEvent) {
  return !event.allDay && event.startTime ? `${event.startTime} ${event.title}` : event.title;
}

export function formatDateMemoForMonthlyWidget(memo: DateMemo) {
  return memo.timeEnabled && !memo.allDay && memo.startTime ? `${memo.startTime} ${memo.text}` : memo.text;
}

type EventCandidate = { key: string; index: number; kind: 'personalEvent' | 'sharedEvent'; text: string; startTime: string | null; timed: boolean; dotColor: string };

export function createMonthlyWidgetInfoRows(events: PersonalEvent[], memos: DateMemo[], sharedEvents: SharedEventCalendarItem[] = []): MonthlyWidgetInfoRow[] {
  const personal: EventCandidate[] = events.map((event, index) => {
    const shared = event.kind === 'shared' || event.source === 'together';
    return { key: `${shared ? 'shared' : 'personal'}:${event.id}`, index, kind: shared ? 'sharedEvent' : 'personalEvent', text: formatPersonalEventForMonthlyWidget(event), startTime: event.startTime, timed: !event.allDay && Boolean(event.startTime), dotColor: shared ? '#F28C72' : event.color ?? DEFAULT_PERSONAL_EVENT_COLOR };
  });
  const server: EventCandidate[] = sharedEvents.map((event, index) => ({ key: `shared:${event.id}`, index: events.length + index, kind: 'sharedEvent', text: event.startTime ? `${event.startTime} ${event.title}` : event.title, startTime: event.startTime || null, timed: Boolean(event.startTime), dotColor: '#F28C72' }));
  const seen = new Set<string>();
  const candidates = [...personal, ...server].filter((candidate) => seen.has(candidate.key) ? false : (seen.add(candidate.key), true));
  const timed = candidates.filter((event) => event.timed).sort((left, right) => (left.startTime ?? '').localeCompare(right.startTime ?? '') || left.index - right.index);
  const eventRows = [...timed, ...candidates.filter((event) => !event.timed)].map((event): MonthlyWidgetInfoRow => ({ kind: event.kind, text: event.text, dotColor: event.dotColor, highlightColor: event.kind === 'sharedEvent' ? '#FCE9E4' : '#EEF3F8' }));
  const memoRows = memos.map((memo): MonthlyWidgetInfoRow => ({ kind: 'memo', text: formatDateMemoForMonthlyWidget(memo), dotColor: '#8F98A3', highlightColor: '#E8F1EC' }));
  return limitMonthlyWidgetInfoRows([...eventRows, ...memoRows]);
}
