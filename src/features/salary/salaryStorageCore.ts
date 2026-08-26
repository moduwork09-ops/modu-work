import { getUserScopedStorageKey } from '../storage/userScopedStorageKey';
import { EMPTY_SALARY_SETTINGS, parseSalarySettings, type SalarySettings } from './salaryTypes';

export type SalaryKeyValueStorage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void>; removeItem: (key: string) => Promise<void> };
export function createSalarySettingsStorage(storage: SalaryKeyValueStorage, legacyKey: string) {
  return {
    async load(userId: string) {
      try { const raw = await storage.getItem(getUserScopedStorageKey(userId, legacyKey)); if (raw === null) return { status: 'ready' as const, settings: EMPTY_SALARY_SETTINGS }; const settings = parseSalarySettings(raw); return settings ? { status: 'ready' as const, settings } : { status: 'error' as const }; } catch { return { status: 'error' as const }; }
    },
    async save(userId: string, settings: SalarySettings) {
      const validated = parseSalarySettings(JSON.stringify(settings)); if (!validated) throw new Error('Invalid salary settings');
      await storage.setItem(getUserScopedStorageKey(userId, legacyKey), JSON.stringify(validated));
    },
    async remove(userId: string) { await storage.removeItem(getUserScopedStorageKey(userId, legacyKey)); },
  };
}
