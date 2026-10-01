import { LOCAL_NOTIFICATION_MARKER, type NotificationPlan } from './notificationPlan';
export type PendingNotification = { identifier: string; at: number; title: string | null; body: string | null; data: Record<string, unknown> };
export type NotificationAdapter = { list(): Promise<PendingNotification[]>; cancel(id: string): Promise<void>; schedule(plan: NotificationPlan): Promise<void> };
export function isManagedNotification(item: PendingNotification) {
  return item.data.managedBy === LOCAL_NOTIFICATION_MARKER && (
    item.identifier.startsWith(LOCAL_NOTIFICATION_MARKER + ':')
    || (item.identifier.startsWith('daily-briefing:') && item.data.kind === 'dailyBriefing')
  );
}
export function isLegacyMemoNotification(item: PendingNotification) {
  return item.title === '일정 알림' && typeof item.data.memoId === 'string' && typeof item.data.date === 'string';
}
/** Serialize native writes and invalidate in-flight work immediately on a new desired state. */
export function createNotificationReconciler(adapter: NotificationAdapter) {
  let revision = 0;
  let tail: Promise<void> = Promise.resolve();
  return (plans: NotificationPlan[], exactCapability: boolean | null = null) => {
    const current = ++revision;
    const run = async () => {
      if (current !== revision) return;
      const pending = await adapter.list();
      const desired = new Map(plans.map(p => [p.identifier, p]));
      const kept = new Set<string>();
      for (const item of pending) {
        if (current !== revision) return;
        if (!isManagedNotification(item) && !isLegacyMemoNotification(item)) continue;
        const plan = desired.get(item.identifier);
        if (plan && (exactCapability === null || item.data.exactAlarmCapability === exactCapability) && item.at === plan.at && item.title === plan.title && item.body === plan.body && item.data.userId === plan.data.userId) kept.add(item.identifier);
        else await adapter.cancel(item.identifier);
      }
      for (const plan of plans) {
        if (current !== revision) return;
        if (kept.has(plan.identifier) || plan.at <= Date.now()) continue;
        // Persist capability on each native reservation, not in account preferences.
        // Missing/changed markers replace old inexact alarms, including after a cold start.
        const scheduledPlan = exactCapability === null ? plan : {
          ...plan, data: { ...plan.data, exactAlarmCapability: exactCapability },
        };
        await adapter.schedule(scheduledPlan);
        // A logout/account switch may have arrived during the native scheduling call.
        if (current !== revision) { await adapter.cancel(plan.identifier); return; }
      }
    };
    const result = tail.catch(() => {}).then(run); tail = result; return result;
  };
}
