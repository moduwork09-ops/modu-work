import type { PersonalEvent } from '../events/personalEventStorage';
import type { GapPersonalEvent } from '../gaps/gapCalculator';
import type { DateMemos } from './dateMemoStorage';

export function createMemoBusyEvents(dateMemos: DateMemos, legacyEvents: PersonalEvent[]): GapPersonalEvent[] {
  const memoEvents = Object.entries(dateMemos).flatMap(([date, memos]) => memos.flatMap((memo) => memo.timeEnabled ? [{
    date,
    allDay: memo.allDay,
    startTime: memo.allDay ? null : memo.startTime,
    endTime: memo.allDay ? null : memo.endTime,
  }] : []));

  return [
    ...legacyEvents.map(({ date, allDay, startTime, endTime }) => ({ date, allDay, startTime, endTime })),
    ...memoEvents,
  ];
}
