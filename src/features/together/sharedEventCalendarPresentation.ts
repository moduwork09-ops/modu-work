import type { SharedEvent } from './sharedEventContract';
import { addLocalCalendarDays, countLocalCalendarDays } from './dayOffProjection';

export type SharedEventCalendarItem = {
  source: 'shared';
  id: string;
  spaceId?: string;
  displayKey: string;
  localDate: string;
  title: string;
  startTime: string;
  endTime: string;
  placeName: string | null;
};

function getZonedDateTimeParts(timestamp: string, timezoneName: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      month: '2-digit',
      timeZone: timezoneName,
      year: 'numeric',
    }).formatToParts(new Date(timestamp));
  } catch {
    throw new Error('Invalid shared event calendar timezone');
  }
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    localDate: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

export function createSharedEventCalendarItem(
  event: SharedEvent,
  timezoneName: string,
): SharedEventCalendarItem {
  const starts = getZonedDateTimeParts(event.startsAt, timezoneName);
  const ends = getZonedDateTimeParts(event.endsAt, timezoneName);
  return {
    source: 'shared',
    id: event.id,
    spaceId: event.spaceId,
    displayKey: `shared-${event.id}`,
    localDate: starts.localDate,
    title: event.title,
    startTime: starts.time,
    endTime: ends.time,
    placeName: event.placeName,
  };
}

/** Expand a multi-day event for Calendar, Day and widget presentation without changing the server event. */
export function createSharedEventCalendarItems(
  event: SharedEvent,
  timezoneName: string,
): SharedEventCalendarItem[] {
  const first = createSharedEventCalendarItem(event, timezoneName);
  const end = getZonedDateTimeParts(event.endsAt, timezoneName);
  const lastDate = end.time === '00:00' && end.localDate > first.localDate
    ? addLocalCalendarDays(end.localDate, -1) : end.localDate;
  const count = countLocalCalendarDays(first.localDate, lastDate);
  if (count < 1 || count > 366) throw new Error('Invalid shared event duration');
  return Array.from({ length: count }, (_, index) => {
    const localDate = addLocalCalendarDays(first.localDate, index);
    return {
      ...first,
      displayKey: `shared-${event.id}-${localDate}`,
      localDate,
      startTime: index === 0 ? first.startTime : '00:00',
      endTime: localDate === end.localDate ? end.time : '24:00',
    };
  });
}
