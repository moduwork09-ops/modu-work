import { getShiftPatternHistoryEntryForDate, type ShiftScheduleInput } from './shiftSchedule';
import type { ShiftDateOverrides } from './shiftDateOverrideStorage';
import type { ShiftType } from '../shift-settings/mockData';
import type { ShiftPatternHistoryEntry } from './shiftSettingsStorage';

/** Presentation only: keep the complete shiftTypes array for storage and date calculations. */
export function selectActiveShiftTypes({ shiftTypes, shiftPattern, patternHistory, isSetupFlow = false }: {
  shiftTypes: ShiftType[];
  shiftPattern: string[];
  patternHistory: ShiftPatternHistoryEntry[];
  isSetupFlow?: boolean;
}): ShiftType[] {
  if (isSetupFlow) return shiftTypes;
  const latest = patternHistory.reduce<ShiftPatternHistoryEntry | undefined>(
    (selected, entry) => !selected || entry.effectiveFrom > selected.effectiveFrom ? entry : selected,
    undefined,
  );
  const pattern = latest?.pattern ?? shiftPattern;
  if (pattern.length === 0) return shiftTypes;
  const activeIds = new Set(pattern);
  return shiftTypes.filter((shiftType) => activeIds.has(shiftType.id));
}

/** Include unused additions, but hide types retained only for historical references. */
export function selectEditableShiftTypes(input: {
  shiftTypes: ShiftType[];
  shiftPattern: string[];
  patternHistory: ShiftPatternHistoryEntry[];
  shiftDateOverrides: ShiftDateOverrides;
}): ShiftType[] {
  const activeIds = new Set(selectActiveShiftTypes(input).map((type) => type.id));
  const referencedIds = new Set([
    ...input.shiftPattern,
    ...input.patternHistory.flatMap((entry) => entry.pattern),
    ...Object.values(input.shiftDateOverrides).map((override) => override.shiftTypeId),
  ]);
  // addShiftType uses custom-shift-<timestamp>; preset materialization uses preset-shift-<UUID>.
  // An unreferenced ID alone is not proof of a pending manual addition.
  return input.shiftTypes.filter((type) => activeIds.has(type.id)
    || (/^custom-shift-\d+$/.test(type.id) && !referencedIds.has(type.id)));
}

/** Date-detail candidates follow the same segment selection as the schedule calculator. */
export function selectShiftTypesForDate(date: string, schedule: ShiftScheduleInput): ShiftType[] {
  const entry = getShiftPatternHistoryEntryForDate(date, schedule.patternHistory);
  const ids = new Set(entry?.pattern ?? schedule.shiftPattern);
  return schedule.shiftTypes.filter((type) => ids.has(type.id));
}
