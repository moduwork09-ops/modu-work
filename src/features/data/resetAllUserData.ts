import AsyncStorage from '@react-native-async-storage/async-storage';

import { RECENT_COLORS_STORAGE_KEY } from '../colors/recentColorStorage';
import { PERSONAL_EVENTS_STORAGE_KEY } from '../events/personalEventStorage';
import { FREQUENT_EVENTS_STORAGE_KEY } from '../events/frequentEventStorage';
import { DATE_MEMOS_STORAGE_KEY } from '../memos/dateMemoStorage';
import { MONTHLY_MEMOS_STORAGE_KEY } from '../memos/monthlyMemo';
import { withLocalNotificationReset, isCurrentNotificationOwner } from '../notifications/notificationRuntime';
import { SHIFT_DATE_OVERRIDES_STORAGE_KEY } from '../shifts/shiftDateOverrideStorage';
import { SHIFT_SETTINGS_STORAGE_KEY } from '../shifts/shiftSettingsStorage';
import { SALARY_SETTINGS_STORAGE_KEY } from '../salary/salaryStorage';
import { OVERTIME_ENTRIES_STORAGE_KEY } from '../overtime/overtimeStorage';
import { getUserScopedStorageKey } from '../storage/userScopedStorageKey';

// Keep clearing the old device hint key for existing installs after its UI was removed.
const CALENDAR_DATE_TIP_STORAGE_KEY = 'modu-work.calendar-date-tip.v1';

export const USER_SCOPED_LEGACY_STORAGE_KEYS = [
  SHIFT_SETTINGS_STORAGE_KEY,
  PERSONAL_EVENTS_STORAGE_KEY,
  DATE_MEMOS_STORAGE_KEY,
  SHIFT_DATE_OVERRIDES_STORAGE_KEY,
  RECENT_COLORS_STORAGE_KEY,
  SALARY_SETTINGS_STORAGE_KEY,
  OVERTIME_ENTRIES_STORAGE_KEY,
  MONTHLY_MEMOS_STORAGE_KEY,
  FREQUENT_EVENTS_STORAGE_KEY,
] as const;

export async function resetAllUserData(ownerUserId: string, reload: () => Promise<void> = async () => {}) {
  if (!ownerUserId || !isCurrentNotificationOwner(ownerUserId)) throw new Error('Account changed during reset');
  // Capture the account once; never resolve different owners for individual storage keys.
  const keysToRemove = [...USER_SCOPED_LEGACY_STORAGE_KEYS.map(key => getUserScopedStorageKey(ownerUserId, key)), CALENDAR_DATE_TIP_STORAGE_KEY];
  const snapshot = await AsyncStorage.multiGet(keysToRemove);
  await withLocalNotificationReset(ownerUserId, async () => {
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
  }, async () => {
    if (isCurrentNotificationOwner(ownerUserId)) await reload();
  });
}
