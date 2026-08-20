import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';

const MOCK_DATES = [
  { date: '23', weekday: '금' },
  { date: '24', weekday: '토' },
  { date: '25', weekday: '일' },
  { date: '26', weekday: '월' },
  { date: '27', weekday: '화' },
  { date: '28', weekday: '수' },
  { date: '29', weekday: '목' },
] as const;

const MOCK_TODAY_GAP = {
  start: '20:00',
  end: '22:30',
  duration: '2시간 30분',
  description: '배우자와 함께 가능',
  best: true,
} as const;

const MOCK_WEEKLY_GAPS = [
  { date: '8/25 (일)', start: '19:00', end: '21:00', duration: '2시간' },
  { date: '8/26 (월)', start: '18:30', end: '20:30', duration: '2시간' },
  { date: '8/28 (수)', start: '14:00', end: '17:00', duration: '3시간' },
] as const;

const TODAY_RANGE = { start: 18, end: 24 } as const;
const WEEKLY_RANGE = { start: 12, end: 24 } as const;

function toDecimalHour(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return hour + minute / 60;
}

function getTimelineRange(rangeStart: number, rangeEnd: number, gapStart: string, gapEnd: string) {
  const total = rangeEnd - rangeStart;
  const start = toDecimalHour(gapStart);
  const end = toDecimalHour(gapEnd);

  return {
    left: `${Math.max(0, ((start - rangeStart) / total) * 100)}%` as const,
    width: `${Math.min(100, ((end - start) / total) * 100)}%` as const,
  };
}

type TimelineProps = {
  gapStart: string;
  gapEnd: string;
  rangeStart: number;
  rangeEnd: number;
  showLabels?: boolean;
};

function GapTimeline({ gapStart, gapEnd, rangeStart, rangeEnd, showLabels = false }: TimelineProps) {
  const activeRange = getTimelineRange(rangeStart, rangeEnd, gapStart, gapEnd);

  return (
    <View style={styles.timeline}>
      <View style={showLabels ? styles.todayTrackArea : styles.weeklyTrackArea}>
        <View style={styles.timelineTrack} />
        <View style={[styles.activeTrack, activeRange]} />
        {showLabels && [0, 1, 2, 3].map((tick) => (
          <View key={tick} style={[styles.majorTick, { left: `${(tick / 3) * 100}%` }]} />
        ))}
      </View>
      {showLabels && (
        <View style={styles.timelineLabels}>
          <AppText variant="caption" style={styles.timelineLabel}>18시</AppText>
          <AppText variant="caption" style={styles.timelineLabel}>20시</AppText>
          <AppText variant="caption" style={styles.timelineLabel}>22시</AppText>
          <AppText variant="caption" style={styles.timelineLabel}>24시</AppText>
        </View>
      )}
    </View>
  );
}

