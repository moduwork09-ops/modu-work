import AsyncStorage from '@react-native-async-storage/async-storage';

export const CALENDAR_DATE_TIP_STORAGE_KEY = 'modu-work.calendar-date-tip.v1';

export async function loadCalendarDateTipDismissed() {
  try { return await AsyncStorage.getItem(CALENDAR_DATE_TIP_STORAGE_KEY) === 'dismissed'; }
  catch { return false; }
}

export async function dismissCalendarDateTip() {
  try { await AsyncStorage.setItem(CALENDAR_DATE_TIP_STORAGE_KEY, 'dismissed'); }
  catch (error) { console.warn('Unable to save calendar date tip state.', error); }
}
