import type { ShiftKind, ShiftType } from '../shift-settings/mockData';
import { isValidTeamRotationTemplate, type TeamRotationTemplate } from '../shifts/teamRotation';

export const SHIFT_PRESET_VERSION = 1 as const;
export type ShiftPresetSource = 'builtin' | 'public' | 'mine' | 'shared';
export type PresetShiftType = Omit<ShiftType, 'id'> & { key: string };
export type PresetConditionalRule = { when: 'weekend' | 'koreanHoliday' | 'weekendOrHoliday'; baseShiftKey: string; resolvedShiftKey: string };
export type ShiftPreset = { id: string; version: typeof SHIFT_PRESET_VERSION; name: string; description?: string; category?: string; organizationName?: string; source: ShiftPresetSource; shiftTypes: PresetShiftType[]; pattern: string[]; initialPatternIndex?: number; teamRotationTemplate?: TeamRotationTemplate; teamPhaseFromOffset?: boolean; conditionalRules?: PresetConditionalRule[] };
export type MaterializedShiftPreset = { shiftTypes: ShiftType[]; pattern: string[]; conditionalRules?: { when: PresetConditionalRule['when']; baseShiftTypeId: string; resolvedShiftTypeId: string }[] };
export type ShiftTypeIdFactory = (presetKey: string, index: number) => string;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const PRESET_SOURCES: ShiftPresetSource[] = ['builtin', 'public', 'mine', 'shared'];
const SHIFT_KINDS: ShiftKind[] = ['work', 'rest'];

function isNonEmptyString(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function isValidOptionalString(value: unknown): value is string | undefined { return value === undefined || typeof value === 'string'; }

function assertValidPresetShiftType(value: unknown): asserts value is PresetShiftType {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid preset shift type');
  const shiftType = value as Record<string, unknown>;
  if (!isNonEmptyString(shiftType.key) || !isNonEmptyString(shiftType.abbreviation) || !isNonEmptyString(shiftType.name) || !isValidOptionalString(shiftType.note) || !SHIFT_KINDS.includes(shiftType.kind as ShiftKind) || !isNonEmptyString(shiftType.color) || !isNonEmptyString(shiftType.textColor)) throw new Error('Invalid preset shift type');
  const hasStartTime = shiftType.startTime !== undefined;
  const hasEndTime = shiftType.endTime !== undefined;
  if (hasStartTime !== hasEndTime) throw new Error('Invalid preset shift time');
  if (hasStartTime && (!TIME_PATTERN.test(String(shiftType.startTime)) || !TIME_PATTERN.test(String(shiftType.endTime)))) throw new Error('Invalid preset shift time');
  if (shiftType.kind === 'work' && !hasStartTime) throw new Error('Work preset shift requires time');
}

export function assertValidShiftPreset(value: unknown): asserts value is ShiftPreset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid shift preset');
  const preset = value as Record<string, unknown>;
  if (!isNonEmptyString(preset.id) || preset.version !== SHIFT_PRESET_VERSION || !isNonEmptyString(preset.name) || !isValidOptionalString(preset.description) || !isValidOptionalString(preset.category) || !isValidOptionalString(preset.organizationName) || !PRESET_SOURCES.includes(preset.source as ShiftPresetSource) || !Array.isArray(preset.shiftTypes) || preset.shiftTypes.length === 0 || !Array.isArray(preset.pattern) || preset.pattern.length === 0) throw new Error('Invalid shift preset');
  preset.shiftTypes.forEach(assertValidPresetShiftType);
  const keys = preset.shiftTypes.map((shiftType) => shiftType.key);
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate preset shift key');
  if (!preset.pattern.every((key) => isNonEmptyString(key) && keys.includes(key))) throw new Error('Unknown preset pattern key');
  const patternKeys = preset.pattern as string[];
  if (preset.initialPatternIndex !== undefined && (!Number.isInteger(preset.initialPatternIndex) || (preset.initialPatternIndex as number) < 0 || (preset.initialPatternIndex as number) >= patternKeys.length)) throw new Error('Invalid initial pattern index');
  if (preset.teamRotationTemplate !== undefined && !isValidTeamRotationTemplate(preset.teamRotationTemplate, preset.pattern.length)) throw new Error('Invalid team rotation template');
  if (preset.teamPhaseFromOffset !== undefined && (preset.teamPhaseFromOffset !== true || !preset.teamRotationTemplate)) throw new Error('Invalid team phase');
  if (preset.conditionalRules !== undefined && (!Array.isArray(preset.conditionalRules) || !preset.conditionalRules.every((rule) => rule && typeof rule === 'object' && ['weekend', 'koreanHoliday', 'weekendOrHoliday'].includes(rule.when) && keys.includes(rule.baseShiftKey) && keys.includes(rule.resolvedShiftKey) && patternKeys.includes(rule.baseShiftKey)))) throw new Error('Invalid preset conditional rules');
}

export function materializeShiftPreset(preset: ShiftPreset, createShiftTypeId: ShiftTypeIdFactory): MaterializedShiftPreset {
  assertValidShiftPreset(preset);
  const idByKey = new Map<string, string>();
  const generatedIds = new Set<string>();
  const presetKeys = new Set(preset.shiftTypes.map((shiftType) => shiftType.key));
  const shiftTypes = preset.shiftTypes.map(({ key, ...shiftType }, index) => {
    const id = createShiftTypeId(key, index);
    if (!isNonEmptyString(id) || presetKeys.has(id) || generatedIds.has(id)) throw new Error('Invalid generated shift type id');
    generatedIds.add(id);
    idByKey.set(key, id);
    return { ...shiftType, id };
  });
  const pattern = preset.pattern.map((key) => {
    const id = idByKey.get(key);
    if (!id) throw new Error('Unknown preset pattern key');
    return id;
  });
  const conditionalRules = preset.conditionalRules?.map((rule) => ({ when: rule.when, baseShiftTypeId: idByKey.get(rule.baseShiftKey)!, resolvedShiftTypeId: idByKey.get(rule.resolvedShiftKey)! }));
  return { shiftTypes, pattern, conditionalRules };
}
