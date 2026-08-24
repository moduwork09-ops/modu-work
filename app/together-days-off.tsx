import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, PrimaryButton, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { useShiftSchedule } from '../src/features/shifts/ShiftScheduleContext';
import { createDayOffProjectionRange } from '../src/features/together/dayOffProjection';
import { syncMyDayOffProjectionRange } from '../src/features/together/togetherServerData';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const DAY_OFF_COLORS = {
  mine: '#E7ECE3',
  partner: '#FCE0D8',
  common: brandColors.coral,
} as const;

const MOCK_MY_DAYS_OFF = ['2026-08-03', '2026-08-12', '2026-08-21', '2026-08-24', '2026-08-31'] as const;
const MOCK_PARTNER_DAYS_OFF = ['2026-08-07', '2026-08-16', '2026-08-24', '2026-08-28', '2026-09-01'] as const;
const MOCK_COMMON_DAYS_OFF = ['2026-08-24', '2026-08-28', '2026-09-01'] as const;

const MOCK_UPCOMING_COMMON_DAYS = [
  { date: '8/24 (토)', range: '하루 종일' },
  { date: '8/28 (수)', range: '하루 종일' },
  { date: '9/1 (일)', range: '하루 종일' },
] as const;

type DayOffType = keyof typeof DAY_OFF_COLORS;

type CalendarDay = {
  date: Date;
  dateKey: string;
  day: number;
  isCurrentMonth: boolean;
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildCalendarDays(year: number, month: number): CalendarDay[] {
  const firstDay = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);

    return {
      date,
      dateKey: toDateKey(date),
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
    };
  });
}

function getDayOffType(dateKey: string): DayOffType | undefined {
  if (MOCK_COMMON_DAYS_OFF.includes(dateKey as (typeof MOCK_COMMON_DAYS_OFF)[number])) return 'common';
  if (MOCK_PARTNER_DAYS_OFF.includes(dateKey as (typeof MOCK_PARTNER_DAYS_OFF)[number])) return 'partner';
  if (MOCK_MY_DAYS_OFF.includes(dateKey as (typeof MOCK_MY_DAYS_OFF)[number])) return 'mine';
  return undefined;
}

function CalendarCell({ day }: { day: CalendarDay }) {
  const theme = useAppTheme();
  const dayOffType = getDayOffType(day.dateKey);
  const weekday = day.date.getDay();
  const isCommon = dayOffType === 'common';
  const dateColor = isCommon
    ? brandColors.white
    : !day.isCurrentMonth
      ? theme.textSecondary
      : weekday === 0
        ? brandColors.coral
        : weekday === 6
          ? '#4B6FA8'
          : theme.text;

  return (
    <View style={styles.calendarCell}>
      <View
        style={[
          styles.dateMarker,
          dayOffType && { backgroundColor: DAY_OFF_COLORS[dayOffType] },
          !day.isCurrentMonth && !isCommon && styles.outsideMonth,
        ]}
      >
        <AppText style={[styles.dateText, { color: dateColor }]}>{day.day}</AppText>
      </View>
    </View>
  );
}

function MonthCalendar({ year, month }: { year: number; month: number }) {
  const days = useMemo(() => buildCalendarDays(year, month), [month, year]);
  const weeks = Array.from({ length: 6 }, (_, index) => days.slice(index * 7, index * 7 + 7));

  return (
    <View style={styles.calendar}>
      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((weekday, index) => (
          <View key={weekday} style={styles.weekdayCell}>
            <AppText
              variant="caption"
              style={[
                styles.weekdayText,
                index === 0 && styles.sundayText,
                index === 6 && styles.saturdayText,
              ]}
            >
              {weekday}
            </AppText>
          </View>
        ))}
      </View>

      {weeks.map((week, weekIndex) => (
        <View key={`week-${weekIndex}`} style={styles.calendarRow}>
          {week.map((day) => <CalendarCell day={day} key={day.dateKey} />)}
        </View>
      ))}
    </View>
  );
}

function Legend() {
  return (
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: DAY_OFF_COLORS.mine }]} />
        <AppText variant="caption" style={styles.legendText}>나의 휴무</AppText>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: DAY_OFF_COLORS.partner }]} />
        <AppText variant="caption" style={styles.legendText}>배우자 휴무</AppText>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: DAY_OFF_COLORS.common }]} />
        <AppText variant="caption" style={styles.legendText}>공통 휴무</AppText>
      </View>
    </View>
  );
}

function UpcomingDayOffRow({ item }: { item: (typeof MOCK_UPCOMING_COMMON_DAYS)[number] }) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => Alert.alert('공통 휴무', '공통 휴무 상세 기능은 다음 단계에서 연결할 예정입니다.')}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card style={styles.upcomingCard}>
        <AppText variant="button" style={styles.upcomingDate}>{item.date}</AppText>
        <AppText tone="secondary" style={styles.upcomingRange}>{item.range}</AppText>
        <MaterialCommunityIcons name="chevron-right" color={theme.text} size={18} />
      </Card>
    </Pressable>
  );
}

