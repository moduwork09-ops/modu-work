import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, PrimaryButton, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { useShiftSchedule } from '../src/features/shifts/ShiftScheduleContext';
import { createDayOffProjectionRange } from '../src/features/together/dayOffProjection';
import {
  buildCommonDaysOffCalendar,
  getCommonDayOffCountLabel,
  getCommonDayOffMarker,
  getOtherDayOffCount,
  getUpcomingCommonDaysOff,
  type CommonDaysOffCalendarDay,
} from '../src/features/together/commonDaysOffPresentation';
import {
  getTogetherCommonDaysOff,
  isTogetherSpaceId,
  syncMyDayOffProjectionRange,
  type TogetherCommonDayOff,
} from '../src/features/together/togetherServerData';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const DAY_OFF_COLORS = {
  mine: '#E7ECE7',
  other: '#FFE4DE',
  common: brandColors.coral,
} as const;

function CalendarCell({
  day,
  data,
  isSelected,
  onSelect,
}: {
  day: CommonDaysOffCalendarDay;
  data?: TogetherCommonDayOff;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const theme = useAppTheme();
  const marker = getCommonDayOffMarker(data);
  const weekday = day.date.getDay();
  const isCommon = marker === 'common';
  const hasOtherDayOff = data ? getOtherDayOffCount(data) > 0 : false;
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
    <Pressable
      accessibilityLabel={`${day.dateKey}, ${data ? getCommonDayOffCountLabel(data) : '정보 없음'}`}
      accessibilityRole="button"
      disabled={!data}
      onPress={onSelect}
      style={styles.calendarCell}
    >
      <View
        style={[
          styles.dateMarker,
          marker && { backgroundColor: DAY_OFF_COLORS[marker] },
          isSelected && { borderColor: theme.text, borderWidth: 1 },
          !day.isCurrentMonth && !isCommon && styles.outsideMonth,
        ]}
      >
        <AppText style={[styles.dateText, { color: dateColor }]}>{day.day}</AppText>
        {marker === 'mine' && hasOtherDayOff ? <View style={styles.otherDayOffDot} /> : null}
      </View>
    </Pressable>
  );
}

function MonthCalendar({
  days,
  daysByDate,
  selectedDate,
  onSelect,
}: {
  days: CommonDaysOffCalendarDay[];
  daysByDate: Map<string, TogetherCommonDayOff>;
  selectedDate?: string;
  onSelect: (date: string) => void;
}) {
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
          {week.map((day) => (
            <CalendarCell
              data={daysByDate.get(day.dateKey)}
              day={day}
              isSelected={selectedDate === day.dateKey}
              key={day.dateKey}
              onSelect={() => onSelect(day.dateKey)}
            />
          ))}
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
        <View style={[styles.legendDot, { backgroundColor: DAY_OFF_COLORS.other }]} />
        <AppText variant="caption" style={styles.legendText}>다른 멤버 휴무</AppText>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: DAY_OFF_COLORS.common }]} />
        <AppText variant="caption" style={styles.legendText}>공통 휴무</AppText>
      </View>
    </View>
  );
}

function formatUpcomingDate(localDate: string) {
  const [year, month, day] = localDate.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
  return `${month}/${day} (${weekday})`;
}

function UpcomingDayOffRow({ item }: { item: TogetherCommonDayOff }) {
  return (
    <Card style={styles.upcomingCard}>
      <AppText variant="button" style={styles.upcomingDate}>{formatUpcomingDate(item.localDate)}</AppText>
      <AppText variant="caption" tone="secondary">공통 휴무</AppText>
    </Card>
  );
}

