export const MAX_PROFILE_DISPLAY_NAME_LENGTH = 30;

export function normalizeProfileDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const displayName = value.trim();
  if (!displayName || displayName.length > MAX_PROFILE_DISPLAY_NAME_LENGTH) return null;
  return displayName;
}
