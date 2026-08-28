import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { useAuth } from '../src/features/auth/AuthContext';
import { getTogetherSpaceTypeLabel } from '../src/features/together/sharePolicyPresentation';
import {
  getTogetherMembers,
  getTogetherSpace,
  isTogetherSpaceId,
  listSharedEvents,
  type SharedEvent,
  type TogetherMember,
} from '../src/features/together/togetherServerData';
import type { TogetherSpace } from '../src/features/together/types';

type DetailOperation = 'space' | 'members' | 'shared-events';

function warnDetailRequestError(operation: DetailOperation, error: unknown) {
  if (!__DEV__) return;

  const errorRecord = error && typeof error === 'object' ? error as Record<string, unknown> : undefined;
  const name = error instanceof Error
    ? error.name
    : typeof errorRecord?.name === 'string' ? errorRecord.name : 'UnknownError';
  const message = error instanceof Error
    ? error.message
    : typeof errorRecord?.message === 'string' ? errorRecord.message : 'Unknown error';
  const code = typeof errorRecord?.code === 'string' ? errorRecord.code : undefined;

  console.warn('[Together detail request failed]', {
    operation,
    name,
    message,
    ...(code ? { code } : {}),
  });
}

function diagnoseRequest<T>(operation: DetailOperation, request: Promise<T>): Promise<T> {
  return request.catch((error: unknown) => {
    warnDetailRequestError(operation, error);
    throw error;
  });
}

function getRoleLabel(role: string) {
  if (role === 'owner') return '그룹장';
  if (role === 'member') return '멤버';
  return role.trim() || '역할 미확인';
}

function getStatusLabel(status: string) {
  if (status === 'active') return '참여 중';
  return status.trim() || '상태 미확인';
}

function getMemberDisplay(displayName: string | null) {
  const normalizedName = displayName?.trim();
  return {
    displayName: normalizedName || '이름 미설정',
    initial: normalizedName?.slice(0, 1) || '?',
  };
}

function Header({ onEdit }: { onEdit?: () => void }) {
  const router = useRouter();
  const theme = useAppTheme();

  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
      </Pressable>
      <AppText variant="button" style={styles.headerTitle}>그룹 정보</AppText>
      {onEdit ? (
        <Pressable accessibilityLabel="그룹 정보 수정" accessibilityRole="button" hitSlop={8} onPress={onEdit} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="pencil-outline" color={theme.text} size={22} />
        </Pressable>
      ) : <View style={styles.headerButton} />}
    </View>
  );
}

function MemberList({ members }: { members: TogetherMember[] }) {
  const theme = useAppTheme();

  if (members.length === 0) {
    return <Card style={styles.emptyCard}><AppText tone="secondary">아직 표시할 멤버가 없어요.</AppText></Card>;
  }

  return (
    <Card style={styles.memberCard}>
      {members.map((member, index) => {
        const { displayName, initial } = getMemberDisplay(member.displayName);
        return (
          <View key={member.userId} style={[styles.memberRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={styles.avatar}><AppText style={styles.avatarText}>{initial}</AppText></View>
            <View style={styles.memberText}>
              <AppText style={styles.memberName}>{displayName}</AppText>
              <AppText variant="caption" tone="secondary">{getStatusLabel(member.status)}</AppText>
            </View>
            <View style={styles.ownerBadge}><AppText variant="caption" style={styles.ownerText}>{getRoleLabel(member.role)}</AppText></View>
          </View>
        );
      })}
    </Card>
  );
}

function formatSharedEventDateTime(startsAt: string, endsAt: string) {
  const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
  const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
  });
  const starts = new Date(startsAt);
  const ends = new Date(endsAt);
  return `${dateFormatter.format(starts)} · ${timeFormatter.format(starts)}~${timeFormatter.format(ends)}`;
}