export default function TogetherDaysOffScreen() {
  const params = useLocalSearchParams<{ spaceId?: string | string[] }>();
  const router = useRouter();
  const theme = useAppTheme();
  const schedule = useShiftSchedule();
  const rawSpaceId = params.spaceId;
  const spaceId = typeof rawSpaceId === 'string' && isTogetherSpaceId(rawSpaceId) ? rawSpaceId : undefined;
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  });
  const [commonDays, setCommonDays] = useState<TogetherCommonDayOff[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const isMountedRef = useRef(true);
  const isFocusedRef = useRef(false);
  const requestIdRef = useRef(0);
  const calendarDays = useMemo(
    () => buildCommonDaysOffCalendar(visibleMonth.year, visibleMonth.month),
    [visibleMonth.month, visibleMonth.year],
  );
  const rangeStart = calendarDays[0].dateKey;
  const rangeEnd = calendarDays[calendarDays.length - 1].dateKey;
  const daysByDate = useMemo(
    () => new Map(commonDays.map((day) => [day.localDate, day])),
    [commonDays],
  );
  const selectedDay = selectedDate ? daysByDate.get(selectedDate) : undefined;
  const hasUnavailableDays = commonDays.some((day) => day.availabilityStatus === 'unavailable');
  const upcomingDays = useMemo(() => getUpcomingCommonDaysOff(commonDays), [commonDays]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useFocusEffect(useCallback(() => {
    const requestId = ++requestIdRef.current;
    isFocusedRef.current = true;
    setIsSyncing(isSyncingRef.current);
    setCommonDays([]);
    setSelectedDate(undefined);
    setHasError(false);

    if (!spaceId) {
      setIsLoading(false);
      setHasError(true);
      return () => {
        isFocusedRef.current = false;
        if (requestIdRef.current === requestId) requestIdRef.current += 1;
      };
    }

    setIsLoading(true);
    void getTogetherCommonDaysOff(spaceId, rangeStart, rangeEnd)
      .then((days) => {
        if (requestIdRef.current !== requestId) return;
        setCommonDays(days);
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setHasError(true);
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        setIsLoading(false);
      });

    return () => {
      isFocusedRef.current = false;
      if (requestIdRef.current === requestId) requestIdRef.current += 1;
    };
  }, [rangeEnd, rangeStart, refreshKey, spaceId]));

  const moveMonth = (offset: number) => {
    requestIdRef.current += 1;
    setCommonDays([]);
    setSelectedDate(undefined);
    setIsLoading(true);
    setVisibleMonth((current) => {
      const next = new Date(current.year, current.month + offset, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const syncMyDaysOff = async () => {
    if (isSyncingRef.current || !schedule.isHydrated || !schedule.hasCompletedSetup) return;
    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const projection = createDayOffProjectionRange(schedule);
      await syncMyDayOffProjectionRange(projection);
      if (isMountedRef.current && isFocusedRef.current) {
        setRefreshKey((value) => value + 1);
        Alert.alert('동기화 완료', '휴무 데이터 동기화가 완료됐어요.');
      }
    } catch {
      if (isMountedRef.current && isFocusedRef.current) {
        Alert.alert('동기화 실패', '휴무 데이터를 동기화할 수 없어요. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      isSyncingRef.current = false;
      if (isMountedRef.current && isFocusedRef.current) setIsSyncing(false);
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

        {isLoading ? <Card style={styles.stateCard}><AppText tone="secondary">공통 휴무를 불러오는 중...</AppText></Card> : null}
        {!isLoading && hasError ? (
          <Card style={styles.stateCard}>
            <AppText>공통 휴무를 확인할 수 없어요.</AppText>
            <PrimaryButton label="다시 시도" onPress={() => setRefreshKey((value) => value + 1)} style={styles.retryButton} />
          </Card>
        ) : null}
        {!isLoading && !hasError ? (
          <>
            <MonthCalendar
              days={calendarDays}
              daysByDate={daysByDate}
              onSelect={setSelectedDate}
              selectedDate={selectedDate}
            />
            <Legend />
            {selectedDay ? (
              <AppText variant="caption" tone="secondary" style={styles.selectionSummary}>
                {formatUpcomingDate(selectedDay.localDate)} · {getCommonDayOffCountLabel(selectedDay)}
              </AppText>
            ) : null}
            {hasUnavailableDays ? (
              <Card style={styles.noticeCard}>
                <AppText variant="caption" tone="secondary">
                  모든 멤버가 휴무 공유를 켜고 동기화를 완료해야 공통 휴무를 확인할 수 있어요.
                </AppText>
              </Card>
            ) : null}
          </>
        ) : null}

        {__DEV__ && (
          <PrimaryButton
            disabled={isSyncing || !schedule.isHydrated || !schedule.hasCompletedSetup}
            label={isSyncing ? '휴무 동기화 중...' : '개발용: 내 휴무 서버 동기화'}
            onPress={() => void syncMyDaysOff()}
            style={styles.devSyncButton}
          />
        )}

        {!isLoading && !hasError ? <View style={styles.upcomingSection}>
          <AppText variant="button" style={styles.sectionTitle}>다가오는 공통 휴무</AppText>
          <View style={styles.upcomingList}>
            {upcomingDays.map((item) => <UpcomingDayOffRow item={item} key={item.localDate} />)}
            {upcomingDays.length === 0 ? (
              <Card style={styles.emptyUpcomingCard}>
                <AppText variant="caption" tone="secondary">
                  {hasUnavailableDays ? '공유·동기화가 완료되면 확인할 수 있어요.' : '조회 범위에 공통 휴무가 없어요.'}
                </AppText>
              </Card>
            ) : null}
          </View>
        </View> : null}
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
  otherDayOffDot: {
    backgroundColor: DAY_OFF_COLORS.other,
    borderColor: brandColors.white,
    borderRadius: 3,
    borderWidth: 1,
    bottom: 1,
    height: 6,
    position: 'absolute',
    right: 1,
    width: 6,
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
  selectionSummary: {
    textAlign: 'center',
  },
  noticeCard: {
    padding: spacing.sm,
  },
  stateCard: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 220,
    padding: spacing.lg,
  },
  retryButton: {
    minHeight: 42,
    width: 140,
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
  emptyUpcomingCard: {
    alignItems: 'center',
    padding: spacing.md,
  },
  upcomingDate: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.78,
  },
});
