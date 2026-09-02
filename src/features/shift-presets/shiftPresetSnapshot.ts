import type { ShiftType } from '../shift-settings/mockData';
import { assertValidShiftPreset, type ShiftPreset } from './shiftPreset';

export function createShiftPresetSnapshot(input: { name: string; organizationName?: string; shiftTypes: ShiftType[]; pattern: string[] }): ShiftPreset {
  const name = input.name.trim();
  const organizationName = input.organizationName?.trim() || undefined;
  const sourceById = new Map(input.shiftTypes.map((shiftType) => [shiftType.id, shiftType]));
  const orderedIds = [...new Set(input.pattern)];
  if (!name || orderedIds.length === 0 || orderedIds.some((id) => !sourceById.has(id))) throw new Error('Invalid preset snapshot');
  const keyById = new Map(orderedIds.map((id, index) => [id, `shift-${index + 1}`]));
  const preset: ShiftPreset = {
    id: 'local-snapshot', version: 1, name, organizationName, source: 'mine',
    shiftTypes: orderedIds.map((id) => { const { id: _id, ...shiftType } = sourceById.get(id)!; return { ...shiftType, key: keyById.get(id)! }; }),
    pattern: input.pattern.map((id) => keyById.get(id)!),
  };
  assertValidShiftPreset(preset);
  return preset;
}
