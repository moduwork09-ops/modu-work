import { getCalendarDateKind } from '../calendar/koreanHolidays';
import type { PersonalEvent } from '../events/personalEventStorage';
import type { DateMemos } from '../memos/dateMemoStorage';
import { getShiftForDate, type ShiftScheduleInput } from '../shifts/shiftSchedule';

export type MonthlyWidgetItem = {
  text: string;
  color: string;
  type: 'memo' | 'event';
};

export type MonthlyWidgetCell = {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  dateKind: ReturnType<typeof getCalendarDateKind>;
  shift: {
    abbreviation: string;
    backgroundColor: string;
    textColor: string;
  };
  items: MonthlyWidgetItem[];
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
};

const EVENT_COLOR = '#D7DCE2';

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
    const memos = (schedule.dateMemos[date] ?? []).map((memo) => ({ text: memo.text, color: memo.color, type: 'memo' as const }));
    const events = schedule.personalEvents
      .filter((event) => event.date === date)
      .sort((left, right) => (left.startTime ?? '').localeCompare(right.startTime ?? ''))
      .map((event) => ({ text: event.title, color: EVENT_COLOR, type: 'event' as const }));

    return {
      date,
      day: dateValue.getUTCDate(),
      inMonth: dateValue.getUTCFullYear() === year && dateValue.getUTCMonth() + 1 === month,
      isToday: date === today,
      dateKind: getCalendarDateKind(date),
      shift: {
        abbreviation: shift.abbreviation,
        backgroundColor: shift.color,
        textColor: shift.textColor,
      },
      items: [...memos, ...events],
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
