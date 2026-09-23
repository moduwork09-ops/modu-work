import type { PersonalEvent } from '../events/personalEventStorage';
import { DEFAULT_PERSONAL_EVENT_COLOR } from '../events/personalEventPresentation';
import type { DateMemo } from '../memos/dateMemoStorage';
import type { SharedEventCalendarItem } from '../together/sharedEventCalendarPresentation';

export type MonthlyWidgetInfoRow = { kind: 'personalEvent' | 'sharedEvent' | 'memo'; text: string; dotColor: string; highlightColor: string };

export function limitMonthlyWidgetInfoRows(rows: MonthlyWidgetInfoRow[], totalCount = rows.length) {
  const visible = rows.slice(0, 4).map((row) => ({ ...row }));
  const hiddenCount = totalCount - visible.length;
  const lastIndex = visible.length - 1;
  if (hiddenCount > 0 && visible[lastIndex]) visible[lastIndex] = { ...visible[lastIndex], text: `${visible[lastIndex].text} +${hiddenCount}` };
  return visible;
}

export function formatPersonalEventForMonthlyWidget(event: PersonalEvent) {
  return event.title;
}

export function formatDateMemoForMonthlyWidget(memo: DateMemo) {
  return memo.text;
}

type EventCandidate = { key: string; index: number; kind: 'personalEvent' | 'sharedEvent'; text: string; startTime: string | null; timed: boolean; dotColor: string };

export function createMonthlyWidgetInfoRows(events: PersonalEvent[], memos: DateMemo[], sharedEvents: SharedEventCalendarItem[] = []): MonthlyWidgetInfoRow[] {
  const personal: EventCandidate[] = events.map((event, index) => {
    const shared = event.kind === 'shared' || event.source === 'together';
    return { key: `${shared ? 'shared' : 'personal'}:${event.id}`, index, kind: shared ? 'sharedEvent' : 'personalEvent', text: formatPersonalEventForMonthlyWidget(event), startTime: event.startTime, timed: !event.allDay && Boolean(event.startTime), dotColor: shared ? '#F28C72' : event.color ?? DEFAULT_PERSONAL_EVENT_COLOR };
  });
  const server: EventCandidate[] = sharedEvents.map((event, index) => ({ key: `shared:${event.id}`, index: events.length + index, kind: 'sharedEvent', text: event.title, startTime: event.startTime || null, timed: Boolean(event.startTime), dotColor: '#F28C72' }));
  const seen = new Set<string>();
  const candidates = [...personal, ...server].filter((candidate) => seen.has(candidate.key) ? false : (seen.add(candidate.key), true));
  const timed = candidates.filter((event) => event.timed).sort((left, right) => (left.startTime ?? '').localeCompare(right.startTime ?? '') || left.index - right.index);
  const eventRows = [...timed, ...candidates.filter((event) => !event.timed)].map((event): MonthlyWidgetInfoRow => ({ kind: event.kind, text: event.text, dotColor: event.dotColor, highlightColor: event.kind === 'sharedEvent' ? '#FCE9E4' : '#EEF3F8' }));
  const memoRows = memos.map((memo): MonthlyWidgetInfoRow => ({ kind: 'memo', text: formatDateMemoForMonthlyWidget(memo), dotColor: '#8F98A3', highlightColor: '#E8F1EC' }));
  return limitMonthlyWidgetInfoRows([...eventRows, ...memoRows]);
}

export function createMonthlyWidgetInfoPresentation(events: PersonalEvent[], memos: DateMemo[], sharedEvents: SharedEventCalendarItem[] = []) {
  const rows = createMonthlyWidgetInfoRows(events, memos, sharedEvents);
  const personalKeys = events.map((event) => `${event.kind === 'shared' || event.source === 'together' ? 'shared' : 'personal'}:${event.id}`);
  const uniqueKeys = new Set(personalKeys);
  for (const event of sharedEvents) uniqueKeys.add(`shared:${event.id}`);
  return { rows: rows.map((row) => ({ ...row, text: row.text.replace(/ \+\d+$/, '') })), totalCount: uniqueKeys.size + memos.length };
}
