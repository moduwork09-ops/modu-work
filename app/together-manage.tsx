import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, Screen } from '../src/components';
import { radius, spacing, useAppTheme } from '../src/constants';
import { useAuth } from '../src/features/auth/AuthContext';
import { getTogetherSpaceTypeLabel } from '../src/features/together/sharePolicyPresentation';
import { getTogetherGroupManagementAction, type TogetherGroupManagementAction } from '../src/features/together/togetherGroupManagement';
import {
  deleteTogetherSpace,
  getTogetherMembers,
  getTogetherSpaces,
  leaveTogetherSpace,
  type TogetherMember,
} from '../src/features/together/togetherServerData';
import type { TogetherSpace } from '../src/features/together/types';

function Header() {
  const router = useRouter();
  const theme = useAppTheme();
  return <View style={styles.header}>
    <Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
      <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
    </Pressable>
    <AppText variant="button" style={styles.headerTitle}>함께 관리</AppText>
    <Pressable accessibilityLabel="함께 추가" accessibilityRole="button" hitSlop={8} onPress={() => router.push('/together-add')} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
      <MaterialCommunityIcons name="account-plus-outline" color={theme.text} size={23} />
    </Pressable>
  </View>;
}

function GroupCard({ disabled, space }: { disabled: boolean; space: TogetherSpace }) {
  const router = useRouter();
  const theme = useAppTheme();
  return <Pressable
    accessibilityLabel={`${space.name}, ${getTogetherSpaceTypeLabel(space.type)}`}
    accessibilityRole="button"
    disabled={disabled}
    onPress={() => router.push({ pathname: '/together-group-detail', params: { spaceId: space.id } })}
    style={({ pressed }) => pressed && styles.pressed}
  >
    <Card style={styles.groupCard}><View style={styles.groupTopRow}>
      <View style={styles.groupText}>
        <AppText variant="button" style={styles.groupName}>{space.name}</AppText>
        <AppText variant="caption" tone="secondary">{getTogetherSpaceTypeLabel(space.type)}</AppText>
      </View>
      <MaterialCommunityIcons name="chevron-right" color={theme.textSecondary} size={20} />
    </View></Card>
  </Pressable>;
}

function isCurrentManagementRequest(
  focused: MutableRefObject<boolean>,
  generation: MutableRefObject<number>,
  sessionUserId: MutableRefObject<string | undefined>,
  expectedGeneration: number,
  expectedUserId: string,
) {
  return focused.current && generation.current === expectedGeneration && sessionUserId.current === expectedUserId;
}

