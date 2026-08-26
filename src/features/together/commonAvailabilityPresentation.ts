import type { AvailabilityInterval } from './availabilityProjection';
import { isLocalCalendarDate } from './dayOffProjection';

export type TogetherCommonAvailabilityStatus =
  | 'ready'
  | 'sharing_disabled'
  | 'not_synced'
  | 'timezone_mismatch'
  | 'not_enough_members';

export type TogetherCommonAvailability = {
  localDate: string;
  availabilityStatus: TogetherCommonAvailabilityStatus;
  timezoneName: string | null;
  intervals: AvailabilityInterval[];
};

export type TogetherAvailabilityRequestIdentity = {
  generation: number;
  localDate: string;
  spaceId: string;
  userId: string;
};

export function formatAvailabilityMinute(minute: number): string {
  if (!Number.isInteger(minute) || minute < 0 || minute > 1440) {
    throw new Error('Invalid availability minute');
  }
  const hour = Math.floor(minute / 60);
  const remainder = minute % 60;
  return `${String(hour).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function formatAvailabilityInterval(interval: AvailabilityInterval): string {
  return `${formatAvailabilityMinute(interval.startMinute)} ~ ${formatAvailabilityMinute(interval.endMinute)}`;
}

export function getTogetherAvailabilityStatusMessage(day: TogetherCommonAvailability): string {
  if (day.availabilityStatus === 'sharing_disabled') return '멤버 중 한 명이 우리의 틈 공유를 꺼두었어요.';
  if (day.availabilityStatus === 'not_synced') return '근무 정보를 준비하고 있어요.';
  if (day.availabilityStatus === 'timezone_mismatch') return '서로 다른 시간대를 사용하고 있어 우리의 틈을 계산할 수 없어요.';
  if (day.availabilityStatus === 'not_enough_members') return '함께할 멤버를 초대해보세요.';
  return '함께 가능한 시간이 없어요.';
}

export function isCurrentTogetherAvailabilityRequest(
  current: TogetherAvailabilityRequestIdentity | undefined,
  candidate: TogetherAvailabilityRequestIdentity,
): boolean {
  return current?.generation === candidate.generation
    && current.spaceId === candidate.spaceId
    && current.localDate === candidate.localDate
    && current.userId === candidate.userId;
}

export function parseTogetherCommonAvailability(value: unknown): TogetherCommonAvailability {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
  const status = row?.availability_status;
  if (
    !row
    || !isLocalCalendarDate(row.local_date)
    || (status !== 'ready'
      && status !== 'sharing_disabled'
      && status !== 'not_synced'
      && status !== 'timezone_mismatch'
      && status !== 'not_enough_members')
    || !Array.isArray(row.intervals)
  ) {
    throw new Error('Invalid together common availability');
  }

  if ((status === 'ready' && (typeof row.timezone_name !== 'string' || !row.timezone_name.trim()))
    || (status !== 'ready' && row.timezone_name !== null)
    || (status !== 'ready' && row.intervals.length !== 0)) {
    throw new Error('Invalid together common availability status');
  }

  let previousEnd = -1;
  const intervals = row.intervals.map((value): AvailabilityInterval => {
    const interval = value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
    if (
      !interval
      || !Number.isInteger(interval.start_minute)
      || !Number.isInteger(interval.end_minute)
      || (interval.start_minute as number) < 0
      || (interval.start_minute as number) >= (interval.end_minute as number)
      || (interval.end_minute as number) > 1440
      || (interval.end_minute as number) - (interval.start_minute as number) < 30
      || (interval.start_minute as number) <= previousEnd
    ) {
      throw new Error('Invalid together common availability interval');
    }
    previousEnd = interval.end_minute as number;
    return { startMinute: interval.start_minute as number, endMinute: interval.end_minute as number };
  });

  return {
    localDate: row.local_date,
    availabilityStatus: status,
    timezoneName: row.timezone_name as string | null,
    intervals,
  };
}
