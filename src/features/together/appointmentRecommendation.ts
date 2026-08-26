import { formatGapDuration } from '../gaps/gapCalculator';
import type { TogetherCommonAvailability, TogetherCommonAvailabilityStatus } from './commonAvailabilityPresentation';
import { formatAvailabilityMinute } from './commonAvailabilityPresentation';
import { isLocalCalendarDate } from './dayOffProjection';

const MINIMUM_RECOMMENDATION_MINUTES = 60;
const MAX_RECOMMENDATIONS = 3;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export type AppointmentRecommendation = {
  localDate: string;
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  isCommonDayOff: boolean;
};

export type AppointmentRecommendationResult = {
  availabilityStatus: TogetherCommonAvailabilityStatus;
  recommendations: AppointmentRecommendation[];
};

export type AppointmentPrefill = {
  localDate: string;
  startTime: string;
  endTime: string;
};

type CommonDayOffLike = {
  localDate: string;
  isCommonDayOff: boolean;
};

function assertValidInterval(startMinute: number, endMinute: number): void {
  if (!Number.isInteger(startMinute)
    || !Number.isInteger(endMinute)
    || startMinute < 0
    || startMinute >= endMinute
    || endMinute > 1440) {
    throw new Error('Invalid recommendation interval');
  }
}

export function createAppointmentRecommendations(
  availabilityDays: TogetherCommonAvailability[],
  commonDaysOff: CommonDayOffLike[],
): AppointmentRecommendationResult {
  if (availabilityDays.length === 0) {
    return { availabilityStatus: 'ready', recommendations: [] };
  }
  const status = availabilityDays[0].availabilityStatus;
  if (availabilityDays.some((day) => day.availabilityStatus !== status)) {
    throw new Error('Inconsistent availability status');
  }
  if (status !== 'ready') return { availabilityStatus: status, recommendations: [] };

  const commonDates = new Set(
    commonDaysOff.filter((day) => day.isCommonDayOff).map((day) => day.localDate),
  );
  const recommendations = availabilityDays.flatMap((day) => {
    if (!isLocalCalendarDate(day.localDate)) throw new Error('Invalid recommendation date');
    return day.intervals.flatMap((interval) => {
      assertValidInterval(interval.startMinute, interval.endMinute);
      const durationMinutes = interval.endMinute - interval.startMinute;
      if (durationMinutes < MINIMUM_RECOMMENDATION_MINUTES) return [];
      return [{
        localDate: day.localDate,
        startMinute: interval.startMinute,
        endMinute: interval.endMinute,
        durationMinutes,
        isCommonDayOff: commonDates.has(day.localDate),
      }];
    });
  });

  recommendations.sort((left, right) =>
    Number(right.isCommonDayOff) - Number(left.isCommonDayOff)
    || right.durationMinutes - left.durationMinutes
    || left.localDate.localeCompare(right.localDate)
    || left.startMinute - right.startMinute
    || left.endMinute - right.endMinute);
  return { availabilityStatus: 'ready', recommendations: recommendations.slice(0, MAX_RECOMMENDATIONS) };
}

export function formatRecommendationDuration(durationMinutes: number): string {
  if (!Number.isInteger(durationMinutes) || durationMinutes < MINIMUM_RECOMMENDATION_MINUTES) {
    throw new Error('Invalid recommendation duration');
  }
  return formatGapDuration(durationMinutes);
}

export function toAppointmentPrefill(recommendation: AppointmentRecommendation): AppointmentPrefill {
  return {
    localDate: recommendation.localDate,
    startTime: formatAvailabilityMinute(recommendation.startMinute),
    endTime: formatAvailabilityMinute(recommendation.endMinute),
  };
}

export function parseAppointmentPrefill(
  localDate: unknown,
  startTime: unknown,
  endTime: unknown,
): AppointmentPrefill | null {
  if (typeof localDate !== 'string'
    || typeof startTime !== 'string'
    || typeof endTime !== 'string'
    || !isLocalCalendarDate(localDate)
    || !TIME_PATTERN.test(startTime)
    || !TIME_PATTERN.test(endTime)
    || startTime === '24:00'
    || startTime >= endTime) return null;
  return { localDate, startTime, endTime };
}
