import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, Screen } from '../../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../../src/constants';
import type { ShiftType } from '../../src/features/shift-settings/mockData';
import { formatShiftTime } from '../../src/features/shift-settings/mockData';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { createMonthlyShiftSchedule } from '../../src/features/shifts/shiftSchedule';

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

type SelectedDayDetail = {
  shiftName: string;
  shiftTime: string;
  beforeGapItems: DetailItem[];
  afterGapItems: DetailItem[];
  gap?: { timeRange: string; duration: string };
};

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const filterOptions: CalendarFilter[] = ['전체', '근무', '개인'];


const mockDateDetails: Record<number, SelectedDayDetail> = {
  12: {
    shiftName: '야간근무',
    shiftTime: '19:00 → 다음날 09:00',
    beforeGapItems: [{ id: '2026-08-12-exercise', time: '11:00', title: '운동' }],
    gap: { timeRange: '13:00 ~ 16:00', duration: '3시간' },
    afterGapItems: [
      { id: '2026-08-12-personal', time: '16:00', title: '개인 일정' },
      { id: '2026-08-12-start', time: '19:00', title: '출근' },
      { id: '2026-08-13-end', time: '다음날 09:00', title: '퇴근' },
    ],
  },
  13: {
    shiftName: '야간근무',
    shiftTime: '19:00 → 다음날 09:00',
    beforeGapItems: [{ id: '2026-08-13-start', time: '19:00', title: '출근' }],
    afterGapItems: [{ id: '2026-08-14-end', time: '다음날 09:00', title: '퇴근' }],
  },
  16: {
    shiftName: '휴무',
    shiftTime: '휴식일',
    beforeGapItems: [],
    gap: { timeRange: '10:00 ~ 18:00', duration: '8시간' },
    afterGapItems: [],
  },
};

function formatMockDate(day: number) {
  return `8월 ${day}일 ${weekdays[(day + 5) % 7]}요일`;
}

function getDetailForDay(day: CalendarDay): SelectedDayDetail {
  const savedDetail = mockDateDetails[day.day];

  if (savedDetail) {
    return {
      ...savedDetail,
      shiftName: day.shift.name,
      shiftTime: formatShiftTime(day.shift),
    };
  }

  return {
    shiftName: day.shift.name,
    shiftTime: formatShiftTime(day.shift),
    beforeGapItems: [],
    afterGapItems: [],
  };
}

export default function CalendarScreen() {
  const theme = useAppTheme();
  const schedule = useShiftSchedule();
  const [selectedFilter, setSelectedFilter] = useState<CalendarFilter>('전체');
  const [selectedDayNumber, setSelectedDayNumber] = useState(12);
  const calendarDays: CalendarDay[] = createMonthlyShiftSchedule(2026, 8, schedule).map((item) => ({ day: item.day, date: item.date, shift: item.shift, hasPersonalSchedule: item.day === 12, hasLongGap: item.day === 16 }));
  const selectedDay = calendarDays.find((day) => day.day === selectedDayNumber) ?? calendarDays[11];
  const selectedDetail = getDetailForDay(selectedDay);
  const calendarGrid = [
    ...Array<CalendarDay | null>(6).fill(null),
    ...calendarDays,
    ...Array<CalendarDay | null>(5).fill(null),
  ];

  return (
    <Screen style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AppText variant="heading">캘린더</AppText>
          <View accessible accessibilityLabel="편집 기능 준비 중" style={styles.headerIcon}>
            <MaterialCommunityIcons name="calendar-edit-outline" size={23} color={theme.primary} />
          </View>
        </View>

        <View style={[styles.monthNavigation, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Pressable accessibilityLabel="이전 달" disabled style={styles.monthButton}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={theme.textSecondary} />
          </Pressable>
          <AppText variant="heading">2026년 8월</AppText>
          <Pressable accessibilityLabel="다음 달" disabled style={styles.monthButton}>
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
              const isSelected = day.day === selectedDayNumber;
              const isToday = day.day === 13;

              return (
                <Pressable
                  key={day.date}
                  accessibilityLabel={`${formatMockDate(day.day)}, ${shift.name}`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSelectedDayNumber(day.day)}
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
                  <View style={styles.markerRow}>
                    {day.hasPersonalSchedule ? <View style={[styles.scheduleDot, { backgroundColor: theme.primary }]} /> : null}
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
            <AppText variant="heading">{formatMockDate(selectedDay.day)}</AppText>
            <View style={[styles.shiftSummary, { backgroundColor: selectedDay.shift.color }]}>
              <AppText variant="body" style={{ color: selectedDay.shift.textColor, fontWeight: '700' }}>
                {selectedDetail.shiftName}
              </AppText>
              <AppText variant="caption" style={{ color: selectedDay.shift.textColor }}>
                {selectedDetail.shiftTime}
              </AppText>
            </View>

            {selectedDetail.beforeGapItems.map((item) => (
              <DetailRow key={item.id} item={item} />
            ))}

            {selectedDetail.gap ? (
              <View style={[styles.gapDetail, { backgroundColor: '#FDE7E1', borderColor: theme.accent }]}>
                <View>
                  <AppText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>
                    오늘의 틈
                  </AppText>
                  <AppText variant="body" style={{ color: theme.accent, fontWeight: '700', marginTop: spacing.xxs }}>
                    {selectedDetail.gap.timeRange}
                  </AppText>
                </View>
                <AppText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>
                  {selectedDetail.gap.duration}
                </AppText>
              </View>
            ) : null}

            {selectedDetail.afterGapItems.map((item) => (
              <DetailRow key={item.id} item={item} />
            ))}
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

function DetailRow({ item }: { item: DetailItem }) {
  const theme = useAppTheme();

  return (
    <View style={[styles.detailRow, { borderTopColor: theme.border }]}>
      <AppText variant="caption" style={[styles.detailTime, { color: theme.primary }]}>
        {item.time}
      </AppText>
      <AppText>{item.title}</AppText>
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
    minHeight: 58,
    paddingVertical: spacing.xxs,
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
    marginTop: spacing.xxs,
    minWidth: 25,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
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
    height: 12,
    justifyContent: 'center',
    marginTop: 2,
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
  gapDetail: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    padding: spacing.md,
  },
});
