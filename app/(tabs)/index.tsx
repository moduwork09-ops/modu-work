import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, PrimaryButton, Screen } from '../../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../../src/constants';
import { calculateDailyGaps, formatGapDuration } from '../../src/features/gaps/gapCalculator';
import { createMemoBusyEvents } from '../../src/features/memos/memoBusyEvents';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { getPreviousIsoDate, getShiftForDate, NO_ACTIVE_SCHEDULE_SHIFT_TYPE } from '../../src/features/shifts/shiftSchedule';

type TodayScheduleItem = {
  id: string;
  time: string;
  title: string;
  isAllDay: boolean;
  isShift: boolean;
  eventId?: string;
};

function formatKoreanDate(date: Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date);
}

function getLocalCalendarDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export default function HomeScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const schedule = useShiftSchedule();

  if (!schedule.hasCompletedSetup) {
    return <Screen style={styles.screen}><View style={styles.setupEmptyState}><AppText variant="heading">근무표를 먼저 설정해주세요.</AppText><AppText tone="secondary" style={styles.setupEmptyDescription}>근무유형과 반복 패턴을 설정하면 오늘의 근무와 틈을 정확하게 확인할 수 있어요.</AppText><PrimaryButton label="근무표 설정하기" onPress={() => router.replace('/onboarding' as never)} style={styles.setupEmptyButton} /></View></Screen>;
  }

  const today = new Date();
  const todayDate = getLocalCalendarDate(today);
  const previousDate = getPreviousIsoDate(todayDate);
  const todayShift = getShiftForDate(todayDate, schedule);
  const hasActiveScheduleToday = todayShift.id !== NO_ACTIVE_SCHEDULE_SHIFT_TYPE.id;
  const hasTodayShiftTime = Boolean(todayShift.startTime && todayShift.endTime);
  const todayShiftEndsNextDay = hasTodayShiftTime && todayShift.endTime! < todayShift.startTime!;
  const todayShiftTime = hasTodayShiftTime
    ? `${todayShift.startTime} → ${todayShiftEndsNextDay ? `다음날 ${todayShift.endTime}` : todayShift.endTime}`
    : !hasActiveScheduleToday || todayShift.kind === 'rest'
      ? '근무 없음'
      : '근무시간 미설정';
  const todayShiftNote = hasTodayShiftTime
    ? `오늘 ${todayShift.startTime} 출근`
    : !hasActiveScheduleToday
      ? '근무표 적용 시작일 전이에요.'
      : todayShift.kind === 'rest'
      ? '오늘은 근무가 없어요.'
      : '근무시간이 설정되지 않았어요.';
  const todayGapResult = calculateDailyGaps({
    date: todayDate,
    shifts: [todayDate, previousDate].map((date) => {
      const shift = getShiftForDate(date, schedule);

      return {
        date,
        kind: shift.kind,
        startTime: shift.startTime,
        endTime: shift.endTime,
      };
    }),
    personalEvents: createMemoBusyEvents(schedule.dateMemos, schedule.personalEvents),
  });
  const visibleGaps = todayGapResult.gaps.slice(0, 3);
  const remainingGapCount = todayGapResult.gaps.length - visibleGaps.length;
  const todayLabel = formatKoreanDate(today);
  const upcomingWeekShifts = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(today);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);

    return getShiftForDate(getLocalCalendarDate(date), schedule);
  });
  const weeklySummary = [
    {
      label: '근무',
      value: `${upcomingWeekShifts.filter((shift) => Boolean(shift.startTime && shift.endTime)).length}일`,
    },
    {
      label: '휴무',
      value: `${upcomingWeekShifts.filter((shift) => shift.kind === 'rest').length}일`,
    },
    {
      label: '야간',
      value: `${upcomingWeekShifts.filter((shift) => (
        Boolean(shift.startTime && shift.endTime && shift.endTime < shift.startTime)
      )).length}회`,
    },
  ];
  const todayScheduleItems: TodayScheduleItem[] = [
    ...(schedule.dateMemos[todayDate] ?? []).map((memo) => ({
      id: `date-memo:${memo.id}`,
      time: memo.timeEnabled ? memo.allDay ? '하루 종일' : memo.startTime ?? '시간 미정' : '시간 없음',
      title: memo.text,
      isAllDay: memo.allDay,
      isShift: false,
    })),
    ...schedule.personalEvents
      .filter((event) => event.date === todayDate)
      .map((event) => ({
        id: `personal-event:${event.id}`,
        time: event.allDay ? '하루 종일' : event.startTime ?? '시간 미정',
        title: event.title,
        isAllDay: event.allDay,
        isShift: false,
        eventId: event.id,
      })),
  ].sort((first, second) => {
    if (first.isAllDay !== second.isAllDay) {
      return first.isAllDay ? -1 : 1;
    }

    if (first.time !== second.time) {
      return first.time.localeCompare(second.time);
    }

    if (first.isShift !== second.isShift) {
      return first.isShift ? 1 : -1;
    }

    return first.id.localeCompare(second.id);
  });

  return (
    <Screen style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AppText variant="heading">모두의 근무</AppText>
          <View accessibilityLabel="알림 기능 준비 중" accessible style={styles.notificationIcon}>
            <MaterialCommunityIcons name="bell-outline" size={24} color={theme.primary} />
          </View>
        </View>

        <AppText tone="secondary" style={styles.date}>
          {todayLabel}
        </AppText>

        <View style={[styles.shiftCard, { backgroundColor: brandColors.deepNavy }]}>
          <AppText variant="caption" style={styles.shiftOverline}>
            오늘의 근무
          </AppText>
          <AppText variant="title" style={styles.shiftName}>
            {todayShift.name}
          </AppText>
          <AppText variant="heading" style={styles.shiftTime}>
            {todayShiftTime}
          </AppText>
          <AppText style={styles.shiftNote}>{todayShiftNote}</AppText>
        </View>

        <View style={styles.section}>
          <AppText variant="heading">오늘의 틈</AppText>
          <Card style={[styles.gapCard, { borderColor: theme.accent }]}>
            <View style={[styles.totalGapBox, { borderColor: theme.accent }]}>
              <View style={styles.totalGapLeft}>
                <MaterialCommunityIcons name="clock-outline" size={18} color={theme.accent} />
                <AppText variant="caption" style={[styles.totalGapLabel, { color: theme.accent }]}>
                  총 틈 시간
                </AppText>
              </View>
              <AppText style={[styles.totalGapValue, { color: theme.accent }]}>
                {formatGapDuration(todayGapResult.totalGapMinutes)}
              </AppText>
            </View>
            {visibleGaps.length > 0 ? (
              <View style={styles.gapList}>
                {visibleGaps.map((gap, index) => (
                  <View
                    key={`${gap.startTime}-${gap.endTime}`}                     style={[                       styles.gapRow,                       index < visibleGaps.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 },                     ]}                   >
                    <AppText variant="body" style={{ color: theme.accent, fontWeight: '700' }}>
                      {gap.startTime} ~ {gap.endTime}
                    </AppText>
                    <AppText variant="caption" style={{ color: theme.accent }}>
                      {formatGapDuration(gap.durationMinutes)}
                    </AppText>
                  </View>
                ))}
                {remainingGapCount > 0 ? (
                  <AppText variant="caption" tone="secondary" style={styles.remainingGaps}>
                    외 {remainingGapCount}개
                  </AppText>
                ) : null}
              </View>
            ) : (
              <AppText tone="secondary" style={styles.emptyGapText}>
                30분 이상 사용할 수 있는 틈이 없어요.
              </AppText>
            )}
          </Card>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <AppText variant="heading">오늘 일정</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="오늘 개인 일정 추가" onPress={() => router.push({ pathname: '/events/new', params: { date: todayDate } })} style={[styles.addScheduleButton, { borderColor: theme.border }]}>
              <MaterialCommunityIcons name="plus" size={18} color={theme.primary} />
              <AppText variant="caption" style={{ color: theme.primary, fontWeight: '700' }}>일정 추가</AppText>
            </Pressable>
          </View>
          <Card style={styles.scheduleCard}>
            {todayScheduleItems.length > 0 ? todayScheduleItems.map((item, index) => {
              const rowStyle = [styles.scheduleRow, index < todayScheduleItems.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }];
              const rowContent = <>
                <AppText variant="body" style={[styles.scheduleTime, { color: theme.primary }]}>
                  {item.time}
                </AppText>
                <AppText>{item.title}</AppText>
              </>;

              return item.eventId ? (
                <Pressable
                  key={item.id}
                  accessibilityLabel={`${item.title} 이전 버전 일정 수정`}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/events/[id]', params: { id: item.eventId! } })}
                  style={rowStyle}
                >
                  {rowContent}
                </Pressable>
              ) : (
                <View key={item.id} style={rowStyle}>
                  {rowContent}
                </View>
              );
            }) : (
              <AppText tone="secondary" style={styles.emptyScheduleText}>
                오늘은 등록된 일정이 없어요.
              </AppText>
            )}
          </Card>
        </View>

        <View style={styles.section}>
          <AppText variant="heading">이번 주</AppText>
          <View style={styles.summaryRow}>
            {weeklySummary.map((item) => (
              <View key={item.label} style={[styles.summaryItem, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <AppText variant="heading" style={{ color: theme.primary }}>
                  {item.value}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  {item.label}
                </AppText>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  setupEmptyState: { flex: 1, justifyContent: 'center' },
  setupEmptyDescription: { marginTop: spacing.sm },
  setupEmptyButton: { marginTop: spacing.xl },
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
    minHeight: 36,
  },
  notificationIcon: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  date: {
    marginTop: spacing.xs,
  },
  shiftCard: {
    borderRadius: radius.xl,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  shiftOverline: {
    color: brandColors.white,
    opacity: 0.8,
  },
  shiftName: {
    color: brandColors.white,
    marginTop: spacing.sm,
  },
  shiftTime: {
    color: brandColors.white,
    marginTop: spacing.xxs,
  },
  shiftNote: {
    color: brandColors.white,
    marginTop: spacing.md,
    opacity: 0.8,
  },
  section: {
    marginTop: spacing.xxl,
  },
  scheduleCard: {
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
  },
  scheduleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 48,
  },
  scheduleTime: {
    fontWeight: '700',
    width: 72,
  },
  emptyScheduleText: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  gapCard: {
    marginTop: spacing.md,
    padding: spacing.md,
  },
  gapHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  gapHeaderLabel: {
    fontWeight: '600',
  },
  durationBadge: {
    borderRadius: radius.xxl,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  durationText: {
    color: brandColors.white,
    fontWeight: '700',
  },
  totalGapBox: {
    alignItems: 'center',
    backgroundColor: '#FFF1EC',
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  totalGapLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  totalGapLabel: {
    fontWeight: '700',
  },
  totalGapValue: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 27,
  },
  gapList: { gap: 0, marginTop: 0 },
  gapRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  remainingGaps: { marginTop: spacing.xxs },
  emptyGapText: { marginTop: spacing.sm },
  sectionTitleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  addScheduleButton: {
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xxs,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  summaryItem: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
});
