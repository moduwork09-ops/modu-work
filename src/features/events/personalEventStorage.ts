import { readUserScopedStorageValue, writeUserScopedStorageValue } from '../storage/userScopedStorage';

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
  kind?: 'personal' | 'shared';
  source?: 'together';
  participants?: string[];
  location?: string;
  place?: EventPlace;
};
type StoredEvents = { version: 1; events: PersonalEvent[] };

const isDate = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
const isTime = (value: unknown) => value === null || (typeof value === 'string' && /^\d{2}:\d{2}$/.test(value));
const isEvent = (value: unknown): value is PersonalEvent => {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  const place = event.place as Record<string, unknown> | undefined;
  const validPlace = place === undefined || (
    place !== null
    && typeof place === 'object'
    && typeof place.name === 'string'
    && typeof place.roadAddress === 'string'
    && typeof place.latitude === 'number'
    && Number.isFinite(place.latitude)
    && typeof place.longitude === 'number'
    && Number.isFinite(place.longitude)
    && (place.kakaoPlaceUrl === undefined || typeof place.kakaoPlaceUrl === 'string')
  );
  return typeof event.id === 'string'
    && typeof event.title === 'string'
    && event.title.trim().length > 0
    && isDate(event.date)
    && typeof event.allDay === 'boolean'
    && isTime(event.startTime)
    && isTime(event.endTime)
    && typeof event.memo === 'string'
    && (event.kind === undefined || event.kind === 'personal' || event.kind === 'shared')
    && (event.source === undefined || event.source === 'together')
    && (event.participants === undefined || (Array.isArray(event.participants) && event.participants.every((item) => typeof item === 'string')))
    && (event.location === undefined || typeof event.location === 'string')
    && validPlace;
};

export function parsePersonalEvents(value: string): PersonalEvent[] | null {
  try {
    const stored = JSON.parse(value) as Partial<StoredEvents>;
    return stored.version === PERSONAL_EVENTS_STORAGE_VERSION && Array.isArray(stored.events) && stored.events.every(isEvent) ? stored.events : null;
  } catch { return null; }
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
