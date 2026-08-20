import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';

type EventDetailParams = {
  title?: string;
  date?: string;
  weekday?: string;
  start?: string;
  end?: string;
  durationHours?: string;
  location?: string;
  memo?: string;
};

type EventDetailData = Required<EventDetailParams>;

const FALLBACK_EVENT = {
  title: '저녁 식사',
  date: '8/24',
  weekday: '토요일',
  start: '20:00',
  end: '22:00',
  durationHours: '2',
  location: '서울 강남구 ○○식당',
  memo: '맛있는 저녁 먹고 산책하기',
} as const;

const MOCK_PARTICIPANTS = [
  { id: 'me', initial: '나', label: '나', color: '#E7ECE3' },
  { id: 'partner', initial: '배', label: '배우자', color: '#FCE0D8' },
  { id: 'coworker', initial: '동', label: '동료', color: '#DDE7EE' },
] as const;

const MOCK_SHIFTS = [
  { person: '나', shift: '휴무', color: '#E7ECE3' },
  { person: '배우자', shift: '휴무', color: '#FCE0D8' },
  { person: '동료', shift: '주간', color: '#E8EEF5' },
] as const;

function Header() {
  const router = useRouter();
  const theme = useAppTheme();

  return (
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
      <AppText variant="button" style={styles.headerTitle}>공동 일정</AppText>
      <Pressable
        accessibilityLabel="일정 관리"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => Alert.alert('일정 관리', '일정 관리 기능은 다음 단계에서 연결할 예정입니다.')}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="dots-vertical" color={theme.text} size={22} />
      </Pressable>
    </View>
  );
}

function SummaryCard({ event }: { event: EventDetailData }) {
  return (
    <Card style={styles.summaryCard}>
      <View style={styles.summaryTopRow}>
        <View style={styles.summaryTitleArea}>
          <AppText variant="heading" style={styles.eventTitle}>{event.title}</AppText>
          <AppText tone="secondary" style={styles.eventDate}>
            {event.date} ({event.weekday})
          </AppText>
        </View>
        <View style={styles.summaryIcon} accessibilityElementsHidden>
          <MaterialCommunityIcons name="calendar-heart" color={brandColors.coral} size={26} />
        </View>
      </View>
      <View style={styles.summaryTimeRow}>
        <AppText variant="heading" style={styles.eventTime}>{event.start} ~ {event.end}</AppText>
        <View style={styles.durationBadge}>
          <AppText style={styles.durationBadgeText}>{event.durationHours}시간</AppText>
        </View>
      </View>
    </Card>
  );
}

