import type { TogetherCommonAvailability } from './commonAvailabilityPresentation';
import { intersectAvailabilityIntervals, type AvailabilityInterval } from './availabilityProjection';
import { addLocalCalendarDays } from './dayOffProjection';
import { createSharedEventIsoRangeAcrossDates } from './sharedEventDateTime';
import type { TogetherMemberShiftDay } from './togetherServerData';
import type { DateMemos } from '../memos/dateMemoStorage';
import type { PersonalEvent } from '../events/personalEventStorage';
import { parseSimulatedLeaveDays } from './travelLeavePolicy';
import { createTravelRecommendations, isTravelNights, TRAVEL_RECOMMENDATION_POLICY, type TravelBusyEvent, type TravelLeaveUsage, type TravelNights, type TravelRecommendation, type TravelResult } from './travelRecommendation';

export type TravelLeaveMember = { userId: string; displayName: string; days: TogetherMemberShiftDay[] };
/** Contains no title, ID, or memo text; it is only used in memory on this device. */
export type TravelPersonalSoftEvent = { date: string; allDay: boolean; startTime: string | null; endTime: string | null };
export type TravelLeaveResult = TravelResult & { extraLeaveRecommendation: TravelRecommendation | null };
type ShiftRange = { member: TravelLeaveMember; date: string; label: string; start: number; end: number };

export function selectCurrentUserTravelSoftEvents(personalEvents: readonly PersonalEvent[], dateMemos: DateMemos): TravelPersonalSoftEvent[] {
  return [
    ...personalEvents.filter((event) => event.kind !== 'shared' && event.source !== 'together')
      .map(({ date, allDay, startTime, endTime }) => ({ date, allDay, startTime, endTime })),
    ...Object.entries(dateMemos).flatMap(([date, memos]) => memos
      .filter((memo) => memo.timeEnabled)
      .map(({ allDay, startTime, endTime }) => ({ date, allDay, startTime, endTime }))),
  ];
}

function workRanges(members: readonly TravelLeaveMember[], from: string, to: string, timezoneName: string):
  { ranges: ShiftRange[] } | { status: 'sharing_disabled' | 'not_synced' } {
  const expectedFrom = addLocalCalendarDays(from, -1);
  const result: ShiftRange[] = [];
  for (const member of members) {
    const days = new Map(member.days.map((day) => [day.localDate, day]));
    for (let date = expectedFrom; date <= to; date = addLocalCalendarDays(date, 1)) {
      const day = days.get(date);
      if (!day) return { status: 'not_synced' };
      if (!day.sharingEnabled) return { status: 'sharing_disabled' };
      if (!day.hasProjection || !day.shiftKind) return { status: 'not_synced' };
      if (day.shiftKind !== 'work') continue;
      if (!day.startTime || !day.endTime) return { status: 'not_synced' };
      const overnight = day.endTime <= day.startTime;
      const period = createSharedEventIsoRangeAcrossDates(date, overnight ? addLocalCalendarDays(date, 1) : date,
        { startTime: day.startTime, endTime: day.endTime }, timezoneName);
      result.push({ member, date, label: day.shiftName || '근무', start: Date.parse(period.startsAt), end: Date.parse(period.endsAt) });
    }
  }
  return { ranges: result };
}

function shiftMinute(time: string): number {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(time);
  if (!match) throw new Error('Invalid travel shift time');
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}

/** Travel-only work availability. Equal start/end denotes one full overnight shift. */
function workOnlyIntervals(previous: TogetherMemberShiftDay, current: TogetherMemberShiftDay): AvailabilityInterval[] {
  const busy: AvailabilityInterval[] = [];
  for (const [day, isPrevious] of [[previous, true], [current, false]] as const) {
    if (day.shiftKind !== 'work' || !day.startTime || !day.endTime) continue;
    const start = shiftMinute(day.startTime);
    const end = shiftMinute(day.endTime);
    if (isPrevious && end <= start && end > 0) busy.push({ startMinute: 0, endMinute: end });
    if (!isPrevious) busy.push({ startMinute: start, endMinute: end <= start ? 1440 : end });
  }
  busy.sort((left, right) => left.startMinute - right.startMinute);
  const free: AvailabilityInterval[] = [];
  let cursor = 0;
  for (const interval of busy) {
    if (interval.startMinute - cursor >= 30) free.push({ startMinute: cursor, endMinute: interval.startMinute });
    cursor = Math.max(cursor, interval.endMinute);
  }
  if (1440 - cursor >= 30) free.push({ startMinute: cursor, endMinute: 1440 });
  return free;
}

