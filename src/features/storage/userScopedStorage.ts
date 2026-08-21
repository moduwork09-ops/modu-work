import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../../lib/supabase';

const LEGACY_PREFIX = 'modu-work.';

export function getUserScopedStorageKey(userId: string, legacyKey: string) {
  if (!legacyKey.startsWith(LEGACY_PREFIX)) {
    throw new Error('Invalid legacy storage key');
  }
  return `modu-work.user.${userId}.${legacyKey.slice(LEGACY_PREFIX.length)}`;
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.user.id) throw new Error('Authenticated user is required for user-scoped storage');
  return data.session.user.id;
}

export async function getCurrentUserScopedStorageKey(legacyKey: string) {
  return getUserScopedStorageKey(await getCurrentUserId(), legacyKey);
}

export async function readUserScopedStorageValue(legacyKey: string) {
  const scopedKey = await getCurrentUserScopedStorageKey(legacyKey);
  const scopedValue = await AsyncStorage.getItem(scopedKey);
  if (scopedValue !== null) return scopedValue;

  const legacyValue = await AsyncStorage.getItem(legacyKey);
  if (legacyValue === null) return null;

  await AsyncStorage.setItem(scopedKey, legacyValue);
  const verifiedValue = await AsyncStorage.getItem(scopedKey);
  if (verifiedValue !== legacyValue) {
    throw new Error('Unable to verify user-scoped storage migration');
  }
  try {
    await AsyncStorage.removeItem(legacyKey);
  } catch (error) {
    console.warn('Unable to remove verified legacy storage value.', error);
  }
  return verifiedValue;
}

export async function writeUserScopedStorageValue(legacyKey: string, value: string) {
  const scopedKey = await getCurrentUserScopedStorageKey(legacyKey);
  await AsyncStorage.setItem(scopedKey, value);
}
