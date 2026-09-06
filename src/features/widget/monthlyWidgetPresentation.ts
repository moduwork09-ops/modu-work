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

export function limitMonthlyWidgetInfoRows(rows: MonthlyWidgetInfoRow[], totalCount = rows.length) {
  const visible = rows.slice(0, 2).map(row => ({ ...row }));
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

export function createMonthlyWidgetInfoRows(events: PersonalEvent[], memos: DateMemo[]): MonthlyWidgetInfoRow[] {
  const timedEvents = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => !event.allDay && Boolean(event.startTime))
    .sort((left, right) => (left.event.startTime ?? '').localeCompare(right.event.startTime ?? '') || left.index - right.index)
    .map(({ event }) => event);
  const untimedEvents = events.filter(event => event.allDay || !event.startTime);
  const eventRows = [...timedEvents, ...untimedEvents]
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

  return limitMonthlyWidgetInfoRows([...eventRows, ...memoRows]);
}
