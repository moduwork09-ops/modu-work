import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppText, Card, PrimaryButton, Screen } from '../../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../../src/constants';
import { defaultPattern } from '../../src/features/shift-settings/mockData';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { getShiftTypeById } from '../../src/features/shifts/shiftSchedule';
import { Header } from '../shift-types';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

function toLocalIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getDateFromIso(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function getMonthGrid(year: number, month: number) {
  const firstWeekday = new Date(year, month - 1, 1, 12).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const remainingCells = (7 - ((firstWeekday + daysInMonth) % 7)) % 7;

  return [
    ...Array<number | null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ...Array<number | null>(remainingCells).fill(null),
  ];
}

export default function ShiftAnchorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pattern?: string }>();
  const theme = useAppTheme();
  const { shiftTypes, saveShiftSchedule } = useShiftSchedule();
  const pattern = useMemo(() => params.pattern?.split(',').filter(Boolean) ?? defaultPattern, [params.pattern]);
  const today = new Date();
  const [displayedMonth, setDisplayedMonth] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() + 1 }));
  const [selectedDate, setSelectedDate] = useState(() => toLocalIsoDate(today));
  const [patternPosition, setPatternPosition] = useState(1);
  const selectedShift = getShiftTypeById(shiftTypes, pattern[patternPosition - 1] ?? pattern[0]);
  const grid = getMonthGrid(displayedMonth.year, displayedMonth.month);
  const selectedDateObject = getDateFromIso(selectedDate);
  const preview = Array.from({ length: 8 }, (_, offset) => {
    const date = new Date(selectedDateObject.getFullYear(), selectedDateObject.getMonth(), selectedDateObject.getDate() + offset, 12);
    const shift = getShiftTypeById(shiftTypes, pattern[(patternPosition - 1 + offset) % pattern.length] ?? pattern[0]);
    return { date: toLocalIsoDate(date), label: `${date.getMonth() + 1}/${date.getDate()}`, abbreviation: shift.abbreviation, color: shift.color, textColor: shift.textColor };
  });

  const moveMonth = (offset: number) => {
    const nextMonth = new Date(displayedMonth.year, displayedMonth.month - 1 + offset, 1, 12);
    const nextYear = nextMonth.getFullYear();
    const nextMonthNumber = nextMonth.getMonth() + 1;

    setDisplayedMonth({ year: nextYear, month: nextMonthNumber });
    setSelectedDate(toLocalIsoDate(new Date(nextYear, nextMonthNumber - 1, 1, 12)));
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Header title="기준 날짜 설정" onBack={() => router.back()} />
        <AppText tone="secondary" style={styles.description}>이 패턴의 기준 날짜는 언제인가요?\n선택한 날짜가 패턴의 몇 번째 날인지 골라주세요.</AppText>

        <View style={styles.monthNavigation}>
          <Pressable accessibilityLabel="이전 달" onPress={() => moveMonth(-1)} style={styles.monthButton}><AppText variant="heading">‹</AppText></Pressable>
          <AppText style={styles.sectionTitle}>{displayedMonth.year}년 {displayedMonth.month}월</AppText>
          <Pressable accessibilityLabel="다음 달" onPress={() => moveMonth(1)} style={styles.monthButton}><AppText variant="heading">›</AppText></Pressable>
        </View>
        <Card style={styles.calendarCard}>
          <View style={styles.weekdayRow}>{weekdays.map((weekday, index) => <AppText key={`weekday-${index}-${weekday}`} variant="caption" tone="secondary" style={styles.weekday}>{weekday}</AppText>)}</View>
          <View style={styles.calendarGrid}>{grid.map((day, index) => {
            if (!day) return <View key={`blank-${index}`} style={styles.dateCell} />;
            const date = toLocalIsoDate(new Date(displayedMonth.year, displayedMonth.month - 1, day, 12));
            const isSelected = date === selectedDate;
            return <Pressable key={date} onPress={() => setSelectedDate(date)} style={[styles.dateCell, isSelected && { backgroundColor: theme.primary }]}><AppText variant="caption" style={{ color: isSelected ? brandColors.white : theme.text, fontWeight: isSelected ? '700' : '400' }}>{day}</AppText></Pressable>;
          })}</View>
        </Card>

        <AppText style={styles.sectionTitle}>패턴 위치 선택</AppText>
        <View style={styles.positionRow}>{pattern.map((id, index) => { const selected = index + 1 === patternPosition; const shift = getShiftTypeById(shiftTypes, id); return <Pressable key={`${id}-${index}`} onPress={() => setPatternPosition(index + 1)} style={[styles.positionButton, { borderColor: theme.border }, selected && { backgroundColor: theme.primary, borderColor: theme.primary }]}><AppText style={{ color: selected ? brandColors.white : theme.text, fontWeight: '700' }}>{index + 1}</AppText><AppText variant="caption" style={{ color: selected ? brandColors.white : theme.textSecondary }}>{shift.abbreviation}</AppText></Pressable>; })}</View>

        <Card style={[styles.anchorSummary, { borderColor: selectedShift.color }]}><AppText tone="secondary">{selectedDateObject.getMonth() + 1}월 {selectedDateObject.getDate()}일 기준 근무</AppText><View style={styles.summaryMain}><View style={[styles.summaryChip, { backgroundColor: selectedShift.color }]}><AppText variant="heading" style={{ color: selectedShift.textColor }}>{selectedShift.abbreviation}</AppText></View><AppText variant="heading">{selectedShift.name}</AppText></View></Card>

        <AppText style={styles.sectionTitle}>적용 결과 미리보기</AppText>
        <Card style={styles.previewCard}>{preview.map((item) => <View key={item.date} style={styles.previewRow}><AppText variant="caption" tone="secondary">{item.label}</AppText><View style={[styles.previewChip, { backgroundColor: item.color }]}><AppText variant="caption" style={{ color: item.textColor, fontWeight: '700' }}>{item.abbreviation}</AppText></View></View>)}</Card>
        <PrimaryButton label="근무표 만들기" onPress={() => { void (async () => { await saveShiftSchedule({ shiftPattern: pattern, anchorDate: selectedDate, anchorPatternIndex: patternPosition - 1 }); router.replace('/calendar'); })(); }} style={styles.submitButton} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 }, content: { paddingBottom: spacing.xxl }, description: { marginTop: spacing.lg }, monthNavigation: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl }, monthButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 }, sectionTitle: { fontWeight: '700' }, calendarCard: { marginTop: spacing.md, padding: spacing.sm }, weekdayRow: { flexDirection: 'row' }, weekday: { textAlign: 'center', width: '14.2857%' }, calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs }, dateCell: { alignItems: 'center', borderRadius: radius.sm, height: 38, justifyContent: 'center', width: '14.2857%' }, positionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md }, positionButton: { alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, height: 50, justifyContent: 'center', width: 48 }, anchorSummary: { marginTop: spacing.md }, summaryMain: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm }, summaryChip: { alignItems: 'center', borderRadius: radius.md, height: 44, justifyContent: 'center', width: 44 }, previewCard: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }, previewRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, width: '22%' }, previewChip: { alignItems: 'center', borderRadius: radius.sm, height: 28, justifyContent: 'center', width: 28 }, submitButton: { marginTop: spacing.xl },
});
