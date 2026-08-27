import { readUserScopedStorageValue, writeUserScopedStorageValue } from '../storage/userScopedStorage';
import { parsePersonalEventsValue } from './personalEventValidation';

export const PERSONAL_EVENTS_STORAGE_KEY = 'modu-work.personal-events.v1';
export const PERSONAL_EVENTS_STORAGE_VERSION = 1;

export type EventPlace = {
  name: string;
  roadAddress: string;
  latitude: number;
  longitude: number;
  kakaoPlaceUrl?: string;
};

export type PersonalEvent = {
  id: string;
  title: string;
  date: string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  memo: string;
  color?: string;
  kind?: 'personal' | 'shared';
  source?: 'together';
  participants?: string[];
  location?: string;
  place?: EventPlace;
};
type StoredEvents = { version: 1; events: PersonalEvent[] };
export function parsePersonalEvents(value: string): PersonalEvent[] | null {
  return parsePersonalEventsValue(value);
}

export type PersonalEventsLoadResult =
  | { status: 'ready'; value: PersonalEvent[] }
  | { status: 'error' };

export async function loadPersonalEventsResult(): Promise<PersonalEventsLoadResult> {
  try {
    const value = await readUserScopedStorageValue(PERSONAL_EVENTS_STORAGE_KEY);
    if (value === null) return { status: 'ready', value: [] };
    const events = parsePersonalEvents(value);
    return events ? { status: 'ready', value: events } : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

export async function loadPersonalEvents() {
  const result = await loadPersonalEventsResult();
  return result.status === 'ready' ? result.value : [];
}

export async function persistPersonalEvents(events: PersonalEvent[]) {
  try { await writeUserScopedStorageValue(PERSONAL_EVENTS_STORAGE_KEY, JSON.stringify({ version: PERSONAL_EVENTS_STORAGE_VERSION, events } satisfies StoredEvents)); return true; }
  catch (error) { console.warn('Unable to save personal events.', error); return false; }
}
