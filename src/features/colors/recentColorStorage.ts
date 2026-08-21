import { readUserScopedStorageValue, writeUserScopedStorageValue } from '../storage/userScopedStorage';

export const RECENT_COLORS_STORAGE_KEY = 'modu-work.recent-colors.v1';
const MAX_RECENT_COLORS = 12;
const HEX_COLOR = /^#[0-9A-F]{6}$/;

export function normalizeHexColor(color: string) {
  const value = color.trim().toUpperCase();
  const withHash = value.startsWith('#') ? value : `#${value}`;
  return HEX_COLOR.test(withHash) ? withHash : null;
}

export async function loadRecentColors() {
  try {
    const stored = await readUserScopedStorageValue(RECENT_COLORS_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.every((color) => typeof color === 'string' && HEX_COLOR.test(color))
      ? parsed.slice(0, MAX_RECENT_COLORS)
      : [];
  } catch {
    return [];
  }
}

export async function rememberRecentColor(color: string) {
  const normalized = normalizeHexColor(color);
  if (!normalized) return [];
  const current = await loadRecentColors();
  const next = [normalized, ...current.filter((item) => item !== normalized)].slice(0, MAX_RECENT_COLORS);
  await writeUserScopedStorageValue(RECENT_COLORS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function getReadableTextColor(backgroundColor: string) {
  const normalized = normalizeHexColor(backgroundColor) ?? '#FFFFFF';
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 >= 150 ? '#252525' : '#FFFFFF';
}
