import {
  calculateDailyGaps,
  MIN_GAP_MINUTES,
  type GapCalculationInput,
  type GapCalculationResult,
} from '../gaps/gapCalculator';
import { isLocalCalendarDate } from './dayOffProjection';

const MINUTES_IN_DAY = 24 * 60;

export type AvailabilityInterval = {
  startMinute: number;
  endMinute: number;
};

export type DailyAvailabilityProjection = {
  localDate: string;
  timezoneName: string;
  intervals: AvailabilityInterval[];
};

export type DailyAvailabilityProjectionInput = Omit<GapCalculationInput, 'minimumGapMinutes'> & {
  timezoneName: string;
};

function assertIanaTimezoneName(timezoneName: string) {
  if (!timezoneName.trim()) throw new Error('Invalid availability timezone');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezoneName }).resolvedOptions();
  } catch {
    throw new Error('Invalid availability timezone');
  }
}

function gapTimeToMinute(time: string) {
  if (time === '24:00') return MINUTES_IN_DAY;
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new Error('Invalid availability time');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error('Invalid availability time');
  return hour * 60 + minute;
}

function assertAvailabilityInterval(interval: AvailabilityInterval) {
  if (!Number.isInteger(interval.startMinute)
    || !Number.isInteger(interval.endMinute)
    || interval.startMinute < 0
    || interval.startMinute >= interval.endMinute
    || interval.endMinute > MINUTES_IN_DAY) {
    throw new Error('Invalid availability interval');
  }
}

export function normalizeAvailabilityIntervals(
  intervals: readonly AvailabilityInterval[],
): AvailabilityInterval[] {
  const sorted = intervals.map((interval) => {
    assertAvailabilityInterval(interval);
    return { ...interval };
  }).sort((left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute);
  const normalized: AvailabilityInterval[] = [];

  sorted.forEach((interval) => {
    const previous = normalized[normalized.length - 1];
    if (!previous || interval.startMinute > previous.endMinute) {
      normalized.push(interval);
      return;
    }
    previous.endMinute = Math.max(previous.endMinute, interval.endMinute);
  });

  return normalized;
}

export function createDailyAvailabilityProjectionFromGapResult(
  localDate: string,
  timezoneName: string,
  result: GapCalculationResult,
): DailyAvailabilityProjection {
  if (!isLocalCalendarDate(localDate)) throw new Error('Invalid availability date');
  assertIanaTimezoneName(timezoneName);

  const intervals = normalizeAvailabilityIntervals(result.gaps.map((gap) => {
    const startMinute = gapTimeToMinute(gap.startTime);
    const endMinute = gapTimeToMinute(gap.endTime);
    if (gap.durationMinutes !== endMinute - startMinute) {
      throw new Error('Invalid availability gap duration');
    }
    return { startMinute, endMinute };
  }));

  return { localDate, timezoneName, intervals };
}

/**
 * This pure function requires trusted, successfully hydrated local data.
 * A storage read/parsing failure must never be converted into an empty input here.
 * `intervals: []` is complete only when trusted inputs genuinely produce no availability.
 */
export function calculateDailyAvailabilityProjection({
  timezoneName,
  ...input
}: DailyAvailabilityProjectionInput): DailyAvailabilityProjection {
  return createDailyAvailabilityProjectionFromGapResult(
    input.date,
    timezoneName,
    calculateDailyGaps(input),
  );
}

export function intersectAvailabilityIntervals(
  members: readonly (readonly AvailabilityInterval[])[],
  minimumMinutes = MIN_GAP_MINUTES,
): AvailabilityInterval[] {
  if (!Number.isInteger(minimumMinutes) || minimumMinutes < 1) {
    throw new Error('Invalid minimum availability duration');
  }
  if (members.length === 0) return [];

  let intersection = normalizeAvailabilityIntervals(members[0]);
  for (let memberIndex = 1; memberIndex < members.length && intersection.length > 0; memberIndex += 1) {
    const memberIntervals = normalizeAvailabilityIntervals(members[memberIndex]);
    const next: AvailabilityInterval[] = [];
    let leftIndex = 0;
    let rightIndex = 0;

    while (leftIndex < intersection.length && rightIndex < memberIntervals.length) {
      const left = intersection[leftIndex];
      const right = memberIntervals[rightIndex];
      const startMinute = Math.max(left.startMinute, right.startMinute);
      const endMinute = Math.min(left.endMinute, right.endMinute);
      if (startMinute < endMinute) next.push({ startMinute, endMinute });
      if (left.endMinute <= right.endMinute) leftIndex += 1;
      if (right.endMinute <= left.endMinute) rightIndex += 1;
    }

    intersection = normalizeAvailabilityIntervals(next);
  }

  return intersection.filter((interval) => interval.endMinute - interval.startMinute >= minimumMinutes);
}
