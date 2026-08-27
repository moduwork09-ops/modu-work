const HEX_COLOR = /^#[0-9A-F]{6}$/;

export function normalizeHexColor(color: string) {
  const value = color.trim().toUpperCase();
  const withHash = value.startsWith('#') ? value : `#${value}`;
  return HEX_COLOR.test(withHash) ? withHash : null;
}

export function getReadableTextColor(backgroundColor: string) {
  const normalized = normalizeHexColor(backgroundColor) ?? '#FFFFFF';
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 >= 150 ? '#252525' : '#FFFFFF';
}
