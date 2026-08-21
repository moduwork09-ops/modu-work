import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, PrimaryButton, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { coworkerSpace } from '../src/features/together/fixtures';
import { getMemberships } from '../src/features/together/mockTogetherState';
import { getTogetherSpaceTypeLabel } from '../src/features/together/sharePolicyPresentation';

export default function TogetherInviteJoinScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const memberCount = getMemberships(coworkerSpace.id).filter((item) => item.status === 'active').length;

  function verify() {
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(code.trim())) { Alert.alert('초대 코드를 확인해 주세요.', '예: ABCD-4821'); return; }
    setShowPreview(true);
  }

  function join() {
    Alert.alert('Mock 참여 완료', '실제 계정과 서버가 연결되면 참여 및 내 SharePolicy 생성이 처리됩니다.', [{ text: '확인', onPress: () => router.replace({ pathname: '/together-group-detail', params: { spaceId: coworkerSpace.id } }) }]);
  }

  return <Screen style={styles.screen}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoiding}><View style={styles.header}><Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}><MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} /></Pressable><AppText variant="button" style={styles.headerTitle}>초대 코드 입력</AppText><View style={styles.headerButton} /></View><ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} contentInsetAdjustmentBehavior="never" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <View style={styles.intro}><AppText variant="heading" style={styles.title}>받은 초대 코드를 입력해 주세요.</AppText><AppText variant="caption" tone="secondary">코드를 확인하면 참여할 그룹을 먼저 보여드려요.</AppText></View>
    <View style={styles.field}><AppText style={styles.label}>초대 코드</AppText><TextInput accessibilityLabel="초대 코드" autoCapitalize="characters" autoCorrect={false} maxLength={9} onChangeText={(value) => { setCode(value.toUpperCase()); setShowPreview(false); }} placeholder="ABCD-4821" placeholderTextColor={theme.textSecondary} returnKeyType="done" style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={code} /></View>
    {!showPreview && <PrimaryButton label="코드 확인" onPress={verify} style={styles.primaryButton} />}
    {showPreview && <><Card style={styles.previewCard}><View style={styles.previewIcon}><MaterialCommunityIcons name="account-group-outline" color={brandColors.coral} size={27} /></View><View style={styles.previewText}><AppText variant="button" style={styles.previewTitle}>{coworkerSpace.name}에 참여할까요?</AppText><AppText variant="caption" tone="secondary">{getTogetherSpaceTypeLabel(coworkerSpace.type)} · {memberCount}명</AppText></View></Card><PrimaryButton label="참여하기" onPress={join} style={styles.primaryButton} /></>}
    <View style={styles.privacyNote}><MaterialCommunityIcons name="shield-lock-outline" color={brandColors.deepNavy} size={20} /><View style={styles.privacyText}><AppText style={styles.privacyTitle}>내 정보가 자동으로 모두 공개되지는 않아요.</AppText><AppText variant="caption" tone="secondary">참여 후 내 공유 범위를 직접 선택할 수 있습니다.</AppText></View></View>
  </ScrollView></KeyboardAvoidingView></Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingTop: spacing.xs }, keyboardAvoiding: { flex: 1 }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 }, headerButton: { alignItems: 'center', borderRadius: radius.xxl, height: 36, justifyContent: 'center', width: 36 }, headerTitle: { fontSize: 18 }, content: { gap: spacing.lg, paddingTop: spacing.lg }, intro: { gap: spacing.xs }, title: { fontSize: 22, lineHeight: 29 }, field: { gap: spacing.xs }, label: { fontSize: 14, fontWeight: '700' }, input: { borderRadius: radius.md, borderWidth: 1, fontSize: 18, fontWeight: '700', letterSpacing: 2, minHeight: 50, paddingHorizontal: spacing.md }, primaryButton: { backgroundColor: brandColors.coral }, previewCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, padding: spacing.md }, previewIcon: { alignItems: 'center', backgroundColor: '#FFF0E9', borderRadius: radius.md, height: 48, justifyContent: 'center', width: 48 }, previewText: { flex: 1, gap: spacing.xxs }, previewTitle: { fontSize: 16 }, privacyNote: { alignItems: 'flex-start', backgroundColor: '#EEF1F3', borderRadius: radius.md, flexDirection: 'row', gap: spacing.sm, padding: spacing.md }, privacyText: { flex: 1, gap: spacing.xxs }, privacyTitle: { color: brandColors.deepNavy, fontSize: 14, fontWeight: '700' }, pressed: { opacity: 0.76 },
});
