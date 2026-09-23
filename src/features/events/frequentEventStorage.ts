import AsyncStorage from '@react-native-async-storage/async-storage';

import { getUserScopedStorageKey } from '../storage/userScopedStorage';

export const FREQUENT_EVENTS_STORAGE_KEY = 'modu-work.frequent-events.v1';
export const FREQUENT_EVENTS_STORAGE_VERSION = 1;
export const MAX_FREQUENT_EVENTS = 20;

export type FrequentEventTemplate = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  color: string;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;

export function parseFrequentEventTemplates(value: string): FrequentEventTemplate[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const envelope = parsed as { version?: unknown; templates?: unknown };
    if (envelope.version !== FREQUENT_EVENTS_STORAGE_VERSION || !Array.isArray(envelope.templates) || envelope.templates.length > MAX_FREQUENT_EVENTS) return null;
    const templates = envelope.templates as Array<Record<string, unknown>>;
    if (!templates.every((item) => typeof item?.id === 'string' && item.id.length > 0
      && typeof item.title === 'string' && item.title.trim().length > 0 && item.title.length <= 80
      && typeof item.startTime === 'string' && TIME.test(item.startTime)
      && typeof item.endTime === 'string' && TIME.test(item.endTime) && item.startTime < item.endTime
      && typeof item.color === 'string' && COLOR.test(item.color))) return null;
    if (new Set(templates.map((item) => item.id)).size !== templates.length) return null;
    return templates.map((item) => ({ id: item.id as string, title: (item.title as string).trim(), startTime: item.startTime as string, endTime: item.endTime as string, color: (item.color as string).toUpperCase() }));
  } catch {
    return null;
  }
}

export async function loadFrequentEventTemplates(ownerUserId: string) {
  const value = await AsyncStorage.getItem(getUserScopedStorageKey(ownerUserId, FREQUENT_EVENTS_STORAGE_KEY));
  if (value === null) return [];
  const parsed = parseFrequentEventTemplates(value);
  if (!parsed) throw new Error('자주 쓰는 일정 데이터가 올바르지 않습니다.');
  return parsed;
}

export async function saveFrequentEventTemplates(ownerUserId: string, templates: FrequentEventTemplate[]) {
  const parsed = parseFrequentEventTemplates(JSON.stringify({ version: FREQUENT_EVENTS_STORAGE_VERSION, templates }));
  if (!parsed) throw new Error('자주 쓰는 일정 입력값을 확인해주세요.');
  await AsyncStorage.setItem(getUserScopedStorageKey(ownerUserId, FREQUENT_EVENTS_STORAGE_KEY), JSON.stringify({ version: FREQUENT_EVENTS_STORAGE_VERSION, templates: parsed }));
  return parsed;
}
