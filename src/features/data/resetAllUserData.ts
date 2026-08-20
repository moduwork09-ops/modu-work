import AsyncStorage from '@react-native-async-storage/async-storage';

import { CALENDAR_DATE_TIP_STORAGE_KEY } from '../calendar/calendarDateTipStorage';
import { RECENT_COLORS_STORAGE_KEY } from '../colors/recentColorStorage';
import { PERSONAL_EVENTS_STORAGE_KEY } from '../events/personalEventStorage';
import { DATE_MEMOS_STORAGE_KEY, parsePersistedDateMemos } from '../memos/dateMemoStorage';
import { cancelMemoNotification } from '../memos/memoNotifications';
import { SHIFT_DATE_OVERRIDES_STORAGE_KEY } from '../shifts/shiftDateOverrideStorage';
import { SHIFT_SETTINGS_STORAGE_KEY } from '../shifts/shiftSettingsStorage';

export const USER_DATA_STORAGE_KEYS = [
  SHIFT_SETTINGS_STORAGE_KEY,
  PERSONAL_EVENTS_STORAGE_KEY,
  DATE_MEMOS_STORAGE_KEY,
  SHIFT_DATE_OVERRIDES_STORAGE_KEY,
  RECENT_COLORS_STORAGE_KEY,
  CALENDAR_DATE_TIP_STORAGE_KEY,
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
  const snapshot = await AsyncStorage.multiGet([...USER_DATA_STORAGE_KEYS]);
  const storedMemos = snapshot.find(([key]) => key === DATE_MEMOS_STORAGE_KEY)?.[1] ?? null;

  await cancelStoredMemoNotifications(storedMemos);

  try {
    await AsyncStorage.multiRemove([...USER_DATA_STORAGE_KEYS]);
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
