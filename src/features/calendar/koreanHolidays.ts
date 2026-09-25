export type KoreanHoliday = {
  date: string;
  name: string;
};

const holidaysByYear: Record<number, KoreanHoliday[]> = {
  2026: [
    { date: '2026-01-01', name: '신정' },
    { date: '2026-02-16', name: '설날 연휴' },
    { date: '2026-02-17', name: '설날' },
    { date: '2026-02-18', name: '설날 연휴' },
    { date: '2026-03-01', name: '삼일절' },
    { date: '2026-03-02', name: '삼일절 대체공휴일' },
    { date: '2026-05-01', name: '노동절' },
    { date: '2026-05-05', name: '어린이날' },
    { date: '2026-05-24', name: '부처님오신날' },
    { date: '2026-05-25', name: '부처님오신날 대체공휴일' },
    { date: '2026-06-03', name: '전국동시지방선거일' },
    { date: '2026-06-06', name: '현충일' },
    { date: '2026-07-17', name: '제헌절' },
    { date: '2026-08-15', name: '광복절' },
    { date: '2026-08-17', name: '광복절 대체공휴일' },
    { date: '2026-09-24', name: '추석 연휴' },
    { date: '2026-09-25', name: '추석' },
    { date: '2026-09-26', name: '추석 연휴' },
    { date: '2026-10-03', name: '개천절' },
    { date: '2026-10-05', name: '개천절 대체공휴일' },
    { date: '2026-10-09', name: '한글날' },
    { date: '2026-12-25', name: '기독탄신일' },
  ],
  // 2027 월력요항 (including substitute holidays): https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=431
  // Complete holiday names/dates: https://astro.kasi.re.kr/life/post/calendardata
  2027: [
    { date: '2027-01-01', name: '신정' },
    { date: '2027-02-06', name: '설날 연휴' },
    { date: '2027-02-07', name: '설날' },
    { date: '2027-02-08', name: '설날 연휴' },
    { date: '2027-02-09', name: '설날 대체공휴일' },
    { date: '2027-03-01', name: '삼일절' },
    { date: '2027-05-01', name: '노동절' },
    { date: '2027-05-03', name: '노동절 대체공휴일' },
    { date: '2027-05-05', name: '어린이날' },
    { date: '2027-05-13', name: '부처님오신날' },
    { date: '2027-06-06', name: '현충일' },
    { date: '2027-07-17', name: '제헌절' },
    { date: '2027-07-19', name: '제헌절 대체공휴일' },
    { date: '2027-08-15', name: '광복절' },
    { date: '2027-08-16', name: '광복절 대체공휴일' },
    { date: '2027-09-14', name: '추석 연휴' },
    { date: '2027-09-15', name: '추석' },
    { date: '2027-09-16', name: '추석 연휴' },
    { date: '2027-10-03', name: '개천절' },
    { date: '2027-10-04', name: '개천절 대체공휴일' },
    { date: '2027-10-09', name: '한글날' },
    { date: '2027-10-11', name: '한글날 대체공휴일' },
    { date: '2027-12-25', name: '기독탄신일' },
    { date: '2027-12-27', name: '기독탄신일 대체공휴일' },
  ],
};

/** Distinguishes a verified non-holiday from a year with no authoritative data. */
export function getKoreanHolidayResolution(isoDate: string): { status: 'supported'; holiday: KoreanHoliday | null } | { status: 'unsupported' } {
  const year = Number.parseInt(isoDate.slice(0, 4), 10);
  const holidays = Object.prototype.hasOwnProperty.call(holidaysByYear, year) ? holidaysByYear[year] : undefined;
  return holidays ? { status: 'supported', holiday: holidays.find((holiday) => holiday.date === isoDate) ?? null } : { status: 'unsupported' };
}

export function getKoreanHoliday(isoDate: string) {
  const result = getKoreanHolidayResolution(isoDate);
  return result.status === 'supported' ? result.holiday ?? undefined : undefined;
}

export function isKoreanHoliday(isoDate: string) {
  return Boolean(getKoreanHoliday(isoDate));
}

export type CalendarDateKind = 'holiday' | 'sunday' | 'saturday' | 'weekday';

export function getCalendarDateKind(isoDate: string): CalendarDateKind {
  if (isKoreanHoliday(isoDate)) return 'holiday';
  const [year, month, day] = isoDate.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (weekday === 0) return 'sunday';
  if (weekday === 6) return 'saturday';
  return 'weekday';
}
