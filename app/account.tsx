import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, PrimaryButton, Screen } from '../src/components';
import { spacing, useAppTheme } from '../src/constants';
import { getAuthErrorMessage, logAuthError } from '../src/features/auth/authError';
import { useAuth } from '../src/features/auth/AuthContext';

export default function AccountScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { isLoading, session, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setErrorMessage(undefined);
    try {
      const { error } = await signOut();
      if (error) {
        logAuthError('sign-out', error);
        setErrorMessage(getAuthErrorMessage(error, 'sign-out'));
        return;
      }
      router.replace('/');
    } catch (error) {
      logAuthError('sign-out', error);
      setErrorMessage(getAuthErrorMessage(error, 'sign-out'));
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={styles.headerButton}>
          <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
        </Pressable>
        <AppText variant="button" style={styles.headerTitle}>계정</AppText>
        <View style={styles.headerButton} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.loading}><ActivityIndicator color={theme.primary} /><AppText tone="secondary">계정 상태를 확인하고 있어요.</AppText></View>
        ) : session?.user ? (
          <Card style={styles.card}>
            <AppText variant="heading">로그인 중</AppText>
            <AppText selectable style={styles.email}>{session.user.email ?? '이메일 정보 없음'}</AppText>
            <AppText variant="caption" tone="secondary">함께 기능 서버 연결은 다음 단계에서 진행합니다.</AppText>
            {errorMessage ? <AppText accessibilityRole="alert" selectable style={{ color: theme.accent }}>{errorMessage}</AppText> : null}
            <PrimaryButton disabled={isSigningOut} label={isSigningOut ? '로그아웃 중...' : '로그아웃'} onPress={() => void handleSignOut()} style={isSigningOut ? styles.disabled : undefined} />
          </Card>
        ) : (
          <Card style={styles.card}>
            <AppText variant="heading">모두의 근무 계정</AppText>
            <AppText tone="secondary">계정에 로그인하면 다른 사람과{`\n`}근무·틈·공동 일정을 공유할 수 있어요.</AppText>
            <View style={styles.actions}>
              <PrimaryButton label="로그인" onPress={() => router.push('/sign-in')} />
              <View style={styles.signUpPrompt}><AppText variant="caption" tone="secondary">아직 계정이 없나요?</AppText><Pressable accessibilityRole="button" onPress={() => router.push('/sign-up')}><AppText variant="button" style={{ color: theme.primary }}>회원가입</AppText></Pressable></View>
            </View>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingTop: spacing.xs }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 }, headerButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 }, headerTitle: { fontSize: 18, lineHeight: 24 }, content: { paddingTop: spacing.xl }, loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl }, card: { gap: spacing.lg }, email: { fontSize: 16, fontWeight: '700' }, actions: { gap: spacing.lg, paddingTop: spacing.xs }, signUpPrompt: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, justifyContent: 'center' }, disabled: { opacity: 0.55 },
});
