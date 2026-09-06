import AsyncStorage from '@react-native-async-storage/async-storage';

// Legacy key remains available to the existing account-reset transaction.
export const CALENDAR_DATE_TIP_STORAGE_KEY = 'modu-work.calendar-date-tip.v1';
const DEVICE_DATE_TIP_STORAGE_KEY = 'modu-work.device.calendar-date-tip.v1';
let dismissedInSession = false;
let persisted = false;
let dismissalWrite: Promise<void> | undefined;

export async function loadCalendarDateTipDismissed() {
  if (dismissedInSession) return true;
  try {
    const saved = await AsyncStorage.getItem(DEVICE_DATE_TIP_STORAGE_KEY);
    if (dismissedInSession) return true;
    if (saved === 'dismissed') {
      persisted = true;
      dismissedInSession = true;
    } else if (await AsyncStorage.getItem(CALENDAR_DATE_TIP_STORAGE_KEY) === 'dismissed') {
      await dismissCalendarDateTip();
    }
    return dismissedInSession;
  } catch { return dismissedInSession; }
}

export async function dismissCalendarDateTip() {
  dismissedInSession = true;
  if (persisted) return;
  if (!dismissalWrite) {
    dismissalWrite = AsyncStorage.setItem(DEVICE_DATE_TIP_STORAGE_KEY, 'dismissed')
      .then(() => { persisted = true; })
      .catch(error => { console.warn('Unable to save calendar date tip state.', error); })
      .finally(() => { dismissalWrite = undefined; });
  }
  await dismissalWrite;
}
