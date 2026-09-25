import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Card } from '../../components';
import { radius, spacing } from '../../constants';
import type { ShiftPreset } from './shiftPreset';

export function ShiftPresetCard({ preset, onPress }: { preset: ShiftPreset; onPress?: () => void }) {
  const byKey = new Map(preset.shiftTypes.map((item) => [item.key, item]));
  const content = <Card style={styles.card}><AppText style={styles.name}>{preset.organizationName || preset.name}</AppText>{preset.organizationName ? <AppText variant="caption" tone="secondary">{preset.name}</AppText> : null}{preset.description ? <AppText variant="caption" tone="secondary">{preset.description}</AppText> : null}<View style={styles.pattern}>{preset.pattern.map((key, index) => { const shift = byKey.get(key)!; return <View key={`${key}-${index}`} style={[styles.badge, { backgroundColor: shift.color }]}><AppText variant="caption" style={{ color: shift.textColor, fontWeight: '700' }}>{shift.abbreviation}</AppText></View>; })}</View>{preset.teamRotationTemplate ? <AppText variant="caption" tone="secondary">{preset.teamRotationTemplate.teams.map((team) => team.label).join(' · ')} 중 선택</AppText> : null}{preset.source === 'public' ? <AppText variant="caption" tone="secondary">커뮤니티 등록</AppText> : null}</Card>;
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>{content}</Pressable> : content;
}
const styles = StyleSheet.create({ card: { gap: spacing.xs }, name: { fontWeight: '700' }, pattern: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, badge: { alignItems: 'center', borderRadius: radius.sm, height: 30, justifyContent: 'center', minWidth: 30, paddingHorizontal: spacing.xs }, pressed: { opacity: 0.78 } });
