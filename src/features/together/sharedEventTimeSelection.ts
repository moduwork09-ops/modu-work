import type { AvailabilityInterval } from './availabilityProjection';
import { formatAvailabilityMinute } from './commonAvailabilityPresentation';

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export type SharedEventTimeSelection = {
  startTime: string;
  endTime: string;
};

export function sharedEventTimeToMinute(value: unknown): number | null {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) return null;
  if (value === '24:00') return 1440;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

export function findContainingAvailabilityInterval(
  selection: SharedEventTimeSelection,
  intervals: AvailabilityInterval[],
): number {
  const startMinute = sharedEventTimeToMinute(selection.startTime);
  const endMinute = sharedEventTimeToMinute(selection.endTime);
  if (startMinute === null || endMinute === null || startMinute >= 1440 || startMinute >= endMinute) return -1;
  return intervals.findIndex((interval) => (
    Number.isInteger(interval.startMinute)
    && Number.isInteger(interval.endMinute)
    && interval.startMinute >= 0
    && interval.startMinute < interval.endMinute
    && interval.endMinute <= 1440
    && startMinute >= interval.startMinute
    && endMinute <= interval.endMinute
  ));
}

export function isSharedEventTimeWithinAvailability(
  selection: SharedEventTimeSelection,
  intervals: AvailabilityInterval[],
): boolean {
  return findContainingAvailabilityInterval(selection, intervals) >= 0;
}

export function createDefaultSharedEventTime(interval: AvailabilityInterval): SharedEventTimeSelection {
  if (!Number.isInteger(interval.startMinute)
    || !Number.isInteger(interval.endMinute)
    || interval.startMinute < 0
    || interval.startMinute >= interval.endMinute
    || interval.endMinute > 1440) {
    throw new Error('Invalid availability interval');
  }
  return {
    startTime: formatAvailabilityMinute(interval.startMinute),
    endTime: formatAvailabilityMinute(Math.min(interval.startMinute + 60, interval.endMinute)),
  };
}
