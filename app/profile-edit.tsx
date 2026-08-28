import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, PrimaryButton, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { useAuth } from '../src/features/auth/AuthContext';
import {
  MAX_PROFILE_DISPLAY_NAME_LENGTH,
  normalizeProfileDisplayName,
} from '../src/features/profile/profileDisplayName';
import { getProfile, updateMyProfileDisplayName } from '../src/features/profile/profileService';

type ScreenState = 'loading' | 'ready' | 'error';

export default function ProfileEditScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [displayName, setDisplayName] = useState('');
  const [originalDisplayName, setOriginalDisplayName] = useState('');
  const [profileUserId, setProfileUserId] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const isCurrentRef = useRef(false);
  const contextRevisionRef = useRef(0);
  const isReadyForCurrentUser = screenState === 'ready' && profileUserId === session?.user.id;

  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    contextRevisionRef.current += 1;
    isCurrentRef.current = true;
    const userId = session?.user.id;
    setScreenState('loading');
    setProfileUserId(undefined);

    if (!userId) {
      setScreenState('error');
      return () => {
        isCurrent = false;
        isCurrentRef.current = false;
      };
    }

    void getProfile(userId)
      .then((profile) => {
        if (!isCurrent) return;
        const currentName = profile.display_name?.trim() ?? '';
        setDisplayName(currentName);
        setOriginalDisplayName(currentName);
        setProfileUserId(userId);
        setScreenState('ready');
      })
      .catch(() => {
        if (isCurrent) setScreenState('error');
      });

    return () => {
      isCurrent = false;
      isCurrentRef.current = false;
    };
  }, [session?.user.id]));

  async function save() {
    if (isSavingRef.current || !isReadyForCurrentUser) return;
    const normalizedName = normalizeProfileDisplayName(displayName);
    if (!normalizedName) {
      Alert.alert('이름을 확인해 주세요.', `이름은 ${MAX_PROFILE_DISPLAY_NAME_LENGTH}자 이하로 입력해 주세요.`);
      return;
    }
    if (normalizedName === originalDisplayName) {
      router.back();
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    const contextRevision = contextRevisionRef.current;
    try {
      await updateMyProfileDisplayName(normalizedName);
      if (isCurrentRef.current && contextRevisionRef.current === contextRevision) router.back();
    } catch {
      if (isCurrentRef.current && contextRevisionRef.current === contextRevision) Alert.alert('이름을 저장할 수 없어요.', '잠시 후 다시 시도해 주세요.');
    } finally {
      isSavingRef.current = false;
      if (isCurrentRef.current) setIsSaving(false);
    }
  }

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoiding}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
          </Pressable>
          <AppText variant="button" style={styles.headerTitle}>이름 수정</AppText>
          <View style={styles.headerButton} />
        </View>

        {screenState === 'loading' || (screenState === 'ready' && !isReadyForCurrentUser) ? <View style={styles.state}><AppText tone="secondary">프로필을 불러오는 중...</AppText></View> : null}
        {screenState === 'error' ? <View style={styles.state}><AppText>프로필을 확인할 수 없어요.</AppText></View> : null}
        {isReadyForCurrentUser ? (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]} contentInsetAdjustmentBehavior="never" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.field}>
              <AppText style={styles.label}>이름</AppText>
              <TextInput accessibilityLabel="사용자 이름" autoCapitalize="none" maxLength={MAX_PROFILE_DISPLAY_NAME_LENGTH} onChangeText={setDisplayName} placeholder="이름을 입력해 주세요" placeholderTextColor={theme.textSecondary} returnKeyType="done" style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={displayName} />
              <AppText variant="caption" tone="secondary">Together 그룹 멤버에게도 같은 이름으로 표시됩니다.</AppText>
            </View>
            <PrimaryButton disabled={isSaving} label={isSaving ? '저장 중...' : '변경사항 저장'} onPress={() => void save()} style={[styles.saveButton, isSaving && styles.disabled]} />
          </ScrollView>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingTop: spacing.xs },
  keyboardAvoiding: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 },
  headerButton: { alignItems: 'center', borderRadius: radius.xxl, height: 36, justifyContent: 'center', width: 36 },
  headerTitle: { fontSize: 18, lineHeight: 24 },
  content: { gap: spacing.xl, paddingTop: spacing.xl },
  field: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  input: { borderRadius: radius.md, borderWidth: 1, fontSize: 16, minHeight: 50, paddingHorizontal: spacing.md },
  saveButton: { backgroundColor: brandColors.coral },
  disabled: { opacity: 0.55 },
  state: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  pressed: { opacity: 0.76 },
});
