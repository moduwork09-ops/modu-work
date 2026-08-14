import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Card, Screen } from '../../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../../src/constants';
import { calculateDailyGaps, formatGapDuration, type GapCalculationResult } from '../../src/features/gaps/gapCalculator';
import type { ShiftType } from '../../src/features/shift-settings/mockData';
import { formatShiftTime } from '../../src/features/shift-settings/mockData';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { createMonthlyShiftSchedule, getPreviousIsoDate, getShiftForDate, type ShiftScheduleInput } from '../../src/features/shifts/shiftSchedule';

type CalendarFilter = '전체' | '근무' | '개인';

type CalendarDay = {
  day: number;
  date: string;
  shift: ShiftType;
  hasPersonalSchedule?: boolean;
  hasLongGap?: boolean;
};

type DetailItem = {
  id: string;
  time: string;
  title: string;
};

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const filterOptions: CalendarFilter[] = ['전체', '근무', '개인'];

function toLocalIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getDateFromIso(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function formatCalendarDate(isoDate: string) {
  const date = getDateFromIso(isoDate);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekdays[date.getDay()]}요일`;
}

function getMonthGrid(year: number, month: number, days: CalendarDay[]) {
  const firstWeekday = new Date(year, month - 1, 1, 12).getDay();
  const remainingCells = (7 - ((firstWeekday + days.length) % 7)) % 7;

  return [
    ...Array<CalendarDay | null>(firstWeekday).fill(null),
    ...days,
    ...Array<CalendarDay | null>(remainingCells).fill(null),
  ];
}

type GapSchedule = ShiftScheduleInput & {
  personalEvents: ReturnType<typeof useShiftSchedule>['personalEvents'];
};

function getGapResultForDate(date: string, schedule: GapSchedule): GapCalculationResult {
  const previousDate = getPreviousIsoDate(date);
  const shifts = [date, previousDate].map((shiftDate) => {
    const shift = getShiftForDate(shiftDate, schedule);

    return {
      date: shiftDate,
      kind: shift.kind,
      startTime: shift.startTime,
      endTime: shift.endTime,
    };
  });

  return calculateDailyGaps({
    date,
    shifts,
    personalEvents: schedule.personalEvents,
  });
}

export default function CalendarScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const schedule = useShiftSchedule();
  const today = new Date();
  const todayDate = toLocalIsoDate(today);
  const [selectedFilter, setSelectedFilter] = useState<CalendarFilter>('전체');
  const [displayedMonth, setDisplayedMonth] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() + 1 }));
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [isMemoEditorVisible, setIsMemoEditorVisible] = useState(false);
  const [memoInput, setMemoInput] = useState('');
  const calendarDays: CalendarDay[] = createMonthlyShiftSchedule(displayedMonth.year, displayedMonth.month, schedule).map((item) => {
    const gapResult = getGapResultForDate(item.date, schedule);

    return {
      day: item.day,
      date: item.date,
      shift: item.shift,
      hasPersonalSchedule: schedule.personalEvents.some((event) => event.date === item.date),
      hasLongGap: gapResult.gaps.some((gap) => gap.durationMinutes >= 180),
    };
  });
  const selectedDay = calendarDays.find((day) => day.date === selectedDate) ?? calendarDays[0];
  const selectedGapResult = getGapResultForDate(selectedDay.date, schedule);
  const selectedMemo = schedule.dateMemos[selectedDay.date] ?? '';
  const selectedEvents = schedule.personalEvents.filter((event) => event.date === selectedDay.date).sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const showMemosInMonth = selectedFilter !== '근무';
  const calendarGrid = getMonthGrid(displayedMonth.year, displayedMonth.month, calendarDays);
  const hasShiftTimes = Boolean(selectedDay.shift.startTime && selectedDay.shift.endTime);
  const isOvernight = hasShiftTimes && selectedDay.shift.endTime! <= selectedDay.shift.startTime!;
  const shiftBoundaryItems = hasShiftTimes ? [
    { id: `${selectedDay.date}-shift-start`, time: selectedDay.shift.startTime!, title: '출근' },
    { id: `${selectedDay.date}-shift-end`, time: `${isOvernight ? '다음날 ' : ''}${selectedDay.shift.endTime!}`, title: '퇴근' },
  ] : [];

  const moveMonth = (offset: number) => {
    const nextMonth = new Date(displayedMonth.year, displayedMonth.month - 1 + offset, 1, 12);
    const nextYear = nextMonth.getFullYear();
    const nextMonthNumber = nextMonth.getMonth() + 1;

    setDisplayedMonth({ year: nextYear, month: nextMonthNumber });
    setSelectedDate(toLocalIsoDate(new Date(nextYear, nextMonthNumber - 1, 1, 12)));
  };

  const openMemoEditor = () => {
    setMemoInput(selectedMemo);
    setIsMemoEditorVisible(true);
  };

  const saveMemo = async () => {
    await schedule.saveDateMemo(selectedDay.date, memoInput);
    setIsMemoEditorVisible(false);
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AppText variant="heading">캘린더</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="선택 날짜 메모 편집" onPress={openMemoEditor} style={styles.headerIcon}>
            <MaterialCommunityIcons name="calendar-edit-outline" size={23} color={theme.primary} />
          </Pressable>
        </View>

        <View style={[styles.monthNavigation, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Pressable accessibilityLabel="이전 달" onPress={() => moveMonth(-1)} style={styles.monthButton}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={theme.textSecondary} />
          </Pressable>
          <AppText variant="heading">{displayedMonth.year}년 {displayedMonth.month}월</AppText>
          <Pressable accessibilityLabel="다음 달" onPress={() => moveMonth(1)} style={styles.monthButton}>
            <MaterialCommunityIcons name="chevron-right" size={24} color={theme.textSecondary} />
          </Pressable>
        </View>

        <View accessibilityRole="tablist" style={styles.filterRow}>
          {filterOptions.map((filter) => {
            const isSelected = selectedFilter === filter;
            return (
              <Pressable
                key={`filter-${filter}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                onPress={() => setSelectedFilter(filter)}
                style={[styles.filterButton, { borderColor: theme.border }, isSelected && { backgroundColor: theme.primary, borderColor: theme.primary }]}
              >
                <AppText variant="caption" style={{ color: isSelected ? brandColors.white : theme.textSecondary, fontWeight: '700' }}>
                  {filter}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <Card style={styles.calendarCard}>
          <View style={styles.weekdayRow}>
            {weekdays.map((weekday, index) => (
              <AppText
                key={`weekday-${index}-${weekday}`}
                variant="caption"
                style={[styles.weekday, { color: index === 0 ? theme.accent : theme.textSecondary }]}
              >
                {weekday}
              </AppText>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendarGrid.map((day, index) => {
              if (!day) {
                return <View key={`blank-${index}`} style={styles.calendarCell} />;
              }

              const shift = day.shift;
              const memo = showMemosInMonth ? schedule.dateMemos[day.date] : undefined;
              const isSelected = day.date === selectedDay.date;
              const isToday = day.date === todayDate;

              return (
                <Pressable
                  key={day.date}
                  accessibilityLabel={`${formatCalendarDate(day.date)}, ${shift.name}`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSelectedDate(day.date)}
                  style={[
                    styles.calendarCell,
                    isToday && { borderColor: theme.accent, borderWidth: 1 },
                    isSelected && { backgroundColor: brandColors.warmIvory, borderColor: theme.primary, borderWidth: 2 },
                  ]}
                >
                  <AppText variant="caption" style={[styles.dayNumber, { color: theme.text }]}>
                    {day.day}
                  </AppText>
                  <View style={[styles.shiftChip, { backgroundColor: shift.color }]}>
                    <AppText style={[styles.shiftLabel, { color: shift.textColor }]}>{shift.abbreviation}</AppText>
                  </View>
                  <AppText numberOfLines={2} ellipsizeMode="tail" style={[styles.memoPreview, { color: theme.textSecondary }]}>
                    {memo ?? ''}
                  </AppText>
                  <View style={styles.markerRow}>
                    {showMemosInMonth && day.hasPersonalSchedule ? <View style={[styles.scheduleDot, { backgroundColor: theme.accent }]} /> : null}
                    {day.hasLongGap ? <MaterialCommunityIcons name="star-four-points" size={11} color={theme.accent} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <View style={styles.detailSection}>
          <AppText variant="heading">선택 날짜</AppText>
          <Card style={styles.detailCard}>
            <AppText variant="heading">{formatCalendarDate(selectedDay.date)}</AppText>
            <View style={[styles.shiftSummary, { backgroundColor: selectedDay.shift.color }]}>
              <AppText variant="body" style={{ color: selectedDay.shift.textColor, fontWeight: '700' }}>
                {selectedDay.shift.name}
              </AppText>
              <AppText variant="caption" style={{ color: selectedDay.shift.textColor }}>
                {formatShiftTime(selectedDay.shift)}
              </AppText>
            </View>

            {selectedMemo ? (
              <View style={[styles.memoDetail, { borderColor: theme.border }]}>
                <View style={styles.memoDetailHeader}>
                  <AppText style={{ fontWeight: '700' }}>메모</AppText>
                  <Pressable accessibilityRole="button" accessibilityLabel="메모 편집" onPress={openMemoEditor} hitSlop={8}>
                    <AppText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>편집</AppText>
                  </Pressable>
                </View>
                <AppText style={styles.memoDetailText}>{selectedMemo}</AppText>
              </View>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel="메모 추가" onPress={openMemoEditor} style={[styles.addMemoRow, { borderColor: theme.border }]}>
                <AppText variant="caption" style={{ color: theme.textSecondary }}>+ 메모 추가</AppText>
              </Pressable>
            )}

            {selectedFilter !== '근무' ? (
              <View style={[styles.eventsSection, { borderColor: theme.border }]}>
                <View style={styles.memoDetailHeader}>
                  <AppText style={{ fontWeight: '700' }}>개인 일정</AppText>
                  <Pressable onPress={() => router.push({ pathname: '/events/new', params: { date: selectedDay.date } })}>
                    <AppText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>+ 일정 추가</AppText>
                  </Pressable>
                </View>
                {selectedEvents.map((event) => (
                  <Pressable key={event.id} accessibilityRole="button" accessibilityLabel={`${event.title} 일정 수정`} onPress={() => router.push({ pathname: '/events/[id]', params: { id: event.id } })} style={[styles.eventCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={styles.eventTitleRow}>
                      <AppText style={styles.eventTitle}>{event.title}</AppText>
                      <MaterialCommunityIcons name="dots-vertical" size={20} color={theme.textSecondary} />
                    </View>
                    <View style={styles.eventTimeRow}>
                      <MaterialCommunityIcons name="clock-outline" size={15} color={theme.textSecondary} />
                      <AppText variant="caption" tone="secondary">{event.allDay ? '하루 종일' : `${event.startTime} ~ ${event.endTime}`}</AppText>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={[styles.gapDetail, { backgroundColor: '#FDE7E1', borderColor: theme.accent }]}>
              <View style={styles.gapDetailHeader}>
                <AppText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>
                  오늘의 틈
                </AppText>
                <AppText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>
                  총 {formatGapDuration(selectedGapResult.totalGapMinutes)}
                </AppText>
              </View>
              {selectedGapResult.gaps.length > 0 ? selectedGapResult.gaps.map((gap) => (
                <View key={`${gap.startTime}-${gap.endTime}`} style={styles.gapDetailRow}>
                  <AppText variant="body" style={{ color: theme.accent, fontWeight: '700' }}>
                    {gap.startTime} ~ {gap.endTime}
                  </AppText>
                  <AppText variant="caption" style={{ color: theme.accent }}>
                    {formatGapDuration(gap.durationMinutes)}
                  </AppText>
                </View>
              )) : (
                <AppText variant="caption" style={{ color: theme.textSecondary, marginTop: spacing.xs }}>
                  30분 이상 사용할 수 있는 틈이 없어요.
                </AppText>
              )}
            </View>

            {shiftBoundaryItems.map((item) => (
              <DetailRow key={item.id} item={item} />
            ))}
          </Card>
        </View>
      </ScrollView>

      <Modal transparent animationType="slide" visible={isMemoEditorVisible} onRequestClose={() => setIsMemoEditorVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.memoModal, { backgroundColor: theme.surface }]}>
            <AppText variant="heading">날짜 메모</AppText>
            <AppText variant="caption" tone="secondary" style={styles.modalDate}>{formatCalendarDate(selectedDay.date)}</AppText>
            <TextInput
              accessibilityLabel="날짜 메모 입력"
              autoFocus
              multiline
              placeholder="메모를 입력하세요"
              placeholderTextColor={theme.textSecondary}
              value={memoInput}
              onChangeText={setMemoInput}
              style={[styles.memoInput, { borderColor: theme.border, color: theme.text }]}
              textAlignVertical="top"
            />
            <AppText variant="caption" tone="secondary">내용을 모두 지우고 저장하면 메모가 삭제됩니다.</AppText>
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" onPress={() => setIsMemoEditorVisible(false)} style={[styles.modalButton, { borderColor: theme.border }]}>
                <AppText style={{ fontWeight: '700' }}>취소</AppText>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => { void saveMemo(); }} style={[styles.modalButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                <AppText style={{ color: theme.surface, fontWeight: '700' }}>저장</AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function DetailRow({ item }: { item: DetailItem }) {
  const theme = useAppTheme();
  const isShiftBoundary = item.title === '출근' || item.title === '퇴근';

  return (
    <View style={[styles.detailRow, { borderTopColor: theme.border }]}>
      {isShiftBoundary ? (
        <>
          <AppText>{item.title}</AppText>
          <AppText variant="caption" style={[styles.detailTimeRight, { color: theme.primary }]}>{item.time}</AppText>
        </>
      ) : (
        <>
          <AppText variant="caption" style={[styles.detailTime, { color: theme.primary }]}>{item.time}</AppText>
          <AppText>{item.title}</AppText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: spacing.sm,
    paddingBottom: 0,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  headerIcon: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  monthNavigation: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  monthButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  filterButton: {
    alignItems: 'center',
    borderRadius: radius.xxl,
    borderWidth: 1,
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  calendarCard: {
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  weekday: {
    textAlign: 'center',
    width: '14.2857%',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    alignItems: 'center',
    borderRadius: radius.sm,
    justifyContent: 'center',
    minHeight: 74,
    paddingVertical: 2,
    width: '14.2857%',
  },
  dayNumber: {
    fontSize: 13,
    lineHeight: 17,
  },
  shiftChip: {
    alignItems: 'center',
    borderRadius: radius.sm,
    justifyContent: 'center',
    marginTop: 2,
    minWidth: 25,
    paddingHorizontal: spacing.xs,
    paddingVertical: 0,
  },
  shiftLabel: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  markerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    height: 8,
    justifyContent: 'center',
    marginTop: 1,
  },
  memoPreview: {
    fontSize: 10,
    lineHeight: 11,
    marginTop: 2,
    minHeight: 22,
    textAlign: 'center',
    width: '92%',
  },
  scheduleDot: {
    borderRadius: 3,
    height: 5,
    width: 5,
  },
  detailSection: {
    marginTop: spacing.xxl,
  },
  detailCard: {
    marginTop: spacing.md,
  },
  shiftSummary: {
    borderRadius: radius.md,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  memoDetail: {
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  memoDetailHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  memoDetailText: {
    marginTop: spacing.xs,
  },
  addMemoRow: {
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  eventsSection: { borderTopWidth: 1, marginTop: spacing.md, paddingTop: spacing.md },
  eventCard: { borderRadius: radius.md, borderWidth: 1, marginTop: spacing.sm, padding: spacing.md },
  eventTitleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  eventTitle: { fontWeight: '700', paddingRight: spacing.sm },
  eventTimeRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  detailRow: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    minHeight: 48,
  },
  detailTime: {
    fontWeight: '700',
    width: 92,
  },
  detailTimeRight: {
    fontWeight: '700',
    marginLeft: 'auto',
    textAlign: 'right',
  },
  gapDetail: {
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  gapDetailHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  gapDetailRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  modalOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  memoModal: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
  },
  modalDate: {
    marginTop: spacing.xs,
  },
  memoInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.md,
    minHeight: 132,
    padding: spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  modalButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
});
