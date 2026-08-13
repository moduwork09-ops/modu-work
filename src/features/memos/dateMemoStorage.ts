import AsyncStorage from '@react-native-async-storage/async-storage';

export const DATE_MEMOS_STORAGE_KEY = 'modu-work.date-memos.v1';
export const DATE_MEMOS_STORAGE_VERSION = 1;

export type DateMemos = Record<string, string>;

type PersistedDateMemos = {
  version: typeof DATE_MEMOS_STORAGE_VERSION;
  memos: DateMemos;
};

function isLocalCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parsePersistedDateMemos(value: string): DateMemos | null {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const stored = parsed as Record<string, unknown>;

    if (stored.version !== DATE_MEMOS_STORAGE_VERSION || !stored.memos || typeof stored.memos !== 'object' || Array.isArray(stored.memos)) {
      return null;
    }

    const entries = Object.entries(stored.memos);

    if (!entries.every(([date, text]) => isLocalCalendarDate(date) && typeof text === 'string' && text.trim().length > 0)) {
      return null;
    }

    return Object.fromEntries(entries);
  } catch {
    return null;
  }
}

export async function loadDateMemos() {
  try {
    const storedValue = await AsyncStorage.getItem(DATE_MEMOS_STORAGE_KEY);

    if (!storedValue) {
      return {};
    }

    const memos = parsePersistedDateMemos(storedValue);

    if (!memos) {
      console.warn('Saved date memos are invalid. Using empty memos instead.');
    }

    return memos ?? {};
  } catch (error) {
    console.warn('Unable to load date memos. Using empty memos instead.', error);
    return {};
  }
}

export async function persistDateMemos(memos: DateMemos) {
  const data: PersistedDateMemos = {
    version: DATE_MEMOS_STORAGE_VERSION,
    memos,
  };

  try {
    await AsyncStorage.setItem(DATE_MEMOS_STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.warn('Unable to save date memos.', error);
    return false;
  }
}
