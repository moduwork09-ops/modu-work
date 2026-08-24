export type StorageLoadResult<T> =
  | { status: 'ready'; value: T | null }
  | { status: 'error' };

export function parseStoredValue<T>(
  storedValue: string | null,
  parse: (value: string) => T | null,
): StorageLoadResult<T> {
  if (storedValue === null) return { status: 'ready', value: null };
  const value = parse(storedValue);
  return value === null ? { status: 'error' } : { status: 'ready', value };
}
