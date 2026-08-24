import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, PrimaryButton, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { MOCK_CURRENT_USER_ID } from '../src/features/together/fixtures';
import { createDefaultSharePolicy } from '../src/features/together/sharePolicy';
import { getSharePolicySummary } from '../src/features/together/sharePolicyPresentation';
import { createTogetherSpace } from '../src/features/together/togetherServerData';
import type { TogetherSpaceType } from '../src/features/together/types';

const TYPES: Array<{ description: string; label: string; type: TogetherSpaceType }> = [
  { type: 'family', label: '가족', description: '가족끼리 근무와 일정을 함께 볼 때' },
  { type: 'couple', label: '배우자/연인', description: '서로의 일정과 틈을 함께 맞출 때' },
  { type: 'coworker', label: '직장 동료', description: '휴무와 가능한 시간 중심으로 공유' },
  { type: 'friend', label: '친구', description: '함께 가능한 시간 중심' },
  { type: 'custom', label: '직접 설정', description: '공유 항목을 처음부터 직접 선택' },
];

export default function TogetherGroupCreateScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [selectedType, setSelectedType] = useState<TogetherSpaceType>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const previewPolicy = useMemo(() => selectedType ? createDefaultSharePolicy(selectedType, { id: 'preview', spaceId: 'preview', ownerUserId: MOCK_CURRENT_USER_ID, updatedAt: '' }) : undefined, [selectedType]);

  async function submit() {
    if (isSubmittingRef.current) return;
    if (!name.trim()) { Alert.alert('그룹 이름을 입력해 주세요.'); return; }
    if (!selectedType) { Alert.alert('그룹 유형을 선택해 주세요.'); return; }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await createTogetherSpace(name, selectedType);
    } catch {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      Alert.alert('그룹을 만들 수 없어요.', '잠시 후 다시 시도해 주세요.');
      return;
    }

    router.replace('/together-manage');
  }

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoiding}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}><MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} /></Pressable>
          <AppText variant="button" style={styles.headerTitle}>새 함께 그룹</AppText><View style={styles.headerButton} />
        </View>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} contentInsetAdjustmentBehavior="never" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.field}><AppText style={styles.label}>그룹 이름</AppText><TextInput accessibilityLabel="그룹 이름" maxLength={30} onChangeText={setName} placeholder="예) 우리 가족, A팀, 운동 모임" placeholderTextColor={theme.textSecondary} returnKeyType="done" style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={name} /></View>
          <View style={styles.field}><AppText style={styles.label}>그룹 유형</AppText><View style={styles.typeList}>{TYPES.map((item) => { const selected = selectedType === item.type; return <Pressable key={item.type} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setSelectedType(item.type)} style={({ pressed }) => [styles.typeRow, { backgroundColor: selected ? '#FFF0E9' : theme.surface, borderColor: selected ? brandColors.coral : theme.border }, pressed && styles.pressed]}><View style={styles.typeText}><AppText style={styles.typeLabel}>{item.label}</AppText><AppText variant="caption" tone="secondary" style={styles.typeDescription}>{item.description}</AppText></View><MaterialCommunityIcons name={selected ? 'check-circle' : 'circle-outline'} color={selected ? brandColors.coral : theme.textSecondary} size={22} /></Pressable>; })}</View></View>
          {previewPolicy && <View style={styles.presetInfo}><AppText style={styles.presetLabel}>기본 공유 설정</AppText><AppText variant="button" style={styles.presetSummary}>{getSharePolicySummary(previewPolicy)}</AppText><AppText variant="caption" tone="secondary">선택한 유형의 추천값이며, 그룹을 만든 뒤 항목별로 바꿀 수 있어요.</AppText></View>}
          <PrimaryButton disabled={isSubmitting} label={isSubmitting ? '그룹 만드는 중...' : '그룹 만들기'} onPress={() => void submit()} style={[styles.createButton, isSubmitting && styles.disabled]} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingTop: spacing.xs }, keyboardAvoiding: { flex: 1 }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 }, headerButton: { alignItems: 'center', borderRadius: radius.xxl, height: 36, justifyContent: 'center', width: 36 }, headerTitle: { fontSize: 18, lineHeight: 24 }, content: { gap: spacing.lg, paddingTop: spacing.md }, field: { gap: spacing.xs }, label: { fontSize: 14, fontWeight: '700', lineHeight: 20 }, input: { borderRadius: radius.md, borderWidth: 1, fontSize: 15, minHeight: 48, paddingHorizontal: spacing.md }, typeList: { gap: spacing.xs }, typeRow: { alignItems: 'center', borderCurve: 'continuous', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 66, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }, typeText: { flex: 1, gap: 1 }, typeLabel: { fontSize: 15, fontWeight: '700', lineHeight: 21 }, typeDescription: { fontSize: 12, lineHeight: 17 }, presetInfo: { backgroundColor: '#FFF0E9', borderColor: '#F5D8CC', borderRadius: radius.md, borderWidth: 1, gap: spacing.xxs, padding: spacing.md }, presetLabel: { color: brandColors.deepNavy, fontSize: 13, fontWeight: '700', lineHeight: 18 }, presetSummary: { color: brandColors.coral, fontSize: 16, lineHeight: 22 }, createButton: { backgroundColor: brandColors.coral }, disabled: { opacity: 0.55 }, pressed: { opacity: 0.76 },
});
