import { assertValidShiftPreset, type ShiftPreset } from './shiftPreset';

/** The existing JSONB RPC accepts extra fields; keep the calculation metadata in its payload. */
export function serializeShiftPresetPayload(preset: ShiftPreset) {
  assertValidShiftPreset(preset);
  return {
    shiftTypes: preset.shiftTypes,
    pattern: preset.pattern,
    ...(preset.description === undefined ? {} : { description: preset.description }),
    ...(preset.category === undefined ? {} : { category: preset.category }),
    ...(preset.initialPatternIndex === undefined ? {} : { initialPatternIndex: preset.initialPatternIndex }),
    ...(preset.teamRotationTemplate === undefined ? {} : { teamRotationTemplate: preset.teamRotationTemplate }),
    ...(preset.teamPhaseFromOffset === undefined ? {} : { teamPhaseFromOffset: preset.teamPhaseFromOffset }),
    ...(preset.conditionalRules === undefined ? {} : { conditionalRules: preset.conditionalRules }),
  };
}

export function parseShiftPresetPayloadRow(value: unknown, source: ShiftPreset['source']): ShiftPreset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid preset row');
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.name !== 'string' || (row.organization_name !== null && row.organization_name !== undefined && typeof row.organization_name !== 'string') || !row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) throw new Error('Invalid preset row');
  const preset: unknown = { ...(row.payload as object), id: row.id, version: 1, name: row.name, organizationName: row.organization_name ?? undefined, source };
  assertValidShiftPreset(preset);
  return preset;
}
