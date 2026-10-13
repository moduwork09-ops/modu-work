import { addLocalCalendarDays, isLocalCalendarDate } from './dayOffProjection';
import { sharedEventTimeToMinute, type SharedEventTimeSelection } from './sharedEventTimeSelection';

type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function getZonedParts(timestamp: number, timezoneName: string): LocalDateTimeParts {
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
    throw new Error('Invalid shared event timezone');
  }
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function localDateTimeToIso(localDate: string, minuteOfDay: number, timezoneName: string): string {
  const normalizedDate = minuteOfDay === 1440 ? addLocalCalendarDays(localDate, 1) : localDate;
  const normalizedMinute = minuteOfDay === 1440 ? 0 : minuteOfDay;
  const [year, month, day] = normalizedDate.split('-').map(Number);
  const desired = Date.UTC(year, month - 1, day, Math.floor(normalizedMinute / 60), normalizedMinute % 60);
  let candidate = desired;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const represented = getZonedParts(candidate, timezoneName);
    const representedAsUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
    );
    candidate += desired - representedAsUtc;
  }

  const verified = getZonedParts(candidate, timezoneName);
  if (verified.year !== year
    || verified.month !== month
    || verified.day !== day
    || verified.hour !== Math.floor(normalizedMinute / 60)
    || verified.minute !== normalizedMinute % 60) {
    throw new Error('Invalid shared event local time');
  }
  return new Date(candidate).toISOString();
}

export function createSharedEventIsoRange(
  localDate: string,
  selection: SharedEventTimeSelection,
  timezoneName: string,
): { startsAt: string; endsAt: string } {
  const startMinute = sharedEventTimeToMinute(selection.startTime);
  const endMinute = sharedEventTimeToMinute(selection.endTime);
  if (!isLocalCalendarDate(localDate)
    || !timezoneName.trim()
    || startMinute === null
    || endMinute === null
    || startMinute >= 1440
    || startMinute >= endMinute) {
    throw new Error('Invalid shared event date time');
  }
  const startsAt = localDateTimeToIso(localDate, startMinute, timezoneName);
  const endsAt = localDateTimeToIso(localDate, endMinute, timezoneName);
  if (Date.parse(startsAt) >= Date.parse(endsAt)) throw new Error('Invalid shared event date time');
  return { startsAt, endsAt };
}

export function createSharedEventIsoRangeAcrossDates(
  startDate: string,
  endDate: string,
  selection: SharedEventTimeSelection,
  timezoneName: string,
): { startsAt: string; endsAt: string } {
  const startMinute = sharedEventTimeToMinute(selection.startTime);
  const endMinute = sharedEventTimeToMinute(selection.endTime);
  if (!isLocalCalendarDate(startDate) || !isLocalCalendarDate(endDate)
    || !timezoneName.trim() || endDate < startDate
    || startMinute === null || endMinute === null || startMinute >= 1440
    || (startDate === endDate && startMinute >= endMinute)) {
    throw new Error('Invalid shared event date time');
  }
  const startsAt = localDateTimeToIso(startDate, startMinute, timezoneName);
  const endsAt = localDateTimeToIso(endDate, endMinute, timezoneName);
  if (Date.parse(startsAt) >= Date.parse(endsAt)) throw new Error('Invalid shared event date time');
  return { startsAt, endsAt };
}