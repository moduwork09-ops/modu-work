import { getShiftForDate, NO_ACTIVE_SCHEDULE_SHIFT_TYPE } from '../shifts/shiftSchedule';
import { UNSUPPORTED_HOLIDAY_SHIFT_TYPE } from '../shifts/conditionalShiftRule';
import type { SharedEventCalendarItem } from '../together/sharedEventCalendarPresentation';
import { LOCAL_NOTIFICATION_MARKER, isNotificationDate, localNotificationDate, type NotificationPlan, type NotificationSource } from './notificationPlan';
import type { NotificationSettings } from './notificationSettings';

export const DAILY_BRIEFING_WINDOW_DAYS = 30;
export type DailyBriefingSource = NotificationSource & { sharedEvents: SharedEventCalendarItem[] };

function briefingDateTime(date: string, time: string): number {
  if (!isNotificationDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute).getTime();
}

export function createDailyBriefingPlan(userId: string, date: string, settings: NotificationSettings, source: DailyBriefingSource): NotificationPlan | null {
  if (!userId || !settings.enabled || !settings.briefingEnabled) return null;
  const at = briefingDateTime(date, settings.briefingTime);
  if (!Number.isFinite(at)) return null;
  const resolvedShift = settings.briefingIncludeShift ? getShiftForDate(date, source) : undefined;
  const shift = resolvedShift?.id === NO_ACTIVE_SCHEDULE_SHIFT_TYPE.id || resolvedShift?.id === UNSUPPORTED_HOLIDAY_SHIFT_TYPE.id ? undefined : resolvedShift;
  const items: { time: string; label: string; kind: 'event' | 'memo' }[] = [];
  if (settings.briefingIncludePersonal) {
    for (const event of source.personalEvents) {
      if (event.date !== date || event.kind === 'shared' || event.source === 'together') continue;
      items.push({ time: event.startTime ?? '', label: `${event.startTime ? event.startTime + ' ' : ''}${event.title}`, kind: 'event' });
    }
    for (const memo of source.dateMemos[date] ?? []) {
      if (!memo.timeEnabled) continue;
      items.push({ time: memo.startTime ?? '', label: `${memo.startTime ? memo.startTime + ' ' : ''}${memo.text}`, kind: 'event' });
    }
  }
  if (settings.briefingIncludeShared) {
    for (const event of source.sharedEvents) {
      if (event.localDate === date) items.push({ time: event.startTime, label: `${event.startTime} ${event.title}`, kind: 'event' });
    }
    // Older locally persisted Together events remain visible even before the server list is loaded.
    for (const event of source.personalEvents) {
      if (event.date === date && (event.kind === 'shared' || event.source === 'together') && !source.sharedEvents.some(shared => shared.id === event.id)) {
        items.push({ time: event.startTime ?? '', label: `${event.startTime ? event.startTime + ' ' : ''}${event.title}`, kind: 'event' });
      }
    }
  }
  if (settings.briefingIncludeMemo) {
    for (const memo of source.dateMemos[date] ?? []) {
      if (!memo.timeEnabled) items.push({ time: '', label: `📝 ${memo.text}`, kind: 'memo' });
    }
  }
  items.sort((a, b) => a.time.localeCompare(b.time) || a.label.localeCompare(b.label));
  if (!shift && !items.length && !settings.briefingNotifyEmpty) return null;
  const work = shift ? `${shift.name}${shift.kind === 'work' && shift.startTime && shift.endTime ? ` ${shift.startTime}~${shift.endTime}` : ''}` : '';
  const events = items.filter(item => item.kind === 'event');
  const memos = items.filter(item => item.kind === 'memo');
  const visible = [...events.slice(0, memos.length ? 2 : 3), ...memos.slice(0, 1)];
  const heading = `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 (${['일', '월', '화', '수', '목', '금', '토'][new Date(`${date}T12:00:00`).getDay()]})`;
  const counts = [events.length ? `오늘 일정 ${events.length}개` : '', memos.length ? `메모 ${memos.length}개` : ''].filter(Boolean).join(' · ');
  const lines = [work || heading, counts, ...(work ? [heading] : []), ...visible.map(item => item.label)];
  if (items.length > visible.length) lines.push(`외 ${items.length - visible.length}건`);
  if (!work && !items.length) lines.push('오늘 등록된 일정이 없어요.');
  const body = lines.filter(Boolean).join('\n');
  return {
    identifier: `daily-briefing:${userId}:${date}`,
    at,
    title: '오늘의 브리핑',
    body,
    data: { managedBy: LOCAL_NOTIFICATION_MARKER, userId, kind: 'dailyBriefing', date, sourceId: 'daily-briefing' },
  };
}

export function buildDailyBriefingPlan(userId: string, settings: NotificationSettings, source: DailyBriefingSource, now = new Date()): NotificationPlan[] {
  if (!userId || !settings.enabled || !settings.briefingEnabled) return [];
  const plans: NotificationPlan[] = [];
  for (let offset = 0; offset < DAILY_BRIEFING_WINDOW_DAYS; offset++) {
    const date = localNotificationDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12));
    const plan = createDailyBriefingPlan(userId, date, settings, source);
    if (plan && plan.at > now.getTime()) plans.push(plan);
  }
  return plans;
}
