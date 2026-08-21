import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, PrimaryButton, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { MOCK_CURRENT_USER_ID } from '../src/features/together/fixtures';
import { getMockSharePolicy, updateMockSharePolicy } from '../src/features/together/mockSharePolicyState';
import { getMemberships, getSpaceById } from '../src/features/together/mockTogetherState';
import { createDefaultSharePolicy } from '../src/features/together/sharePolicy';
import { getSharePolicyStatus, getTogetherSpaceTypeLabel } from '../src/features/together/sharePolicyPresentation';
import type { SharePolicy } from '../src/features/together/types';

type ShareBooleanField = keyof Pick<
  SharePolicy,
  'shareShiftDetails' | 'sharePersonalEvents' | 'shareDaysOff' | 'shareAvailability' | 'shareSharedEvents'
>;

type ShareOption = {
  description: string;
  field: ShareBooleanField;
  label: string;
};

const SHARE_OPTIONS: ShareOption[] = [
  { field: 'shareShiftDetails', label: '근무 상세', description: '주간 · 야간 · 비번 등 실제 근무를 보여줘요.' },
  { field: 'sharePersonalEvents', label: '개인 일정', description: '개인 일정의 제목과 시간을 보여줘요.' },
  { field: 'shareDaysOff', label: '휴무', description: '근무 내용은 숨기고 휴무 날짜만 공유할 수 있어요.' },
  { field: 'shareAvailability', label: '함께 가능한 시간', description: '근무와 개인 일정 내용을 보여주지 않아도 서로 가능한 시간만 공유할 수 있어요.' },
  { field: 'shareSharedEvents', label: '공동 일정', description: '이 그룹에서 함께 만든 일정을 공유해요.' },
];

function Header() {
  const router = useRouter();
  const theme = useAppTheme();

  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
      </Pressable>
      <AppText variant="button" style={styles.headerTitle}>공유 범위 설정</AppText>
      <View style={styles.headerButton} />
    </View>
  );
}

function ShareOptionRow({ onChange, option, value }: { onChange: (value: boolean) => void; option: ShareOption; value: boolean }) {
  const theme = useAppTheme();

  return (
    <View style={styles.optionRow}>
      <View style={styles.optionText}>
        <AppText style={styles.optionLabel}>{option.label}</AppText>
        <AppText variant="caption" tone="secondary" style={styles.optionDescription}>{option.description}</AppText>
      </View>
      <Switch
        accessibilityLabel={`${option.label} 공유`}
        accessibilityRole="switch"
        onValueChange={onChange}
        thumbColor={brandColors.white}
        trackColor={{ false: '#D7D9DC', true: brandColors.coral }}
        value={value}
      />
      <View pointerEvents="none" style={[styles.optionDivider, { backgroundColor: theme.border }]} />
    </View>
  );
}

