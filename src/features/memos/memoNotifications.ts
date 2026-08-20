import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { DateMemo } from './dateMemoStorage';
import type { DateMemos } from './dateMemoStorage';
import { getMemoNotificationDate } from './memoNotificationTiming';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

export async function cancelMemoNotification(notificationId: string | null) {
  if (notificationId) await Notifications.cancelScheduledNotificationAsync(notificationId);
}

export async function scheduleMemoNotification(date: string, memo: DateMemo) {
  if (!memo.timeEnabled || memo.allDay || memo.reminderMinutes === null || !memo.startTime) {
    return null;
  }

  const triggerDate = getMemoNotificationDate(date, memo.startTime, memo.reminderMinutes);
  if (!triggerDate) throw new Error('과거 시간에는 알림을 예약할 수 없습니다.');

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('schedule-reminders', {
      name: '일정 알림',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('알림 권한이 필요합니다.');
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: { title: '일정 알림', body: memo.text, data: { date, memoId: memo.id } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
  });
  return notificationId;
}

export async function reconcileMemoNotifications(dateMemos: DateMemos) {
  const reconciled: DateMemos = {};
  for (const [date, memos] of Object.entries(dateMemos)) {
    reconciled[date] = [];
    for (const memo of memos) {
      try {
        const notificationId = await scheduleMemoNotification(date, memo);
        if (memo.notificationId && memo.notificationId !== notificationId) await cancelMemoNotification(memo.notificationId);
        reconciled[date].push({ ...memo, notificationId });
      } catch {
        await cancelMemoNotification(memo.notificationId);
        reconciled[date].push({ ...memo, notificationId: null });
      }
    }
  }
  return reconciled;
}
