import { formatAvailabilityMinute, type TogetherCommonAvailability, type TogetherCommonAvailabilityStatus } from './commonAvailabilityPresentation';
import { addLocalCalendarDays, isLocalCalendarDate } from './dayOffProjection';
import { createSharedEventIsoRangeAcrossDates } from './sharedEventDateTime';

const MINUTE = 60_000;
export const MAX_TRAVEL_NIGHTS = 9;
export type TravelNights = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export function isTravelNights(value: unknown): value is TravelNights {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_TRAVEL_NIGHTS;
}
const POLICY = {
  departureEarliestMinute: 9 * 60,
  departureLatestMinute: 12 * 60,
  returnEarliestMinute: 15 * 60,
  returnLatestMinute: 18 * 60,
  minimumExtraMinutes: 3 * 60,
  maxResults: 3,
} as const;

type Range = { start: number; end: number };
export type TravelBusyEvent = { spaceId: string; startsAt: string; endsAt: string; id?: string; title?: string };
export type TravelLeaveUsage = {
  userId: string;
  displayName: string;
  shiftDate: string;
  shiftLabel: string;
  shiftStartsAt: string;
  shiftEndsAt: string;
  leaveUnits: 1;
};
export type TravelSharedSoftConflict = { id: string; title: string; startsAt: string };
export type TravelRecommendation = {
  spaceId: string;
  timezoneName: string;
  startDate: string;
  endDate: string;
  startsAt: string;
  endsAt: string;
  nights: TravelNights;
  durationMinutes: number;
  returnBufferMinutes: number;
  weekendDays: number;
  totalFreeMinutes?: number;
  totalLeaveDays?: number;
  leaveUsageByMember?: TravelLeaveUsage[];
  sharedSoftConflicts?: TravelSharedSoftConflict[];
  sharedSoftConflictCount?: number;
  currentUserPersonalSoftConflictCount?: number;
};
export type TravelResult = {
  status: TogetherCommonAvailabilityStatus;
  recommendations: TravelRecommendation[];
};

function mergeRanges(ranges: Range[]): Range[] {
  const result: Range[] = [];
  for (const range of ranges.sort((a, b) => a.start - b.start || a.end - b.end)) {
    const previous = result[result.length - 1];
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else result.push({ ...range });
  }
  return result;
}

function subtractRanges(free: Range[], busy: Range[]): Range[] {
  const blocked = mergeRanges(busy);
  return free.flatMap((range) => {
    const pieces: Range[] = [];
    let cursor = range.start;
    for (const event of blocked) {
      if (event.end <= cursor || event.start >= range.end) continue;
      if (event.start > cursor) pieces.push({ start: cursor, end: Math.min(event.start, range.end) });
      cursor = Math.max(cursor, Math.min(event.end, range.end));
      if (cursor >= range.end) break;
    }
    if (cursor < range.end) pieces.push({ start: cursor, end: range.end });
    return pieces;
  });
}

function instant(localDate: string, minute: number, timezoneName: string): number {
  const value = formatAvailabilityMinute(minute);
  const other = minute === 1440 ? '00:00' : '24:00';
  const range = minute === 1440
    ? createSharedEventIsoRangeAcrossDates(localDate, localDate, { startTime: other, endTime: value }, timezoneName)
    : createSharedEventIsoRangeAcrossDates(localDate, localDate, { startTime: value, endTime: other }, timezoneName);
  return Date.parse(minute === 1440 ? range.endsAt : range.startsAt);
}

function countWeekendDays(from: string, to: string): number {
  let count = 0;
  for (let date = from; date <= to; date = addLocalCalendarDays(date, 1)) {
    const [year, month, day] = date.split('-').map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (weekday === 0 || weekday === 6) count += 1;
  }
  return count;
}

/** Travel uses full-day member projections. An incomplete day or sharing-disabled group never yields a suggestion. */
export function createTravelRecommendations(
  spaceId: string,
  days: TogetherCommonAvailability[],
  sharedEvents: readonly TravelBusyEvent[],
  nights: TravelNights,
  maxResults: number = POLICY.maxResults,
): TravelResult {
  if (!spaceId || !isTravelNights(nights) || !Number.isInteger(maxResults) || maxResults < 1) throw new Error('Invalid travel request');
  if (days.length === 0) return { status: 'ready', recommendations: [] };
  const unavailable = days.find((day) => day.availabilityStatus !== 'ready');
  if (unavailable) return { status: unavailable.availabilityStatus, recommendations: [] };
  const timezoneName = days[0].timezoneName;
  if (!timezoneName || days.some((day, index) => day.timezoneName !== timezoneName
    || !isLocalCalendarDate(day.localDate)
    || (index > 0 && day.localDate !== addLocalCalendarDays(days[index - 1].localDate, 1)))) {
    throw new Error('Invalid travel availability');
  }

  const free = mergeRanges(days.flatMap((day) => day.intervals.map((interval) => ({
    start: instant(day.localDate, interval.startMinute, timezoneName),
    end: instant(day.localDate, interval.endMinute, timezoneName),
  }))));
  const sharedBusy = sharedEvents.filter((event) => event.spaceId === spaceId).map((event) => ({
    start: Date.parse(event.startsAt),
    end: Date.parse(event.endsAt),
  }));
  if (sharedBusy.some((event) => !Number.isFinite(event.start) || !Number.isFinite(event.end) || event.end <= event.start)) {
    throw new Error('Invalid shared event time');
  }

  const available = subtractRanges(free, sharedBusy);
  const lastDate = days[days.length - 1].localDate;
  const candidates: TravelRecommendation[] = [];
  for (const startDate of days.map((day) => day.localDate)) {
    const endDate = addLocalCalendarDays(startDate, nights);
    if (endDate > lastDate) break;
    const earliestDeparture = instant(startDate, POLICY.departureEarliestMinute, timezoneName);
    const latestDeparture = instant(startDate, POLICY.departureLatestMinute, timezoneName);
    const earliestReturn = instant(endDate, POLICY.returnEarliestMinute, timezoneName);
    const latestReturn = instant(endDate, POLICY.returnLatestMinute, timezoneName);
    for (const interval of available) {
      const start = Math.max(interval.start, earliestDeparture);
      const end = Math.min(interval.end, latestReturn);
      const durationMinutes = Math.round((end - start) / MINUTE);
      if (start > latestDeparture || end < earliestReturn
        || durationMinutes < nights * 1440 + POLICY.minimumExtraMinutes) continue;
      candidates.push({
        spaceId, timezoneName, startDate, endDate,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
        nights, durationMinutes,
        returnBufferMinutes: Math.max(0, Math.floor((interval.end - end) / MINUTE)),
        weekendDays: countWeekendDays(startDate, endDate),
      });
    }
  }
  candidates.sort((a, b) => b.durationMinutes - a.durationMinutes
    || b.returnBufferMinutes - a.returnBufferMinutes
    || b.weekendDays - a.weekendDays
    || a.startsAt.localeCompare(b.startsAt));
  return { status: 'ready', recommendations: candidates.slice(0, maxResults) };
}

export const TRAVEL_RECOMMENDATION_POLICY = POLICY;