function ParticipantsSection() {
  const theme = useAppTheme();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <AppText style={styles.sectionTitle}>참여자</AppText>
        <AppText variant="caption" tone="secondary" style={styles.sectionCount}>3명</AppText>
      </View>
      <View style={styles.participantRow}>
        {MOCK_PARTICIPANTS.map((participant) => (
          <View key={participant.id} style={styles.participantItem}>
            <View style={[styles.avatar, { backgroundColor: participant.color, borderColor: theme.border }]}>
              <AppText variant="caption" style={styles.avatarInitial}>{participant.initial}</AppText>
            </View>
            <AppText variant="caption" style={styles.participantLabel}>{participant.label}</AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

function InfoSection({ icon, label, text, secondary = false }: {
  icon: 'map-marker-outline' | 'note-text-outline';
  label: string;
  text: string;
  secondary?: boolean;
}) {
  const theme = useAppTheme();

  return (
    <View style={styles.section}>
      <AppText style={styles.sectionTitle}>{label}</AppText>
      <View style={[styles.infoRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <MaterialCommunityIcons name={icon} color={brandColors.coral} size={20} />
        <AppText tone={secondary ? 'secondary' : 'primary'} style={styles.infoText}>{text}</AppText>
      </View>
    </View>
  );
}

function GapSourceSection({ start, end }: { start: string; end: string }) {
  const theme = useAppTheme();

  return (
    <View style={styles.section}>
      <AppText style={styles.sectionTitle}>함께 시간</AppText>
      <Pressable
        accessibilityRole="button"
        onPress={() => Alert.alert('우리의 틈', '우리의 틈 연결은 다음 단계에서 구현합니다.')}
        style={({ pressed }) => [
          styles.sourceRow,
          { backgroundColor: theme.surface, borderColor: theme.border },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.sourceIcon}>
          <MaterialCommunityIcons name="account-clock-outline" color={brandColors.coral} size={21} />
        </View>
        <View style={styles.sourceTextArea}>
          <AppText style={styles.sourceTitle}>우리의 틈에서 만든 일정</AppText>
          <AppText variant="caption" tone="secondary">배우자와 함께 가능한 시간 · {start} ~ {end}</AppText>
        </View>
        <MaterialCommunityIcons name="chevron-right" color={theme.text} size={18} />
      </Pressable>
    </View>
  );
}

function ShiftSection() {
  const theme = useAppTheme();

  return (
    <View style={styles.section}>
      <AppText style={styles.sectionTitle}>당일 근무</AppText>
      <View style={[styles.shiftGroup, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {MOCK_SHIFTS.map((item, index) => (
          <View key={item.person}>
            {index > 0 && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
            <View style={styles.shiftRow}>
              <AppText style={styles.shiftPerson}>{item.person}</AppText>
              <View style={[styles.shiftBadge, { backgroundColor: item.color }]}>
                <AppText style={styles.shiftText}>{item.shift}</AppText>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function ActionButtons() {
  const theme = useAppTheme();

  return (
    <View style={styles.actionRow}>
      <Pressable
        accessibilityRole="button"
        onPress={() => Alert.alert('일정 수정', '일정 수정 기능은 다음 단계에서 연결할 예정입니다.')}
        style={({ pressed }) => [styles.actionButton, { backgroundColor: theme.surface, borderColor: theme.border }, pressed && styles.pressed]}
      >
        <AppText variant="button" style={styles.actionText}>일정 수정</AppText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => Alert.alert('일정 삭제', '일정 삭제 기능은 실제 저장 기능 구현 후 연결합니다.')}
        style={({ pressed }) => [styles.actionButton, styles.deleteButton, pressed && styles.pressed]}
      >
        <AppText variant="button" style={styles.deleteText}>삭제</AppText>
      </Pressable>
    </View>
  );
}

export default function TogetherEventDetailScreen() {
  const params = useLocalSearchParams<EventDetailParams>();
  const insets = useSafeAreaInsets();
  const event: EventDetailData = {
    title: params.title ?? FALLBACK_EVENT.title,
    date: params.date ?? FALLBACK_EVENT.date,
    weekday: params.weekday ?? FALLBACK_EVENT.weekday,
    start: params.start ?? FALLBACK_EVENT.start,
    end: params.end ?? FALLBACK_EVENT.end,
    durationHours: params.durationHours ?? FALLBACK_EVENT.durationHours,
    location: params.location ?? FALLBACK_EVENT.location,
    memo: params.memo ?? FALLBACK_EVENT.memo,
  };
  const locationText = event.location || '장소 미정';
  const memoText = event.memo || '등록된 메모가 없습니다.';

  return (
    <Screen style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        <Header />
        <SummaryCard event={event} />
        <ParticipantsSection />
        <InfoSection icon="map-marker-outline" label="장소" secondary={!event.location} text={locationText} />
        <InfoSection icon="note-text-outline" label="메모" secondary={!event.memo} text={memoText} />
        <GapSourceSection end={event.end} start={event.start} />
        <ShiftSection />
        <ActionButtons />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 0,
    paddingTop: spacing.xs,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
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
  summaryCard: {
    backgroundColor: '#FFF1EA',
    borderColor: '#F5D8CC',
    borderCurve: 'continuous',
    gap: spacing.sm,
    padding: spacing.md,
  },
  summaryTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryTitleArea: {
    flex: 1,
    gap: 2,
  },
  eventTitle: {
    color: brandColors.deepNavy,
    fontSize: 21,
    lineHeight: 28,
  },
  eventDate: {
    fontSize: 13,
    lineHeight: 18,
  },
  summaryIcon: {
    alignItems: 'center',
    backgroundColor: '#FFE4D8',
    borderRadius: radius.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  summaryTimeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  eventTime: {
    color: brandColors.coral,
    flex: 1,
    fontSize: 23,
    lineHeight: 30,
  },
  durationBadge: {
    backgroundColor: brandColors.coral,
    borderRadius: radius.xxl,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  durationBadgeText: {
    color: brandColors.white,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  section: {
    gap: spacing.xs,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  sectionCount: {
    fontSize: 12,
    lineHeight: 17,
  },
  participantRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  participantItem: {
    alignItems: 'center',
    gap: spacing.xxs,
    minWidth: 48,
  },
  avatar: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  avatarInitial: {
    color: brandColors.deepNavy,
    fontWeight: '700',
  },
  participantLabel: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  infoRow: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 46,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  sourceRow: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sourceIcon: {
    alignItems: 'center',
    backgroundColor: '#FFF0E9',
    borderRadius: radius.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  sourceTextArea: {
    flex: 1,
    gap: 1,
  },
  sourceTitle: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  shiftGroup: {
    borderCurve: 'continuous',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
  },
  shiftRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 38,
  },
  shiftPerson: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  shiftBadge: {
    alignItems: 'center',
    borderRadius: radius.xxl,
    minWidth: 48,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  shiftText: {
    color: brandColors.deepNavy,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingTop: spacing.xxs,
  },
  actionButton: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  actionText: {
    fontSize: 14,
  },
  deleteButton: {
    backgroundColor: '#FFF8F6',
    borderColor: '#F2C9C2',
  },
  deleteText: {
    color: '#C85C4A',
    fontSize: 14,
  },
  pressed: {
    opacity: 0.78,
  },
});
