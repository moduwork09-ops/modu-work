import { getUserScopedStorageKey } from '../storage/userScopedStorageKey';
export type CalendarDisplaySettings = {
  weekStartsOn: 0 | 1;
  showHolidayNames: boolean;
  showPersonalEvents: boolean;
  showSharedEvents: boolean;
  showOvertime: boolean;
  showEventTime: boolean;
  showMonthlyMemoCard: boolean;
};
export const DEFAULT_CALENDAR_DISPLAY_SETTINGS: CalendarDisplaySettings = {
  weekStartsOn: 0, showHolidayNames: true, showPersonalEvents: true, showSharedEvents: true,
  showOvertime: true, showEventTime: true, showMonthlyMemoCard: true,
};
export const CALENDAR_DISPLAY_SETTINGS_KEY = 'modu-work.calendar-display-settings.v1';
export function normalizeCalendarDisplaySettings(value: unknown): CalendarDisplaySettings {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result = { ...DEFAULT_CALENDAR_DISPLAY_SETTINGS };
  result.weekStartsOn = input.weekStartsOn === 1 ? 1 : 0;
  for (const key of ['showHolidayNames', 'showPersonalEvents', 'showSharedEvents', 'showOvertime', 'showEventTime', 'showMonthlyMemoCard'] as const) {
    if (typeof input[key] === 'boolean') result[key] = input[key];
  }
  return result;
}
export function parseCalendarDisplaySettings(raw: string | null): CalendarDisplaySettings {
  try { const data = raw === null ? null : JSON.parse(raw); return normalizeCalendarDisplaySettings(data?.version === 1 ? data.settings : null); }
  catch { return { ...DEFAULT_CALENDAR_DISPLAY_SETTINGS }; }
}
export function createCalendarDisplaySettingsStore(storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }) {
  const key = (userId: string) => { if (!userId) throw new Error('Account required'); return getUserScopedStorageKey(userId, CALENDAR_DISPLAY_SETTINGS_KEY); };
  return {
    async load(userId: string) { return parseCalendarDisplaySettings(await storage.getItem(key(userId))); },
    async save(userId: string, value: CalendarDisplaySettings) {
      const settings = normalizeCalendarDisplaySettings(value);
      await storage.setItem(key(userId), JSON.stringify({ version: 1, settings }));
      return settings;
    },
  };
}
