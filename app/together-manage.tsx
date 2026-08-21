import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { MOCK_CURRENT_USER_ID } from '../src/features/together/fixtures';
import { getMockSharePolicy } from '../src/features/together/mockSharePolicyState';
import { getMemberships, getMockProfile, getSpaces } from '../src/features/together/mockTogetherState';
import {
  getSharePolicySummary,
  getTogetherSpaceTypeLabel,
} from '../src/features/together/sharePolicyPresentation';
import type { SharePolicy, TogetherMembership, TogetherSpace } from '../src/features/together/types';

const AVATAR_COLORS = ['#F8D6CA', '#DDE7EE', '#E3E9D9', '#F2E2D5'];

function Header() {
  const router = useRouter();
  const theme = useAppTheme();

  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
      </Pressable>
      <AppText variant="button" style={styles.headerTitle}>함께 관리</AppText>
      <Pressable
        accessibilityLabel="함께 추가"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => router.push('/together-add')}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="account-plus-outline" color={theme.text} size={23} />
      </Pressable>
    </View>
  );
}

function GroupCard({ memberships, policy, space }: { memberships: TogetherMembership[]; policy: SharePolicy; space: TogetherSpace }) {
  const router = useRouter();
  const theme = useAppTheme();
  const activeMemberships = memberships.filter((membership) => membership.status === 'active');

  return (
    <Pressable
      accessibilityLabel={`${space.name}, ${activeMemberships.length}명, ${getSharePolicySummary(policy)}`}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/together-group-detail', params: { spaceId: space.id } })}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card style={styles.groupCard}>
        <View style={styles.groupTopRow}>
          <View style={styles.groupText}>
            <AppText variant="button" style={styles.groupName}>{space.name}</AppText>
            <AppText variant="caption" tone="secondary">{getTogetherSpaceTypeLabel(space.type)}</AppText>
          </View>
          <View style={styles.memberCountRow}>
            <AppText variant="caption" tone="secondary">{activeMemberships.length}명</AppText>
            <MaterialCommunityIcons name="chevron-right" color={theme.textSecondary} size={20} />
          </View>
        </View>

        <View style={styles.groupBottomRow}>
          <View accessibilityElementsHidden style={styles.avatarStack}>
            {activeMemberships.slice(0, 4).map((membership, index) => (
              <View key={membership.id} style={[styles.avatar, { backgroundColor: AVATAR_COLORS[index], marginLeft: index === 0 ? 0 : -7, zIndex: activeMemberships.length - index }]}>
                <AppText variant="caption" style={styles.avatarText}>{getMockProfile(membership.userId).initials}</AppText>
              </View>
            ))}
          </View>
          <View style={styles.policyBadge}>
            <AppText variant="caption" style={styles.policyText}>{getSharePolicySummary(policy)}</AppText>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

export default function TogetherManageScreen() {
  const insets = useSafeAreaInsets();
  const [spaces, setSpaces] = useState(getSpaces);

  useFocusEffect(useCallback(() => {
    setSpaces(getSpaces());
  }, []));

  return (
    <Screen style={styles.screen}>
      <Header />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <AppText variant="heading" style={styles.introTitle}>함께하는 사람과{`\n`}공유할 정보를 그룹별로 설정할 수 있어요.</AppText>
          <AppText variant="caption" tone="secondary">상대마다 내 근무와 일정의 공개 범위를 다르게 설정할 수 있습니다.</AppText>
        </View>

        <View style={styles.groupList}>
          {spaces.flatMap((space) => {
            const policy = getMockSharePolicy(space.id, MOCK_CURRENT_USER_ID);
            return policy ? [<GroupCard memberships={getMemberships(space.id)} key={space.id} policy={policy} space={space} />] : [];
          })}
        </View>
      </ScrollView>
    </Screen>
  );
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
  memberCountRow: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  groupBottomRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  avatarStack: { alignItems: 'center', flexDirection: 'row', minHeight: 34 },
  avatar: { alignItems: 'center', borderColor: brandColors.white, borderRadius: 17, borderWidth: 2, height: 34, justifyContent: 'center', width: 34 },
  avatarText: { color: brandColors.deepNavy, fontSize: 11, fontWeight: '700', lineHeight: 15 },
  policyBadge: { backgroundColor: '#FFF0E9', borderRadius: radius.xxl, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  policyText: { color: brandColors.coral, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  pressed: { opacity: 0.76 },
});
