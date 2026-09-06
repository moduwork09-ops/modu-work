import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, PrimaryButton, Screen } from '../../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../../src/constants';
import { useAuth } from '../../src/features/auth/AuthContext';
import {
  createAppointmentRecommendations,
  formatRecommendationDuration,
  toAppointmentPrefill,
  type AppointmentRecommendation,
  type AppointmentRecommendationResult,
} from '../../src/features/together/appointmentRecommendation';
import { getTogetherSpaceTypeLabel } from '../../src/features/together/sharePolicyPresentation';
import {
  formatAvailabilityInterval,
  formatAvailabilityMinute,
  getTogetherAvailabilityStatusMessage,
  isCurrentTogetherAvailabilityRequest,
  type TogetherAvailabilityRequestIdentity,
} from '../../src/features/together/commonAvailabilityPresentation';
import {
  chooseTogetherHomeSpace,
  getCurrentLocalWeekRange,
  getTogetherHomeMembers,
  getWeeklyCommonDaysOff,
  type TogetherHomeMember,
} from '../../src/features/together/togetherHomePresentation';
import {
  getTogetherCommonDaysOff,
  getTogetherCommonAvailability,
  getTogetherMembers,
  getTogetherSpaces,
  type TogetherCommonDayOff,
  type TogetherCommonAvailability,
} from '../../src/features/together/togetherServerData';
import { addLocalCalendarDays, formatLocalCalendarDate } from '../../src/features/together/dayOffProjection';
import type { TogetherSpace } from '../../src/features/together/types';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const AVATAR_COLORS = ['#F8D6CA', '#DDE7EE', '#E3E9D9', '#F3E2C7', '#DED8EC'] as const;
const MAX_VISIBLE_AVATARS = 5;

function formatWeekDate(localDate: string) {
  const [year, month, day] = localDate.split('-').map(Number);
  return `${month}/${day} (${WEEKDAYS[new Date(year, month - 1, day).getDay()]})`;
}

function getRoleLabel(role: string) {
  if (role === 'owner') return '그룹장';
  if (role === 'member') return '멤버';
  return role.trim() || '역할 미확인';
}

function CompactHero() {
  return (
    <View style={styles.hero}>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        source={require('../../assets/together/together-hero.png')}
        style={styles.heroImage}
      />
    </View>
  );
}

