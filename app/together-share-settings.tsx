import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, PrimaryButton, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { getSharePolicyStatus, getTogetherSpaceTypeLabel } from '../src/features/together/sharePolicyPresentation';
import {
  getMyTogetherSharePolicy,
  getTogetherMembers,
  getTogetherSpace,
  isTogetherSpaceId,
  type TogetherSharePolicy,
  type TogetherSharePolicySettings,
  updateMyTogetherSharePolicy,
} from '../src/features/together/togetherServerData';
import type { TogetherSpace } from '../src/features/together/types';

type ShareBooleanField = keyof TogetherSharePolicySettings;

type ShareOption = {
  description: string;
  field: ShareBooleanField;
  label: string;
};

const SHARE_OPTIONS: ShareOption[] = [
  { field: 'shareShiftDetails', label: '근무표 공유', description: '그룹 멤버가 내 월간 근무표를 볼 수 있어요.' },
  { field: 'sharePersonalEvents', label: '개인 일정', description: '개인 일정의 제목과 시간을 보여줘요.' },
  { field: 'shareDaysOff', label: '휴무', description: '근무 내용은 숨기고 휴무 날짜만 공유할 수 있어요.' },
  { field: 'shareAvailability', label: '함께 가능한 시간', description: '근무와 개인 일정 내용을 보여주지 않아도 서로 가능한 시간만 공유할 수 있어요.' },
  { field: 'shareSharedEvents', label: '공동 일정', description: '이 그룹에서 함께 만든 일정을 공유해요.' },
];

const EMPTY_SETTINGS: TogetherSharePolicySettings = {
  shareAvailability: false,
  shareDaysOff: false,
  sharePersonalEvents: false,
  shareSharedEvents: false,
  shareShiftDetails: false,
};

function getSettings(policy: TogetherSharePolicy): TogetherSharePolicySettings {
  return {
    shareAvailability: policy.shareAvailability,
    shareDaysOff: policy.shareDaysOff,
    sharePersonalEvents: policy.sharePersonalEvents,
    shareSharedEvents: policy.shareSharedEvents,
    shareShiftDetails: policy.shareShiftDetails,
  };
}

function settingsEqual(left: TogetherSharePolicySettings, right: TogetherSharePolicySettings) {
  return SHARE_OPTIONS.every(({ field }) => left[field] === right[field]);
}

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

function ShareOptionRow({ disabled, onChange, option, value }: { disabled: boolean; onChange: (value: boolean) => void; option: ShareOption; value: boolean }) {
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
        disabled={disabled}
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
  const rawSpaceId = params.spaceId;
  const spaceId = typeof rawSpaceId === 'string' && isTogetherSpaceId(rawSpaceId) ? rawSpaceId : undefined;
  const [space, setSpace] = useState<TogetherSpace>();
  const [memberCount, setMemberCount] = useState(0);
  const [baseline, setBaseline] = useState<TogetherSharePolicySettings>();
  const [draft, setDraft] = useState<TogetherSharePolicySettings>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);
  const loadRef = useRef<{ promise: Promise<[TogetherSpace, number, TogetherSharePolicy]>; spaceId: string } | undefined>(undefined);
  const loadedSpaceIdRef = useRef<string | undefined>(undefined);
  const isSavingRef = useRef(false);
  const isMountedRef = useRef(true);

  useFocusEffect(useCallback(() => {
    isMountedRef.current = true;
    let isCurrent = true;

    if (!spaceId) {
      setIsLoading(false);
      setHasError(true);
      return () => {
        isCurrent = false;
        isMountedRef.current = false;
      };
    }

    if (loadedSpaceIdRef.current !== spaceId) {
      setIsLoading(true);
      setHasError(false);
      const currentLoad = loadRef.current?.spaceId === spaceId
        ? loadRef.current.promise
        : Promise.all([
          getTogetherSpace(spaceId),
          getTogetherMembers(spaceId).then((members) => members.filter((member) => member.status === 'active').length),
          getMyTogetherSharePolicy(spaceId),
        ]);
      loadRef.current = { promise: currentLoad, spaceId };

      void currentLoad
        .then(([nextSpace, nextMemberCount, nextPolicy]) => {
          if (!isCurrent) return;
          const nextSettings = getSettings(nextPolicy);
          setSpace(nextSpace);
          setMemberCount(nextMemberCount);
          setBaseline(nextSettings);
          setDraft(nextSettings);
          setHasError(false);
          loadedSpaceIdRef.current = spaceId;
        })
        .catch(() => {
          if (!isCurrent) return;
          setHasError(true);
          loadRef.current = undefined;
        })
        .finally(() => {
          if (!isCurrent) return;
          setIsLoading(false);
        });
    }

    return () => {
      isCurrent = false;
      isMountedRef.current = false;
    };
  }, [spaceId]));

  const hasChanges = Boolean(draft && baseline && !settingsEqual(draft, baseline));

  function updateField(field: ShareBooleanField, value: boolean) {
    setDraft((current) => current ? { ...current, [field]: value } : current);
  }

  function resetToDefault() {
    setDraft({ ...EMPTY_SETTINGS });
  }

  async function save() {
    if (!spaceId || !draft || !hasChanges || isSavingRef.current) return;
    const settingsToSave = { ...draft };

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await updateMyTogetherSharePolicy(spaceId, settingsToSave);
      const savedPolicy = await getMyTogetherSharePolicy(spaceId);
      if (!isMountedRef.current) return;
      const savedSettings = getSettings(savedPolicy);
      setBaseline(savedSettings);
      setDraft(savedSettings);
      setIsSaving(false);
      router.back();
    } catch {
      if (!isMountedRef.current) return;
      setIsSaving(false);
      Alert.alert('공유 범위를 저장할 수 없어요.', '잠시 후 다시 시도해 주세요.');
    } finally {
      isSavingRef.current = false;
    }
  }

  if (isLoading) {
    return <Screen style={styles.screen}><Header /><View style={styles.missingState}><AppText tone="secondary">공유 설정을 불러오는 중...</AppText></View></Screen>;
  }

  if (hasError || !space || !draft) {
    return (
      <Screen style={styles.screen}>
        <Header />
        <View style={styles.missingState}>
          <AppText style={styles.missingTitle}>공유 설정을 확인할 수 없어요.</AppText>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backAction}>
            <AppText style={styles.backActionText}>그룹 정보로 돌아가기</AppText>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const status = getSharePolicyStatus(draft);
  const controlsDisabled = isLoading || isSaving;

  return (
    <Screen style={styles.screen}>
      <Header />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.groupInfo}>
          <AppText variant="heading" style={styles.groupName}>{space.name}</AppText>
          <AppText variant="caption" tone="secondary">{getTogetherSpaceTypeLabel(space.type)} · {memberCount}명</AppText>
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
                disabled={controlsDisabled}
                onChange={(value) => updateField(option.field, value)}
                option={option}
                value={draft[option.field]}
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

        <Pressable accessibilityRole="button" disabled={controlsDisabled} onPress={resetToDefault} style={({ pressed }) => [styles.resetButton, controlsDisabled && styles.disabled, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="restore" color={brandColors.deepNavy} size={19} />
          <AppText style={styles.resetText}>기본 설정으로 되돌리기</AppText>
        </Pressable>

        <PrimaryButton disabled={controlsDisabled || !hasChanges} label={isSaving ? '저장하는 중...' : '저장'} onPress={() => void save()} style={[styles.saveButton, (controlsDisabled || !hasChanges) && styles.disabled]} />
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
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.76 },
});