export default function TogetherManageScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const theme = useAppTheme();
  const [spaces, setSpaces] = useState<TogetherSpace[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | undefined>(undefined);
  const [members, setMembers] = useState<TogetherMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isManagementLoading, setIsManagementLoading] = useState(false);
  const [hasManagementError, setHasManagementError] = useState(false);
  const focusedRef = useRef(false);
  const generationRef = useRef(0);
  const sessionUserIdRef = useRef(session?.user.id);
  const selectedSpaceIdRef = useRef<string | undefined>(undefined);
  const spacesRef = useRef<TogetherSpace[]>([]);
  const confirmationOpenRef = useRef(false);
  const mutationRef = useRef<object | undefined>(undefined);
  const selectionRequestRef = useRef(0);
  sessionUserIdRef.current = session?.user.id;
  spacesRef.current = spaces;
  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId);
  const managementAction = getTogetherGroupManagementAction(members, session?.user.id);

  useFocusEffect(useCallback(() => {
    const expectedUserId = session?.user.id;
    const generation = ++generationRef.current;
    focusedRef.current = true;
    confirmationOpenRef.current = false;
    setIsLoading(true);
    setHasError(false);
    setMembers([]);
    setSelectedSpaceId(undefined);
    selectedSpaceIdRef.current = undefined;
    setIsManagementLoading(false);
    setHasManagementError(false);
    if (!expectedUserId) {
      setSpaces([]);
      setIsLoading(false);
      return () => { focusedRef.current = false; generationRef.current += 1; };
    }

    void getTogetherSpaces()
      .then((nextSpaces) => {
        if (!isCurrentManagementRequest(focusedRef, generationRef, sessionUserIdRef, generation, expectedUserId)) return;
        spacesRef.current = nextSpaces;
        setSpaces(nextSpaces);
      })
      .catch(() => {
        if (isCurrentManagementRequest(focusedRef, generationRef, sessionUserIdRef, generation, expectedUserId)) setHasError(true);
      })
      .finally(() => {
        if (isCurrentManagementRequest(focusedRef, generationRef, sessionUserIdRef, generation, expectedUserId)) setIsLoading(false);
      });

    return () => {
      focusedRef.current = false;
      confirmationOpenRef.current = false;
      selectionRequestRef.current += 1;
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [session?.user.id]));

  const selectManagementSpace = async (target: TogetherSpace) => {
    if (mutationRef.current || confirmationOpenRef.current) return;
    const expectedUserId = sessionUserIdRef.current;
    if (!expectedUserId || !spacesRef.current.some((space) => space.id === target.id)) return;
    const generation = generationRef.current;
    const requestId = ++selectionRequestRef.current;
    selectedSpaceIdRef.current = target.id;
    setSelectedSpaceId(target.id);
    setMembers([]);
    setHasManagementError(false);
    setIsManagementLoading(true);
    try {
      const nextMembers = await getTogetherMembers(target.id);
      if (!isCurrentManagementRequest(focusedRef, generationRef, sessionUserIdRef, generation, expectedUserId)
        || selectionRequestRef.current !== requestId || selectedSpaceIdRef.current !== target.id) return;
      setMembers(nextMembers);
    } catch {
      if (isCurrentManagementRequest(focusedRef, generationRef, sessionUserIdRef, generation, expectedUserId)
        && selectionRequestRef.current === requestId && selectedSpaceIdRef.current === target.id) setHasManagementError(true);
    } finally {
      if (isCurrentManagementRequest(focusedRef, generationRef, sessionUserIdRef, generation, expectedUserId)
        && selectionRequestRef.current === requestId && selectedSpaceIdRef.current === target.id) setIsManagementLoading(false);
    }
  };

  const clearManagementSelection = () => {
    if (mutationRef.current || confirmationOpenRef.current) return;
    selectionRequestRef.current += 1;
    selectedSpaceIdRef.current = undefined;
    setSelectedSpaceId(undefined);
    setMembers([]);
    setHasManagementError(false);
    setIsManagementLoading(false);
  };

  const performGroupAction = async (action: TogetherGroupManagementAction, target: TogetherSpace) => {
    if (mutationRef.current) return;
    const expectedUserId = sessionUserIdRef.current;
    if (!expectedUserId || selectedSpaceIdRef.current !== target.id) return;
    const generation = generationRef.current;
    const mutation = {};
    mutationRef.current = mutation;
    setIsMutating(true);
    let succeeded = false;
    try {
      if (action === 'delete') await deleteTogetherSpace(target.id);
      else await leaveTogetherSpace(target.id);
      succeeded = true;
      if (!isCurrentManagementRequest(focusedRef, generationRef, sessionUserIdRef, generation, expectedUserId) || selectedSpaceIdRef.current !== target.id) return;

      setMembers([]);
      selectionRequestRef.current += 1;
      const knownRemaining = spacesRef.current.filter((space) => space.id !== target.id);
      spacesRef.current = knownRemaining;
      setSpaces(knownRemaining);
      selectedSpaceIdRef.current = undefined;
      setSelectedSpaceId(undefined);

      let refreshedSpaces = knownRemaining;
      try {
        refreshedSpaces = (await getTogetherSpaces()).filter((space) => space.id !== target.id);
      } catch {
        // The mutation succeeded; retain the safe local result until focus reloads the list.
      }
      if (!isCurrentManagementRequest(focusedRef, generationRef, sessionUserIdRef, generation, expectedUserId)) return;
      spacesRef.current = refreshedSpaces;
      setSpaces(refreshedSpaces);
    } catch {
      if (!succeeded && isCurrentManagementRequest(focusedRef, generationRef, sessionUserIdRef, generation, expectedUserId) && selectedSpaceIdRef.current === target.id) {
        Alert.alert(action === 'delete' ? '그룹을 삭제하지 못했어요.' : '그룹에서 나가지 못했어요.', '잠시 후 다시 시도해 주세요.');
      }
    } finally {
      if (mutationRef.current === mutation) {
        mutationRef.current = undefined;
        if (focusedRef.current && sessionUserIdRef.current === expectedUserId) setIsMutating(false);
      }
    }
  };

  const confirmGroupAction = () => {
    if (!selectedSpace || !managementAction || confirmationOpenRef.current || mutationRef.current) return;
    const target = selectedSpace;
    const action = managementAction;
    confirmationOpenRef.current = true;
    const closeConfirmation = () => { confirmationOpenRef.current = false; };
    Alert.alert(
      action === 'delete' ? `${target.name} 그룹을 삭제할까요?` : `${target.name} 그룹에서 나갈까요?`,
      action === 'delete' ? '삭제하면 이 그룹의 공유 정보에 더 이상 접근할 수 없으며 되돌릴 수 없어요.' : '나가면 이 그룹의 공유 정보에 더 이상 접근할 수 없어요.',
      [
        { text: '취소', style: 'cancel', onPress: closeConfirmation },
        { text: action === 'delete' ? '그룹 삭제' : '그룹 나가기', style: 'destructive', onPress: () => { closeConfirmation(); void performGroupAction(action, target); } },
      ],
      { cancelable: true, onDismiss: closeConfirmation },
    );
  };

  return <Screen style={styles.screen}>
    <Header />
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator={false}>
      <View style={styles.intro}>
        <AppText variant="heading" style={styles.introTitle}>함께하는 사람과{`\n`}공유할 정보를 그룹별로 설정할 수 있어요.</AppText>
        <AppText variant="caption" tone="secondary">상대마다 내 근무와 일정의 공개 범위를 다르게 설정할 수 있습니다.</AppText>
      </View>
      <View style={styles.groupList}>
        {isLoading ? <AppText tone="secondary" style={styles.stateText}>그룹을 불러오는 중...</AppText> : null}
        {!isLoading && hasError ? <AppText tone="secondary" style={styles.stateText}>그룹 목록을 불러올 수 없어요.</AppText> : null}
        {!isLoading && !hasError && spaces.length === 0 ? <AppText tone="secondary" style={styles.stateText}>아직 만든 그룹이 없어요.</AppText> : null}
        {!isLoading && !hasError ? spaces.map((space) => <GroupCard disabled={isMutating} key={space.id} space={space} />) : null}
      </View>
      {!isLoading && !hasError && spaces.length > 0 ? <View style={styles.dangerSection}>
        <AppText variant="button" style={styles.sectionTitle}>그룹 관리</AppText>
        {!selectedSpace ? <Card style={styles.managementCard}><AppText style={styles.managementPrompt}>삭제하거나 나갈 그룹을 선택하세요.</AppText><View style={styles.managementList}>{spaces.map((space) => <Pressable key={space.id} accessibilityRole="button" accessibilityLabel={`${space.name} 관리`} disabled={isMutating} onPress={() => void selectManagementSpace(space)} style={({ pressed }) => [styles.managementRow, { borderColor: theme.border }, pressed && styles.pressed]}><View style={styles.groupText}><AppText style={styles.dangerName}>{space.name}</AppText><AppText variant="caption" tone="secondary">{getTogetherSpaceTypeLabel(space.type)}</AppText></View><MaterialCommunityIcons name="chevron-right" color={theme.textSecondary} size={20} /></Pressable>)}</View></Card>
          : <Card style={styles.dangerCard}>
            <Pressable accessibilityRole="button" disabled={isMutating} onPress={clearManagementSelection} style={styles.changeSelection}><MaterialCommunityIcons name="chevron-left" color={theme.textSecondary} size={18} /><AppText variant="caption" tone="secondary">다른 그룹 선택</AppText></Pressable>
            <View style={styles.dangerCopy}><AppText style={styles.dangerName}>{selectedSpace.name}</AppText><AppText variant="caption" tone="secondary">{getTogetherSpaceTypeLabel(selectedSpace.type)}</AppText></View>
            {isManagementLoading ? <AppText variant="caption" tone="secondary">권한을 확인하는 중...</AppText> : null}
            {hasManagementError ? <AppText variant="caption" style={{ color: theme.accent }}>그룹 권한을 확인하지 못했어요. 다른 그룹을 선택한 뒤 다시 시도해 주세요.</AppText> : null}
            {!isManagementLoading && !hasManagementError && managementAction ? <><AppText variant="caption" tone="secondary">{managementAction === 'delete' ? '그룹과 그룹의 공유 정보를 삭제해요.' : '이 그룹에서 나가고 공유를 중단해요.'}</AppText><Pressable accessibilityRole="button" disabled={isMutating} onPress={confirmGroupAction} style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed, isMutating && styles.disabled]}><MaterialCommunityIcons name={managementAction === 'delete' ? 'delete-outline' : 'logout'} color={theme.accent} size={20} /><AppText style={[styles.dangerButtonText, { color: theme.accent }]}>{isMutating ? '처리 중...' : managementAction === 'delete' ? '그룹 삭제' : '그룹 나가기'}</AppText></Pressable></> : null}
          </Card>}
      </View> : null}
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingTop: spacing.xs },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 },
  headerButton: { alignItems: 'center', borderRadius: radius.xxl, height: 36, justifyContent: 'center', width: 36 },
  headerTitle: { fontSize: 18, lineHeight: 24 },
  content: { gap: spacing.lg, paddingTop: spacing.md },
  intro: { gap: spacing.xs, paddingHorizontal: spacing.xxs },
  introTitle: { fontSize: 21, lineHeight: 29 },
  groupList: { gap: spacing.sm },
  groupCard: { borderCurve: 'continuous', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  groupTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  groupText: { gap: 1 },
  groupName: { fontSize: 17, lineHeight: 23 },
  stateText: { paddingVertical: spacing.xl, textAlign: 'center' },
  dangerSection: { gap: spacing.xs },
  sectionTitle: { fontSize: 15 },
  managementCard: { gap: spacing.md, padding: spacing.md },
  managementPrompt: { fontWeight: '700' },
  managementList: { gap: spacing.xs },
  managementRow: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  dangerCard: { gap: spacing.md, padding: spacing.md },
  changeSelection: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', minHeight: 36 },
  dangerCopy: { gap: 2 },
  dangerName: { fontSize: 15, fontWeight: '700' },
  dangerButton: { alignItems: 'center', backgroundColor: '#FFF0E9', borderColor: '#F5D8CC', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 46 },
  dangerButtonText: { fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.76 },
});
