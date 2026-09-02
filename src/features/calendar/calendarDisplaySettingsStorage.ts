import AsyncStorage from '@react-native-async-storage/async-storage';
import { createCalendarDisplaySettingsStore } from './calendarDisplaySettings';
export const calendarDisplaySettingsStore = createCalendarDisplaySettingsStore(AsyncStorage);