function SharedEventList({ events }: { events: SharedEvent[] }) {
  const theme = useAppTheme();

  if (events.length === 0) {
    return <Card style={styles.emptyCard}><AppText tone="secondary">아직 등록된 공동 일정이 없어요.</AppText></Card>;
  }

  return (
    <Card style={styles.eventCard}>
      {events.map((event, index) => (
        <View key={event.id} style={[styles.eventRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <View style={styles.eventIcon}>
            <MaterialCommunityIcons name="calendar-clock-outline" color={brandColors.coral} size={20} />
          </View>
          <View style={styles.eventText}>
            <AppText style={styles.eventTitle} numberOfLines={1}>{event.title}</AppText>
            <AppText variant="caption" tone="secondary">{formatSharedEventDateTime(event.startsAt, event.endsAt)}</AppText>
            {event.placeName ? <AppText variant="caption" tone="secondary" numberOfLines={1}>{event.placeName}</AppText> : null}
          </View>
        </View>
      ))}
    </Card>
  );
}

export default function TogetherGroupDetailScreen() {
  const params = useLocalSearchParams<{ spaceId?: string | string[] }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const rawSpaceId = params.spaceId;
  const spaceId = typeof rawSpaceId === 'string' && isTogetherSpaceId(rawSpaceId) ? rawSpaceId : undefined;
  const [space, setSpace] = useState<TogetherSpace>();
  const [members, setMembers] = useState<TogetherMember[]>([]);
  const [sharedEvents, setSharedEvents] = useState<SharedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const canEdit = Boolean(session?.user.id && members.some((member) => (
    member.userId === session.user.id && member.role === 'owner' && member.status === 'active'
  )));

  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    setSpace(undefined);
    setMembers([]);
    setSharedEvents([]);
    setHasError(false);

    if (!spaceId) {
      setIsLoading(false);
      setHasError(true);
      return () => {
        isCurrent = false;
      };
    }

    setIsLoading(true);
    void Promise.all([
      diagnoseRequest('space', getTogetherSpace(spaceId)),
      diagnoseRequest('members', getTogetherMembers(spaceId)),
      diagnoseRequest('shared-events', listSharedEvents(spaceId)),
    ])
      .then(([nextSpace, nextMembers, nextSharedEvents]) => {
        if (!isCurrent) return;
        setSpace(nextSpace);
        setMembers(nextMembers);
        setSharedEvents(nextSharedEvents);
      })
      .catch(() => {
        if (!isCurrent) return;
        setHasError(true);
      })
      .finally(() => {
        if (!isCurrent) return;
        setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [retryKey, spaceId]));

  return (
    <Screen style={styles.screen}>
      <Header onEdit={canEdit && space ? () => router.push({ pathname: '/together-group-edit', params: { spaceId: space.id } }) : undefined} />
      {isLoading ? <View style={styles.state}><AppText tone="secondary">그룹 정보를 불러오는 중...</AppText></View> : null}
      {!isLoading && (hasError || !space) ? (
        <View style={styles.state}>
          <AppText>그룹 정보를 확인할 수 없어요.</AppText>
          <Pressable accessibilityRole="button" onPress={() => setRetryKey((current) => current + 1)} style={({ pressed }) => pressed && styles.pressed}>
            <AppText style={styles.retryText}>다시 시도</AppText>
          </Pressable>
        </View>
      ) : null}
      {!isLoading && !hasError && space ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator={false}>
          <View style={styles.groupInfo}>
            <AppText variant="heading" style={styles.groupName}>{space.name}</AppText>
            <AppText variant="caption" tone="secondary">{getTogetherSpaceTypeLabel(space.type)} · {members.length}명</AppText>
          </View>

          <View style={styles.section}>
            <AppText variant="button" style={styles.sectionTitle}>함께하는 사람</AppText>
            <MemberList members={members} />
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/together-invite', params: { spaceId: space.id } })} style={({ pressed }) => [styles.inviteButton, pressed && styles.pressed]}>
              <MaterialCommunityIcons name="account-plus-outline" color={brandColors.coral} size={20} />
              <AppText style={styles.inviteText}>사람 초대하기</AppText>
            </Pressable>
          </View>

          <View style={styles.section}>
            <AppText variant="button" style={styles.sectionTitle}>내 공유 범위</AppText>
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/together-share-settings', params: { spaceId: space.id } })} style={({ pressed }) => pressed && styles.pressed}>
              <Card style={styles.shareCard}>
                <View>
                  <AppText style={styles.shareSummary}>내 공유 범위 설정</AppText>
                  <AppText variant="caption" tone="secondary">이 그룹에 공유할 정보를 직접 선택할 수 있어요.</AppText>
                </View>
              </Card>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/together-days-off', params: { spaceId: space.id } })} style={({ pressed }) => pressed && styles.pressed}>
              <Card style={styles.shareCard}>
                <AppText style={styles.shareSummary}>공통 휴무 확인</AppText>
                <AppText variant="caption" tone="secondary">그룹 멤버와 겹치는 휴무를 확인해보세요.</AppText>
              </Card>
            </Pressable>
          </View>

          <View style={styles.section}>
            <AppText variant="button" style={styles.sectionTitle}>공동 일정</AppText>
            <SharedEventList events={sharedEvents} />
          </View>
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingTop: spacing.xs },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 },
  headerButton: { alignItems: 'center', borderRadius: radius.xxl, height: 36, justifyContent: 'center', width: 36 },
  headerTitle: { fontSize: 18 },
  content: { gap: spacing.lg, paddingTop: spacing.md },
  groupInfo: { gap: 1 },
  groupName: { fontSize: 24, lineHeight: 31 },
  section: { gap: spacing.xs },
  sectionTitle: { fontSize: 15 },
  memberCard: { paddingHorizontal: spacing.md, paddingVertical: 0 },
  memberRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 66, paddingVertical: spacing.xs },
  avatar: { alignItems: 'center', backgroundColor: '#F8D6CA', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  avatarText: { color: brandColors.deepNavy, fontWeight: '700' },
  memberText: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '700' },
  ownerBadge: { backgroundColor: '#EEF1F3', borderRadius: radius.xxl, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  ownerText: { color: brandColors.deepNavy, fontSize: 12, fontWeight: '700' },
  emptyCard: { alignItems: 'center', paddingVertical: spacing.xl },
  eventCard: { paddingHorizontal: spacing.md, paddingVertical: 0 },
  eventRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 72, paddingVertical: spacing.sm },
  eventIcon: { alignItems: 'center', backgroundColor: '#FFF0E9', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  eventText: { flex: 1, gap: 1 },
  eventTitle: { fontSize: 15, fontWeight: '700' },
  inviteButton: { alignItems: 'center', backgroundColor: '#FFF0E9', borderColor: '#F5D8CC', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 46 },
  inviteText: { color: brandColors.coral, fontSize: 14, fontWeight: '700' },
  shareCard: { padding: spacing.md },
  shareSummary: { color: brandColors.coral, fontSize: 16, fontWeight: '700' },
  state: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  retryText: { color: brandColors.coral, fontWeight: '700', marginTop: spacing.xs },
  pressed: { opacity: 0.76 },
});
