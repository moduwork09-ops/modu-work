import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useState } from 'react';

import { AppText, Card, Screen } from '../../src/components';
import { radius, spacing, useAppTheme } from '../../src/constants';
import { calculateDailyGaps, formatGapDuration, type GapCalculationResult } from '../../src/features/gaps/gapCalculator';
import { createMemoBusyEvents } from '../../src/features/memos/memoBusyEvents';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { getPreviousIsoDate, getShiftForDate } from '../../src/features/shifts/shiftSchedule';

type Period = 'today' | 'tomorrow' | 'week';

type GapDay = {
  date: string;
  label: string | null;
  dateLabel: string;
  shift: ReturnType<typeof getShiftForDate>;
  result: GapCalculationResult;
};

const periodOptions: { id: Period; label: string; dayCount: number; startOffset: number }[] = [
  { id: 'today', label: '오늘', dayCount: 1, startOffset: 0 },
  { id: 'tomorrow', label: '내일', dayCount: 1, startOffset: 1 },
  { id: 'week', label: '7일', dayCount: 7, startOffset: 0 },
];

function getLocalCalendarDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getLocalDateOffset(offset: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);

  return date;
}

function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date);
}

function getRelativeLabel(offset: number) {
  if (offset === 0) {
    return '오늘';
  }

  return offset === 1 ? '내일' : null;
}

export default function GapScreen() {
  const theme = useAppTheme();
  const schedule = useShiftSchedule();
  const [period, setPeriod] = useState<Period>('week');
  const selectedPeriod = periodOptions.find((option) => option.id === period) ?? periodOptions[2];
  const gapDays: GapDay[] = Array.from({ length: selectedPeriod.dayCount }, (_, index) => {
    const offset = selectedPeriod.startOffset + index;
    const localDate = getLocalDateOffset(offset);
    const date = getLocalCalendarDate(localDate);
    const previousDate = getPreviousIsoDate(date);
    const shift = getShiftForDate(date, schedule);
    const result = calculateDailyGaps({
      date,
      shifts: [date, previousDate].map((shiftDate) => {
        const currentShift = getShiftForDate(shiftDate, schedule);

        return {
          date: shiftDate,
          kind: currentShift.kind,
          startTime: currentShift.startTime,
          endTime: currentShift.endTime,
        };
      }),
      personalEvents: createMemoBusyEvents(schedule.dateMemos, schedule.personalEvents),
    });

    return {
      date,
      label: getRelativeLabel(offset),
      dateLabel: formatDateLabel(localDate),
      shift,
      result,
    };
  });
  const totalGapMinutes = gapDays.reduce((total, day) => total + day.result.totalGapMinutes, 0);
  const mostAvailableDay = gapDays.reduce<GapDay | null>((current, day) => (
    !current || day.result.totalGapMinutes > current.result.totalGapMinutes ? day : current
  ), null);

  return (
    <Screen style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AppText variant="title">틈</AppText>
          <AppText tone="secondary" style={styles.description}>
            근무와 일정 사이, 사용할 수 있는 시간을 확인하세요.
          </AppText>
        </View>

        <View accessibilityRole="tablist" style={styles.periodControl}>
          {periodOptions.map((option) => {
            const selected = option.id === period;

            return (
              <Pressable
                key={option.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setPeriod(option.id)}
                style={[
                  styles.periodButton,
                  { borderColor: theme.border },
                  selected && { backgroundColor: theme.primary, borderColor: theme.primary },
                ]}
              >
                <AppText variant="caption" style={{ color: selected ? theme.surface : theme.textSecondary, fontWeight: '700' }}>
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {period === 'week' ? (
          <Card style={[styles.summaryCard, { borderColor: theme.border }]}>
            <AppText variant="caption" tone="secondary">이번 7일</AppText>
            <AppText variant="heading" style={{ color: theme.primary, marginTop: spacing.xxs }}>
              총 {formatGapDuration(totalGapMinutes)}
            </AppText>
            {mostAvailableDay && mostAvailableDay.result.totalGapMinutes > 0 ? (
              <AppText variant="caption" tone="secondary" style={styles.summaryDetail}>
                가장 여유 있는 날 · {mostAvailableDay.dateLabel} · {formatGapDuration(mostAvailableDay.result.totalGapMinutes)}
              </AppText>
            ) : (
              <AppText variant="caption" tone="secondary" style={styles.summaryDetail}>
                30분 이상 사용할 수 있는 틈이 없어요.
              </AppText>
            )}
          </Card>
        ) : null}

        <View style={styles.dayList}>
          {gapDays.map((day) => (
            <Card
              key={day.date}
              style={[
                styles.dayCard,
                day.label === '오늘' && { borderColor: theme.accent, borderWidth: 1 },
              ]}
            >
              <View style={styles.dayHeader}>
                <View style={styles.dayTitle}>
                  {day.label ? (
                    <AppText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>
                      {day.label}
                    </AppText>
                  ) : null}
                  <AppText variant="heading">{day.dateLabel}</AppText>
                </View>
                <View style={[styles.shiftBadge, { backgroundColor: day.shift.color }]}>
                  <AppText variant="caption" style={{ color: day.shift.textColor, fontWeight: '700' }}>
                    {day.shift.name}
                  </AppText>
                </View>
              </View>

              <View style={[styles.gapTotalRow, { borderTopColor: theme.border }]}>
                <AppText variant="caption" tone="secondary">사용 가능한 시간</AppText>
                <AppText variant="body" style={{ color: theme.primary, fontWeight: '700' }}>
                  총 {formatGapDuration(day.result.totalGapMinutes)}
                </AppText>
              </View>

              {day.result.gaps.length > 0 ? (
                <View style={styles.gapRows}>
                  {day.result.gaps.map((gap) => (
                    <View key={`${day.date}-${gap.startTime}-${gap.endTime}`} style={styles.gapRow}>
                      <AppText variant="body" style={{ color: theme.accent, fontWeight: '700' }}>
                        {gap.startTime} ~ {gap.endTime}
                      </AppText>
                      <AppText variant="caption" style={{ color: theme.textSecondary }}>
                        {formatGapDuration(gap.durationMinutes)}
                      </AppText>
                    </View>
                  ))}
                </View>
              ) : (
                <AppText variant="caption" tone="secondary" style={styles.emptyGapText}>
                  30분 이상 사용할 수 있는 틈이 없어요.
                </AppText>
              )}
            </Card>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingTop: spacing.sm },
  content: { paddingBottom: spacing.xxl },
  header: { minHeight: 72 },
  description: { marginTop: spacing.xs },
  periodControl: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.lg },
  periodButton: { alignItems: 'center', borderRadius: radius.xxl, borderWidth: 1, flex: 1, minHeight: 40, justifyContent: 'center' },
  summaryCard: { borderWidth: 1, marginTop: spacing.md },
  summaryDetail: { marginTop: spacing.xs },
  dayList: { gap: spacing.md, marginTop: spacing.lg },
  dayCard: { borderWidth: 0 },
  dayHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  dayTitle: { flex: 1, gap: spacing.xxs },
  shiftBadge: { borderRadius: radius.sm, maxWidth: '52%', paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  gapTotalRow: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, paddingTop: spacing.sm },
  gapRows: { gap: spacing.xs, marginTop: spacing.sm },
  gapRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  emptyGapText: { marginTop: spacing.sm },
});
