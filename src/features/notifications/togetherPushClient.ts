import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '../../lib/supabase';
import { getUserScopedStorageKey } from '../storage/userScopedStorageKey';
import { ensureNotificationChannel } from './notificationRuntime';
import { createNotificationSettingsStore } from './notificationSettings';
import { createTogetherPushLifecycle } from './togetherPushLifecycle';

const tokenKey = (owner: string) => getUserScopedStorageKey(owner, 'modu-work.together-push-token.v1');

async function requireCurrentOwner(owner: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user.id !== owner) throw new Error('Push owner changed');
}

const lifecycle = createTogetherPushLifecycle({
  async hasPermission() {
    if (Platform.OS === 'web') return false;
    await ensureNotificationChannel();
    return (await Notifications.getPermissionsAsync()).granted;
  },
  async getToken() {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (typeof projectId !== 'string' || !projectId) throw new Error('Missing EAS project id');
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  },
  async loadTokens(owner) {
    const stored = await AsyncStorage.getItem(tokenKey(owner));
    if (!stored) return [];
    try {
      const parsed: unknown = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed.filter((token): token is string => typeof token === 'string') : [];
    } catch { return [stored]; }
  },
  saveTokens: (owner, tokens) => AsyncStorage.setItem(tokenKey(owner), JSON.stringify(tokens)),
  clearTokens: (owner) => AsyncStorage.removeItem(tokenKey(owner)),
  async register(owner, token, previousToken) {
    await requireCurrentOwner(owner);
    const { error } = await supabase.rpc('register_my_push_token', {
      p_token: token,
      p_platform: Platform.OS,
      p_previous_token: previousToken,
    });
    if (error) throw error;
  },
  async unregister(owner, token) {
    await requireCurrentOwner(owner);
    const { error } = await supabase.rpc('unregister_my_push_token', { p_token: token });
    if (error) throw error;
  },
});

const notificationSettings = createNotificationSettingsStore(AsyncStorage);
export async function refreshTogetherPushRegistration(owner: string, enabled?: boolean): Promise<void> {
  const shouldRegister = enabled ?? (await notificationSettings.load(owner)).enabled;
  await lifecycle.refresh(owner, shouldRegister);
}
export const unregisterTogetherPushBeforeSignOut = lifecycle.beforeSignOut;

export async function dispatchPendingTogetherPush(): Promise<void> {
  const { error } = await supabase.functions.invoke('together-shared-event-push', { body: {} });
  if (error) throw error;
}
