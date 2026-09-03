import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useRootNavigationState, useRouter } from 'expo-router';
import { Alert, AppState, Platform } from 'react-native';
import { createContext, use, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useShiftSchedule } from '../shifts/ShiftScheduleContext';
import { createNotificationSettingsStore, DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from './notificationSettings';
import { buildNotificationPlan, isNotificationDate, LOCAL_NOTIFICATION_MARKER } from './notificationPlan';
import { isCurrentNotificationOwner, reconcileLocalNotifications, requestLocalNotificationPermission } from './notificationRuntime';
import { getExactAlarmCapability, openExactAlarmSettings, showsExactAlarmSettings } from './exactAlarm';
const store = createNotificationSettingsStore(AsyncStorage);
const NOTIFICATION_ONBOARDING_SEEN_KEY = '@modu-work/notification-onboarding-seen-v1';
type Value = { settings: NotificationSettings; ready: boolean; saving: boolean; permission: boolean; exactCapability: boolean | null; error: string | null; update(patch: Partial<NotificationSettings>): Promise<void>; requestPermission(): Promise<void>; refresh(): void };
const Context = createContext<Value | null>(null);
export function NotificationProvider({ children }: PropsWithChildren) {
  const { session } = useAuth(); const owner = session?.user.id; const schedule = useShiftSchedule(); const router = useRouter(); const navigation = useRootNavigationState();
  const [settings, setSettings] = useState(DEFAULT_NOTIFICATION_SETTINGS); const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false); const [permission, setPermission] = useState(false); const [error, setError] = useState<string | null>(null);
  const [exactCapability, setExactCapability] = useState<boolean | null>(null);
  const [tick, setTick] = useState(0); const lock = useRef(false); const mounted = useRef(true); const onboardingPrompted = useRef(false);
  const refresh = useCallback(() => setTick(n => n + 1), []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!owner || ready) return;
    let active = true;
    void store.load(owner).then(value => { if (active) { setSettings(value); setReady(true); } }).catch(() => { if (active) setError('설정을 불러오지 못했어요. 화면을 다시 열어 주세요.'); });
    return () => { active = false; };
  }, [owner, ready, tick]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, 60_000);
    return () => { sub.remove(); clearInterval(timer); };
  }, [refresh]);
  useEffect(() => {
    if (!owner || !navigation?.key || onboardingPrompted.current || Platform.OS !== 'android') return;
    let active = true;

    void (async () => {
      const seen = await AsyncStorage.getItem(NOTIFICATION_ONBOARDING_SEEN_KEY);
      if (!active || seen === '1') return;

      const notificationPermission = await Notifications.getPermissionsAsync();
      const exact = getExactAlarmCapability();

      if (notificationPermission.granted && (!showsExactAlarmSettings || exact === true)) {
        await AsyncStorage.setItem(NOTIFICATION_ONBOARDING_SEEN_KEY, '1');
        return;
      }

      onboardingPrompted.current = true;
      const markSeen = () => {
        void AsyncStorage.setItem(NOTIFICATION_ONBOARDING_SEEN_KEY, '1').catch(() => {});
      };

      if (!active) return;

      Alert.alert(
        '일정 알림을 받아보세요',
        '근무와 개인 일정을 놓치지 않도록 설정한 시간에 알려드릴게요.',
        [
          {
            text: '나중에',
            style: 'cancel',
            onPress: markSeen,
          },
          {
            text: '알림 설정하기',
            onPress: () => {
              markSeen();
              void (async () => {
                try {
                  const granted = await requestLocalNotificationPermission();
                  if (!mounted.current) return;

                  setPermission(granted);
                  refresh();

                  if (granted && showsExactAlarmSettings && getExactAlarmCapability() === false) {
                    await openExactAlarmSettings();
                  }
                } catch {
                  if (mounted.current) {
                    setError('알림 설정을 열지 못했어요. MY > 알림 설정에서 다시 시도해 주세요.');
                  }
                }
              })();
            },
          },
        ],
        { cancelable: true, onDismiss: markSeen },
      );
    })().catch(() => {});

    return () => { active = false; };
  }, [owner, navigation?.key, refresh]);
  useEffect(() => {
    if (!owner) return;
    let active = true;
    setExactCapability(getExactAlarmCapability());
    void Notifications.getPermissionsAsync().then(p => { if (active) setPermission(p.granted); }).catch(() => { if (active) setPermission(false); });
    const plans = ready && schedule.isHydrated && schedule.hasCompletedSetup ? buildNotificationPlan(owner, settings, schedule) : [];
    void reconcileLocalNotifications(owner, plans).then(() => { if (active && ready) setError(null); }).catch(() => { if (active) setError('알림 예약을 확인하지 못했어요. 다시 시도해 주세요.'); });
    return () => { active = false; };
  }, [owner, ready, settings, tick, schedule.isHydrated, schedule.hasCompletedSetup, schedule.shiftTypes, schedule.shiftPattern, schedule.anchorDate, schedule.anchorPatternIndex, schedule.patternHistory, schedule.shiftDateOverrides, schedule.dateMemos, schedule.personalEvents]);
  useEffect(() => {
    if (!owner || !schedule.isHydrated || !schedule.hasCompletedSetup || !navigation?.key) return;
    let active = true; const handled = new Set<string>();
    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!active || !response) return;
      const { request, date: deliveredAt } = response.notification; const data = request.content.data;
      if (data.managedBy !== LOCAL_NOTIFICATION_MARKER) return;
      const key = request.identifier + ':' + deliveredAt;
      if (handled.has(key)) return; handled.add(key);
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
      if (data.userId !== owner || !isCurrentNotificationOwner(owner) || !isNotificationDate(data.date)) return;
      router.push({ pathname: '/(tabs)/calendar', params: { notificationDate: data.date, notificationOpenId: String(Date.now()) } });
    };
    void Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => { active = false; sub.remove(); };
  }, [owner, schedule.isHydrated, schedule.hasCompletedSetup, router, navigation?.key]);
  const requestPermission = async () => {
    const granted = await requestLocalNotificationPermission();
    if (!mounted.current) return; setPermission(granted); refresh();
    if (!granted) throw new Error('알림 권한이 꺼져 있어요. 기기 설정에서 허용해 주세요.');
  };
  const update = async (patch: Partial<NotificationSettings>) => {
    if (!owner || !ready || lock.current) return;
    lock.current = true; setSaving(true);
    try {
      if (patch.enabled === true || patch.shiftEnabled === true || patch.personalEventEnabled === true) await requestPermission();
      if (!mounted.current || !isCurrentNotificationOwner(owner)) return;
      const next = await store.save(owner, { ...settings, ...patch });
      if (!mounted.current || !isCurrentNotificationOwner(owner)) return;
      setSettings(next);
      await reconcileLocalNotifications(owner, schedule.isHydrated && schedule.hasCompletedSetup ? buildNotificationPlan(owner, next, schedule) : []);
    } finally { lock.current = false; if (mounted.current) setSaving(false); }
  };
  return <Context.Provider value={{ settings, ready, saving, permission, exactCapability, error, update, requestPermission, refresh }}>{children}</Context.Provider>;
}
export function useNotificationSettings() { const value = use(Context); if (!value) throw new Error('NotificationProvider required'); return value; }
