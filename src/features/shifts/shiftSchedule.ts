import type { ShiftType } from '../shift-settings/mockData';

export type ShiftScheduleInput = {
  shiftTypes: ShiftType[];
  shiftPattern: string[];
  anchorDate: string;
  anchorPatternIndex: number;
};

export type ComputedShiftDay = {
  day: number;
  date: string;
  shift: ShiftType;
};

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function toUtcTimestamp(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function toIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getPreviousIsoDate(isoDate: string) {
  const previousTimestamp = toUtcTimestamp(isoDate) - DAY_IN_MILLISECONDS;
  const previousDate = new Date(previousTimestamp);

  return toIsoDate(previousDate.getUTCFullYear(), previousDate.getUTCMonth() + 1, previousDate.getUTCDate());
}

export function getShiftTypeByAbbreviation(shiftTypes: ShiftType[], abbreviation: string) {
  return shiftTypes.find((shiftType) => shiftType.abbreviation === abbreviation) ?? shiftTypes[0];
}

export function getPatternIndexForDate(date: string, configuration: ShiftScheduleInput) {
  const { anchorDate, anchorPatternIndex, shiftPattern } = configuration;
  const dateDifference = Math.round((toUtcTimestamp(date) - toUtcTimestamp(anchorDate)) / DAY_IN_MILLISECONDS);
  const rawIndex = dateDifference + anchorPatternIndex;

  return ((rawIndex % shiftPattern.length) + shiftPattern.length) % shiftPattern.length;
}

export function getShiftForDate(date: string, configuration: ShiftScheduleInput) {
  const patternIndex = getPatternIndexForDate(date, configuration);
  return getShiftTypeByAbbreviation(configuration.shiftTypes, configuration.shiftPattern[patternIndex]);
}

export function createMonthlyShiftSchedule(year: number, month: number, configuration: ShiftScheduleInput): ComputedShiftDay[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = toIsoDate(year, month, day);

    return { day, date, shift: getShiftForDate(date, configuration) };
  });
}
