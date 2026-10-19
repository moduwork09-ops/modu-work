import { countLocalCalendarDays, isLocalCalendarDate } from './dayOffProjection';
import { isTravelNights, type TravelRecommendation } from './travelRecommendation';

export const TRAVEL_AIRPORTS = [
  { id: 'ICN', label: '인천공항' },
  { id: 'PUS', label: '김해공항' },
] as const;
export const TRAVEL_ACCESS_MINUTES = [30, 60, 90] as const;
export const TRAVEL_STYLES = [
  { id: 'relaxed', label: '여유롭게' },
  { id: 'balanced', label: '알차게' },
  { id: 'packed', label: '꽉 채워서' },
] as const;

export type TravelAirport = typeof TRAVEL_AIRPORTS[number]['id'];
export type TravelAccessMinutes = typeof TRAVEL_ACCESS_MINUTES[number];
export type TravelStyle = typeof TRAVEL_STYLES[number]['id'];
export type TravelPreferences = { airport: TravelAirport; accessMinutes: TravelAccessMinutes; style: TravelStyle };
export type TravelDestination = {
  id: string;
  city: string;
  country: string;
  flightMinutes: number;
  stayMinutes: number;
  returnBufferMinutes: number;
  grade: string;
  reason: string;
};

/** Fixed planning estimates, not schedules, fares, or a claim that a flight operates on a chosen day. */
const ROUTES: readonly { id: string; city: string; country: string; interest: number; minutes: Record<TravelAirport, number> }[] = [
  { id: 'fukuoka', city: '후쿠오카', country: '일본', interest: 1, minutes: { ICN: 95, PUS: 55 } },
  { id: 'osaka', city: '오사카', country: '일본', interest: 2, minutes: { ICN: 110, PUS: 85 } },
  { id: 'tokyo', city: '도쿄', country: '일본', interest: 3, minutes: { ICN: 145, PUS: 125 } },
  { id: 'taipei', city: '타이베이', country: '대만', interest: 4, minutes: { ICN: 165, PUS: 155 } },
];
const AIRPORT_PROCESSING_ROUND_TRIP_MINUTES = 180;
const MINIMUM_STAY_PER_NIGHT_MINUTES = 12 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formatTravelMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}시간 ${remainder}분` : `${hours}시간`;
}

export function isTravelPreferences(value: unknown): value is TravelPreferences {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return TRAVEL_AIRPORTS.some((airport) => airport.id === item.airport)
    && TRAVEL_ACCESS_MINUTES.some((minutes) => minutes === item.accessMinutes)
    && TRAVEL_STYLES.some((style) => style.id === item.style);
}

/** Route parameters are user-controlled; never allow an invalid candidate into the save flow. */
export function parseTravelCandidate(value: unknown): TravelRecommendation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.spaceId !== 'string' || !UUID.test(item.spaceId)
    || typeof item.timezoneName !== 'string' || !item.timezoneName
    || typeof item.startDate !== 'string' || !isLocalCalendarDate(item.startDate)
    || typeof item.endDate !== 'string' || !isLocalCalendarDate(item.endDate)
    || typeof item.startsAt !== 'string' || typeof item.endsAt !== 'string'
    || !isTravelNights(item.nights)
    || countLocalCalendarDays(item.startDate, item.endDate) !== Number(item.nights) + 1
    || typeof item.durationMinutes !== 'number' || !Number.isFinite(item.durationMinutes) || item.durationMinutes <= 0
    || typeof item.returnBufferMinutes !== 'number' || !Number.isFinite(item.returnBufferMinutes) || item.returnBufferMinutes < 0
    || typeof item.weekendDays !== 'number' || !Number.isFinite(item.weekendDays)) return null;
  const start = Date.parse(item.startsAt);
  const end = Date.parse(item.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start
    || Math.abs((end - start) / 60_000 - item.durationMinutes) > 1) return null;
  if (item.totalLeaveDays !== undefined) {
    if (!Number.isInteger(item.totalLeaveDays) || (item.totalLeaveDays as number) < 0 || (item.totalLeaveDays as number) > 100
      || !Array.isArray(item.leaveUsageByMember) || item.leaveUsageByMember.length !== item.totalLeaveDays
      || item.leaveUsageByMember.some((usage: unknown) => {
        const shift = usage && typeof usage === 'object' ? usage as Record<string, unknown> : null;
        return !shift || typeof shift.userId !== 'string' || !UUID.test(shift.userId)
          || typeof shift.displayName !== 'string' || shift.displayName.length > 80
          || !isLocalCalendarDate(shift.shiftDate) || typeof shift.shiftLabel !== 'string' || shift.shiftLabel.length > 80
          || typeof shift.shiftStartsAt !== 'string' || !Number.isFinite(Date.parse(shift.shiftStartsAt))
          || typeof shift.shiftEndsAt !== 'string' || !Number.isFinite(Date.parse(shift.shiftEndsAt))
          || shift.leaveUnits !== 1;
      })
      || item.totalFreeMinutes !== item.durationMinutes
      || !Number.isInteger(item.sharedSoftConflictCount) || (item.sharedSoftConflictCount as number) < 0
      || !Array.isArray(item.sharedSoftConflicts) || item.sharedSoftConflicts.length > 5
      || item.sharedSoftConflicts.some((conflict: unknown) => {
        const event = conflict && typeof conflict === 'object' ? conflict as Record<string, unknown> : null;
        return !event || typeof event.id !== 'string' || (event.id !== '' && !UUID.test(event.id))
          || typeof event.title !== 'string' || event.title.length > 100
          || typeof event.startsAt !== 'string' || !Number.isFinite(Date.parse(event.startsAt));
      })
      || item.sharedSoftConflicts.length > (item.sharedSoftConflictCount as number)
      || !Number.isInteger(item.currentUserPersonalSoftConflictCount)
      || (item.currentUserPersonalSoftConflictCount as number) < 0) return null;
  }
  try {
    const timezone = item.timezoneName as string;
    const startLocal = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(start));
    const endLocal = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(end));
    const dateOf = (parts: Intl.DateTimeFormatPart[]) => {
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return `${values.year}-${values.month}-${values.day}`;
    };
    if (dateOf(startLocal) !== item.startDate || dateOf(endLocal) !== item.endDate) return null;
  } catch { return null; }
  return item as TravelRecommendation;
}

/** Style changes reorder destinations only; the shared free-time candidate is never recalculated here. */
export function rankTravelDestinations(
  candidate: TravelRecommendation,
  preferences: TravelPreferences,
): TravelDestination[] {
  if (!parseTravelCandidate(candidate) || !isTravelPreferences(preferences)) return [];
  return ROUTES.flatMap((route) => {
    const flightMinutes = route.minutes[preferences.airport];
    const stayMinutes = candidate.durationMinutes
      - 2 * (preferences.accessMinutes + flightMinutes)
      - AIRPORT_PROCESSING_ROUND_TRIP_MINUTES;
    if (stayMinutes < candidate.nights * MINIMUM_STAY_PER_NIGHT_MINUTES) return [];
    const score = preferences.style === 'relaxed'
      ? stayMinutes - 3 * flightMinutes
      : preferences.style === 'balanced'
        ? stayMinutes - flightMinutes + route.interest * 80
        : stayMinutes + route.interest * 180;
    const grade = stayMinutes >= candidate.nights * 20 * 60 ? '여유롭게'
      : stayMinutes >= candidate.nights * 16 * 60 ? '알차게' : '꽉 채워서';
    const reason = flightMinutes <= 100
      ? '이동시간이 짧고, 귀가 후에도 함께 쉴 시간이 남아요.'
      : '이동시간을 고려해도 현지에서 머물 시간이 충분해요.';
    return [{ id: route.id, city: route.city, country: route.country,
      flightMinutes, stayMinutes, returnBufferMinutes: candidate.returnBufferMinutes,
      grade, reason, score }];
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map(({ score: _score, ...item }) => item);
}

export const TRAVEL_DESTINATION_POLICY = {
  airportProcessingRoundTripMinutes: AIRPORT_PROCESSING_ROUND_TRIP_MINUTES,
  minimumStayPerNightMinutes: MINIMUM_STAY_PER_NIGHT_MINUTES,
} as const;
function dateAndTimeInTimezone(iso: string, timezoneName: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezoneName, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

/** Reuse the existing editable shared-event form; no new event write path. */
export function createTravelEventPrefill(candidate: TravelRecommendation, destination: TravelDestination) {
  if (!parseTravelCandidate(candidate)) throw new Error('Invalid travel candidate');
  const departure = dateAndTimeInTimezone(candidate.startsAt, candidate.timezoneName);
  const arrival = dateAndTimeInTimezone(candidate.endsAt, candidate.timezoneName);
  if (departure.date !== candidate.startDate || arrival.date !== candidate.endDate) throw new Error('Invalid travel candidate dates');
  const estimates = `예상 현지 체류 약 ${formatTravelMinutes(destination.stayMinutes)}\n예상 편도 비행 약 ${formatTravelMinutes(destination.flightMinutes)}`;
  const usage = candidate.leaveUsageByMember ?? [];
  const lines: string[] = [];
  if (usage.length) {
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    for (const shift of usage) {
      const [year, month, day] = shift.shiftDate.split('-').map(Number);
      const line = `${shift.displayName} · ${month}/${day}(${weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]}) ${shift.shiftLabel}`;
      const remainder = usage.length - lines.length - 1;
      const proposed = `연가 필요\n${[...lines, line].join('\n')}${remainder ? `\n외 ${remainder}회` : ''}\n${estimates}`;
      if (proposed.length > 200) break;
      lines.push(line);
    }
  }
  const remaining = usage.length - lines.length;
  const leaveMemo = usage.length ? `연가 필요\n${lines.join('\n')}${remaining ? `\n외 ${remaining}회` : ''}\n` : '';
  return {
    spaceId: candidate.spaceId,
    date: candidate.startDate,
    endDate: candidate.endDate,
    startTime: departure.time,
    endTime: arrival.time,
    title: `${destination.city} 여행`,
    memo: `${leaveMemo}${estimates}`,
    source: 'travel',
    timezoneName: candidate.timezoneName,
  };
}
