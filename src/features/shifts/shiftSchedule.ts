import type { ShiftType } from '../shift-settings/mockData';
import type { ShiftPatternHistoryEntry } from './shiftSettingsStorage';
import type { ShiftDateOverrides } from './shiftDateOverrideStorage';
import type { TeamRotationMetadata } from './teamRotation';

export type ShiftScheduleInput = {
  shiftTypes: ShiftType[];
  shiftPattern: string[];
  anchorDate: string;
  anchorPatternIndex: number;
  patternHistory?: ShiftPatternHistoryEntry[];
  shiftDateOverrides?: ShiftDateOverrides;
  teamRotation?: TeamRotationMetadata;
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

export function getShiftTypeById(shiftTypes: ShiftType[], id: string) {
  return shiftTypes.find((shiftType) => shiftType.id === id) ?? shiftTypes[0];
}

export function getPatternIndexForDate(date: string, configuration: ShiftScheduleInput) {
  const entry = getShiftPatternHistoryEntryForDate(date, configuration.patternHistory);
  const { anchorDate, anchorPatternIndex, shiftPattern } = entry
    ? { anchorDate: entry.anchorDate, anchorPatternIndex: entry.anchorPatternIndex, shiftPattern: entry.pattern }
    : configuration;
  const dateDifference = Math.round((toUtcTimestamp(date) - toUtcTimestamp(anchorDate)) / DAY_IN_MILLISECONDS);
  const rawIndex = dateDifference + anchorPatternIndex;

  return ((rawIndex % shiftPattern.length) + shiftPattern.length) % shiftPattern.length;
}

export function getShiftPatternHistoryEntryForDate(date: string, history?: ShiftPatternHistoryEntry[]) {
  return history
    ?.filter((entry) => entry.effectiveFrom <= date)
    .reduce<ShiftPatternHistoryEntry | undefined>((latest, entry) => !latest || entry.effectiveFrom > latest.effectiveFrom ? entry : latest, undefined);
}

export function getShiftForDate(date: string, configuration: ShiftScheduleInput) {
  const override = configuration.shiftDateOverrides?.[date];
  if (override) return getShiftTypeById(configuration.shiftTypes, override.shiftTypeId);
  return getPatternShiftForDate(date, configuration);
}

export function getPatternShiftForDate(date: string, configuration: ShiftScheduleInput) {
  const entry = getShiftPatternHistoryEntryForDate(date, configuration.patternHistory);
  const patternIndex = getPatternIndexForDate(date, configuration);
  return getShiftTypeById(configuration.shiftTypes, (entry?.pattern ?? configuration.shiftPattern)[patternIndex]);
}

export function createMonthlyShiftSchedule(year: number, month: number, configuration: ShiftScheduleInput): ComputedShiftDay[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = toIsoDate(year, month, day);

    return { day, date, shift: getShiftForDate(date, configuration) };
  });
}
