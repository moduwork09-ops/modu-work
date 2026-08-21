import type { ShiftType } from '../shift-settings/mockData';
import { readUserScopedStorageValue, writeUserScopedStorageValue } from '../storage/userScopedStorage';

export const SHIFT_SETTINGS_STORAGE_KEY = 'modu-work.shift-settings.v1';
export const SHIFT_SETTINGS_STORAGE_VERSION = 2;

export type ShiftPatternHistoryEntry = {
  id: string;
  effectiveFrom: string;
  pattern: string[];
  anchorDate: string;
  anchorPatternIndex: number;
  createdAt: string;
};

export type PersistedShiftSettingsV1 = {
  version: 1;
  isSetupComplete: boolean;
  shiftTypes: ShiftType[];
  shiftPattern: string[];
  anchorDate: string;
  anchorPatternIndex: number;
};

export type PersistedShiftSettings = Omit<PersistedShiftSettingsV1, 'version'> & {
  version: typeof SHIFT_SETTINGS_STORAGE_VERSION;
  patternHistory: ShiftPatternHistoryEntry[];
};

function isShiftType(value: unknown): value is ShiftType {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const shiftType = value as Record<string, unknown>;
  const hasValidOptionalTime = (time: unknown) => time === undefined || typeof time === 'string';

  return typeof shiftType.id === 'string'
    && typeof shiftType.abbreviation === 'string'
    && typeof shiftType.name === 'string'
    && (shiftType.note === undefined || typeof shiftType.note === 'string')
    && (shiftType.kind === 'work' || shiftType.kind === 'rest')
    && typeof shiftType.color === 'string'
    && typeof shiftType.textColor === 'string'
    && hasValidOptionalTime(shiftType.startTime)
    && hasValidOptionalTime(shiftType.endTime);
}

function normalizePatternIds(pattern: string[], shiftTypes: ShiftType[]) {
  return pattern.map((item) => shiftTypes.find((shiftType) => shiftType.id === item)?.id
    ?? shiftTypes.find((shiftType) => shiftType.abbreviation === item)?.id
    ?? item);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseBaseSettings(settings: Record<string, unknown>) {
    const anchorPatternIndex = settings.anchorPatternIndex;

    if (!Array.isArray(settings.shiftTypes)
      || settings.shiftTypes.length === 0
      || !settings.shiftTypes.every(isShiftType)
      || !Array.isArray(settings.shiftPattern)
      || settings.shiftPattern.length === 0
      || !settings.shiftPattern.every((item) => typeof item === 'string')
      || !isIsoDate(settings.anchorDate)
      || typeof anchorPatternIndex !== 'number'
      || !Number.isInteger(anchorPatternIndex)
      || anchorPatternIndex < 0
      || anchorPatternIndex >= settings.shiftPattern.length) {
      return null;
    }

    const shiftTypes = (settings.shiftTypes as ShiftType[]).map((shiftType) => shiftType.id === 'shift-day' && shiftType.color.toUpperCase() === '#F6C344'
      ? { ...shiftType, color: '#FFF640', textColor: '#5C4100' }
      : shiftType);
    const shiftPattern = normalizePatternIds(settings.shiftPattern, shiftTypes);

    if (!shiftPattern.every((id) => shiftTypes.some((shiftType) => shiftType.id === id))) {
      return null;
    }

    return {
      isSetupComplete: settings.isSetupComplete !== false,
      shiftTypes,
      shiftPattern,
      anchorDate: settings.anchorDate,
      anchorPatternIndex,
    };
}

function normalizeHistoryEntry(value: unknown, shiftTypes: ShiftType[]): ShiftPatternHistoryEntry | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== 'string' || !entry.id
    || !isIsoDate(entry.effectiveFrom)
    || !Array.isArray(entry.pattern) || entry.pattern.length === 0
    || !entry.pattern.every((item) => typeof item === 'string')
    || !isIsoDate(entry.anchorDate)
    || typeof entry.anchorPatternIndex !== 'number'
    || !Number.isInteger(entry.anchorPatternIndex)
    || entry.anchorPatternIndex < 0
    || entry.anchorPatternIndex >= entry.pattern.length
    || typeof entry.createdAt !== 'string') return null;

  const pattern = normalizePatternIds(entry.pattern, shiftTypes);
  if (!pattern.every((id) => shiftTypes.some((shiftType) => shiftType.id === id))) return null;

  return { id: entry.id, effectiveFrom: entry.effectiveFrom, pattern, anchorDate: entry.anchorDate, anchorPatternIndex: entry.anchorPatternIndex, createdAt: entry.createdAt };
}

export function parsePersistedShiftSettings(value: string): PersistedShiftSettings | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const settings = parsed as Record<string, unknown>;
    const base = parseBaseSettings(settings);
    if (!base) return null;

    if (settings.version === 1) {
      return {
        version: SHIFT_SETTINGS_STORAGE_VERSION,
        ...base,
        patternHistory: [{
          id: `migrated-${base.anchorDate}`,
          effectiveFrom: base.anchorDate,
          pattern: base.shiftPattern,
          anchorDate: base.anchorDate,
          anchorPatternIndex: base.anchorPatternIndex,
          createdAt: new Date().toISOString(),
        }],
      };
    }

    if (settings.version !== SHIFT_SETTINGS_STORAGE_VERSION || !Array.isArray(settings.patternHistory)) return null;
    const patternHistory = settings.patternHistory.map((entry) => normalizeHistoryEntry(entry, base.shiftTypes));
    if (patternHistory.some((entry) => entry === null)) return null;

    return { version: SHIFT_SETTINGS_STORAGE_VERSION, ...base, patternHistory: patternHistory as ShiftPatternHistoryEntry[] };
  } catch {
    return null;
  }
}

export async function loadPersistedShiftSettings() {
  try {
    const storedValue = await readUserScopedStorageValue(SHIFT_SETTINGS_STORAGE_KEY);

    if (!storedValue) {
      return null;
    }

    const settings = parsePersistedShiftSettings(storedValue);

    if (!settings) {
      console.warn('Saved shift settings are invalid. Using default settings instead.');
    }

    if (settings && JSON.parse(storedValue).version === 1) {
      await persistShiftSettings(settings);
    }

    return settings;
  } catch (error) {
    console.warn('Unable to load saved shift settings. Using default settings instead.', error);
    return null;
  }
}

export async function persistShiftSettings(settings: PersistedShiftSettings) {
  try {
    await writeUserScopedStorageValue(SHIFT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    console.warn('Unable to save shift settings.', error);
    return false;
  }
}
