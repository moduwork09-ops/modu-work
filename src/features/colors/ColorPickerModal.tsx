import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { AppText } from '../../components';
import { radius, spacing, useAppTheme } from '../../constants';
import { getReadableTextColor, loadRecentColors, normalizeHexColor, rememberRecentColor } from './recentColorStorage';

export type RepresentativeColor = { id: string; label: string; color: string; textColor: string };
type Props = { visible: boolean; initialColor: string; representativeColors: RepresentativeColor[]; onClose: () => void; onSelect: (color: string, textColor: string) => void };
type Hsv = { hue: number; saturation: number; value: number };

const WHEEL_SIZE = 216;
const WHEEL_RADIUS = WHEEL_SIZE / 2;
const CELL_COUNT = 24;
const CELL_SIZE = WHEEL_SIZE / CELL_COUNT;
const brightnessSteps = Array.from({ length: 24 }, (_, index) => index / 23);

function hsvToHex({ hue, saturation, value }: Hsv) {
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = value - chroma;
  const rgb = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return `#${rgb.map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function hexToHsv(color: string): Hsv {
  const normalized = normalizeHexColor(color) ?? '#FFD54F';
  const [red, green, blue] = [normalized.slice(1, 3), normalized.slice(3, 5), normalized.slice(5, 7)].map((channel) => Number.parseInt(channel, 16) / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const hue = delta === 0 ? 0 : maximum === red ? 60 * (((green - blue) / delta) % 6) : maximum === green ? 60 * ((blue - red) / delta + 2) : 60 * ((red - green) / delta + 4);
  return { hue: (hue + 360) % 360, saturation: maximum === 0 ? 0 : delta / maximum, value: maximum };
}

const wheelCells = Array.from({ length: CELL_COUNT * CELL_COUNT }, (_, index) => {
  const row = Math.floor(index / CELL_COUNT);
  const column = index % CELL_COUNT;
  const x = column * CELL_SIZE + CELL_SIZE / 2 - WHEEL_RADIUS;
  const y = row * CELL_SIZE + CELL_SIZE / 2 - WHEEL_RADIUS;
  const distance = Math.sqrt(x * x + y * y);
  if (distance > WHEEL_RADIUS) return null;
  const hue = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return { key: index, left: column * CELL_SIZE, top: row * CELL_SIZE, color: hsvToHex({ hue, saturation: distance / WHEEL_RADIUS, value: 1 }) };
}).filter((cell): cell is NonNullable<typeof cell> => cell !== null);

export function ColorPickerModal({ visible, initialColor, representativeColors, onClose, onSelect }: Props) {
  const theme = useAppTheme();
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(initialColor));
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [selectionSource, setSelectionSource] = useState<'free' | 'recent' | 'representative'>('free');
  const color = useMemo(() => hsvToHex(hsv), [hsv]);

  useEffect(() => {
    if (!visible) return;
    setHsv(hexToHsv(initialColor));
    setSelectionSource('free');
    void loadRecentColors().then(setRecentColors);
  }, [initialColor, visible]);

  const selectFromWheel = (event: GestureResponderEvent) => {
    const x = event.nativeEvent.locationX - WHEEL_RADIUS;
    const y = event.nativeEvent.locationY - WHEEL_RADIUS;
    const distance = Math.min(WHEEL_RADIUS, Math.sqrt(x * x + y * y));
    setHsv((current) => ({ ...current, hue: (Math.atan2(y, x) * 180 / Math.PI + 360) % 360, saturation: distance / WHEEL_RADIUS }));
    setSelectionSource('free');
  };
  const selectBrightness = (event: GestureResponderEvent) => { setHsv((current) => ({ ...current, value: Math.max(0.08, Math.min(1, event.nativeEvent.locationX / WHEEL_SIZE)) })); setSelectionSource('free'); };
  const responderProps: Pick<ComponentProps<typeof View>, 'onStartShouldSetResponder' | 'onMoveShouldSetResponder'> = { onStartShouldSetResponder: () => true, onMoveShouldSetResponder: () => true };
  const confirm = async () => { if (selectionSource !== 'representative') setRecentColors(await rememberRecentColor(color)); onSelect(color, getReadableTextColor(color)); onClose(); };
  const markerAngle = hsv.hue * Math.PI / 180;
  const markerDistance = hsv.saturation * WHEEL_RADIUS;

  return <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}><View style={styles.overlay}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent} style={[styles.sheet, { backgroundColor: theme.surface }]}><AppText variant="heading">사용자 지정 색상</AppText><AppText style={styles.sectionTitle}>대표 색상</AppText><View style={styles.representativeRow}>{representativeColors.map((item) => <Pressable key={item.id} accessibilityLabel={`${item.label} 대표 색상`} onPress={() => { setHsv(hexToHsv(item.color)); setSelectionSource('representative'); }} style={[styles.representativeColor, { backgroundColor: item.color }, selectionSource === 'representative' && color === item.color.toUpperCase() && { borderColor: theme.text, borderWidth: 3 }]}><AppText style={{ color: item.textColor, fontWeight: '700' }}>{item.label}</AppText></Pressable>)}</View><AppText style={styles.sectionTitle}>최근 사용 색상</AppText>{recentColors.length ? <View style={styles.recentRow}>{recentColors.map((item) => <Pressable key={item} accessibilityLabel={`최근 색상 ${item}`} onPress={() => { setHsv(hexToHsv(item)); setSelectionSource('recent'); }} style={[styles.recentColor, { backgroundColor: item }, selectionSource === 'recent' && color === item && { borderColor: theme.text, borderWidth: 3 }]} />)}</View> : <AppText variant="caption" tone="secondary" style={styles.emptyRecent}>아직 사용한 색상이 없어요.</AppText>}<AppText style={styles.sectionTitle}>자유 색상 선택</AppText><View {...responderProps} onResponderGrant={selectFromWheel} onResponderMove={selectFromWheel} accessibilityLabel="색상 휠" style={styles.wheel}>{wheelCells.map((cell) => <View key={cell.key} pointerEvents="none" style={[styles.wheelCell, { backgroundColor: cell.color, left: cell.left, top: cell.top }]} />)}<View pointerEvents="none" style={[styles.wheelMarker, { borderColor: theme.text, left: WHEEL_RADIUS + Math.cos(markerAngle) * markerDistance - 8, top: WHEEL_RADIUS + Math.sin(markerAngle) * markerDistance - 8 }]} /></View><AppText style={styles.controlLabel}>밝기</AppText><View {...responderProps} onResponderGrant={selectBrightness} onResponderMove={selectBrightness} accessibilityLabel="밝기 조절" style={styles.brightness}>{brightnessSteps.map((value) => <View key={value} pointerEvents="none" style={[styles.brightnessStep, { backgroundColor: hsvToHex({ ...hsv, value }) }]} />)}<View pointerEvents="none" style={[styles.brightnessMarker, { borderColor: theme.text, left: hsv.value * WHEEL_SIZE - 7 }]} /></View><View style={styles.previewRow}><View style={[styles.preview, { backgroundColor: color }]}><AppText style={{ color: getReadableTextColor(color), fontWeight: '700' }}>Aa</AppText></View><View><AppText variant="caption" tone="secondary">선택한 색상</AppText><AppText style={styles.hex}>{color}</AppText></View></View><View style={styles.actions}><Pressable onPress={onClose} style={[styles.button, { borderColor: theme.border }]}><AppText style={styles.buttonText}>취소</AppText></Pressable><Pressable onPress={() => void confirm()} style={[styles.button, { backgroundColor: theme.primary, borderColor: theme.primary }]}><AppText style={[styles.buttonText, { color: theme.surface }]}>선택</AppText></Pressable></View></ScrollView></View></Modal>;
}

const styles = StyleSheet.create({ overlay: { backgroundColor: 'rgba(0,0,0,0.4)', flex: 1, justifyContent: 'center', padding: spacing.lg }, sheet: { borderRadius: radius.xl, maxHeight: '92%' }, sheetContent: { padding: spacing.lg }, sectionTitle: { fontWeight: '700', marginTop: spacing.md }, representativeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }, representativeColor: { alignItems: 'center', borderColor: 'transparent', borderRadius: radius.sm, borderWidth: 1, height: 38, justifyContent: 'center', width: 46 }, emptyRecent: { marginTop: spacing.xs }, wheel: { alignSelf: 'center', borderRadius: WHEEL_RADIUS, height: WHEEL_SIZE, marginTop: spacing.sm, overflow: 'hidden', position: 'relative', width: WHEEL_SIZE }, wheelCell: { height: CELL_SIZE + 1, position: 'absolute', width: CELL_SIZE + 1 }, wheelMarker: { backgroundColor: 'transparent', borderRadius: 8, borderWidth: 2, height: 16, position: 'absolute', width: 16 }, controlLabel: { fontWeight: '700', marginTop: spacing.md }, brightness: { alignSelf: 'center', borderRadius: radius.sm, flexDirection: 'row', height: 28, marginTop: spacing.xs, overflow: 'visible', position: 'relative', width: WHEEL_SIZE }, brightnessStep: { flex: 1 }, brightnessMarker: { backgroundColor: 'transparent', borderRadius: 7, borderWidth: 2, height: 34, marginLeft: -7, position: 'absolute', top: -3, width: 14 }, previewRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }, preview: { alignItems: 'center', borderRadius: radius.md, height: 48, justifyContent: 'center', width: 64 }, hex: { fontWeight: '700', marginTop: spacing.xxs }, recentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }, recentColor: { borderColor: 'transparent', borderRadius: 14, borderWidth: 1, height: 28, width: 28 }, actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }, button: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flex: 1, minHeight: 46, justifyContent: 'center' }, buttonText: { fontWeight: '700' } });
