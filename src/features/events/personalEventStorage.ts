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

const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
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

export async function loadPersonalEvents() {
  try { const value = await readUserScopedStorageValue(PERSONAL_EVENTS_STORAGE_KEY); return value ? parsePersonalEvents(value) ?? [] : []; }
  catch (error) { console.warn('Unable to load personal events.', error); return []; }
}

export async function persistPersonalEvents(events: PersonalEvent[]) {
  try { await writeUserScopedStorageValue(PERSONAL_EVENTS_STORAGE_KEY, JSON.stringify({ version: PERSONAL_EVENTS_STORAGE_VERSION, events } satisfies StoredEvents)); return true; }
  catch (error) { console.warn('Unable to save personal events.', error); return false; }
}
