import AsyncStorage from '@react-native-async-storage/async-storage';

import { CALENDAR_DATE_TIP_STORAGE_KEY } from '../calendar/calendarDateTipStorage';
import { RECENT_COLORS_STORAGE_KEY } from '../colors/recentColorStorage';
import { PERSONAL_EVENTS_STORAGE_KEY } from '../events/personalEventStorage';
import { DATE_MEMOS_STORAGE_KEY, parsePersistedDateMemos } from '../memos/dateMemoStorage';
import { cancelMemoNotification } from '../memos/memoNotifications';
import { SHIFT_DATE_OVERRIDES_STORAGE_KEY } from '../shifts/shiftDateOverrideStorage';
import { SHIFT_SETTINGS_STORAGE_KEY } from '../shifts/shiftSettingsStorage';
import { SALARY_SETTINGS_STORAGE_KEY } from '../salary/salaryStorage';
import { getCurrentUserScopedStorageKey, readUserScopedStorageValue } from '../storage/userScopedStorage';

export const USER_SCOPED_LEGACY_STORAGE_KEYS = [
  SHIFT_SETTINGS_STORAGE_KEY,
  PERSONAL_EVENTS_STORAGE_KEY,
  DATE_MEMOS_STORAGE_KEY,
  SHIFT_DATE_OVERRIDES_STORAGE_KEY,
  RECENT_COLORS_STORAGE_KEY,
  SALARY_SETTINGS_STORAGE_KEY,
] as const;

async function cancelStoredMemoNotifications(storedMemos: string | null) {
  if (!storedMemos) return;

  const dateMemos = parsePersistedDateMemos(storedMemos);
  if (!dateMemos) return;

  for (const memos of Object.values(dateMemos)) {
    for (const memo of memos) {
      await cancelMemoNotification(memo.notificationId);
    }
  }
}

export async function resetAllUserData() {
  const currentValues = await Promise.all(USER_SCOPED_LEGACY_STORAGE_KEYS.map((key) => readUserScopedStorageValue(key)));
  const scopedKeys = await Promise.all(USER_SCOPED_LEGACY_STORAGE_KEYS.map((key) => getCurrentUserScopedStorageKey(key)));
  const keysToRemove = [...scopedKeys, CALENDAR_DATE_TIP_STORAGE_KEY];
  const storedMemos = currentValues[2];
  const snapshot = await AsyncStorage.multiGet(keysToRemove);

  await cancelStoredMemoNotifications(storedMemos);

  try {
    await AsyncStorage.multiRemove(keysToRemove);
  } catch (error) {
    try {
      const existing = snapshot.filter((pair): pair is [string, string] => pair[1] !== null);
      const missing = snapshot.filter(([, value]) => value === null).map(([key]) => key);
      if (existing.length) await AsyncStorage.multiSet(existing);
      if (missing.length) await AsyncStorage.multiRemove(missing);
    } catch (rollbackError) {
      console.error('Unable to rollback failed data reset.', rollbackError);
    }
    throw error;
  }
}
