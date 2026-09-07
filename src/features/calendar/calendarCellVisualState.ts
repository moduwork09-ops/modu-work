export const CALENDAR_SELECTION_BACKGROUND = '#F5F9FF';

export type CalendarCellVisualState = 'selected' | 'today' | 'default';

export function getCalendarCellVisualState(date: string, today: string, selectedDate: string): CalendarCellVisualState {
  if (date === selectedDate) return 'selected';
  if (date === today) return 'today';
  return 'default';
}