export default function TogetherDaysOffScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const schedule = useShiftSchedule();
  const [visibleMonth, setVisibleMonth] = useState({ year: 2026, month: 7 });
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const moveMonth = (offset: number) => {
    const next = new Date(visibleMonth.year, visibleMonth.month + offset, 1);
    setVisibleMonth({ year: next.getFullYear(), month: next.getMonth() });
  };

  const syncMyDaysOff = async () => {
    if (isSyncingRef.current || !schedule.isHydrated || !schedule.hasCompletedSetup) return;
    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const projection = createDayOffProjectionRange(schedule);
      await syncMyDayOffProjectionRange(projection);
      if (isMountedRef.current) Alert.alert('동기화 완료', '휴무 데이터 동기화가 완료됐어요.');
    } catch {
      if (isMountedRef.current) Alert.alert('동기화 실패', '휴무 데이터를 동기화할 수 없어요. 잠시 후 다시 시도해주세요.');
    } finally {
      isSyncingRef.current = false;
      if (isMountedRef.current) setIsSyncing(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="뒤로"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
        </Pressable>
        <AppText variant="button" style={styles.headerTitle}>공통 휴무</AppText>
        <Pressable
          accessibilityLabel="공통 휴무 설정"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => Alert.alert('공통 휴무 설정', '공통 휴무 설정은 다음 단계에서 연결할 예정입니다.')}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="cog-outline" color={theme.text} size={22} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.monthSelector}>
          <Pressable
            accessibilityLabel="이전 달"
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => moveMonth(-1)}
            style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="chevron-left" color={theme.text} size={22} />
          </Pressable>
          <AppText variant="button" style={styles.monthTitle}>
            {visibleMonth.year}년 {visibleMonth.month + 1}월
          </AppText>
          <Pressable
            accessibilityLabel="다음 달"
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => moveMonth(1)}
            style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="chevron-right" color={theme.text} size={22} />
          </Pressable>
        </View>

        <MonthCalendar month={visibleMonth.month} year={visibleMonth.year} />
        <Legend />

        {__DEV__ && (
          <PrimaryButton
            disabled={isSyncing || !schedule.isHydrated || !schedule.hasCompletedSetup}
            label={isSyncing ? '휴무 동기화 중...' : '개발용: 내 휴무 서버 동기화'}
            onPress={() => void syncMyDaysOff()}
            style={styles.devSyncButton}
          />
        )}

        <View style={styles.upcomingSection}>
          <AppText variant="button" style={styles.sectionTitle}>다가오는 공통 휴무</AppText>
          <View style={styles.upcomingList}>
            {MOCK_UPCOMING_COMMON_DAYS.map((item) => <UpcomingDayOffRow item={item} key={item.date} />)}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 0,
    paddingTop: spacing.xs,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  headerButton: {
    alignItems: 'center',
    borderRadius: radius.xxl,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  headerTitle: {
    fontSize: 18,
    lineHeight: 24,
  },
  content: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xs,
  },
  monthSelector: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 38,
    paddingHorizontal: spacing.xxs,
  },
  monthButton: {
    alignItems: 'center',
    borderRadius: radius.xxl,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  monthTitle: {
    color: brandColors.deepNavy,
    fontSize: 16,
    lineHeight: 22,
  },
  calendar: {
    gap: 1,
    width: '100%',
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayCell: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  weekdayText: {
    color: brandColors.deepNavy,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 18,
  },
  sundayText: {
    color: brandColors.coral,
  },
  saturdayText: {
    color: '#4B6FA8',
  },
  calendarRow: {
    flexDirection: 'row',
  },
  calendarCell: {
    alignItems: 'center',
    flex: 1,
    height: 36,
    justifyContent: 'center',
    minWidth: 0,
  },
  dateMarker: {
    alignItems: 'center',
    borderRadius: radius.xxl,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  outsideMonth: {
    opacity: 0.42,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  legend: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.xs,
  },
  legendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  legendDot: {
    borderColor: '#E5E1D9',
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    height: 12,
    width: 12,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  upcomingSection: {
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  devSyncButton: {
    marginTop: spacing.xxs,
  },
  sectionTitle: {
    fontWeight: '700',
  },
  upcomingList: {
    gap: spacing.xs,
  },
  upcomingCard: {
    alignItems: 'center',
    borderCurve: 'continuous',
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  upcomingDate: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  upcomingRange: {
    fontSize: 12,
    lineHeight: 18,
    marginRight: spacing.xs,
  },
  pressed: {
    opacity: 0.78,
  },
});
