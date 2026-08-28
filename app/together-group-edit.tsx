import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, PrimaryButton, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { useAuth } from '../src/features/auth/AuthContext';
import { TOGETHER_SPACE_TYPE_OPTIONS } from '../src/features/together/sharePolicyPresentation';
import {
  getTogetherMembers,
  getTogetherSpace,
  isTogetherSpaceId,
  updateTogetherSpace,
} from '../src/features/together/togetherServerData';
import { MAX_TOGETHER_SPACE_NAME_LENGTH } from '../src/features/together/togetherSpaceUpdate';
import type { TogetherSpaceType } from '../src/features/together/types';

type ScreenState = 'loading' | 'ready' | 'forbidden' | 'error';

export default function TogetherGroupEditScreen() {
  const params = useLocalSearchParams<{ spaceId?: string | string[] }>();
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const rawSpaceId = params.spaceId;
  const spaceId = typeof rawSpaceId === 'string' && isTogetherSpaceId(rawSpaceId) ? rawSpaceId : undefined;
  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [name, setName] = useState('');
  const [type, setType] = useState<TogetherSpaceType>('custom');
  const [originalName, setOriginalName] = useState('');
  const [originalType, setOriginalType] = useState<TogetherSpaceType>('custom');
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const isCurrentRef = useRef(false);

  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    isCurrentRef.current = true;
    setScreenState('loading');

    if (!spaceId || !session?.user.id) {
      setScreenState('error');
      return () => {
        isCurrent = false;
        isCurrentRef.current = false;
      };
    }

    void Promise.all([getTogetherSpace(spaceId), getTogetherMembers(spaceId)])
      .then(([space, members]) => {
        if (!isCurrent) return;
        const isOwner = members.some((member) => (
          member.userId === session.user.id && member.role === 'owner' && member.status === 'active'
        ));
        if (!isOwner) {
          setScreenState('forbidden');
          return;
        }
        setName(space.name);
        setType(space.type);
        setOriginalName(space.name.trim());
        setOriginalType(space.type);
        setScreenState('ready');
      })
      .catch(() => {
        if (isCurrent) setScreenState('error');
      });

    return () => {
      isCurrent = false;
      isCurrentRef.current = false;
    };
  }, [session?.user.id, spaceId]));

  async function save() {
    if (isSavingRef.current || !spaceId || screenState !== 'ready') return;
    const normalizedName = name.trim();
    if (!normalizedName) {
      Alert.alert('그룹 이름을 입력해 주세요.');
      return;
    }
    if (normalizedName === originalName && type === originalType) {
      router.back();
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await updateTogetherSpace(spaceId, normalizedName, type);
      if (isCurrentRef.current) router.back();
    } catch {
      if (isCurrentRef.current) Alert.alert('그룹 정보를 저장할 수 없어요.', '잠시 후 다시 시도해 주세요.');
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
          <AppText variant="button" style={styles.headerTitle}>그룹 정보 수정</AppText>
          <View style={styles.headerButton} />
        </View>

        {screenState === 'loading' ? <View style={styles.state}><AppText tone="secondary">그룹 정보를 불러오는 중...</AppText></View> : null}
        {screenState === 'forbidden' ? <View style={styles.state}><AppText>그룹장만 그룹 정보를 수정할 수 있어요.</AppText></View> : null}
        {screenState === 'error' ? <View style={styles.state}><AppText>그룹 정보를 확인할 수 없어요.</AppText></View> : null}
        {screenState === 'ready' ? (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} contentInsetAdjustmentBehavior="never" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.field}>
              <AppText style={styles.label}>그룹 이름</AppText>
              <TextInput accessibilityLabel="그룹 이름" maxLength={MAX_TOGETHER_SPACE_NAME_LENGTH} onChangeText={setName} placeholder="그룹 이름" placeholderTextColor={theme.textSecondary} returnKeyType="done" style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={name} />
            </View>
            <View style={styles.field}>
              <AppText style={styles.label}>그룹 유형</AppText>
              <View style={styles.typeList}>
                {TOGETHER_SPACE_TYPE_OPTIONS.map((item) => {
                  const selected = item.type === type;
                  return (
                    <Pressable key={item.type} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setType(item.type)} style={({ pressed }) => [styles.typeRow, { backgroundColor: selected ? '#FFF0E9' : theme.surface, borderColor: selected ? brandColors.coral : theme.border }, pressed && styles.pressed]}>
                      <View style={styles.typeText}><AppText style={styles.typeLabel}>{item.label}</AppText><AppText variant="caption" tone="secondary" style={styles.typeDescription}>{item.description}</AppText></View>
                      <MaterialCommunityIcons name={selected ? 'check-circle' : 'circle-outline'} color={selected ? brandColors.coral : theme.textSecondary} size={22} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <PrimaryButton disabled={isSaving} label={isSaving ? '저장 중...' : '저장'} onPress={() => void save()} style={[styles.saveButton, isSaving && styles.disabled]} />
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
  content: { gap: spacing.lg, paddingTop: spacing.md },
  field: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  input: { borderRadius: radius.md, borderWidth: 1, fontSize: 15, minHeight: 48, paddingHorizontal: spacing.md },
  typeList: { gap: spacing.xs },
  typeRow: { alignItems: 'center', borderCurve: 'continuous', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 66, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  typeText: { flex: 1, gap: 1 },
  typeLabel: { fontSize: 15, fontWeight: '700', lineHeight: 21 },
  typeDescription: { fontSize: 12, lineHeight: 17 },
  saveButton: { backgroundColor: brandColors.coral },
  disabled: { opacity: 0.55 },
  state: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  pressed: { opacity: 0.76 },
});