function GroupSelector({ spaces, selectedSpaceId, onSelect }: {
  spaces: TogetherSpace[];
  selectedSpaceId: string;
  onSelect: (spaceId: string) => void;
}) {
  if (spaces.length <= 1) return null;
  return (
    <ScrollView horizontal contentContainerStyle={styles.groupSelector} showsHorizontalScrollIndicator={false}>
      {spaces.map((space) => {
        const selected = space.id === selectedSpaceId;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={space.id}
            onPress={() => onSelect(space.id)}
            style={({ pressed }) => [styles.groupChip, selected && styles.groupChipSelected, pressed && styles.pressed]}
          >
            <AppText variant="caption" style={[styles.groupChipText, selected && styles.groupChipTextSelected]}>{space.name}</AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function PeopleRow({ members, space, onPress }: {
  members: TogetherHomeMember[];
  space: TogetherSpace;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  const visibleMembers = members.slice(0, MAX_VISIBLE_AVATARS);
  const overflowCount = Math.max(0, members.length - visibleMembers.length);

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.peopleRow, pressed && styles.pressed]}>
      <View style={styles.groupIdentity}>
        <AppText variant="button" style={styles.groupName}>{space.name}</AppText>
        <AppText variant="caption" tone="secondary">{getTogetherSpaceTypeLabel(space.type)} · {members.length}명</AppText>
        <AppText variant="caption" tone="secondary" numberOfLines={2}>
          {members.map((member) => `${member.displayLabel} · ${getRoleLabel(member.role)}`).join(', ')}
        </AppText>
      </View>
      <View style={styles.avatarStack}>
        {visibleMembers.map((member, index) => (
          <View
            accessibilityLabel={`${member.displayLabel}, ${getRoleLabel(member.role)}`}
            key={member.userId}
            style={[
              styles.memberAvatar,
              { backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length], marginLeft: index === 0 ? 0 : -8, zIndex: visibleMembers.length - index },
            ]}
          >
            <AppText variant="caption" style={styles.memberInitial}>{member.initial}</AppText>
          </View>
        ))}
        {overflowCount > 0 ? (
          <View style={[styles.memberAvatar, styles.overflowAvatar, { marginLeft: -8 }]}>
            <AppText variant="caption" style={styles.memberInitial}>+{overflowCount}</AppText>
          </View>
        ) : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" color={theme.textSecondary} size={21} />
    </Pressable>
  );
}

function GroupActions({ onManage, onShareSettings }: { onManage: () => void; onShareSettings: () => void }) {
  return (
    <View style={styles.groupActions}>
      <Pressable accessibilityRole="button" onPress={onManage} style={({ pressed }) => [styles.groupAction, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="account-group-outline" color={brandColors.coral} size={17} />
        <AppText variant="caption" style={styles.groupActionText}>함께 관리</AppText>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onShareSettings} style={({ pressed }) => [styles.groupAction, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="shield-account-outline" color={brandColors.coral} size={17} />
        <AppText variant="caption" style={styles.groupActionText}>공유 설정</AppText>
      </Pressable>
    </View>
  );
}

function PendingCard({ message }: { message: string }) {
  return <Card style={styles.pendingCard}><AppText variant="caption" tone="secondary">{message}</AppText></Card>;
}

type AvailabilityCardState =
  | { kind: 'loading' }
  | { kind: 'loaded'; day: TogetherCommonAvailability }
  | { kind: 'error' };

type RecommendationState =
  | { kind: 'loading' }
  | { kind: 'loaded'; result: AppointmentRecommendationResult }
  | { kind: 'error' };

function TodayAvailabilityCard({ onPress, onCreate, onRetry, state }: {
  onCreate: (localDate: string, interval: TogetherCommonAvailability['intervals'][number]) => void;
  onPress: () => void;
  onRetry: () => void;
  state: AvailabilityCardState;
}) {
  if (state.kind === 'loading') return <PendingCard message="우리의 틈을 확인하는 중..." />;
  if (state.kind === 'error') {
    return (
      <Card style={styles.pendingCard}>
        <AppText variant="caption" tone="secondary">우리의 틈을 확인할 수 없어요.</AppText>
        <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => pressed && styles.pressed}>
          <AppText variant="caption" style={styles.inlineRetry}>다시 시도</AppText>
        </Pressable>
      </Card>
    );
  }
  const intervals = state.day.availabilityStatus === 'ready' ? state.day.intervals : [];
  return (
    <Card style={styles.pendingCard}>
      {intervals.length ? intervals.map(interval => (
        <Pressable key={interval.startMinute + ':' + interval.endMinute} accessibilityRole="button"
          accessibilityLabel={formatAvailabilityInterval(interval) + ' 약속 만들기'}
          onPress={() => onCreate(state.day.localDate, interval)}
          style={({ pressed }) => [styles.availabilityRow, pressed && styles.pressed]}>
          <AppText variant="button" style={{ flexShrink: 1 }}>{formatAvailabilityInterval(interval)}</AppText>
          <View style={styles.availabilityAction}><AppText variant="caption" style={styles.createAppointmentText}>약속 만들기</AppText><MaterialCommunityIcons name="chevron-right" size={18} color={brandColors.coral} /></View>
        </Pressable>
      )) : <Pressable accessibilityRole="button" onPress={onPress}><AppText variant="caption" tone="secondary">{getTogetherAvailabilityStatusMessage(state.day)}</AppText></Pressable>}
    </Card>
  );
}

function formatRecommendationDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${month}월 ${day}일 ${new Intl.DateTimeFormat('ko-KR', { weekday: 'long' }).format(date)}`;
}

function getRecommendationStatusMessage(result: AppointmentRecommendationResult): string {
  if (result.availabilityStatus === 'sharing_disabled') return '우리의 틈 공유가 켜지면 약속을 추천해드릴 수 있어요.';
  if (result.availabilityStatus === 'not_synced') return '근무 정보를 준비하고 있어요.';
  if (result.availabilityStatus === 'timezone_mismatch') return '서로 다른 시간대를 사용하고 있어 약속을 추천할 수 없어요.';
  if (result.availabilityStatus === 'not_enough_members') return '함께할 멤버를 초대하면 약속을 추천해드릴게요.';
  return '앞으로 2주 동안 추천할 만한 함께 시간이 없어요.';
}

function RecommendationCard({ item, onCreate }: { item: AppointmentRecommendation; onCreate: () => void }) {
  return (
    <Card style={styles.recommendationCard}>
      <View style={styles.recommendationHeader}>
        <AppText variant="button">{formatRecommendationDate(item.localDate)}</AppText>
        {item.isCommonDayOff ? (
          <View style={styles.commonDayBadge}><AppText variant="caption" style={styles.commonDayBadgeText}>공통 휴무</AppText></View>
        ) : null}
      </View>
      <AppText style={styles.recommendationTime}>
        {formatAvailabilityInterval(item)} · {formatRecommendationDuration(item.durationMinutes)}
      </AppText>
      <Pressable accessibilityRole="button" onPress={onCreate} style={({ pressed }) => [styles.createAppointmentButton, pressed && styles.pressed]}>
        <AppText variant="caption" style={styles.createAppointmentText}>약속 만들기</AppText>
      </Pressable>
    </Card>
  );
}

function Recommendations({ onCreate, onRetry, state }: {
  onCreate: (item: AppointmentRecommendation) => void;
  onRetry: () => void;
  state: RecommendationState;
}) {
  if (state.kind === 'loading') return <PendingCard message="추천 약속을 찾는 중..." />;
  if (state.kind === 'error') {
    return (
      <Card style={styles.pendingCard}>
        <AppText variant="caption" tone="secondary">추천 약속을 확인할 수 없어요.</AppText>
        <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => pressed && styles.pressed}>
          <AppText variant="caption" style={styles.inlineRetry}>다시 시도</AppText>
        </Pressable>
      </Card>
    );
  }
  if (state.result.recommendations.length === 0) return <PendingCard message={getRecommendationStatusMessage(state.result)} />;
  return (
    <View style={styles.recommendationList}>
      {state.result.recommendations.map((item) => (
        <RecommendationCard item={item} key={`${item.localDate}-${item.startMinute}-${item.endMinute}`} onCreate={() => onCreate(item)} />
      ))}
    </View>
  );
}

function WeeklyCommonDays({ days, hasUnavailable, onPress }: {
  days: TogetherCommonDayOff[];
  hasUnavailable: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  const commonDays = getWeeklyCommonDaysOff(days);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {commonDays.length > 0 ? (
        <View style={styles.weeklyContent}>
          <View style={styles.dayChipRow}>
            {commonDays.map((day) => (
              <View key={day.localDate} style={[styles.dayChip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <AppText variant="button" style={styles.dayChipText}>{formatWeekDate(day.localDate)}</AppText>
              </View>
            ))}
          </View>
          {hasUnavailable ? <AppText variant="caption" tone="secondary">일부 날짜는 휴무 공유와 동기화가 더 필요해요.</AppText> : null}
        </View>
      ) : (
        <Card style={styles.pendingCard}>
          <AppText variant="caption" tone="secondary">
            {hasUnavailable ? '모든 멤버의 휴무 공유와 동기화가 필요해요.' : '이번 주 공통 휴무가 없어요.'}
          </AppText>
        </Card>
      )}
    </Pressable>
  );
}

export default function TogetherScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { session } = useAuth();
  const [spaces, setSpaces] = useState<TogetherSpace[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>();
  const [members, setMembers] = useState<TogetherHomeMember[]>([]);
  const [weekDays, setWeekDays] = useState<TogetherCommonDayOff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [availabilityState, setAvailabilityState] = useState<AvailabilityCardState>({ kind: 'loading' });
  const [recommendationState, setRecommendationState] = useState<RecommendationState>({ kind: 'loading' });
  const selectedSpaceIdRef = useRef<string | undefined>(undefined);
  const appointmentNavigationRef = useRef(false);
  const isFocusedRef = useRef(false);
  const requestIdRef = useRef(0);
  const availabilityRequestRef = useRef<TogetherAvailabilityRequestIdentity | undefined>(undefined);
  const sessionUserIdRef = useRef(session?.user.id);
  sessionUserIdRef.current = session?.user.id;
  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId);

  const loadSelectedSpace = useCallback(async (spaceId: string, requestId: number) => {
    const { from, to } = getCurrentLocalWeekRange();
    const [nextMembers, nextWeekDays] = await Promise.all([
      getTogetherMembers(spaceId),
      getTogetherCommonDaysOff(spaceId, from, to),
    ]);
    if (!isFocusedRef.current || requestIdRef.current !== requestId) return;
    setMembers(getTogetherHomeMembers(nextMembers, session?.user.id));
    setWeekDays(nextWeekDays);
  }, [session?.user.id]);

  const loadAvailability = useCallback(async (spaceId: string, generation: number) => {
    const userId = sessionUserIdRef.current;
    if (!userId) return;
    const localDate = formatLocalCalendarDate(new Date());
    const rangeEnd = addLocalCalendarDays(localDate, 13);
    const identity = { generation, localDate, spaceId, userId };
    availabilityRequestRef.current = identity;
    setAvailabilityState({ kind: 'loading' });
    setRecommendationState({ kind: 'loading' });
    const [availabilityResult, daysOffResult] = await Promise.allSettled([
      getTogetherCommonAvailability(spaceId, localDate, rangeEnd),
      getTogetherCommonDaysOff(spaceId, localDate, rangeEnd),
    ]);
    if (!isFocusedRef.current
      || sessionUserIdRef.current !== userId
      || !isCurrentTogetherAvailabilityRequest(availabilityRequestRef.current, identity)) return;
    if (availabilityResult.status === 'rejected') {
      setAvailabilityState({ kind: 'error' });
      setRecommendationState({ kind: 'error' });
      return;
    }
    setAvailabilityState({ kind: 'loaded', day: availabilityResult.value[0] });
    if (daysOffResult.status === 'rejected') {
      setRecommendationState({ kind: 'error' });
      return;
    }
    try {
      setRecommendationState({
        kind: 'loaded',
        result: createAppointmentRecommendations(availabilityResult.value, daysOffResult.value),
      });
    } catch {
      setRecommendationState({ kind: 'error' });
    }
  }, []);

  useFocusEffect(useCallback(() => {
    const requestId = ++requestIdRef.current;
    isFocusedRef.current = true;
    appointmentNavigationRef.current = false;
    setIsLoading(true);
    setHasError(false);
    setMembers([]);
    setWeekDays([]);
    setAvailabilityState({ kind: 'loading' });
    setRecommendationState({ kind: 'loading' });

    void getTogetherSpaces()
      .then(async (nextSpaces) => {
        if (!isFocusedRef.current || requestIdRef.current !== requestId) return;
        const nextSpace = chooseTogetherHomeSpace(nextSpaces, selectedSpaceIdRef.current);
        setSpaces(nextSpaces);
        setSelectedSpaceId(nextSpace?.id);
        selectedSpaceIdRef.current = nextSpace?.id;
        if (!nextSpace) return;
        void loadAvailability(nextSpace.id, requestId);
        await loadSelectedSpace(nextSpace.id, requestId);
      })
      .catch(() => {
        if (!isFocusedRef.current || requestIdRef.current !== requestId) return;
        setHasError(true);
      })
      .finally(() => {
        if (!isFocusedRef.current || requestIdRef.current !== requestId) return;
        setIsLoading(false);
      });

    return () => {
      isFocusedRef.current = false;
      if (requestIdRef.current === requestId) requestIdRef.current += 1;
    };
  }, [loadAvailability, loadSelectedSpace, retryKey]));

  const selectSpace = (spaceId: string) => {
    if (spaceId === selectedSpaceIdRef.current) return;
    const requestId = ++requestIdRef.current;
    selectedSpaceIdRef.current = spaceId;
    setSelectedSpaceId(spaceId);
    setMembers([]);
    setWeekDays([]);
    setHasError(false);
    setIsLoading(true);
    void loadAvailability(spaceId, requestId);
    void loadSelectedSpace(spaceId, requestId)
      .catch(() => {
        if (!isFocusedRef.current || requestIdRef.current !== requestId) return;
        setHasError(true);
      })
      .finally(() => {
        if (!isFocusedRef.current || requestIdRef.current !== requestId) return;
        setIsLoading(false);
      });
  };

  const retryAvailability = () => {
    const spaceId = selectedSpaceIdRef.current;
    if (!spaceId) return;
    void loadAvailability(spaceId, ++requestIdRef.current);
  };

  const createGapAppointment = (date: string, interval: TogetherCommonAvailability['intervals'][number]) => {
    const identity = availabilityRequestRef.current;
    if (appointmentNavigationRef.current || !isFocusedRef.current || !selectedSpace
      || selectedSpace.id !== selectedSpaceIdRef.current || identity?.spaceId !== selectedSpace.id
      || identity.localDate !== date || identity.userId !== sessionUserIdRef.current) return;
    appointmentNavigationRef.current = true;
    router.push({ pathname: '/together-event-create', params: {
      spaceId: selectedSpace.id, date,
      startTime: formatAvailabilityMinute(interval.startMinute), endTime: formatAvailabilityMinute(interval.endMinute),
    } });
  };

  const createRecommendedAppointment = (item: AppointmentRecommendation) => {
    const identity = availabilityRequestRef.current;
    if (appointmentNavigationRef.current || !isFocusedRef.current || !selectedSpace
      || selectedSpace.id !== selectedSpaceIdRef.current || identity?.spaceId !== selectedSpace.id
      || identity.userId !== sessionUserIdRef.current) return;
    appointmentNavigationRef.current = true;
    const prefill = toAppointmentPrefill(item);
    router.push({
      pathname: '/together-event-create',
      params: {
        spaceId: selectedSpace.id,
        date: prefill.localDate,
        startTime: prefill.startTime,
        endTime: prefill.endTime,
      },
    });
  };

  const openForSelectedSpace = (pathname: '/together-group-detail' | '/together-manage' | '/together-days-off' | '/together-share-settings' | '/together-gap') => {
    if (!selectedSpace) return;
    router.push({ pathname, params: { spaceId: selectedSpace.id } });
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <AppText variant="title" style={styles.headerTitle}>함께</AppText>
          <Pressable accessibilityLabel="알림" accessibilityRole="button" hitSlop={8} onPress={() => Alert.alert('알림', '함께 알림은 다음 단계에서 연결돼요.')} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="bell-outline" color={theme.text} size={21} />
          </Pressable>
        </View>

        <CompactHero />

        {isLoading ? <Card style={styles.stateCard}><AppText tone="secondary">함께 정보를 불러오는 중...</AppText></Card> : null}
        {!isLoading && hasError ? (
          <Card style={styles.stateCard}>
            <AppText>함께 정보를 확인할 수 없어요.</AppText>
            <PrimaryButton label="다시 시도" onPress={() => setRetryKey((value) => value + 1)} style={styles.retryButton} />
          </Card>
        ) : null}
        {!isLoading && !hasError && spaces.length === 0 ? (
          <Card style={styles.stateCard}>
            <AppText variant="button">아직 함께하는 그룹이 없어요.</AppText>
            <AppText variant="caption" tone="secondary">그룹을 만들거나 초대 코드로 참여해보세요.</AppText>
            <PrimaryButton label="함께 시작하기" onPress={() => router.push('/together-add')} style={styles.retryButton} />
          </Card>
        ) : null}

        {!isLoading && !hasError && selectedSpace ? (
          <>
            <GroupSelector onSelect={selectSpace} selectedSpaceId={selectedSpace.id} spaces={spaces} />
            <PeopleRow members={members} onPress={() => openForSelectedSpace('/together-group-detail')} space={selectedSpace} />
            <GroupActions
              onManage={() => openForSelectedSpace('/together-manage')}
              onShareSettings={() => openForSelectedSpace('/together-share-settings')}
            />

            <View style={styles.section}>
              <AppText variant="button" style={styles.sectionTitle}>오늘의 함께하는 틈</AppText>
              <TodayAvailabilityCard
                onCreate={createGapAppointment}
                onPress={() => openForSelectedSpace('/together-gap')}
                onRetry={retryAvailability}
                state={availabilityState}
              />
            </View>

            <View style={[styles.section, styles.sectionSeparated]}>
              <AppText variant="button" style={styles.sectionTitle}>이번 주 공통 휴무</AppText>
              <WeeklyCommonDays
                days={weekDays}
                hasUnavailable={weekDays.some((day) => day.availabilityStatus === 'unavailable')}
                onPress={() => openForSelectedSpace('/together-days-off')}
              />
            </View>

            <View style={[styles.section, styles.sectionSeparated]}>
              <AppText variant="button" style={styles.sectionTitle}>추천 약속</AppText>
              <Recommendations onCreate={createRecommendedAppointment} onRetry={retryAvailability} state={recommendationState} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  availabilityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 48 },
  availabilityAction: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  screen: { paddingBottom: 0, paddingTop: spacing.xs },
  content: { gap: spacing.sm, paddingBottom: spacing.xs },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 38 },
  headerTitle: { fontSize: 24, lineHeight: 31 },
  headerButton: { alignItems: 'center', borderRadius: radius.xxl, height: 36, justifyContent: 'center', width: 36 },
  hero: { aspectRatio: 2.35, borderColor: '#F5D8CC', borderCurve: 'continuous', borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', width: '100%' },
  heroImage: { height: '100%', width: '100%' },
  groupSelector: { gap: spacing.xs, paddingVertical: spacing.xxs },
  groupChip: { backgroundColor: '#F4F1EC', borderColor: '#E5E1D9', borderRadius: radius.xxl, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  groupChipSelected: { backgroundColor: brandColors.deepNavy, borderColor: brandColors.deepNavy },
  groupChipText: { color: brandColors.deepNavy, fontWeight: '700' },
  groupChipTextSelected: { color: brandColors.white },
  peopleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 64, paddingHorizontal: spacing.xs },
  groupIdentity: { flex: 1, gap: 1 },
  groupName: { fontSize: 16, lineHeight: 22 },
  avatarStack: { alignItems: 'center', flexDirection: 'row', height: 40 },
  memberAvatar: { alignItems: 'center', borderColor: brandColors.white, borderRadius: 20, borderWidth: 2, height: 40, justifyContent: 'center', width: 40 },
  overflowAvatar: { backgroundColor: '#EEF1F3' },
  memberInitial: { color: brandColors.deepNavy, fontWeight: '700' },
  groupActions: { flexDirection: 'row', gap: spacing.xs },
  groupAction: { alignItems: 'center', backgroundColor: '#FFF0E9', borderColor: '#F5D8CC', borderRadius: radius.md, borderWidth: 1, flex: 1, flexDirection: 'row', gap: spacing.xxs, justifyContent: 'center', minHeight: 38 },
  groupActionText: { color: brandColors.coral, fontWeight: '700' },
  section: { gap: 6 },
  sectionSeparated: { marginTop: spacing.xxs },
  sectionTitle: { fontWeight: '700' },
  pendingCard: { alignItems: 'center', justifyContent: 'center', minHeight: 54, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  inlineRetry: { color: brandColors.coral, fontWeight: '700', paddingTop: spacing.xxs },
  weeklyContent: { gap: spacing.xxs },
  dayChipRow: { flexDirection: 'row', gap: spacing.xs },
  dayChip: { alignItems: 'center', borderCurve: 'continuous', borderRadius: radius.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: spacing.xs },
  dayChipText: { fontSize: 13, textAlign: 'center' },
  stateCard: { alignItems: 'center', gap: spacing.sm, justifyContent: 'center', minHeight: 180, padding: spacing.lg },
  retryButton: { minHeight: 42, width: 150 },
  recommendationList: { gap: spacing.xs },
  recommendationCard: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  recommendationHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  recommendationTime: { color: brandColors.coral, fontSize: 14, fontWeight: '700' },
  commonDayBadge: { backgroundColor: '#FFF0E9', borderRadius: radius.xxl, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  commonDayBadgeText: { color: brandColors.coral, fontWeight: '700' },
  createAppointmentButton: { alignItems: 'center', alignSelf: 'flex-end', borderColor: brandColors.coral, borderRadius: radius.md, borderWidth: 1, minHeight: 34, justifyContent: 'center', paddingHorizontal: spacing.sm },
  createAppointmentText: { color: brandColors.coral, fontWeight: '700' },
  pressed: { opacity: 0.78 },
});