function DateStrip() {
  const [selectedDate, setSelectedDate] = useState('24');
  const theme = useAppTheme();

  return (
    <View style={styles.dateStrip}>
      {MOCK_DATES.map((item) => {
        const selected = item.date === selectedDate;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={item.date}
            onPress={() => setSelectedDate(item.date)}
            style={({ pressed }) => [
              styles.dateItem,
              { backgroundColor: selected ? brandColors.coral : theme.surface, borderColor: selected ? brandColors.coral : theme.border },
              pressed && styles.pressed,
            ]}
          >
            <AppText style={[styles.dateNumber, selected && styles.selectedDateText]}>{item.date}</AppText>
            <AppText variant="caption" style={[styles.dateWeekday, selected && styles.selectedDateText]}>{item.weekday}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function TodayBestCard() {
  return (
    <Card style={styles.bestCard}>
      <View style={styles.bestTimeRow}>
        <AppText variant="heading" style={styles.bestTime}>
          {MOCK_TODAY_GAP.start} ~ {MOCK_TODAY_GAP.end}
        </AppText>
        {MOCK_TODAY_GAP.best && (
          <View style={styles.bestBadge}>
            <AppText variant="caption" style={styles.bestBadgeText}>BEST</AppText>
          </View>
        )}
      </View>

      <View style={styles.descriptionRow}>
        <AppText style={styles.description}>{MOCK_TODAY_GAP.description}</AppText>
        <MaterialCommunityIcons name="heart-outline" color={brandColors.coral} size={18} />
      </View>

      <GapTimeline
        gapEnd={MOCK_TODAY_GAP.end}
        gapStart={MOCK_TODAY_GAP.start}
        rangeEnd={TODAY_RANGE.end}
        rangeStart={TODAY_RANGE.start}
        showLabels
      />
    </Card>
  );
}

function WeeklyGapItem({ gap }: { gap: (typeof MOCK_WEEKLY_GAPS)[number] }) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => Alert.alert('우리의 틈', '상세 기능은 다음 단계에서 연결할 예정입니다.')}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card style={styles.weeklyCard}>
        <View style={styles.weeklyInfoRow}>
          <AppText variant="button" style={styles.weeklyDate}>{gap.date}</AppText>
          <AppText variant="button" style={styles.weeklyTime}>{gap.start} ~ {gap.end}</AppText>
          <AppText style={styles.weeklyDuration}>{gap.duration}</AppText>
          <MaterialCommunityIcons name="chevron-right" color={theme.text} size={18} />
        </View>
        <GapTimeline
          gapEnd={gap.end}
          gapStart={gap.start}
          rangeEnd={WEEKLY_RANGE.end}
          rangeStart={WEEKLY_RANGE.start}
        />
      </Card>
    </Pressable>
  );
}

export default function TogetherGapScreen() {
  const router = useRouter();
  const theme = useAppTheme();

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
        <AppText variant="button" style={styles.headerTitle}>우리의 틈</AppText>
        <Pressable
          accessibilityLabel="날짜 선택"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => Alert.alert('날짜 선택', '달력 기능은 다음 단계에서 연결할 예정입니다.')}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="calendar-month-outline" color={theme.text} size={22} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        <DateStrip />

        <View style={styles.section}>
          <AppText variant="button" style={styles.sectionTitle}>오늘</AppText>
          <TodayBestCard />
        </View>

        <View style={[styles.section, styles.weeklySection]}>
          <AppText variant="button" style={styles.sectionTitle}>이번 주 함께 가능한 틈</AppText>
          <View style={styles.weeklyList}>
            {MOCK_WEEKLY_GAPS.map((gap) => <WeeklyGapItem gap={gap} key={gap.date} />)}
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
    gap: spacing.md,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  dateStrip: {
    flexDirection: 'row',
    gap: spacing.xxs,
    width: '100%',
  },
  dateItem: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: 1,
    justifyContent: 'center',
    minHeight: 58,
    minWidth: 0,
    paddingVertical: spacing.xs,
  },
  dateNumber: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  dateWeekday: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  selectedDateText: {
    color: brandColors.white,
  },
  section: {
    gap: spacing.xs,
  },
  weeklySection: {
    marginTop: spacing.xxs,
  },
  sectionTitle: {
    fontWeight: '700',
  },
  bestCard: {
    borderCurve: 'continuous',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  bestTimeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bestTime: {
    color: brandColors.coral,
    fontSize: 24,
    lineHeight: 30,
  },
  bestBadge: {
    backgroundColor: '#FFF0E9',
    borderRadius: radius.xxl,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  bestBadgeText: {
    color: brandColors.coral,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  descriptionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  timeline: {
    gap: 2,
    paddingTop: spacing.xxs,
  },
  todayTrackArea: {
    height: 15,
    justifyContent: 'center',
    position: 'relative',
  },
  weeklyTrackArea: {
    height: 10,
    justifyContent: 'center',
    position: 'relative',
  },
  timelineTrack: {
    backgroundColor: '#E9EBED',
    borderRadius: 4,
    height: 2,
    width: '100%',
  },
  activeTrack: {
    backgroundColor: brandColors.coral,
    borderRadius: 5,
    height: 7,
    position: 'absolute',
    top: 4,
  },
  majorTick: {
    backgroundColor: '#B7BDC3',
    bottom: 0,
    height: 4,
    position: 'absolute',
    width: StyleSheet.hairlineWidth,
  },
  timelineLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timelineLabel: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  weeklyList: {
    gap: spacing.xs,
  },
  weeklyCard: {
    borderCurve: 'continuous',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  weeklyInfoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  weeklyDate: {
    fontSize: 13,
    lineHeight: 18,
    width: 72,
  },
  weeklyTime: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    minWidth: 0,
    textAlign: 'center',
  },
  weeklyDuration: {
    color: brandColors.coral,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.78,
  },
});
