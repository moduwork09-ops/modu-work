import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, PrimaryButton, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { useAuth } from '../src/features/auth/AuthContext';
import { formatAvailabilityInterval, getTogetherAvailabilityStatusMessage, isCurrentTogetherAvailabilityRequest, type TogetherAvailabilityRequestIdentity } from '../src/features/together/commonAvailabilityPresentation';
import { addLocalCalendarDays, formatLocalCalendarDate } from '../src/features/together/dayOffProjection';
import { getTogetherGapAvailability, isTogetherSpaceId, type TogetherCommonAvailability } from '../src/features/together/togetherServerData';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

function getDateParts(localDate: string) {
  const [year, month, day] = localDate.split('-').map(Number);
  return { day: String(day), weekday: WEEKDAYS[new Date(year, month - 1, day).getDay()] };
}

function getWeekDates(today: Date = new Date()): string[] {
  const todayKey = formatLocalCalendarDate(today);
  const weekStart = addLocalCalendarDays(todayKey, -today.getDay());
  return Array.from({ length: 7 }, (_, index) => addLocalCalendarDays(weekStart, index));
}

function formatDuration(startMinute: number, endMinute: number): string {
  const duration = endMinute - startMinute;
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  if (hours === 0) return `${minutes}분`;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

type LoadState = { kind: 'loading' } | { kind: 'loaded'; day: TogetherCommonAvailability } | { kind: 'error' };

export default function TogetherGapScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ spaceId?: string | string[] }>();
  const spaceId = typeof params.spaceId === 'string' && isTogetherSpaceId(params.spaceId) ? params.spaceId : undefined;
  const today = formatLocalCalendarDate(new Date());
  const weekDates = useMemo(() => getWeekDates(), [today]);
  const [selectedDate, setSelectedDate] = useState(weekDates.includes(today) ? today : weekDates[0]);
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [retryKey, setRetryKey] = useState(0);
  const requestGenerationRef = useRef(0);
  const currentRequestRef = useRef<TogetherAvailabilityRequestIdentity | undefined>(undefined);
  const sessionUserIdRef = useRef(session?.user.id);
  sessionUserIdRef.current = session?.user.id;

  useFocusEffect(useCallback(() => {
    if (!weekDates.includes(selectedDate)) {
      setSelectedDate(today);
      return undefined;
    }
    const userId = sessionUserIdRef.current;
    if (!spaceId || !userId) {
      setLoadState({ kind: 'error' });
      return undefined;
    }
    const identity = { generation: ++requestGenerationRef.current, localDate: selectedDate, spaceId, userId };
    currentRequestRef.current = identity;
    let active = true;
    setLoadState({ kind: 'loading' });
    void getTogetherGapAvailability(spaceId, selectedDate, selectedDate)
      .then(([day]) => {
        if (!active || sessionUserIdRef.current !== userId || !isCurrentTogetherAvailabilityRequest(currentRequestRef.current, identity)) return;
        setLoadState({ kind: 'loaded', day });
      })
      .catch(() => {
        if (!active || sessionUserIdRef.current !== userId || !isCurrentTogetherAvailabilityRequest(currentRequestRef.current, identity)) return;
        setLoadState({ kind: 'error' });
      });
    return () => {
      active = false;
      if (isCurrentTogetherAvailabilityRequest(currentRequestRef.current, identity)) currentRequestRef.current = undefined;
    };
  }, [retryKey, selectedDate, spaceId, session?.user.id, today, weekDates]));

  const day = loadState.kind === 'loaded' ? loadState.day : undefined;
  const hasIntervals = day?.availabilityStatus === 'ready' && day.intervals.length > 0;

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
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.dateStrip}>
          {weekDates.map((localDate) => {
            const selected = localDate === selectedDate;
            const parts = getDateParts(localDate);
            return (
              <Pressable
                accessibilityLabel={`${parts.day}일 ${parts.weekday}요일`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={localDate}
                onPress={() => setSelectedDate(localDate)}
                style={({ pressed }) => [
                  styles.dateItem,
                  { backgroundColor: selected ? brandColors.coral : theme.surface, borderColor: selected ? brandColors.coral : theme.border },
                  pressed && styles.pressed,
                ]}
              >
                <AppText style={[styles.dateNumber, selected && styles.selectedDateText]}>{parts.day}</AppText>
                <AppText variant="caption" style={[styles.dateWeekday, selected && styles.selectedDateText]}>{parts.weekday}</AppText>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.section}>
          <AppText variant="button" style={styles.sectionTitle}>선택한 날의 함께 가능한 틈</AppText>
          {loadState.kind === 'loading' ? <Card style={styles.stateCard}><AppText tone="secondary">우리의 틈을 확인하는 중...</AppText></Card> : null}
          {loadState.kind === 'error' ? (
            <Card style={styles.stateCard}>
              <AppText tone="secondary">우리의 틈을 확인할 수 없어요.</AppText>
              <PrimaryButton label="다시 시도" onPress={() => setRetryKey((value) => value + 1)} style={styles.retryButton} />
            </Card>
          ) : null}
          {day && !hasIntervals ? <Card style={styles.stateCard}><AppText tone="secondary">{getTogetherAvailabilityStatusMessage(day)}</AppText></Card> : null}
          {day && hasIntervals ? (
            <View style={styles.intervalList}>
              {day.intervals.map((interval) => (
                <Card key={`${interval.startMinute}-${interval.endMinute}`} style={styles.intervalCard}>
                  <View style={styles.intervalRow}>
                    <AppText variant="heading" style={styles.intervalTime}>{formatAvailabilityInterval(interval)}</AppText>
                    <AppText style={styles.intervalDuration}>{formatDuration(interval.startMinute, interval.endMinute)}</AppText>
                  </View>
                </Card>
              ))}
            </View>
          ) : null}
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
  sectionTitle: {
    fontWeight: '700',
  },
  stateCard: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 110,
    padding: spacing.md,
  },
  retryButton: {
    minHeight: 42,
    width: 150,
  },
  intervalList: {
    gap: spacing.xs,
  },
  intervalCard: {
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  intervalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  intervalTime: {
    color: brandColors.coral,
    fontSize: 22,
    lineHeight: 28,
  },
  intervalDuration: {
    color: brandColors.coral,
    fontSize: 13,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
});
