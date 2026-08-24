import { addLocalCalendarDays, formatLocalCalendarDate } from './dayOffProjection';
import type { TogetherMember, TogetherCommonDayOff } from './togetherServerData';
import type { TogetherSpace } from './types';

export type TogetherHomeMember = TogetherMember & {
  displayLabel: string;
  initial: string;
  isMe: boolean;
};

export function chooseTogetherHomeSpace(spaces: TogetherSpace[], selectedSpaceId?: string) {
  return spaces.find((space) => space.id === selectedSpaceId) ?? spaces[0];
}

export function getTogetherHomeMembers(members: TogetherMember[], userId?: string): TogetherHomeMember[] {
  return members
    .filter((member) => member.status === 'active')
    .map((member) => {
      const isMe = member.userId === userId;
      const displayName = member.displayName?.trim();
      const displayLabel = displayName || (isMe ? '나' : '이름 미설정');
      return {
        ...member,
        displayLabel,
        initial: displayName?.slice(0, 1) || (isMe ? '나' : '?'),
        isMe,
      };
    });
}

export function getCurrentLocalWeekRange(today: Date = new Date()) {
  const todayKey = formatLocalCalendarDate(today);
  const from = addLocalCalendarDays(todayKey, -today.getDay());
  return { from, to: addLocalCalendarDays(from, 6) };
}

export function getWeeklyCommonDaysOff(days: TogetherCommonDayOff[]) {
  return days.filter((day) => day.isCommonDayOff).slice(0, 3);
}
