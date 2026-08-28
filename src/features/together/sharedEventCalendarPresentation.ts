import type { SharedEvent } from './sharedEventContract';

export type SharedEventCalendarItem = {
  source: 'shared';
  id: string;
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
    displayKey: `shared-${event.id}`,
    localDate: starts.localDate,
    title: event.title,
    startTime: starts.time,
    endTime: ends.time,
    placeName: event.placeName,
  };
}
