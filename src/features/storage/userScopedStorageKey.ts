const LEGACY_PREFIX = 'modu-work.';

export function getUserScopedStorageKey(userId: string, legacyKey: string) {
  if (!legacyKey.startsWith(LEGACY_PREFIX)) {
    throw new Error('Invalid legacy storage key');
  }
  return `modu-work.user.${userId}.${legacyKey.slice(LEGACY_PREFIX.length)}`;
}
