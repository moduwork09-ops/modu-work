import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { getTogetherSpaceTypeLabel } from '../src/features/together/sharePolicyPresentation';
import {
  getTogetherMembers,
  getTogetherSpace,
  isTogetherSpaceId,
  type TogetherMember,
} from '../src/features/together/togetherServerData';
import type { TogetherSpace } from '../src/features/together/types';

type DetailOperation = 'space' | 'members';

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

function Header() {
  const router = useRouter();
  const theme = useAppTheme();

  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
      </Pressable>
      <AppText variant="button" style={styles.headerTitle}>그룹 정보</AppText>
      <Pressable accessibilityLabel="그룹 메뉴" accessibilityRole="button" hitSlop={8} onPress={() => Alert.alert('그룹 설정', '그룹 이름과 유형 수정은 다음 단계에서 연결할 기능이에요.')} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="dots-horizontal" color={theme.text} size={23} />
      </Pressable>
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

export default function TogetherGroupDetailScreen() {
  const params = useLocalSearchParams<{ spaceId?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const rawSpaceId = params.spaceId;
  const spaceId = typeof rawSpaceId === 'string' && isTogetherSpaceId(rawSpaceId) ? rawSpaceId : undefined;
  const [space, setSpace] = useState<TogetherSpace>();
  const [members, setMembers] = useState<TogetherMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    setSpace(undefined);
    setMembers([]);
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
    ])
      .then(([nextSpace, nextMembers]) => {
        if (!isCurrent) return;
        setSpace(nextSpace);
        setMembers(nextMembers);
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
  }, [spaceId]));

  return (
    <Screen style={styles.screen}>
      <Header />
      {isLoading ? <View style={styles.state}><AppText tone="secondary">그룹 정보를 불러오는 중...</AppText></View> : null}
      {!isLoading && (hasError || !space) ? <View style={styles.state}><AppText>그룹 정보를 확인할 수 없어요.</AppText></View> : null}
      {!isLoading && !hasError && space ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator={false}>
          <View style={styles.groupInfo}>
            <AppText variant="heading" style={styles.groupName}>{space.name}</AppText>
            <AppText variant="caption" tone="secondary">{getTogetherSpaceTypeLabel(space.type)} · {members.length}명</AppText>
          </View>

          <View style={styles.section}>
            <AppText variant="button" style={styles.sectionTitle}>함께하는 사람</AppText>
            <MemberList members={members} />
            <Pressable accessibilityRole="button" onPress={() => Alert.alert('사람 초대하기', '다음 단계에서 연결할 기능이에요.')} style={({ pressed }) => [styles.inviteButton, pressed && styles.pressed]}>
              <MaterialCommunityIcons name="account-plus-outline" color={brandColors.coral} size={20} />
              <AppText style={styles.inviteText}>사람 초대하기</AppText>
            </Pressable>
          </View>

          <View style={styles.section}>
            <AppText variant="button" style={styles.sectionTitle}>내 공유 범위</AppText>
            <Pressable accessibilityRole="button" onPress={() => Alert.alert('공유 범위 설정', '다음 단계에서 연결할 기능이에요.')} style={({ pressed }) => pressed && styles.pressed}>
              <Card style={styles.shareCard}>
                <View>
                  <AppText style={styles.shareSummary}>서버 연결 예정</AppText>
                  <AppText variant="caption" tone="secondary">다음 단계에서 연결할 기능이에요.</AppText>
                </View>
              </Card>
            </Pressable>
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
  inviteButton: { alignItems: 'center', backgroundColor: '#FFF0E9', borderColor: '#F5D8CC', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 46 },
  inviteText: { color: brandColors.coral, fontSize: 14, fontWeight: '700' },
  shareCard: { padding: spacing.md },
  shareSummary: { color: brandColors.coral, fontSize: 16, fontWeight: '700' },
  state: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  pressed: { opacity: 0.76 },
});
