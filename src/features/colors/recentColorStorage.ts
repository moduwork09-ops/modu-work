import { readUserScopedStorageValue, writeUserScopedStorageValue } from '../storage/userScopedStorage';
import { normalizeHexColor } from './readableColor';
export { getReadableTextColor, normalizeHexColor } from './readableColor';

export const RECENT_COLORS_STORAGE_KEY = 'modu-work.recent-colors.v1';
const MAX_RECENT_COLORS = 12;
const HEX_COLOR = /^#[0-9A-F]{6}$/;

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
