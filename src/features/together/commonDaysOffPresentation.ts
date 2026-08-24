import { formatLocalCalendarDate } from './dayOffProjection';
import type { TogetherCommonDayOff } from './togetherServerData';

export type CommonDaysOffCalendarDay = {
  date: Date;
  dateKey: string;
  day: number;
  isCurrentMonth: boolean;
};

export type CommonDayOffMarker = 'mine' | 'other' | 'common' | undefined;

export function buildCommonDaysOffCalendar(year: number, month: number): CommonDaysOffCalendarDay[] {
  const firstDay = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      date,
      dateKey: formatLocalCalendarDate(date),
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
    };
  });
}

export function getOtherDayOffCount(day: TogetherCommonDayOff) {
  if (day.availabilityStatus === 'unavailable') return 0;
  return Math.max(0, day.dayOffMemberCount - (day.myIsDayOff === true ? 1 : 0));
}

export function getCommonDayOffMarker(day: TogetherCommonDayOff | undefined): CommonDayOffMarker {
  if (!day) return undefined;
  if (day.availabilityStatus === 'unavailable') return day.myIsDayOff === true ? 'mine' : undefined;
  if (day.isCommonDayOff) return 'common';
  if (day.myIsDayOff === true) return 'mine';
  if (getOtherDayOffCount(day) > 0) return 'other';
  return undefined;
}

export function getCommonDayOffCountLabel(day: TogetherCommonDayOff) {
  if (day.availabilityStatus === 'unavailable') return '공유·동기화 준비 중';
  if (day.activeMemberCount >= 3) return `${day.activeMemberCount}명 중 ${day.dayOffMemberCount}명 휴무`;
  const labels = [
    day.myIsDayOff === true ? '나의 휴무' : undefined,
    getOtherDayOffCount(day) > 0 ? '상대방 휴무' : undefined,
  ].filter((label): label is string => Boolean(label));
  return labels.length > 0 ? labels.join(' · ') : '휴무 없음';
}

export function getUpcomingCommonDaysOff(
  days: TogetherCommonDayOff[],
  today: Date = new Date(),
) {
  const todayKey = formatLocalCalendarDate(today);
  return days
    .filter((day) => day.isCommonDayOff && day.localDate >= todayKey)
    .sort((left, right) => left.localDate.localeCompare(right.localDate))
    .slice(0, 3);
}
