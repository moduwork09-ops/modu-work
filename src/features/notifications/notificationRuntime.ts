import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getExactAlarmCapability } from './exactAlarm';
import { parseTogetherPushForOwner } from './togetherPushNotification';
import { createNotificationReconciler } from './notificationReconciler';
import { DAILY_BRIEFING_CHANNEL, LOCAL_NOTIFICATION_MARKER, type NotificationPlan } from './notificationPlan';
export const LOCAL_NOTIFICATION_CHANNEL = 'modu-work-local-v1';
let owner: string | null | undefined;
let generation = 0;
let latestPlans: NotificationPlan[] = [];
let resetting: { owner: string } | undefined;
const reconcile = createNotificationReconciler({
  async list() { return (await Notifications.getAllScheduledNotificationsAsync()).map(n => ({ identifier: n.identifier, title: n.content.title, body: n.content.body, data: n.content.data, at: Number((n.trigger as unknown as { value?: number })?.value ?? 0) })); },
  cancel: id => Notifications.cancelScheduledNotificationAsync(id),
  async schedule(plan) { await Notifications.scheduleNotificationAsync({ identifier: plan.identifier, content: { title: plan.title, body: plan.body, data: plan.data, sound: 'default' }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(plan.at), channelId: plan.data.kind === 'dailyBriefing' ? DAILY_BRIEFING_CHANNEL : LOCAL_NOTIFICATION_CHANNEL } }); },
});
Notifications.setNotificationHandler({ handleNotification: async notification => {
  const data = notification.request.content.data;
  const allowed = (data.managedBy === LOCAL_NOTIFICATION_MARKER && data.userId === owner && latestPlans.some(plan => plan.identifier === notification.request.identifier))
    || parseTogetherPushForOwner(data, owner) !== null;
  return { shouldPlaySound: allowed, shouldSetBadge: false, shouldShowBanner: allowed, shouldShowList: allowed };
} });
export async function ensureNotificationChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(LOCAL_NOTIFICATION_CHANNEL, { name: '모두의 근무', importance: Notifications.AndroidImportance.HIGH });
    await Notifications.setNotificationChannelAsync(DAILY_BRIEFING_CHANNEL, { name: '오늘의 브리핑', importance: Notifications.AndroidImportance.HIGH });
  }
}
export async function requestLocalNotificationPermission() {
  await ensureNotificationChannel();
  const current = await Notifications.getPermissionsAsync();
  return current.granted || (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
}
export function setNotificationOwner(next: string | null): Promise<void> {
  if (owner === next) return next === null ? reconcile([]) : Promise.resolve();
  owner = next; generation++; latestPlans = []; resetting = undefined;
  return reconcile([]);
}
export function isCurrentNotificationOwner(candidate: string) { return owner === candidate; }
export async function reconcileLocalNotifications(candidate: string, plans: NotificationPlan[]) {
  if (owner !== candidate || resetting?.owner === candidate) return;
  latestPlans = plans;
  if (!plans.length) { generation++; await reconcile([]); return; }
  const request = ++generation;
  await ensureNotificationChannel();
  const permission = await Notifications.getPermissionsAsync();
  if (owner !== candidate || request !== generation) return;
  await reconcile(permission.granted ? plans : [], getExactAlarmCapability());
}
export async function withLocalNotificationReset(candidate: string, operation: () => Promise<void>, afterCommit: () => Promise<void> = async () => {}) {
  if (owner !== candidate || resetting) throw new Error('Account changed or reset already running');
  const token = { owner: candidate }; resetting = token;
  let committed = false;
  const previousPlans = latestPlans; latestPlans = []; generation++;
  try {
    await reconcile([]);
    if (owner !== candidate) throw new Error('Account changed during reset');
    await operation();
    committed = true;
    await afterCommit();
  } catch (error) {
    if (!committed && owner === candidate && resetting === token) {
      latestPlans = previousPlans;
      try {
        const p = await Notifications.getPermissionsAsync();
        if (owner === candidate && resetting === token) {
          await reconcile(p.granted ? previousPlans : [], getExactAlarmCapability());
        }
      }
      catch { /* Original reset failure remains visible; foreground reconciliation retries. */ }
    }
    throw error;
  } finally { if (resetting === token) resetting = undefined; }
}