export default function TogetherShareSettingsScreen() {
  const params = useLocalSearchParams<{ spaceId?: string | string[] }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const spaceId = Array.isArray(params.spaceId) ? params.spaceId[0] : params.spaceId;
  const space = spaceId ? getSpaceById(spaceId) : undefined;
  const memberships = spaceId ? getMemberships(spaceId) : [];
  const initialPolicy = useMemo(
    () => spaceId ? getMockSharePolicy(spaceId, MOCK_CURRENT_USER_ID) : undefined,
    [spaceId],
  );
  const [draft, setDraft] = useState<SharePolicy | undefined>(initialPolicy);

  if (!space || !draft) {
    return (
      <Screen style={styles.screen}>
        <Header />
        <View style={styles.missingState}>
          <AppText style={styles.missingTitle}>그룹 정보를 찾을 수 없어요.</AppText>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backAction}>
            <AppText style={styles.backActionText}>함께 관리로 돌아가기</AppText>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const currentSpace = space;
  const currentDraft = draft;
  const status = getSharePolicyStatus(currentDraft);
  const activeMemberCount = memberships.filter((membership) => membership.status === 'active').length;

  function updateField(field: ShareBooleanField, value: boolean) {
    setDraft((current) => current ? { ...current, [field]: value } : current);
  }

  function resetToDefault() {
    setDraft((current) => current ? createDefaultSharePolicy(currentSpace.type, {
      id: current.id,
      ownerUserId: current.ownerUserId,
      spaceId: current.spaceId,
      updatedAt: current.updatedAt,
    }) : current);
  }

  function save() {
    updateMockSharePolicy({ ...currentDraft, updatedAt: new Date().toISOString() });
    router.back();
  }

  return (
    <Screen style={styles.screen}>
      <Header />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.groupInfo}>
          <AppText variant="heading" style={styles.groupName}>{currentSpace.name}</AppText>
          <AppText variant="caption" tone="secondary">{getTogetherSpaceTypeLabel(currentSpace.type)} · {activeMemberCount}명</AppText>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <MaterialCommunityIcons name={status.icon} color={brandColors.coral} size={23} />
          </View>
          <View style={styles.summaryText}>
            <AppText variant="button" style={styles.summaryTitle}>{status.title}</AppText>
            <AppText variant="caption" tone="secondary" style={styles.summaryDescription}>{status.description}</AppText>
          </View>
        </View>

        <View style={styles.settingsSection}>
          <AppText variant="button" style={styles.sectionTitle}>내가 이 그룹에 공유할 정보</AppText>
          <View style={styles.optionList}>
            {SHARE_OPTIONS.map((option) => (
              <ShareOptionRow
                key={option.field}
                onChange={(value) => updateField(option.field, value)}
                option={option}
                value={currentDraft[option.field]}
              />
            ))}
          </View>
        </View>

        <View style={styles.privacyBlock}>
          <MaterialCommunityIcons name="shield-lock-outline" color={brandColors.deepNavy} size={22} />
          <View style={styles.privacyText}>
            <AppText style={styles.privacyTitle}>공유하지 않은 정보는 상대에게 표시되지 않아요.</AppText>
            <AppText variant="caption" tone="secondary" style={styles.privacyDescription}>‘함께 가능한 시간’만 켠 경우에도 근무 종류나 개인 일정 내용은 상대에게 공개되지 않습니다.</AppText>
          </View>
        </View>

        <Pressable accessibilityRole="button" onPress={resetToDefault} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="restore" color={brandColors.deepNavy} size={19} />
          <AppText style={styles.resetText}>기본 설정으로 되돌리기</AppText>
        </Pressable>

        <PrimaryButton label="저장" onPress={save} style={styles.saveButton} />
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
  groupInfo: { gap: 1, paddingHorizontal: spacing.xxs },
  groupName: { fontSize: 22, lineHeight: 29 },
  summaryCard: { alignItems: 'flex-start', backgroundColor: '#FFF0E9', borderColor: '#F5D8CC', borderCurve: 'continuous', borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  summaryIcon: { alignItems: 'center', backgroundColor: brandColors.white, borderRadius: radius.xxl, height: 38, justifyContent: 'center', width: 38 },
  summaryText: { flex: 1, gap: spacing.xxs },
  summaryTitle: { color: brandColors.deepNavy, fontSize: 16, lineHeight: 22 },
  summaryDescription: { color: '#5F6871', fontSize: 13, lineHeight: 19 },
  settingsSection: { gap: spacing.xs },
  sectionTitle: { fontSize: 15, lineHeight: 21 },
  optionList: { backgroundColor: brandColors.white, borderColor: '#E5E1D9', borderCurve: 'continuous', borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', paddingHorizontal: spacing.md },
  optionRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 76, paddingVertical: spacing.sm, position: 'relative' },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { fontSize: 15, fontWeight: '700', lineHeight: 21 },
  optionDescription: { fontSize: 12, lineHeight: 18 },
  optionDivider: { bottom: 0, height: StyleSheet.hairlineWidth, left: 0, position: 'absolute', right: 0 },
  privacyBlock: { alignItems: 'flex-start', backgroundColor: '#EEF1F3', borderCurve: 'continuous', borderRadius: radius.md, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  privacyText: { flex: 1, gap: spacing.xxs },
  privacyTitle: { color: brandColors.deepNavy, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  privacyDescription: { fontSize: 12, lineHeight: 18 },
  resetButton: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', gap: spacing.xs, minHeight: 40, paddingHorizontal: spacing.sm },
  resetText: { color: brandColors.deepNavy, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  saveButton: { minHeight: 48 },
  missingState: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center' },
  missingTitle: { fontSize: 16, fontWeight: '700' },
  backAction: { padding: spacing.sm },
  backActionText: { color: brandColors.coral, fontWeight: '700' },
  pressed: { opacity: 0.76 },
});
