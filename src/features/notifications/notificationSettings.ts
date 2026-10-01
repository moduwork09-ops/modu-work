import { getUserScopedStorageKey } from '../storage/userScopedStorageKey';
export const SHIFT_LEADS = [0, 10, 30, 60, 120] as const;
export const PERSONAL_LEADS = [0, 10, 30, 60, 120, 1440] as const;
export type NotificationSettings = { enabled: boolean; shiftEnabled: boolean; personalEventEnabled: boolean; shiftLeadMinutes: number; personalEventLeadMinutes: number; briefingEnabled: boolean; briefingTime: string; briefingIncludeShift: boolean; briefingIncludePersonal: boolean; briefingIncludeShared: boolean; briefingIncludeMemo: boolean; briefingNotifyEmpty: boolean };
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = { enabled: true, shiftEnabled: true, personalEventEnabled: true, shiftLeadMinutes: 30, personalEventLeadMinutes: 10, briefingEnabled: false, briefingTime: '07:00', briefingIncludeShift: true, briefingIncludePersonal: true, briefingIncludeShared: true, briefingIncludeMemo: true, briefingNotifyEmpty: false };
export function normalizeNotificationSettings(value: unknown): NotificationSettings {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result = { ...DEFAULT_NOTIFICATION_SETTINGS };
  for (const key of ['enabled', 'shiftEnabled', 'personalEventEnabled', 'briefingEnabled', 'briefingIncludeShift', 'briefingIncludePersonal', 'briefingIncludeShared', 'briefingIncludeMemo', 'briefingNotifyEmpty'] as const) if (typeof input[key] === 'boolean') result[key] = input[key];
  if (typeof input.briefingTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.briefingTime)) result.briefingTime = input.briefingTime;
  if (SHIFT_LEADS.includes(input.shiftLeadMinutes as never)) result.shiftLeadMinutes = input.shiftLeadMinutes as number;
  if (PERSONAL_LEADS.includes(input.personalEventLeadMinutes as never)) result.personalEventLeadMinutes = input.personalEventLeadMinutes as number;
  return result;
}
export function createNotificationSettingsStore(storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }) {
  const key = (owner: string) => { if (!owner) throw new Error('Account required'); return getUserScopedStorageKey(owner, 'modu-work.notification-settings.v1'); };
  return {
    async load(owner: string) {
      const raw = await storage.getItem(key(owner));
      try { const parsed = raw ? JSON.parse(raw) : null; return normalizeNotificationSettings(parsed?.version === 1 ? parsed.settings : null); }
      catch { return { ...DEFAULT_NOTIFICATION_SETTINGS }; }
    },
    async save(owner: string, value: NotificationSettings) { const settings = normalizeNotificationSettings(value); await storage.setItem(key(owner), JSON.stringify({ version: 1, settings })); return settings; },
  };
}
export function notificationLeadLabel(minutes: number) { return minutes === 0 ? '시작 시간' : minutes === 1440 ? '1일 전' : minutes >= 60 ? (minutes / 60) + '시간 전' : minutes + '분 전'; }
