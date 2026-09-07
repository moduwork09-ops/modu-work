import { getCalendarDateKind, getKoreanHoliday } from '../calendar/koreanHolidays';
import type { PersonalEvent } from '../events/personalEventStorage';
import type { DateMemos } from '../memos/dateMemoStorage';
import type { SharedEventCalendarItem } from '../together/sharedEventCalendarPresentation';
import { getShiftForDate, type ShiftScheduleInput } from '../shifts/shiftSchedule';
import { createMonthlyWidgetInfoRows, type MonthlyWidgetInfoRow } from './monthlyWidgetPresentation';

export type MonthlyWidgetCell = {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  dateKind: ReturnType<typeof getCalendarDateKind>;
  holidayName: string | null;
  shift: {
    abbreviation: string;
    name: string;
    kind: 'work' | 'rest';
    startTime: string | null;
    endTime: string | null;
    backgroundColor: string;
    textColor: string;
  };
  infoRows: MonthlyWidgetInfoRow[];
};

export type MonthlyWidgetSnapshot = {
  version: 1;
  generatedAt: string;
  months: Array<{
    offset: number;
    year: number;
    month: number;
    label: string;
    cells: MonthlyWidgetCell[];
  }>;
};

type WidgetSchedule = ShiftScheduleInput & {
  dateMemos: DateMemos;
  personalEvents: PersonalEvent[];
  sharedEvents?: SharedEventCalendarItem[];
};

function toIsoDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function createMonthCells(year: number, month: number, today: string, schedule: WidgetSchedule) {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - firstWeekday));

  return Array.from({ length: 42 }, (_, index): MonthlyWidgetCell => {
    const dateValue = new Date(gridStart.getTime() + index * 24 * 60 * 60 * 1000);
    const date = toIsoDate(dateValue);
    const shift = getShiftForDate(date, schedule);

    return {
      date,
      day: dateValue.getUTCDate(),
      inMonth: dateValue.getUTCFullYear() === year && dateValue.getUTCMonth() + 1 === month,
      isToday: date === today,
      dateKind: getCalendarDateKind(date),
      holidayName: getKoreanHoliday(date)?.name ?? null,
      shift: {
        abbreviation: shift.abbreviation,
        name: shift.name,
        kind: shift.kind,
        startTime: shift.startTime ?? null,
        endTime: shift.endTime ?? null,
        backgroundColor: shift.color,
        textColor: shift.textColor,
      },
      infoRows: dateValue.getUTCFullYear() === year && dateValue.getUTCMonth() + 1 === month
        ? createMonthlyWidgetInfoRows(schedule.personalEvents.filter((event) => event.date === date), schedule.dateMemos[date] ?? [], (schedule.sharedEvents ?? []).filter((event) => event.localDate === date))
        : [],
    };
  });
}

export function createMonthlyWidgetSnapshot(schedule: WidgetSchedule, now = new Date()): MonthlyWidgetSnapshot {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return {
    version: 1,
    generatedAt: now.toISOString(),
    months: Array.from({ length: 25 }, (_, index) => {
      const offset = index - 12;
      const date = new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset, 1));
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      return {
        offset,
        year,
        month,
        label: `${year}년 ${month}월`,
        cells: createMonthCells(year, month, today, schedule),
      };
    }),
  };
}

export function createEmptyMonthlyWidgetSnapshot(): MonthlyWidgetSnapshot {
  return { version: 1, generatedAt: new Date().toISOString(), months: [] };
}
