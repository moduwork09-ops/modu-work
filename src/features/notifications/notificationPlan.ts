import { getShiftForDate, type ShiftScheduleInput } from '../shifts/shiftSchedule';
import type { DateMemos } from '../memos/dateMemoStorage';
import type { PersonalEvent } from '../events/personalEventStorage';
import type { NotificationSettings } from './notificationSettings';
import { notificationLeadLabel } from './notificationSettings';
export const LOCAL_NOTIFICATION_MARKER = 'modu-work.local.v1';
export const NOTIFICATION_WINDOW_DAYS = 14;
export const MAX_LOCAL_NOTIFICATIONS = 60;
export type NotificationData = { managedBy: typeof LOCAL_NOTIFICATION_MARKER; userId: string; kind: 'shift' | 'personal'; date: string; sourceId: string };
export type NotificationPlan = { identifier: string; at: number; title: string; body: string; data: NotificationData };
export type NotificationSource = ShiftScheduleInput & { dateMemos: DateMemos; personalEvents: PersonalEvent[] };
export function localNotificationDate(date: Date) { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); }
export function isNotificationDate(date: unknown): date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);return localNotificationDate(new Date(y, m - 1, d, 12)) === date;
}
function triggerTime(date: string, time: string | null | undefined, lead: number) {
  if (!isNotificationDate(date) || !time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN;
  const [y, m, d] = date.split('-').map(Number); const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min).getTime() - lead * 60_000;
}
export function buildNotificationPlan(userId: string, settings: NotificationSettings, source: NotificationSource, now = new Date()): NotificationPlan[] {
  if (!userId || !settings.enabled) return [];
  const plans = new Map<string, NotificationPlan>();
  const add = (kind: NotificationData['kind'], date: string, sourceId: string, time: string | null | undefined, lead: number, title: string, body: string) => {
    const at = triggerTime(date, time, lead); if (!Number.isFinite(at) || at <= now.getTime()) return;
    const identifier = [LOCAL_NOTIFICATION_MARKER, userId, kind, date, sourceId].map(encodeURIComponent).join(':');
    plans.set(identifier, { identifier, at, title, body, data: { managedBy: LOCAL_NOTIFICATION_MARKER, userId, kind, date, sourceId } });
  };
  for (let offset = 0; offset < NOTIFICATION_WINDOW_DAYS; offset++) {
    const date = localNotificationDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12));
    if (settings.shiftEnabled && source.shiftTypes.length && source.shiftPattern.length) {
      const shift = getShiftForDate(date, source);
      if (shift?.kind === 'work' && shift.startTime) add('shift', date, shift.id, shift.startTime, settings.shiftLeadMinutes, shift.name + ' 시작을 알려드려요', shift.startTime + ' 근무 시작 · ' + notificationLeadLabel(settings.shiftLeadMinutes));
    }
    if (!settings.personalEventEnabled) continue;
    // Calendar's timed/untimed schedule editor uses DateMemo storage. No ID/time heuristic for ownership.
    for (const memo of source.dateMemos[date] ?? []) if (memo.timeEnabled && !memo.allDay && memo.startTime) add('personal', date, 'memo:' + memo.id, memo.startTime, settings.personalEventLeadMinutes, '곧 일정이 있어요', memo.startTime + ' ' + memo.text);
    for (const event of source.personalEvents) if (event.date === date && event.kind !== 'shared' && event.source !== 'together' && !event.allDay && event.startTime) add('personal', date, 'event:' + event.id, event.startTime, settings.personalEventLeadMinutes, '곧 일정이 있어요', event.startTime + ' ' + event.title);
  }
  return [...plans.values()].sort((a, b) => a.at - b.at || a.identifier.localeCompare(b.identifier)).slice(0, MAX_LOCAL_NOTIFICATIONS);
}
