import { getCalendarDateKind, getKoreanHoliday } from './koreanHolidays';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
assert(!getKoreanHoliday('2026-09-02'), 'ordinary weekday has no holiday name');
assert(getCalendarDateKind('2026-09-06') === 'sunday' && !getKoreanHoliday('2026-09-06'), 'Sunday alone has no holiday name');
assert(getKoreanHoliday('2026-08-15')?.name === '광복절', 'fixed holiday name');
assert(getKoreanHoliday('2026-05-05')?.name === '어린이날', 'children day name');
assert(getKoreanHoliday('2026-02-17')?.name === '설날', 'lunar new year');
assert(getKoreanHoliday('2026-02-16')?.name === '설날 연휴', 'lunar holiday period');
assert(getKoreanHoliday('2026-09-25')?.name === '추석', 'Chuseok');
assert(getKoreanHoliday('2026-09-24')?.name === '추석 연휴', 'Chuseok period');
assert(getKoreanHoliday('2026-05-25')?.name === '부처님오신날 대체공휴일', 'full substitute holiday name preserved');
assert(getKoreanHoliday('2026-06-03')?.name === '전국동시지방선거일', 'existing election record');
assert(getCalendarDateKind('2026-08-15') === 'holiday', 'existing holiday color classification unchanged');
assert(getCalendarDateKind('2026-09-05') === 'saturday', 'Saturday classification unchanged');
assert(!getKoreanHoliday('2027-08-15'), 'unsupported year must not invent holiday data');
console.log('Korean holiday fixtures passed');
