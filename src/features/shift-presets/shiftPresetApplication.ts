import type { ShiftDateOverrides } from '../shifts/shiftDateOverrideStorage';
import type { PersistedShiftSettings, ShiftPatternHistoryEntry } from '../shifts/shiftSettingsStorage';
import { materializeShiftPreset, type ShiftPreset, type ShiftTypeIdFactory } from './shiftPreset';
import { createTeamRotationMetadata, type TeamRotationMetadata } from '../shifts/teamRotation';

export type ShiftPresetApplicationState = PersistedShiftSettings & {
  shiftDateOverrides: ShiftDateOverrides;
};

export type ApplyShiftPresetInput = {
  preset: ShiftPreset;
  effectiveFrom: string;
  myTeamId?: string;
};

type CreateShiftPresetApplicationOptions = ApplyShiftPresetInput & {
  current: ShiftPresetApplicationState;
  createShiftTypeId: ShiftTypeIdFactory;
  createdAt: string;
};

type PersistShiftPresetApplicationOptions = CreateShiftPresetApplicationOptions & {
  persist: (settings: PersistedShiftSettings) => Promise<boolean>;
};

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function createShiftPresetApplication({
  current,
  preset,
  effectiveFrom,
  myTeamId,
  createShiftTypeId,
  createdAt,
}: CreateShiftPresetApplicationOptions): ShiftPresetApplicationState {
  if (!isIsoDate(effectiveFrom)) throw new Error('Invalid preset effective date');

  const materialized = materializeShiftPreset(preset, createShiftTypeId);
  let teamRotation: TeamRotationMetadata | undefined;
  if (preset.teamRotationTemplate) {
    const createdTeamRotation = createTeamRotationMetadata(preset.teamRotationTemplate, myTeamId ?? '', 'preset');
    if (!createdTeamRotation) throw new Error('A valid team selection is required');
    teamRotation = createdTeamRotation;
  }
  const existingIds = new Set(current.shiftTypes.map((shiftType) => shiftType.id));
  if (materialized.shiftTypes.some((shiftType) => existingIds.has(shiftType.id))) {
    throw new Error('Generated shift type id already exists');
  }

  const nextShiftTypes = [...current.shiftTypes, ...materialized.shiftTypes];
  const nextEntry: ShiftPatternHistoryEntry = {
    id: `shift-pattern-${effectiveFrom}`,
    effectiveFrom,
    pattern: materialized.pattern,
    anchorDate: effectiveFrom,
    anchorPatternIndex: preset.initialPatternIndex ?? 0,
    teamRotation,
    teamPhaseFromOffset: preset.teamPhaseFromOffset,
    presetCategory: preset.category,
    conditionalRules: materialized.conditionalRules,
    createdAt,
  };
  const nextPatternHistory = [
    ...current.patternHistory.filter((entry) => entry.effectiveFrom < effectiveFrom),
    nextEntry,
  ].sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
  const latestEntry = nextPatternHistory[nextPatternHistory.length - 1];

  return {
    version: current.version,
    isSetupComplete: true,
    shiftTypes: nextShiftTypes,
    shiftPattern: latestEntry.pattern,
    anchorDate: latestEntry.anchorDate,
    anchorPatternIndex: latestEntry.anchorPatternIndex,
    teamRotation: latestEntry.teamRotation,
    patternHistory: nextPatternHistory,
    shiftDateOverrides: current.shiftDateOverrides,
  };
}

export async function persistShiftPresetApplication(
  options: PersistShiftPresetApplicationOptions,
): Promise<ShiftPresetApplicationState | null> {
  const next = createShiftPresetApplication(options);
  const { shiftDateOverrides: _preservedOverrides, ...settings } = next;
  return await options.persist(settings) ? next : null;
}
