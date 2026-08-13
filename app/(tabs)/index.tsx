import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, PrimaryButton, Screen } from '../../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../../src/constants';

type ScheduleKind = 'personal' | 'shift' | 'hospital' | 'exercise' | 'appointment' | 'daycare' | 'caregiving';

type TodayScheduleItem = {
  time: string;
  title: string;
  kind: ScheduleKind;
};

const mockHomeData = {
  shift: {
    name: '야간근무',
    timeRange: '19:00 → 09:00',
    note: '오늘 19:00 출근',
  },
  schedules: [
    { time: '11:00', title: '운동', kind: 'exercise' },
    { time: '16:00', title: '개인 일정', kind: 'personal' },
    { time: '19:00', title: '출근', kind: 'shift' },
  ] satisfies TodayScheduleItem[],
  gap: {
    timeRange: '13:00 ~ 16:00',
    label: '자유시간',
    duration: '3시간',
  },
  weeklySummary: [
    { label: '근무', value: '4일' },
    { label: '휴무', value: '2일' },
    { label: '야간', value: '2회' },
  ],
} as const;

function formatKoreanDate(date: Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date);
}

export default function HomeScreen() {
  const theme = useAppTheme();
  const todayLabel = formatKoreanDate(new Date());

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
            {mockHomeData.shift.name}
          </AppText>
          <AppText variant="heading" style={styles.shiftTime}>
            {mockHomeData.shift.timeRange}
          </AppText>
          <AppText style={styles.shiftNote}>{mockHomeData.shift.note}</AppText>
        </View>

        <View style={styles.section}>
          <AppText variant="heading">오늘의 틈</AppText>
          <Card style={[styles.gapCard, { borderColor: theme.accent }]}>
            <View style={styles.gapHeader}>
              <AppText variant="heading" style={{ color: theme.accent }}>
                {mockHomeData.gap.timeRange}
              </AppText>
              <View style={[styles.durationBadge, { backgroundColor: theme.accent }]}>
                <AppText variant="caption" style={styles.durationText}>
                  {mockHomeData.gap.duration}
                </AppText>
              </View>
            </View>
            <AppText tone="secondary" style={styles.gapLabel}>
              {mockHomeData.gap.label}
            </AppText>
            <PrimaryButton
              label="+ 일정 추가"
              disabled
              accessibilityLabel="일정 추가 기능은 준비 중입니다"
              style={[styles.addScheduleButton, { backgroundColor: theme.accent }]}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <AppText variant="heading">오늘 일정</AppText>
          <Card style={styles.scheduleCard}>
            {mockHomeData.schedules.map((schedule, index) => (
              <View
                key={`${schedule.time}-${schedule.title}`}
                style={[styles.scheduleRow, index < mockHomeData.schedules.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}
              >
                <AppText variant="body" style={[styles.scheduleTime, { color: theme.primary }]}>
                  {schedule.time}
                </AppText>
                <AppText>{schedule.title}</AppText>
              </View>
            ))}
          </Card>
        </View>

        <View style={styles.section}>
          <AppText variant="heading">이번 주</AppText>
          <View style={styles.summaryRow}>
            {mockHomeData.weeklySummary.map((item) => (
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
  gapCard: {
    marginTop: spacing.md,
    padding: spacing.md,
  },
  gapHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  gapLabel: {
    marginTop: spacing.xxs,
  },
  addScheduleButton: {
    marginTop: spacing.sm,
    minHeight: 44,
    paddingVertical: spacing.xs,
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
