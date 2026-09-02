export const OVERTIME_STORAGE_VERSION = 1 as const;

export type OvertimeEntry = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  memo?: string;
  createdAt: string;
  updatedAt?: string;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isOvertimeDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isOvertimeTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function getOvertimeDurationMinutes(startTime: string, endTime: string): number | null {
  if (!isOvertimeTime(startTime) || !isOvertimeTime(endTime) || startTime === endTime) return null;
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return end > start ? end - start : 24 * 60 - start + end;
}

export function isOvertimeEntry(value: unknown): value is OvertimeEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === 'string'
    && entry.id.length > 0
    && isOvertimeDate(entry.date)
    && isOvertimeTime(entry.startTime)
    && isOvertimeTime(entry.endTime)
    && getOvertimeDurationMinutes(entry.startTime, entry.endTime) !== null
    && (entry.memo === undefined || (typeof entry.memo === 'string' && entry.memo.trim() === entry.memo && entry.memo.length > 0))
    && typeof entry.createdAt === 'string'
    && Number.isFinite(Date.parse(entry.createdAt))
    && (entry.updatedAt === undefined || (typeof entry.updatedAt === 'string' && Number.isFinite(Date.parse(entry.updatedAt))));
}

export function parseOvertimeEntries(value: string): OvertimeEntry[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const envelope = parsed as Record<string, unknown>;
    if (envelope.version !== OVERTIME_STORAGE_VERSION || !Array.isArray(envelope.entries)) return null;
    if (!envelope.entries.every(isOvertimeEntry)) return null;
    const ids = envelope.entries.map((entry) => entry.id);
    return new Set(ids).size === ids.length ? envelope.entries : null;
  } catch {
    return null;
  }
}

export function parseBackupOvertimeEntries(value: unknown): OvertimeEntry[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  return value.every(isOvertimeEntry) && new Set(value.map((entry) => entry.id)).size === value.length
    ? value
    : null;
}

export function getOvertimeTotalMinutes(entries: readonly OvertimeEntry[]) {
  return entries.reduce((total, entry) => total + (getOvertimeDurationMinutes(entry.startTime, entry.endTime) ?? 0), 0);
}

export function getOvertimeDateTotalMinutes(entries: readonly OvertimeEntry[], date: string) {
  return getOvertimeTotalMinutes(entries.filter((entry) => entry.date === date));
}

export function getOvertimeMonthTotalMinutes(entries: readonly OvertimeEntry[], year: number, month: number) {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  return getOvertimeTotalMinutes(entries.filter((entry) => entry.date.startsWith(prefix)));
}

export function formatOvertimeDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}분`;
  if (remainder === 0) return `${hours}시간`;
  return `${hours}시간 ${remainder}분`;
}

export function formatOvertimeCalendarBadge(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `초과 ${remainder}m`;
  if (remainder === 0) return `초과 ${hours}h`;
  return `초과 ${hours}h ${remainder}m`;
}
