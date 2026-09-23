import type { PersonalEvent } from '../events/personalEventStorage';
import type { CalendarDisplaySettings } from './calendarDisplaySettings';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export function getCalendarWeekdays(start: 0 | 1) { return [...WEEKDAYS.slice(start), ...WEEKDAYS.slice(0, start)]; }
export function createCalendarMonthGrid<T>(year: number, month: number, days: T[], start: 0 | 1): (T | null)[] {
  const leading = (new Date(year, month - 1, 1, 12).getDay() - start + 7) % 7;
  return [...Array<null>(leading).fill(null), ...days, ...Array<null>(42 - leading - days.length).fill(null)];
}
export type CalendarItemCategory = 'personalEvent' | 'sharedEvent' | 'overtime';
export function selectMonthlyCalendarItems<T extends { category: CalendarItemCategory }>(items: T[], settings: CalendarDisplaySettings) {
  const enabled = items.filter(item => item.category === 'personalEvent' ? settings.showPersonalEvents
    : item.category === 'sharedEvent' ? settings.showSharedEvents : settings.showOvertime);
  return { visible: enabled.slice(0, 4), remainingCount: Math.max(0, enabled.length - 4) };
}

/** Legacy Together events share personal-events storage; their kind identifies them. */
export function getCalendarEventCategory(event: Pick<PersonalEvent, 'kind'>): 'personalEvent' | 'sharedEvent' {
  return event.kind === 'shared' ? 'sharedEvent' : 'personalEvent';
}

export function formatMonthlyCalendarEventTitle(title: string, startTime: string | null, showTime: boolean) {
  return showTime && startTime ? `${startTime.slice(0, 2)} ${title}` : title;
}
