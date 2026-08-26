import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSalarySettingsStorage } from './salaryStorageCore';
import type { SalarySettings } from './salaryTypes';
export { parseSalarySettings } from './salaryTypes';

export const SALARY_SETTINGS_STORAGE_KEY = 'modu-work.salary-settings.v1';
const storage = createSalarySettingsStorage(AsyncStorage, SALARY_SETTINGS_STORAGE_KEY);
export function loadSalarySettings(userId: string) { return storage.load(userId); }
export function saveSalarySettings(userId: string, settings: SalarySettings) { return storage.save(userId, settings); }
