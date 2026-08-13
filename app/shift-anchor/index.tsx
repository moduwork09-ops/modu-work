import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppText, Card, PrimaryButton, Screen } from '../../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../../src/constants';
import { defaultPattern } from '../../src/features/shift-settings/mockData';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { getShiftTypeByAbbreviation } from '../../src/features/shifts/shiftSchedule';
import { Header } from '../shift-types';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

export default function ShiftAnchorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pattern?: string }>();
  const theme = useAppTheme();
  const { shiftTypes, saveShiftSchedule } = useShiftSchedule();
  const pattern = useMemo(() => params.pattern?.split(',').filter(Boolean) ?? defaultPattern, [params.pattern]);
  const [selectedDate, setSelectedDate] = useState(10);
  const [patternPosition, setPatternPosition] = useState(1);
  const selectedShift = getShiftTypeByAbbreviation(shiftTypes, pattern[patternPosition - 1] ?? pattern[0]);
  const grid = [...Array<number | null>(6).fill(null), ...Array.from({ length: 31 }, (_, index) => index + 1), ...Array<number | null>(5).fill(null)];
  const preview = Array.from({ length: 8 }, (_, offset) => {
    const day = selectedDate + offset;
    const shift = getShiftTypeByAbbreviation(shiftTypes, pattern[(patternPosition - 1 + offset) % pattern.length] ?? pattern[0]);
    return { day, abbreviation: shift.abbreviation, color: shift.color, textColor: shift.textColor };
  });

  return (
    <Screen style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Header title="기준 날짜 설정" onBack={() => router.back()} />
        <AppText tone="secondary" style={styles.description}>이 패턴의 기준 날짜는 언제인가요?\n선택한 날짜가 패턴의 몇 번째 날인지 골라주세요.</AppText>

        <AppText style={styles.sectionTitle}>2026년 8월</AppText>
        <Card style={styles.calendarCard}>
          <View style={styles.weekdayRow}>{weekdays.map((weekday, index) => <AppText key={`weekday-${index}-${weekday}`} variant="caption" tone="secondary" style={styles.weekday}>{weekday}</AppText>)}</View>
          <View style={styles.calendarGrid}>{grid.map((day, index) => day ? <Pressable key={`2026-08-${String(day).padStart(2, '0')}`} onPress={() => setSelectedDate(day)} style={[styles.dateCell, day === selectedDate && { backgroundColor: theme.primary }]}><AppText variant="caption" style={{ color: day === selectedDate ? brandColors.white : theme.text, fontWeight: day === selectedDate ? '700' : '400' }}>{day}</AppText></Pressable> : <View key={`blank-${index}`} style={styles.dateCell} />)}</View>
        </Card>

        <AppText style={styles.sectionTitle}>패턴 위치 선택</AppText>
        <View style={styles.positionRow}>{pattern.map((abbreviation, index) => { const selected = index + 1 === patternPosition; return <Pressable key={`${abbreviation}-${index}`} onPress={() => setPatternPosition(index + 1)} style={[styles.positionButton, { borderColor: theme.border }, selected && { backgroundColor: theme.primary, borderColor: theme.primary }]}><AppText style={{ color: selected ? brandColors.white : theme.text, fontWeight: '700' }}>{index + 1}</AppText><AppText variant="caption" style={{ color: selected ? brandColors.white : theme.textSecondary }}>{abbreviation}</AppText></Pressable>; })}</View>

        <Card style={[styles.anchorSummary, { borderColor: selectedShift.color }]}><AppText tone="secondary">8월 {selectedDate}일 기준 근무</AppText><View style={styles.summaryMain}><View style={[styles.summaryChip, { backgroundColor: selectedShift.color }]}><AppText variant="heading" style={{ color: selectedShift.textColor }}>{selectedShift.abbreviation}</AppText></View><AppText variant="heading">{selectedShift.name}</AppText></View></Card>

        <AppText style={styles.sectionTitle}>적용 결과 미리보기</AppText>
        <Card style={styles.previewCard}>{preview.map((item) => <View key={item.day} style={styles.previewRow}><AppText variant="caption" tone="secondary">8/{item.day}</AppText><View style={[styles.previewChip, { backgroundColor: item.color }]}><AppText variant="caption" style={{ color: item.textColor, fontWeight: '700' }}>{item.abbreviation}</AppText></View></View>)}</Card>
        <PrimaryButton label="근무표 만들기" onPress={() => { saveShiftSchedule({ shiftPattern: pattern, anchorDate: `2026-08-${String(selectedDate).padStart(2, '0')}`, anchorPatternIndex: patternPosition - 1 }); router.replace('/calendar'); }} style={styles.submitButton} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 }, content: { paddingBottom: spacing.xxl }, description: { marginTop: spacing.lg }, sectionTitle: { fontWeight: '700', marginTop: spacing.xl }, calendarCard: { marginTop: spacing.md, padding: spacing.sm }, weekdayRow: { flexDirection: 'row' }, weekday: { textAlign: 'center', width: '14.2857%' }, calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs }, dateCell: { alignItems: 'center', borderRadius: radius.sm, height: 38, justifyContent: 'center', width: '14.2857%' }, positionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md }, positionButton: { alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, height: 50, justifyContent: 'center', width: 48 }, anchorSummary: { marginTop: spacing.md }, summaryMain: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm }, summaryChip: { alignItems: 'center', borderRadius: radius.md, height: 44, justifyContent: 'center', width: 44 }, previewCard: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }, previewRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, width: '22%' }, previewChip: { alignItems: 'center', borderRadius: radius.sm, height: 28, justifyContent: 'center', width: 28 }, submitButton: { marginTop: spacing.xl },
});
