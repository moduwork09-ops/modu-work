import { getShiftForDate, type ShiftScheduleInput } from '../shifts/shiftSchedule';

export type DayOffProjectionItem = {
  localDate: string;
  isDayOff: boolean;
  shiftName: string;
  shiftAbbreviation: string;
  shiftColor: string;
  shiftTextColor: string;
  shiftKind: 'work' | 'rest';
  startTime: string | null;
  endTime: string | null;
};

export type DayOffProjectionRange = {
  rangeStart: string;
  rangeEnd: string;
  days: DayOffProjectionItem[];
};

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const MAX_PROJECTION_DAYS = 800;

function formatDateParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatUtcDate(date: Date) {
  return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function getUtcTimestamp(localDate: string) {
  const [year, month, day] = localDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function formatLocalCalendarDate(date: Date) {
  if (Number.isNaN(date.getTime())) throw new Error('Invalid local calendar date');
  return formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function isLocalCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return formatUtcDate(date) === value;
}

export function addLocalCalendarDays(localDate: string, days: number) {
  if (!isLocalCalendarDate(localDate) || !Number.isInteger(days)) {
    throw new Error('Invalid local calendar date offset');
  }
  return formatUtcDate(new Date(getUtcTimestamp(localDate) + days * DAY_IN_MILLISECONDS));
}

export function countLocalCalendarDays(from: string, to: string) {
  if (!isLocalCalendarDate(from) || !isLocalCalendarDate(to)) {
    throw new Error('Invalid local calendar date range');
  }
  return Math.round((getUtcTimestamp(to) - getUtcTimestamp(from)) / DAY_IN_MILLISECONDS) + 1;
}

export function assertValidDayOffProjectionCoverage(rangeStart: string, rangeEnd: string) {
  if (!isLocalCalendarDate(rangeStart)
    || !isLocalCalendarDate(rangeEnd)
    || rangeStart > rangeEnd) {
    throw new Error('Invalid day off projection coverage');
  }
  const dayCount = countLocalCalendarDays(rangeStart, rangeEnd);
  if (!Number.isInteger(dayCount)
    || !Number.isFinite(dayCount)
    || dayCount < 1
    || dayCount > MAX_PROJECTION_DAYS) {
    throw new Error('Invalid day off projection coverage');
  }
  return dayCount;
}

export function isLocalDateInRange(localDate: string, rangeStart: string, rangeEnd: string) {
  return isLocalCalendarDate(localDate)
    && isLocalCalendarDate(rangeStart)
    && isLocalCalendarDate(rangeEnd)
    && rangeStart <= localDate
    && localDate <= rangeEnd;
}

export function normalizeDirtyDates(values: readonly unknown[]) {
  if (!Array.isArray(values) || !values.every(isLocalCalendarDate)) {
    throw new Error('Invalid dirty dates');
  }
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function createDayOffProjectionItem(
  localDate: string,
  schedule: ShiftScheduleInput,
): DayOffProjectionItem {
  if (!isLocalCalendarDate(localDate)) throw new Error('Invalid projection date');
  const shift = getShiftForDate(localDate, schedule);
  return {
    localDate,
    isDayOff: shift.kind === 'rest',
    shiftName: shift.name,
    shiftAbbreviation: shift.abbreviation,
    shiftColor: shift.color,
    shiftTextColor: shift.textColor,
    shiftKind: shift.kind,
    startTime: shift.startTime ?? null,
    endTime: shift.endTime ?? null,
  };
}

export function getChangedDayOffProjectionDates(
  before: ShiftScheduleInput,
  after: ShiftScheduleInput,
  rangeStart: string,
  rangeEnd: string,
) {
  const dayCount = assertValidDayOffProjectionCoverage(rangeStart, rangeEnd);
  const dirtyDates: string[] = [];
  for (let index = 0; index < dayCount; index += 1) {
    const localDate = addLocalCalendarDays(rangeStart, index);
    const beforeIsDayOff = getShiftForDate(localDate, before).kind === 'rest';
    const afterIsDayOff = getShiftForDate(localDate, after).kind === 'rest';
    if (beforeIsDayOff !== afterIsDayOff) dirtyDates.push(localDate);
  }
  return dirtyDates;
}

export function getChangedShiftProjectionDates(before: ShiftScheduleInput, after: ShiftScheduleInput, rangeStart: string, rangeEnd: string) {
  const dayCount = assertValidDayOffProjectionCoverage(rangeStart, rangeEnd);
  const dirtyDates: string[] = [];
  for (let index = 0; index < dayCount; index += 1) {
    const localDate = addLocalCalendarDays(rangeStart, index);
    const left = getShiftForDate(localDate, before);
    const right = getShiftForDate(localDate, after);
    if (left.id !== right.id || left.name !== right.name || left.abbreviation !== right.abbreviation || left.color !== right.color || left.textColor !== right.textColor || left.kind !== right.kind || left.startTime !== right.startTime || left.endTime !== right.endTime) dirtyDates.push(localDate);
  }
  return dirtyDates;
}

export function assertValidDayOffProjectionRange(range: DayOffProjectionRange) {
  if (!isLocalCalendarDate(range.rangeStart) || !isLocalCalendarDate(range.rangeEnd)) {
    throw new Error('Invalid day off projection range');
  }
  if (!Array.isArray(range.days) || range.days.length < 1 || range.days.length > MAX_PROJECTION_DAYS) {
    throw new Error('Invalid day off projection days');
  }

  const startTimestamp = getUtcTimestamp(range.rangeStart);
  const expectedCount = countLocalCalendarDays(range.rangeStart, range.rangeEnd);
  if (expectedCount !== range.days.length || expectedCount < 1) {
    throw new Error('Invalid day off projection coverage');
  }

  const seenDates = new Set<string>();
  range.days.forEach((item, index) => {
    if (!item || !isLocalCalendarDate(item.localDate) || typeof item.isDayOff !== 'boolean'
      || typeof item.shiftName !== 'string' || typeof item.shiftAbbreviation !== 'string'
      || typeof item.shiftColor !== 'string' || typeof item.shiftTextColor !== 'string'
      || (item.shiftKind !== 'work' && item.shiftKind !== 'rest')) {
      throw new Error('Invalid day off projection item');
    }
    const expectedDate = formatUtcDate(new Date(startTimestamp + index * DAY_IN_MILLISECONDS));
    if (item.localDate !== expectedDate || seenDates.has(item.localDate)) {
      throw new Error('Invalid day off projection sequence');
    }
    seenDates.add(item.localDate);
  });

  if (range.days[0].localDate !== range.rangeStart
    || range.days[range.days.length - 1].localDate !== range.rangeEnd) {
    throw new Error('Invalid day off projection bounds');
  }
}

export function createDayOffProjectionRange(
  schedule: ShiftScheduleInput,
  today: Date = new Date(),
): DayOffProjectionRange {
  if (Number.isNaN(today.getTime())) throw new Error('Invalid projection date');

  const historyStart = schedule.patternHistory
    ?.map((entry) => entry.effectiveFrom)
    .filter(isLocalCalendarDate)
    .sort((left, right) => left.localeCompare(right))[0];
  if (!historyStart) throw new Error('Reliable shift pattern history is required');

  const year = today.getFullYear();
  const month = today.getMonth();
  const requestedStart = formatUtcDate(new Date(Date.UTC(year, month - 12, 1)));
  const rangeStart = historyStart > requestedStart ? historyStart : requestedStart;
  const rangeEnd = formatUtcDate(new Date(Date.UTC(year, month + 13, 0)));
  if (rangeStart > rangeEnd) throw new Error('Reliable shift pattern history is outside the projection range');

  const startTimestamp = getUtcTimestamp(rangeStart);
  const endTimestamp = getUtcTimestamp(rangeEnd);
  const dayCount = Math.round((endTimestamp - startTimestamp) / DAY_IN_MILLISECONDS) + 1;
  if (dayCount < 1 || dayCount > MAX_PROJECTION_DAYS) {
    throw new Error('Day off projection range is too large');
  }

  const days = Array.from({ length: dayCount }, (_, index) => {
    const localDate = formatUtcDate(new Date(startTimestamp + index * DAY_IN_MILLISECONDS));
    return createDayOffProjectionItem(localDate, schedule);
  });
  const range = { rangeStart, rangeEnd, days };
  assertValidDayOffProjectionRange(range);
  return range;
}
