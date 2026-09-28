import { getCalendarDateKind, getKoreanHoliday } from './koreanHolidays';

export function getMemberShiftCalendarDatePresentation(date: string) {
  return { dateKind: getCalendarDateKind(date), holidayName: getKoreanHoliday(date)?.name ?? null };
}
