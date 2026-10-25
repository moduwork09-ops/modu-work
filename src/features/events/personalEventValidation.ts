import type { PersonalEvent } from './personalEventStorage';

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
    place !== null && typeof place === 'object' && typeof place.name === 'string'
    && typeof place.roadAddress === 'string' && typeof place.latitude === 'number'
    && Number.isFinite(place.latitude) && typeof place.longitude === 'number'
    && Number.isFinite(place.longitude) && (place.kakaoPlaceUrl === undefined || typeof place.kakaoPlaceUrl === 'string')
  );
  return typeof event.id === 'string' && typeof event.title === 'string' && event.title.trim().length > 0
    && isDate(event.date) && typeof event.allDay === 'boolean' && isTime(event.startTime)
    && isTime(event.endTime) && typeof event.memo === 'string'
    && (event.color === undefined || (typeof event.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(event.color)))
    && (event.stickerKey === undefined || event.stickerKey === null || typeof event.stickerKey === 'string')
    && (event.stickerPackId === undefined || event.stickerPackId === null || typeof event.stickerPackId === 'string')
    && (event.kind === undefined || event.kind === 'personal' || event.kind === 'shared')
    && (event.source === undefined || event.source === 'together')
    && (event.participants === undefined || (Array.isArray(event.participants) && event.participants.every((item) => typeof item === 'string')))
    && (event.location === undefined || typeof event.location === 'string') && validPlace;
};

export function parsePersonalEventsValue(value: string): PersonalEvent[] | null {
  try {
    const stored = JSON.parse(value) as Partial<StoredEvents>;
    return stored.version === 1 && Array.isArray(stored.events) && stored.events.every(isEvent) ? stored.events : null;
  } catch { return null; }
}
