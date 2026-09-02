import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, Screen } from '../../src/components';
import { spacing, useAppTheme } from '../../src/constants';
import { useAuth } from '../../src/features/auth/AuthContext';
import { createAndShareLocalBackup, pickLocalBackup, restoreLocalBackup } from '../../src/features/backup/localDataBackup';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { scheduleReplacementDayOffProjectionSync } from '../../src/features/together/dayOffProjectionSync';
import { scheduleFullAvailabilityProjectionSync } from '../../src/features/together/availabilityProjectionSync';

export default function MyScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { isLoading: isAuthLoading, session } = useAuth();
  const { reloadPersistedData, resetAllUserData } = useShiftSchedule();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleBackup = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await createAndShareLocalBackup();
    } catch (error) {
      Alert.alert('백업에 실패했어요.', error instanceof Error ? error.message : '다시 시도해주세요.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
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
              setIsProcessing(true);
              void (async () => {
                try {
                  await restoreLocalBackup(backup);
                  await reloadPersistedData();
                  if (session) await scheduleReplacementDayOffProjectionSync(session.user.id);
                  if (session) await scheduleFullAvailabilityProjectionSync(session.user.id);
                  Alert.alert('복원 완료', '데이터 복원이 완료되었습니다.');
                } catch (error) {
                  Alert.alert('복원에 실패했어요.', error instanceof Error ? error.message : '기존 데이터는 유지됩니다.');
                } finally {
                  setIsProcessing(false);
                }
              })();
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert('복원할 수 없어요.', error instanceof Error ? error.message : '백업 파일을 확인해주세요.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    if (isProcessing) return;

    Alert.alert(
      '모든 데이터를 초기화할까요?',
      '근무 설정, 일정, 메모 등 저장된 데이터가 삭제됩니다.\n삭제된 데이터는 백업 파일이 없으면 복구할 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '모든 데이터 초기화',
          style: 'destructive',
          onPress: () => {
            setIsProcessing(true);
            void (async () => {
              try {
                await resetAllUserData();
              } catch (error) {
                Alert.alert('초기화하지 못했어요.', error instanceof Error ? error.message : '다시 시도해주세요.');
              } finally {
                setIsProcessing(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <AppText variant="title">MY</AppText>
        <Pressable accessibilityLabel="근무 설정" onPress={() => router.push('/shift-types')}>
          <Card style={styles.card}>
            <View style={styles.settingRow}>
              <View><AppText style={styles.settingTitle}>근무 설정</AppText><AppText variant="caption" tone="secondary">근무유형과 반복 패턴을 설정하세요.</AppText></View>
              <MaterialCommunityIcons name="chevron-right" size={24} color={theme.textSecondary} />
            </View>
          </Card>
        </Pressable>
        <Pressable accessibilityLabel="급여 계산" onPress={() => router.push('/salary')}>
          <Card style={styles.accountCard}>
            <View style={styles.settingRow}>
              <View><AppText style={styles.settingTitle}>급여 계산</AppText><AppText variant="caption" tone="secondary">근무표 기준 예상 급여를 확인하세요.</AppText></View>
              <MaterialCommunityIcons name="chevron-right" size={24} color={theme.textSecondary} />
            </View>
          </Card>
        </Pressable>

        <Pressable accessibilityLabel="환경설정" accessibilityRole="button" onPress={() => router.push('/settings' as never)}>
          <Card style={styles.accountCard}>
            <View style={styles.settingRow}>
              <View style={styles.textArea}><AppText style={styles.settingTitle}>환경설정</AppText><AppText variant="caption" tone="secondary">근무표와 급여, 계정 설정을 한곳에서 확인해요.</AppText></View>
              <MaterialCommunityIcons name="chevron-right" size={24} color={theme.textSecondary} />
            </View>
          </Card>
        </Pressable>

        <AppText style={styles.sectionTitle}>도움말</AppText>
        <Pressable accessibilityLabel="사용법 다시 보기" accessibilityRole="button" onPress={() => router.push({ pathname: '/tutorial', params: { mode: 'replay' } })}>
          <Card style={styles.accountCard}>
            <View style={styles.settingRow}>
              <View><AppText style={styles.settingTitle}>사용법 다시 보기</AppText><AppText variant="caption" tone="secondary">핵심 기능을 4페이지로 다시 확인하세요.</AppText></View>
              <MaterialCommunityIcons name="book-open-page-variant-outline" size={24} color={theme.textSecondary} />
            </View>
          </Card>
        </Pressable>

        <AppText style={styles.sectionTitle}>계정</AppText>
        <Pressable accessibilityLabel="계정" accessibilityRole="button" onPress={() => router.push('/account')}>
          <Card style={styles.accountCard}>
            <View style={styles.settingRow}>
              <View style={styles.textArea}><AppText style={styles.settingTitle}>계정</AppText><AppText variant="caption" tone="secondary" numberOfLines={1}>{isAuthLoading ? '계정 상태를 확인하고 있어요.' : session?.user.email ?? '로그인하고 함께 기능을 연결하세요'}</AppText></View>
              <MaterialCommunityIcons name="chevron-right" size={24} color={theme.textSecondary} />
            </View>
          </Card>
        </Pressable>

        <AppText style={styles.sectionTitle}>데이터 관리</AppText>
        <Card style={styles.dataCard}>
          <Pressable disabled={isProcessing} accessibilityLabel="데이터 백업" onPress={() => void handleBackup()} style={styles.dataRow}>
            <View style={styles.textArea}><AppText style={styles.settingTitle}>데이터 백업</AppText><AppText variant="caption" tone="secondary">근무표와 일정을 파일로 저장합니다.</AppText></View>
            <MaterialCommunityIcons name="export-variant" size={22} color={theme.textSecondary} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <Pressable disabled={isProcessing} accessibilityLabel="데이터 복원" onPress={() => void handleRestore()} style={styles.dataRow}>
            <View style={styles.textArea}><AppText style={styles.settingTitle}>데이터 복원</AppText><AppText variant="caption" tone="secondary">저장한 백업 파일에서 데이터를 복원합니다.</AppText></View>
            <MaterialCommunityIcons name="import" size={22} color={theme.textSecondary} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <Pressable disabled={isProcessing} accessibilityLabel="모든 데이터 초기화" onPress={handleReset} style={styles.dataRow}>
            <View style={styles.textArea}><AppText style={[styles.settingTitle, { color: theme.accent }]}>모든 데이터 초기화</AppText><AppText variant="caption" tone="secondary">근무 설정과 저장된 일정을 모두 삭제합니다.</AppText></View>
            <MaterialCommunityIcons name="delete-outline" size={22} color={theme.accent} />
          </Pressable>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  content: { paddingBottom: spacing.xxl },
  card: {
    marginTop: spacing.xl,
  },
  accountCard: { marginTop: spacing.md },
  dataCard: { marginTop: spacing.md, paddingVertical: 0 },
  dataRow: { alignItems: 'center', flexDirection: 'row', minHeight: 84, justifyContent: 'space-between' },
  divider: { height: StyleSheet.hairlineWidth },
  sectionTitle: { fontWeight: '700', marginTop: spacing.xxl },
  settingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  settingTitle: { fontWeight: '700' },
  textArea: { flex: 1, paddingRight: spacing.md },
});