function countPersonalConflicts(candidate: TravelRecommendation, events: readonly TravelPersonalSoftEvent[]): number {
  const start = Date.parse(candidate.startsAt);
  const end = Date.parse(candidate.endsAt);
  return events.filter((event) => {
    if (event.date < candidate.startDate || event.date > candidate.endDate) return false;
    const period = createSharedEventIsoRangeAcrossDates(event.date, event.date,
      { startTime: event.allDay || !event.startTime || !event.endTime ? '00:00' : event.startTime,
        endTime: event.allDay || !event.startTime || !event.endTime ? '24:00' : event.endTime }, candidate.timezoneName);
    return Date.parse(period.startsAt) < end && Date.parse(period.endsAt) > start;
  }).length;
}

function decorate(
  candidate: TravelRecommendation,
  shifts: readonly ShiftRange[],
  budgets: Readonly<Record<string, number>>,
  sharedEvents: readonly TravelBusyEvent[],
  personalEvents: readonly TravelPersonalSoftEvent[],
): TravelRecommendation | null {
  const start = Date.parse(candidate.startsAt);
  const end = Date.parse(candidate.endsAt);
  const conflicts = shifts.filter((shift) => shift.start < end && shift.end > start);
  const byMember = new Map<string, number>();
  for (const shift of conflicts) {
    const next = (byMember.get(shift.member.userId) ?? 0) + 1;
    if (next > (budgets[shift.member.userId] ?? 0)) return null;
    byMember.set(shift.member.userId, next);
  }
  const leaveUsageByMember: TravelLeaveUsage[] = conflicts.map((shift) => ({
    userId: shift.member.userId, displayName: shift.member.displayName, shiftDate: shift.date,
    shiftLabel: shift.label, shiftStartsAt: new Date(shift.start).toISOString(),
    shiftEndsAt: new Date(shift.end).toISOString(), leaveUnits: 1,
  }));
  const shared = sharedEvents.filter((event) => event.spaceId === candidate.spaceId
    && Date.parse(event.startsAt) < end && Date.parse(event.endsAt) > start);
  const nextShift = shifts.filter((shift) => shift.start >= end).reduce((earliest, shift) => Math.min(earliest, shift.start), Infinity);
  return {
    ...candidate, totalFreeMinutes: candidate.durationMinutes, totalLeaveDays: conflicts.length, leaveUsageByMember,
    sharedSoftConflictCount: shared.length,
    sharedSoftConflicts: shared.slice(0, 5).map((event) => ({ id: event.id ?? '', title: event.title ?? '공동 일정', startsAt: event.startsAt })),
    currentUserPersonalSoftConflictCount: countPersonalConflicts(candidate, personalEvents),
    returnBufferMinutes: Math.min(candidate.returnBufferMinutes,
      Number.isFinite(nextShift) ? Math.max(0, Math.floor((nextShift - end) / 60_000)) : candidate.returnBufferMinutes),
  };
}

function compareCandidates(a: TravelRecommendation, b: TravelRecommendation): number {
  return a.totalLeaveDays! - b.totalLeaveDays!
    || (a.sharedSoftConflictCount! + a.currentUserPersonalSoftConflictCount!) - (b.sharedSoftConflictCount! + b.currentUserPersonalSoftConflictCount!)
    || b.durationMinutes - a.durationMinutes || b.returnBufferMinutes - a.returnBufferMinutes
    || b.weekendDays - a.weekendDays || a.startsAt.localeCompare(b.startsAt);
}

