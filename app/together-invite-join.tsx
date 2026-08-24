import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, PrimaryButton, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { acceptTogetherInvitation } from '../src/features/together/togetherServerData';

function getInviteCodeParam(value: string | string[] | undefined) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return '';
  }
}

export default function TogetherInviteJoinScreen() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState(() => getInviteCodeParam(params.code));
  const [isJoining, setIsJoining] = useState(false);
  const isJoiningRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const inviteCode = getInviteCodeParam(params.code);
    if (inviteCode && !isJoiningRef.current) setCode(inviteCode);
  }, [params.code]);

  async function join() {
    const inviteCode = code.trim();
    if (!inviteCode) {
      Alert.alert('초대 코드를 입력해 주세요.');
      return;
    }
    if (isJoiningRef.current) return;

    isJoiningRef.current = true;
    setIsJoining(true);
    try {
      const spaceId = await acceptTogetherInvitation(inviteCode);
      if (!isMountedRef.current) return;
      router.replace({ pathname: '/together-group-detail', params: { spaceId } });
    } catch {
      isJoiningRef.current = false;
      if (!isMountedRef.current) return;
      setIsJoining(false);
      Alert.alert('초대 코드로 참여할 수 없어요.', '코드를 확인하거나 잠시 후 다시 시도해 주세요.');
    }
  }

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoiding}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
          </Pressable>
          <AppText variant="button" style={styles.headerTitle}>초대 코드 입력</AppText>
          <View style={styles.headerButton} />
        </View>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} contentInsetAdjustmentBehavior="never" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <AppText variant="heading" style={styles.title}>받은 초대 코드를 입력해 주세요.</AppText>
            <AppText variant="caption" tone="secondary">초대 코드를 확인하고 그룹에 참여할 수 있어요.</AppText>
          </View>
          <View style={styles.field}>
            <AppText style={styles.label}>초대 코드</AppText>
            <TextInput accessibilityLabel="초대 코드" autoCapitalize="none" autoCorrect={false} editable={!isJoining} onChangeText={setCode} placeholder="초대 코드 입력" placeholderTextColor={theme.textSecondary} returnKeyType="done" style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={code} />
          </View>
          <PrimaryButton disabled={isJoining} label={isJoining ? '참여하는 중...' : '참여하기'} onPress={() => void join()} style={[styles.primaryButton, isJoining && styles.disabled]} />
          <View style={styles.privacyNote}><MaterialCommunityIcons name="shield-lock-outline" color={brandColors.deepNavy} size={20} /><View style={styles.privacyText}><AppText style={styles.privacyTitle}>내 정보가 자동으로 모두 공개되지는 않아요.</AppText><AppText variant="caption" tone="secondary">참여 후 내 공유 범위를 직접 선택할 수 있습니다.</AppText></View></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingTop: spacing.xs },
  keyboardAvoiding: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 },
  headerButton: { alignItems: 'center', borderRadius: radius.xxl, height: 36, justifyContent: 'center', width: 36 },
  headerTitle: { fontSize: 18 },
  content: { gap: spacing.lg, paddingTop: spacing.lg },
  intro: { gap: spacing.xs },
  title: { fontSize: 22, lineHeight: 29 },
  field: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '700' },
  input: { borderRadius: radius.md, borderWidth: 1, fontSize: 18, fontWeight: '700', letterSpacing: 2, minHeight: 50, paddingHorizontal: spacing.md },
  primaryButton: { backgroundColor: brandColors.coral },
  privacyNote: { alignItems: 'flex-start', backgroundColor: '#EEF1F3', borderRadius: radius.md, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  privacyText: { flex: 1, gap: spacing.xxs },
  privacyTitle: { color: brandColors.deepNavy, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.76 },
});
