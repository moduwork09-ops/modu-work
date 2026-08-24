import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppText, Card, PrimaryButton, Screen } from '../../src/components';
import { radius, spacing, useAppTheme } from '../../src/constants';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { getShiftTypeById } from '../../src/features/shifts/shiftSchedule';
import { Header } from '../shift-types';

export default function ShiftPatternScreen() {
  const router = useRouter();
  const { setup } = useLocalSearchParams<{ setup?: string }>();
  const isSetupFlow = setup === 'true';
  const theme = useAppTheme();
  const { shiftTypes } = useShiftSchedule();
  const getShiftType = (id: string) => getShiftTypeById(shiftTypes, id);
  const [pattern, setPattern] = useState<string[]>([]);

  const addToPattern = (id: string) => setPattern((current) => [...current, id]);
  const removeFromPattern = (index: number) => setPattern((current) => current.filter((_, itemIndex) => itemIndex !== index));

  return (
    <Screen style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Header title="근무패턴 설정" onBack={() => router.canGoBack()
          ? router.back()
          : router.replace({ pathname: '/shift-types', params: isSetupFlow ? { setup: 'true' } : {} })} />
        {isSetupFlow ? <AppText variant="caption" tone="secondary" style={styles.progress}>2 / 3 · 근무패턴</AppText> : null}
        <AppText tone="secondary" style={styles.description}>{'내 근무유형을 순서대로 배치하여\n반복 근무패턴을 만드세요.'}</AppText>

        <AppText style={styles.sectionTitle}>사용 중인 근무유형</AppText>
        <View style={styles.typeRow}>
          {shiftTypes.map((shiftType) => <Pressable key={shiftType.id} onPress={() => addToPattern(shiftType.id)} style={[styles.typeButton, { backgroundColor: shiftType.color }]}><AppText variant="heading" style={{ color: shiftType.textColor }}>{shiftType.abbreviation}</AppText><AppText variant="caption" style={{ color: shiftType.textColor }}>{shiftType.name}</AppText></Pressable>)}
        </View>

        <View style={styles.patternHeader}><AppText style={styles.sectionTitle}>내 근무패턴</AppText><Pressable disabled={pattern.length === 0} onPress={() => setPattern([])} accessibilityLabel="패턴 모두 지우기"><AppText variant="caption" style={{ color: pattern.length ? theme.accent : theme.textSecondary, fontWeight: '700' }}>모두 지우기</AppText></Pressable></View>
        <Card style={styles.patternCard}>
          {pattern.length === 0 ? <AppText tone="secondary" style={styles.emptyText}>위 근무유형을 눌러 패턴에 추가하세요.</AppText> : <View style={styles.patternItems}>{pattern.map((id, index) => { const shiftType = getShiftType(id); return <Pressable key={`${id}-${index}`} accessibilityLabel={`${index + 1}일차 ${shiftType.name}, 누르면 삭제`} onPress={() => removeFromPattern(index)} style={styles.patternItem}><View style={[styles.patternChip, { backgroundColor: shiftType.color }]}><AppText variant="heading" style={{ color: shiftType.textColor }}>{shiftType.abbreviation}</AppText></View><AppText variant="caption" tone="secondary" style={styles.patternOrder}>{index + 1}일차</AppText></Pressable>; })}</View>}
        </Card>
        <AppText variant="caption" tone="secondary" style={styles.hint}>패턴 항목을 누르면 삭제됩니다.</AppText>
        <View style={[styles.cycleNotice, { backgroundColor: theme.surface, borderColor: theme.border }]}><AppText tone="secondary">현재 패턴</AppText><AppText style={{ fontWeight: '700' }}>{pattern.length}일 주기</AppText></View>
        <PrimaryButton label="다음: 기준 날짜 설정" disabled={pattern.length === 0} onPress={() => router.push({ pathname: '/shift-anchor', params: { pattern: pattern.join(','), ...(isSetupFlow ? { setup: 'true' } : {}) } })} style={styles.nextButton} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 }, content: { paddingBottom: spacing.xxl }, progress: { marginTop: spacing.sm }, description: { marginTop: spacing.lg }, sectionTitle: { fontWeight: '700', marginTop: spacing.xl }, typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }, typeButton: { alignItems: 'center', borderRadius: radius.md, minHeight: 72, justifyContent: 'center', width: '22%' }, patternHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, patternCard: { marginTop: spacing.md, minHeight: 116 }, emptyText: { textAlign: 'center' }, patternItems: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, patternItem: { alignItems: 'center', width: 48 }, patternChip: { alignItems: 'center', borderRadius: radius.md, height: 48, justifyContent: 'center', width: 48 }, patternOrder: { marginTop: spacing.xxs, textAlign: 'center' }, hint: { marginTop: spacing.sm }, cycleNotice: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl, padding: spacing.md }, nextButton: { marginTop: spacing.lg },
});