/** Only departure/return boundary times are varied; no subset of work shifts is enumerated. */
function boundaryCandidates(full: TravelRecommendation, shifts: readonly ShiftRange[]): TravelRecommendation[] {
  const start = Date.parse(full.startsAt);
  const end = Date.parse(full.endsAt);
  const latestDeparture = Date.parse(createSharedEventIsoRangeAcrossDates(full.startDate, full.startDate,
    { startTime: '09:00', endTime: '12:00' }, full.timezoneName).endsAt);
  const earliestReturn = Date.parse(createSharedEventIsoRangeAcrossDates(full.endDate, full.endDate,
    { startTime: '15:00', endTime: '18:00' }, full.timezoneName).startsAt);
  const starts = [...new Set([start, ...shifts.map((shift) => shift.end)
    .filter((time) => time >= start && time <= latestDeparture)])];
  const ends = [...new Set([end, ...shifts.map((shift) => shift.start)
    .filter((time) => time >= earliestReturn && time <= end)])];
  const candidates: TravelRecommendation[] = [];
  for (const departure of starts) for (const arrival of ends) {
    const durationMinutes = Math.round((arrival - departure) / 60_000);
    if (durationMinutes < full.nights * 1440 + TRAVEL_RECOMMENDATION_POLICY.minimumExtraMinutes) continue;
    candidates.push({ ...full, startsAt: new Date(departure).toISOString(), endsAt: new Date(arrival).toISOString(), durationMinutes });
  }
  return candidates;
}

/** Travel alone treats personal/shared events as warnings. Gap and general availability remain unchanged. */
export function createTravelLeaveRecommendations(
  spaceId: string,
  statusDays: readonly TogetherCommonAvailability[],
  members: readonly TravelLeaveMember[],
  budgets: Readonly<Record<string, number>>,
  sharedEvents: readonly TravelBusyEvent[],
  currentUserPersonalEvents: readonly TravelPersonalSoftEvent[],
  nights: TravelNights,
  maxResults = 3,
): TravelLeaveResult {
  if (!spaceId || !isTravelNights(nights) || !Number.isInteger(maxResults) || maxResults < 1
    || members.length < 2 || members.some((member) => !member.userId
    || parseSimulatedLeaveDays(budgets[member.userId] ?? 0) === null)) throw new Error('Invalid travel leave request');
  if (statusDays.length === 0) return { status: 'ready', recommendations: [], extraLeaveRecommendation: null };
  const unavailable = statusDays.find((day) => day.availabilityStatus !== 'ready');
  if (unavailable) return { status: unavailable.availabilityStatus, recommendations: [], extraLeaveRecommendation: null };
  const timezoneName = statusDays[0].timezoneName;
  if (!timezoneName || statusDays.some((day, index) => day.timezoneName !== timezoneName
    || (index > 0 && day.localDate !== addLocalCalendarDays(statusDays[index - 1].localDate, 1)))) {
    throw new Error('Invalid travel timezone or date range');
  }
  const from = statusDays[0].localDate;
  const to = statusDays[statusDays.length - 1].localDate;
  const work = workRanges(members, from, to, timezoneName);
  if ('status' in work) return { status: work.status, recommendations: [], extraLeaveRecommendation: null };
  const shifts = work.ranges;
  const days = statusDays.map((day) => ({ ...day, intervals: intersectAvailabilityIntervals(members.map((member) => {
    const previous = member.days.find((item) => item.localDate === addLocalCalendarDays(day.localDate, -1))!;
    const current = member.days.find((item) => item.localDate === day.localDate)!;
    return workOnlyIntervals(previous, current);
  })) }));
  const baseline = createTravelRecommendations(spaceId, days, [], nights, Number.MAX_SAFE_INTEGER).recommendations;
  const expanded = members.some((member) => (budgets[member.userId] ?? 0) > 0)
    ? createTravelRecommendations(spaceId, statusDays.map((day) => ({ ...day, intervals: [{ startMinute: 0, endMinute: 1440 }] })), [], nights, Number.MAX_SAFE_INTEGER).recommendations
    : [];
  const byWindow = new Map<string, TravelRecommendation>();
  for (const candidate of [...baseline, ...expanded.flatMap((item) => boundaryCandidates(item, shifts))]) {
    const decorated = decorate(candidate, shifts, budgets, sharedEvents, currentUserPersonalEvents);
    if (!decorated) continue;
    const key = `${candidate.startDate}:${decorated.totalLeaveDays}`;
    const prior = byWindow.get(key);
    if (!prior || compareCandidates(decorated, prior) < 0) byWindow.set(key, decorated);
  }
  const ranked = [...byWindow.values()].sort(compareCandidates);
  const top = ranked.slice(0, maxResults);
  return { status: 'ready', recommendations: top,
    extraLeaveRecommendation: maxResults === 3 && top.length === 3 && top.every((item) => item.totalLeaveDays === 0)
      ? ranked.find((item) => item.totalLeaveDays! > 0) ?? null : null };
}
