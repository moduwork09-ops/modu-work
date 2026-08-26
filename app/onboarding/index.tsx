import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, PrimaryButton, Screen } from '../../src/components';
import { spacing, useAppTheme } from '../../src/constants';
import { useAuth } from '../../src/features/auth/AuthContext';
import { pickLocalBackup, restoreLocalBackup } from '../../src/features/backup/localDataBackup';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { scheduleReplacementDayOffProjectionSync } from '../../src/features/together/dayOffProjectionSync';

export default function OnboardingScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const { reloadPersistedData } = useShiftSchedule();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleAccountSwitch = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      const { error } = await signOut();
      if (error) {
        Alert.alert('로그아웃하지 못했어요.', '잠시 후 다시 시도해 주세요.');
      }
    } catch {
      Alert.alert('로그아웃하지 못했어요.', '네트워크 연결을 확인하고 다시 시도해 주세요.');
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleRestore = async () => {
    try {
      const backup = await pickLocalBackup();
      if (!backup) return;

      Alert.alert(
        '데이터를 복원할까요?',
        '현재 데이터가 백업 파일의 데이터로 변경됩니다.',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '복원하기',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await restoreLocalBackup(backup);
                  await reloadPersistedData();
                  if (session) await scheduleReplacementDayOffProjectionSync(session.user.id);
                  Alert.alert('복원이 완료됐어요.', '백업 파일의 데이터로 복원했어요.', [
                    { text: '확인', onPress: () => router.replace('/') },
                  ]);
                } catch {
                  Alert.alert('복원하지 못했어요.', '백업 파일을 확인한 뒤 다시 시도해주세요.');
                }
              })();
            },
          },
        ],
      );
    } catch {
      Alert.alert('복원하지 못했어요.', '백업 파일을 확인한 뒤 다시 시도해주세요.');
    }
  };

  return <Screen style={styles.screen}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}><View><AppText variant="title" style={{ color: theme.primary }}>모두의 근무</AppText><AppText variant="heading" style={styles.tagline}>교대근무자의 시간을 더 쉽게</AppText><Card style={styles.messageCard}><AppText tone="secondary">근무표를 한 번 설정하면{`\n`}내 일정과 사용할 수 있는 틈을{`\n`}자동으로 확인할 수 있어요.</AppText></Card></View><View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}><PrimaryButton label="시작하기" onPress={() => router.push({ pathname: '/shift-types', params: { setup: 'true' } })} style={styles.startButton} /><PrimaryButton label="백업에서 복원" onPress={() => void handleRestore()} style={styles.startButton} /><Pressable accessibilityRole="button" disabled={isSigningOut} onPress={() => void handleAccountSwitch()} style={styles.accountSwitchButton}><AppText variant="button" tone="secondary">{isSigningOut ? '로그아웃 중...' : '다른 계정으로 로그인'}</AppText></Pressable></View></ScrollView></Screen>;
}

const styles = StyleSheet.create({ screen: { paddingTop: spacing.xl, paddingBottom: 0 }, content: { flexGrow: 1, gap: spacing.xl, justifyContent: 'space-between' }, tagline: { marginTop: spacing.sm }, messageCard: { marginTop: spacing.xxl }, actions: { gap: spacing.sm }, startButton: { width: '100%' }, accountSwitchButton: { alignItems: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md } });
