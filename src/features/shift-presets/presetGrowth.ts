import type { ShiftPreset } from './shiftPreset';

export function normalizePresetRequestQuery(value: string) {
  const displayQuery = value.trim().replace(/\s+/g, ' ');
  if (!displayQuery || value.length > 100 || displayQuery.length > 80) throw new Error('Search query must be 1–80 characters');
  return { displayQuery, normalizedQuery: displayQuery.toLowerCase() };
}

/** The candidate opt-in path only sends calculation data and explicit public metadata. */
export function createCandidateSafePreset(preset: ShiftPreset): ShiftPreset {
  return {
    ...preset,
    description: undefined,
    shiftTypes: preset.shiftTypes.map(({ note: _note, ...shiftType }) => shiftType),
  };
}
