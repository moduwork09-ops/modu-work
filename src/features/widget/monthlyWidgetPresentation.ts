import { getReadableTextColor } from '../colors/readableColor';
import type { PersonalEvent } from '../events/personalEventStorage';
import { DEFAULT_PERSONAL_EVENT_COLOR } from '../events/personalEventPresentation';
import type { DateMemo } from '../memos/dateMemoStorage';
import { DEFAULT_MEMO_COLOR } from '../memos/memoPresentation';

export type MonthlyWidgetInfoRow = {
  kind: 'event' | 'memo';
  text: string;
  backgroundColor: string;
  textColor: string;
};

function appendHiddenCount(rows: MonthlyWidgetInfoRow[], totalCount: number) {
  const visible = rows.slice(0, 2);
  const hiddenCount = totalCount - visible.length;
  if (hiddenCount > 0 && visible[1]) visible[1] = { ...visible[1], text: `${visible[1].text} +${hiddenCount}` };
  return visible;
}

export function formatPersonalEventForMonthlyWidget(event: PersonalEvent) {
  if (event.allDay) return `종일 ${event.title}`;
  return event.startTime ? `${event.startTime} ${event.title}` : event.title;
}

export function formatDateMemoForMonthlyWidget(memo: DateMemo) {
  if (!memo.timeEnabled) return memo.text;
  if (memo.allDay) return `종일 ${memo.text}`;
  return memo.startTime ? `${memo.startTime} ${memo.text}` : memo.text;
}

export function createMonthlyWidgetInfoRows(events: PersonalEvent[], memos: DateMemo[]): MonthlyWidgetInfoRow[] {
  const eventRows = [...events]
    .sort((left, right) => (left.startTime ?? '').localeCompare(right.startTime ?? ''))
    .map((event): MonthlyWidgetInfoRow => {
      const backgroundColor = event.color ?? DEFAULT_PERSONAL_EVENT_COLOR;
      return {
        kind: 'event',
        text: formatPersonalEventForMonthlyWidget(event),
        backgroundColor,
        textColor: getReadableTextColor(backgroundColor),
      };
    });
  const memoRows = memos.map((memo): MonthlyWidgetInfoRow => {
    const backgroundColor = memo.color || DEFAULT_MEMO_COLOR;
    return { kind: 'memo', text: formatDateMemoForMonthlyWidget(memo), backgroundColor, textColor: getReadableTextColor(backgroundColor) };
  });

  const selected = eventRows.length > 0 && memoRows.length > 0
    ? [eventRows[0], memoRows[0]]
    : [...eventRows, ...memoRows].slice(0, 2);
  return appendHiddenCount(selected, eventRows.length + memoRows.length);
}
