import { getShiftForDate } from '../shifts/shiftSchedule';
import { createShiftPresetApplication, type ShiftPresetApplicationState } from './shiftPresetApplication';
import { assertValidShiftPreset, type ShiftPreset } from './shiftPreset';

export function cloneShiftPreset(preset: ShiftPreset): ShiftPreset {
  assertValidShiftPreset(preset);
  return JSON.parse(JSON.stringify(preset)) as ShiftPreset;
}

export function parseShiftPresetDraft(value: string, expectedSource: string, expectedId?: string): ShiftPreset {
  const parsed: unknown = JSON.parse(value);
  assertValidShiftPreset(parsed);
  if (parsed.source !== expectedSource || (expectedId !== undefined && parsed.id !== expectedId)) {
    throw new Error('Preset draft does not match the selected preset');
  }
  return parsed;
}

export type ShiftPresetPreviewDay = { date: string; weekday: number; shiftName: string; abbreviation: string; shiftTypeId: string; color: string; textColor: string };

export function createShiftPresetPreview(preset: ShiftPreset, effectiveFrom: string, myTeamId?: string): ShiftPresetPreviewDay[] {
  const empty: ShiftPresetApplicationState = {
    version: 2, isSetupComplete: false, shiftTypes: [], shiftPattern: [], anchorDate: effectiveFrom,
    anchorPatternIndex: 0, patternHistory: [], shiftDateOverrides: {},
  };
  const reservedKeys = new Set(preset.shiftTypes.map((item) => item.key));
  const applied = createShiftPresetApplication({ current: empty, preset, effectiveFrom, myTeamId, createdAt: `${effectiveFrom}T00:00:00.000Z`, createShiftTypeId: (_key, index) => {
    let id = `preview-generated-${index}`;
    while (reservedKeys.has(id)) id = `_${id}`;
    return id;
  } });
  const [year, month, day] = effectiveFrom.split('-').map(Number);
  return Array.from({ length: 14 }, (_, offset) => {
    const current = new Date(Date.UTC(year, month - 1, day + offset));
    const date = current.toISOString().slice(0, 10);
    const shift = getShiftForDate(date, applied);
    return { date, weekday: current.getUTCDay(), shiftName: shift.name, abbreviation: shift.abbreviation, shiftTypeId: shift.id, color: shift.color, textColor: shift.textColor };
  });
}
