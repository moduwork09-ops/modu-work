import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ShiftType } from '../shift-settings/mockData';

export const SHIFT_SETTINGS_STORAGE_KEY = 'modu-work.shift-settings.v1';
export const SHIFT_SETTINGS_STORAGE_VERSION = 1;

export type PersistedShiftSettings = {
  version: typeof SHIFT_SETTINGS_STORAGE_VERSION;
  shiftTypes: ShiftType[];
  shiftPattern: string[];
  anchorDate: string;
  anchorPatternIndex: number;
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

export function parsePersistedShiftSettings(value: string): PersistedShiftSettings | null {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const settings = parsed as Record<string, unknown>;
    const anchorPatternIndex = settings.anchorPatternIndex;

    if (settings.version !== SHIFT_SETTINGS_STORAGE_VERSION
      || !Array.isArray(settings.shiftTypes)
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

    const shiftTypes = settings.shiftTypes as ShiftType[];
    const shiftPattern = normalizePatternIds(settings.shiftPattern, shiftTypes);

    if (!shiftPattern.every((id) => shiftTypes.some((shiftType) => shiftType.id === id))) {
      return null;
    }

    return {
      version: SHIFT_SETTINGS_STORAGE_VERSION,
      shiftTypes,
      shiftPattern,
      anchorDate: settings.anchorDate,
      anchorPatternIndex,
    };
  } catch {
    return null;
  }
}

export async function loadPersistedShiftSettings() {
  try {
    const storedValue = await AsyncStorage.getItem(SHIFT_SETTINGS_STORAGE_KEY);

    if (!storedValue) {
      return null;
    }

    const settings = parsePersistedShiftSettings(storedValue);

    if (!settings) {
      console.warn('Saved shift settings are invalid. Using default settings instead.');
    }

    return settings;
  } catch (error) {
    console.warn('Unable to load saved shift settings. Using default settings instead.', error);
    return null;
  }
}

export async function persistShiftSettings(settings: PersistedShiftSettings) {
  try {
    await AsyncStorage.setItem(SHIFT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    console.warn('Unable to save shift settings.', error);
    return false;
  }
}
