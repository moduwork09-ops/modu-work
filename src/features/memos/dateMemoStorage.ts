import { readUserScopedStorageValue, writeUserScopedStorageValue } from '../storage/userScopedStorage';
import { DEFAULT_MEMO_COLOR } from './memoPresentation';

export const DATE_MEMOS_STORAGE_KEY = 'modu-work.date-memos.v1';
export const DATE_MEMOS_STORAGE_VERSION = 1;
export { DEFAULT_MEMO_COLOR } from './memoPresentation';

export type DateMemo = {
  id: string;
  text: string;
  color: string;
  timeEnabled: boolean;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  reminderMinutes: 0 | 5 | 10 | 30 | 60 | null;
  notificationId: string | null;
};

export type DateMemoTiming = Pick<DateMemo, 'timeEnabled' | 'allDay' | 'startTime' | 'endTime'>;

export type DateMemos = Record<string, DateMemo[]>;

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

function isStoredMemo(value: unknown) {
  if (typeof value === 'string') return value.trim().length > 0;
  if (!value || typeof value !== 'object') return false;
  const memo = value as Record<string, unknown>;
  const hasValidTime = (time: unknown) => time === null || (typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
  const timingFieldsAreValid = (memo.timeEnabled === undefined || typeof memo.timeEnabled === 'boolean')
    && (memo.allDay === undefined || typeof memo.allDay === 'boolean')
    && (memo.startTime === undefined || hasValidTime(memo.startTime))
    && (memo.endTime === undefined || hasValidTime(memo.endTime));
  const reminderIsValid = memo.reminderMinutes === undefined || memo.reminderMinutes === null || [0, 5, 10, 30, 60].includes(memo.reminderMinutes as number);
  const identityFieldsAreValid = (memo.id === undefined || (typeof memo.id === 'string' && memo.id.length > 0))
    && (memo.notificationId === undefined || memo.notificationId === null || typeof memo.notificationId === 'string');

  if (!timingFieldsAreValid || !reminderIsValid || !identityFieldsAreValid) return false;
  if (memo.timeEnabled === true && memo.allDay !== true) {
    if (typeof memo.startTime !== 'string' || typeof memo.endTime !== 'string' || memo.startTime >= memo.endTime) return false;
  }

  return typeof memo.text === 'string'
    && memo.text.trim().length > 0
    && (memo.color === undefined || (typeof memo.color === 'string' && /^#[0-9A-F]{6}$/i.test(memo.color)));
}

function normalizeMemo(date: string, value: unknown, index: number): DateMemo {
  if (typeof value === 'string') {
    return { id: `date-memo-${date}-${index}`, text: value, color: DEFAULT_MEMO_COLOR, timeEnabled: false, allDay: false, startTime: null, endTime: null, reminderMinutes: null, notificationId: null };
  }
  const storedMemo = value as Partial<DateMemo> & Pick<DateMemo, 'text'>;
  const timeEnabled = storedMemo.timeEnabled === true;
  const allDay = timeEnabled && storedMemo.allDay === true;
  return {
    id: typeof storedMemo.id === 'string' && storedMemo.id ? storedMemo.id : `date-memo-${date}-${index}`,
    text: storedMemo.text,
    color: storedMemo.color || DEFAULT_MEMO_COLOR,
    timeEnabled,
    allDay,
    startTime: timeEnabled && !allDay ? storedMemo.startTime ?? null : null,
    endTime: timeEnabled && !allDay ? storedMemo.endTime ?? null : null,
    reminderMinutes: timeEnabled && !allDay && [0, 5, 10, 30, 60].includes(storedMemo.reminderMinutes as number) ? storedMemo.reminderMinutes ?? null : null,
    notificationId: typeof storedMemo.notificationId === 'string' ? storedMemo.notificationId : null,
  };
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

    if (!entries.every(([date, memos]) => isLocalCalendarDate(date) && (Array.isArray(memos) ? memos.length > 0 && memos.every(isStoredMemo) : isStoredMemo(memos)))) {
      return null;
    }

    const normalized = Object.fromEntries(entries.map(([date, memos]) => [date, (Array.isArray(memos) ? memos : [memos]).map((memo, index) => normalizeMemo(date, memo, index))]));
    if (Object.values(normalized).some((memos) => new Set(memos.map((memo) => memo.id)).size !== memos.length)) return null;
    return normalized;
  } catch {
    return null;
  }
}

export type DateMemosLoadResult =
  | { status: 'ready'; value: DateMemos }
  | { status: 'error' };

export async function loadDateMemosResult(): Promise<DateMemosLoadResult> {
  try {
    const storedValue = await readUserScopedStorageValue(DATE_MEMOS_STORAGE_KEY);
    if (storedValue === null) return { status: 'ready', value: {} };
    const memos = parsePersistedDateMemos(storedValue);
    return memos ? { status: 'ready', value: memos } : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

export async function loadDateMemos() {
  const result = await loadDateMemosResult();
  return result.status === 'ready' ? result.value : {};
}

export async function persistDateMemos(memos: DateMemos) {
  const data: PersistedDateMemos = {
    version: DATE_MEMOS_STORAGE_VERSION,
    memos,
  };

  try {
    await writeUserScopedStorageValue(DATE_MEMOS_STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.warn('Unable to save date memos.', error);
    return false;
  }
}
