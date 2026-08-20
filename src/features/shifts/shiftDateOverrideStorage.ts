import AsyncStorage from '@react-native-async-storage/async-storage';

export const SHIFT_DATE_OVERRIDES_STORAGE_KEY = 'modu-work.shift-overrides.v1';
export const SHIFT_DATE_OVERRIDES_STORAGE_VERSION = 1;

export type ShiftDateOverride = {
  date: string;
  shiftTypeId: string;
  createdAt: string;
  updatedAt: string;
};

export type ShiftDateOverrides = Record<string, ShiftDateOverride>;

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseShiftDateOverrides(value: string): ShiftDateOverrides | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const stored = parsed as Record<string, unknown>;
    if (stored.version !== SHIFT_DATE_OVERRIDES_STORAGE_VERSION || !stored.overrides || typeof stored.overrides !== 'object' || Array.isArray(stored.overrides)) return null;
    const entries = Object.entries(stored.overrides as Record<string, unknown>);
    if (!entries.every(([date, value]) => {
      if (!isIsoDate(date) || !value || typeof value !== 'object') return false;
      const item = value as Record<string, unknown>;
      return item.date === date
        && typeof item.shiftTypeId === 'string'
        && item.shiftTypeId.length > 0
        && typeof item.createdAt === 'string'
        && Number.isFinite(Date.parse(item.createdAt))
        && typeof item.updatedAt === 'string'
        && Number.isFinite(Date.parse(item.updatedAt));
    })) return null;
    return stored.overrides as ShiftDateOverrides;
  } catch {
    return null;
  }
}

export async function loadShiftDateOverrides() {
  try {
    const value = await AsyncStorage.getItem(SHIFT_DATE_OVERRIDES_STORAGE_KEY);
    return value ? parseShiftDateOverrides(value) ?? {} : {};
  } catch (error) {
    console.warn('Unable to load shift date overrides.', error);
    return {};
  }
}

export async function persistShiftDateOverrides(overrides: ShiftDateOverrides) {
  try {
    await AsyncStorage.setItem(SHIFT_DATE_OVERRIDES_STORAGE_KEY, JSON.stringify({ version: SHIFT_DATE_OVERRIDES_STORAGE_VERSION, overrides }));
    return true;
  } catch (error) {
    console.warn('Unable to save shift date overrides.', error);
    return false;
  }
}
