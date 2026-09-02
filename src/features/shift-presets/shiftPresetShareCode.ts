export function normalizeShiftPresetShareCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = compact.startsWith('MW') ? compact.slice(2) : compact;
  return body ? `MW-${body}` : '';
}
