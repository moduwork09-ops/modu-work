import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, PrimaryButton, Screen } from '../../components';
import { radius, spacing, useAppTheme } from '../../constants';
import { getAuthErrorMessage, logAuthError } from './authError';
import { useAuth } from './AuthContext';

type AuthFormScreenProps = { mode: 'sign-in' | 'sign-up' };

export function AuthFormScreen({ mode }: AuthFormScreenProps) {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const isSignUp = mode === 'sign-up';

  async function submit() {
    if (isSubmitting) return;

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setErrorMessage('이메일을 입력해 주세요.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('비밀번호는 6자 이상 입력해 주세요.');
      return;
    }
    if (isSignUp && password !== passwordConfirm) {
      setErrorMessage('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(undefined);
    const action = isSignUp ? 'sign-up' : 'sign-in';

    try {
      const { error } = isSignUp
        ? await signUp(normalizedEmail, password)
        : await signIn(normalizedEmail, password);
      if (error) {
        logAuthError(action, error);
        setErrorMessage(getAuthErrorMessage(error, action));
        return;
      }
    } catch (error) {
      logAuthError(action, error);
      setErrorMessage(getAuthErrorMessage(error, action));
    } finally {
      setIsSubmitting(false);
    }
  }

  const title = isSignUp ? '회원가입' : '로그인';

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoiding}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={styles.headerButton}>
            <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
          </Pressable>
          <AppText variant="button" style={styles.headerTitle}>{title}</AppText>
          <View style={styles.headerButton} />
        </View>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.form}>
            <AuthField autoCapitalize="none" autoComplete="email" keyboardType="email-address" label="이메일" onChangeText={setEmail} returnKeyType="next" value={email} />
            <PasswordField label="비밀번호" onChangeText={setPassword} onToggle={() => setIsPasswordVisible((value) => !value)} returnKeyType={isSignUp ? 'next' : 'done'} value={password} visible={isPasswordVisible} />
            {isSignUp ? <PasswordField label="비밀번호 확인" onChangeText={setPasswordConfirm} onToggle={() => setIsConfirmVisible((value) => !value)} returnKeyType="done" value={passwordConfirm} visible={isConfirmVisible} /> : null}
            {errorMessage ? <AppText accessibilityRole="alert" selectable style={[styles.error, { color: theme.accent }]}>{errorMessage}</AppText> : null}
            <PrimaryButton disabled={isSubmitting} label={isSubmitting ? (isSignUp ? '가입 중...' : '로그인 중...') : title} onPress={() => void submit()} style={isSubmitting ? styles.disabled : undefined} />
          </View>
          <View style={styles.footer}>
            <AppText variant="caption" tone="secondary">{isSignUp ? '이미 계정이 있나요?' : '계정이 없나요?'}</AppText>
            <Pressable accessibilityRole="button" onPress={() => router.replace(isSignUp ? '/sign-in' : '/sign-up')}>
              <AppText variant="button" style={{ color: theme.primary }}>{isSignUp ? '로그인' : '회원가입'}</AppText>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

type AuthFieldProps = React.ComponentProps<typeof TextInput> & { label: string };

function AuthField({ label, style, ...props }: AuthFieldProps) {
  const theme = useAppTheme();
  return <View style={styles.field}><AppText style={styles.label}>{label}</AppText><TextInput accessibilityLabel={label} placeholderTextColor={theme.textSecondary} style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }, style]} {...props} /></View>;
}

function PasswordField({ label, onToggle, visible, ...props }: AuthFieldProps & { onToggle: () => void; visible: boolean }) {
  const theme = useAppTheme();
  return (
    <View style={styles.field}>
      <AppText style={styles.label}>{label}</AppText>
      <View style={[styles.passwordInput, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TextInput accessibilityLabel={label} autoCapitalize="none" autoComplete="password" secureTextEntry={!visible} style={[styles.passwordText, { color: theme.text }]} {...props} />
        <Pressable accessibilityLabel={visible ? `${label} 숨기기` : `${label} 표시하기`} accessibilityRole="button" hitSlop={8} onPress={onToggle}>
          <MaterialCommunityIcons name={visible ? 'eye-off-outline' : 'eye-outline'} color={theme.textSecondary} size={22} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingTop: spacing.xs }, keyboardAvoiding: { flex: 1 }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 }, headerButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 }, headerTitle: { fontSize: 18, lineHeight: 24 }, content: { flexGrow: 1, gap: spacing.xxl, justifyContent: 'space-between', paddingTop: spacing.xxl }, form: { gap: spacing.lg }, field: { gap: spacing.xs }, label: { fontSize: 14, fontWeight: '700', lineHeight: 20 }, input: { borderRadius: radius.md, borderWidth: 1, fontSize: 16, minHeight: 50, paddingHorizontal: spacing.md }, passwordInput: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', minHeight: 50, paddingHorizontal: spacing.md }, passwordText: { flex: 1, fontSize: 16, paddingVertical: spacing.sm }, error: { fontSize: 14, lineHeight: 20 }, footer: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', paddingTop: spacing.lg }, disabled: { opacity: 0.55 },
});
