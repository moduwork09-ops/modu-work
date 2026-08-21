import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { MOCK_CURRENT_USER_ID } from '../src/features/together/fixtures';
import { getMockSharePolicy } from '../src/features/together/mockSharePolicyState';
import { getMemberships, getMockProfile, getSpaceById } from '../src/features/together/mockTogetherState';
import { getSharePolicySummary, getTogetherSpaceTypeLabel } from '../src/features/together/sharePolicyPresentation';

export default function TogetherGroupDetailScreen() {
  const params = useLocalSearchParams<{ spaceId?: string | string[] }>();
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const spaceId = Array.isArray(params.spaceId) ? params.spaceId[0] : params.spaceId;
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => { setRevision((value) => value + 1); }, []));
  const space = spaceId ? getSpaceById(spaceId) : undefined;
  const memberships = spaceId ? getMemberships(spaceId).filter((item) => item.status === 'active') : [];
  const policy = spaceId ? getMockSharePolicy(spaceId, MOCK_CURRENT_USER_ID) : undefined;
  void revision;

  if (!space || !policy) return <Screen style={styles.screen}><View style={styles.header}><Pressable accessibilityLabel="뒤로" accessibilityRole="button" onPress={() => router.back()} style={styles.headerButton}><MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} /></Pressable><AppText variant="button">그룹 정보</AppText><View style={styles.headerButton} /></View><View style={styles.missing}><AppText>그룹 정보를 찾을 수 없어요.</AppText></View></Screen>;

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}><Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}><MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} /></Pressable><AppText variant="button" style={styles.headerTitle}>그룹 정보</AppText><Pressable accessibilityLabel="그룹 메뉴" accessibilityRole="button" hitSlop={8} onPress={() => Alert.alert('그룹 설정', '그룹 이름과 유형 수정은 다음 단계에서 연결할 예정입니다.')} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}><MaterialCommunityIcons name="dots-horizontal" color={theme.text} size={23} /></Pressable></View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator={false}>
        <View style={styles.groupInfo}><AppText variant="heading" style={styles.groupName}>{space.name}</AppText><AppText variant="caption" tone="secondary">{getTogetherSpaceTypeLabel(space.type)} · {memberships.length}명</AppText></View>
        <View style={styles.section}><AppText variant="button" style={styles.sectionTitle}>함께하는 사람</AppText><Card style={styles.memberCard}>{memberships.map((membership, index) => { const profile = getMockProfile(membership.userId); return <View key={membership.id} style={[styles.memberRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}><View style={styles.avatar}><AppText style={styles.avatarText}>{profile.initials}</AppText></View><AppText style={styles.memberName}>{profile.displayName}</AppText>{membership.role === 'owner' && <View style={styles.ownerBadge}><AppText variant="caption" style={styles.ownerText}>관리자</AppText></View>}</View>; })}</Card><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/together-invite', params: { spaceId: space.id } })} style={({ pressed }) => [styles.inviteButton, { borderColor: theme.border }, pressed && styles.pressed]}><MaterialCommunityIcons name="account-plus-outline" color={brandColors.coral} size={20} /><AppText style={styles.inviteText}>사람 초대하기</AppText></Pressable></View>
        <View style={styles.section}><AppText variant="button" style={styles.sectionTitle}>내 공유 범위</AppText><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/together-share-settings', params: { spaceId: space.id } })} style={({ pressed }) => pressed && styles.pressed}><Card style={styles.shareCard}><View><AppText style={styles.shareSummary}>{getSharePolicySummary(policy)}</AppText><AppText variant="caption" tone="secondary">공유할 정보를 항목별로 설정할 수 있어요.</AppText></View><View style={styles.shareLink}><AppText variant="caption" style={styles.shareLinkText}>공유 범위 설정</AppText><MaterialCommunityIcons name="chevron-right" color={brandColors.coral} size={20} /></View></Card></Pressable></View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingTop: spacing.xs }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 }, headerButton: { alignItems: 'center', borderRadius: radius.xxl, height: 36, justifyContent: 'center', width: 36 }, headerTitle: { fontSize: 18 }, content: { gap: spacing.lg, paddingTop: spacing.md }, groupInfo: { gap: 1 }, groupName: { fontSize: 24, lineHeight: 31 }, section: { gap: spacing.xs }, sectionTitle: { fontSize: 15 }, memberCard: { paddingHorizontal: spacing.md, paddingVertical: 0 }, memberRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 66, paddingVertical: spacing.xs }, avatar: { alignItems: 'center', backgroundColor: '#F8D6CA', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 }, avatarText: { color: brandColors.deepNavy, fontWeight: '700' }, memberName: { flex: 1, fontSize: 15, fontWeight: '700' }, ownerBadge: { backgroundColor: '#EEF1F3', borderRadius: radius.xxl, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs }, ownerText: { color: brandColors.deepNavy, fontSize: 12, fontWeight: '700' }, inviteButton: { alignItems: 'center', backgroundColor: '#FFF0E9', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 46 }, inviteText: { color: brandColors.coral, fontSize: 14, fontWeight: '700' }, shareCard: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md }, shareSummary: { color: brandColors.coral, fontSize: 16, fontWeight: '700' }, shareLink: { alignItems: 'center', flexDirection: 'row' }, shareLinkText: { color: brandColors.coral, fontWeight: '700' }, missing: { alignItems: 'center', flex: 1, justifyContent: 'center' }, pressed: { opacity: 0.76 },
});
