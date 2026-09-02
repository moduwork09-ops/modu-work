import AsyncStorage from '@react-native-async-storage/async-storage';

import { getUserScopedStorageKey } from '../storage/userScopedStorageKey';
import { OVERTIME_STORAGE_VERSION, parseOvertimeEntries, type OvertimeEntry } from './overtime';

export const OVERTIME_ENTRIES_STORAGE_KEY = 'modu-work.overtime-entries.v1';

export type OvertimeStorage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export function createOvertimeEntryStore(storage: OvertimeStorage = AsyncStorage) {
  return {
    getStorageKey(userId: string) {
      return getUserScopedStorageKey(userId, OVERTIME_ENTRIES_STORAGE_KEY);
    },
    async load(userId: string) {
      try {
        const raw = await storage.getItem(getUserScopedStorageKey(userId, OVERTIME_ENTRIES_STORAGE_KEY));
        if (raw === null) return { status: 'ready' as const, entries: [] as OvertimeEntry[] };
        const entries = parseOvertimeEntries(raw);
        return entries ? { status: 'ready' as const, entries } : { status: 'error' as const };
      } catch {
        return { status: 'error' as const };
      }
    },
    async save(userId: string, entries: OvertimeEntry[]) {
      const validated = parseOvertimeEntries(JSON.stringify({ version: OVERTIME_STORAGE_VERSION, entries }));
      if (!validated) throw new Error('Invalid overtime entries');
      await storage.setItem(
        getUserScopedStorageKey(userId, OVERTIME_ENTRIES_STORAGE_KEY),
        JSON.stringify({ version: OVERTIME_STORAGE_VERSION, entries: validated }),
      );
    },
  };
}

export const overtimeEntryStore = createOvertimeEntryStore();
