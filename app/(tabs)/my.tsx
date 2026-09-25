import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Fragment, useState, type ComponentProps } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Screen } from '../../src/components';
import { calendarShiftColors, radius, spacing, useAppTheme } from '../../src/constants';
import { useAuth } from '../../src/features/auth/AuthContext';
import { createAndShareLocalBackup, pickLocalBackup, restoreLocalBackup } from '../../src/features/backup/localDataBackup';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { scheduleReplacementDayOffProjectionSync } from '../../src/features/together/dayOffProjectionSync';
import { scheduleFullAvailabilityProjectionSync } from '../../src/features/together/availabilityProjectionSync';

type MyMenuRow = {
  title: string;
  description: string;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  colors: { background: string; text: string };
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

export default function MyScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
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

  const sections: { title: string; rows: MyMenuRow[] }[] = [
    { title: '', rows: [
      { title: '내 정보', description: '이름과 계정 정보를 확인해요', icon: 'account-outline', colors: calendarShiftColors.training, onPress: () => router.push('/account') },
    ] },
    { title: '화면 · 캘린더', rows: [
      { title: '캘린더 설정', description: '시작 요일과 표시 항목을 설정해요', icon: 'calendar-month-outline', colors: calendarShiftColors.training, onPress: () => router.push('/calendar-settings') },
    ] },
    { title: '알림', rows: [
      { title: '알림 설정', description: '근무와 개인 일정 알림을 설정해요', icon: 'bell-outline', colors: calendarShiftColors.annualLeave, onPress: () => router.push('/notification-settings') },
    ] },
    { title: '근무표', rows: [
      { title: '근무유형', description: '근무 이름과 색상을 관리해요', icon: 'palette-outline', colors: calendarShiftColors.training, onPress: () => router.push('/shift-types') },
      { title: '근무패턴', description: '반복되는 근무 패턴을 관리해요', icon: 'calendar-sync-outline', colors: calendarShiftColors.offDuty, onPress: () => router.push('/shift-pattern') },
      { title: '근무표 찾기 · 공유', description: '회사·기관 근무표를 찾거나 공유해요', icon: 'account-switch-outline', colors: calendarShiftColors.rest, onPress: () => router.push('/shift-presets') },
    ] },
    { title: '급여', rows: [
      { title: '급여 계산', description: '근무표 기준 예상 급여를 확인해요', icon: 'calculator-variant-outline', colors: calendarShiftColors.annualLeave, onPress: () => router.push('/salary') },
      { title: '급여 설정', description: '기본급과 근무별 수당을 설정해요', icon: 'wallet-outline', colors: calendarShiftColors.annualLeave, onPress: () => router.push('/salary-settings') },
    ] },
    { title: '도움말', rows: [
      { title: '사용 방법', description: '핵심 기능을 다시 확인해요', icon: 'book-open-page-variant-outline', colors: calendarShiftColors.offDuty, onPress: () => router.push({ pathname: '/tutorial', params: { mode: 'replay' } }) },
      { title: '베타 피드백', description: '불편한 점과 필요한 기능을 알려주세요', icon: 'comment-text-outline', colors: calendarShiftColors.training, onPress: () => router.push('/beta-feedback') },
    ] },
    { title: '데이터 관리', rows: [
      { title: '데이터 백업', description: '근무표와 일정을 파일로 저장합니다.', icon: 'export-variant', colors: calendarShiftColors.training, onPress: () => void handleBackup(), disabled: isProcessing },
      { title: '데이터 복원', description: '저장한 백업 파일에서 데이터를 복원합니다.', icon: 'import', colors: calendarShiftColors.training, onPress: () => void handleRestore(), disabled: isProcessing },
      { title: '모든 데이터 초기화', description: '근무 설정과 저장된 일정을 모두 삭제합니다.', icon: 'delete-outline', colors: calendarShiftColors.annualLeave, onPress: handleReset, disabled: isProcessing, destructive: true },
    ] },
  ];

  return (
    <Screen style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]}>
        <AppText variant="title">MY</AppText>
        {sections.map(section => <View key={section.title || 'account'} style={styles.section}>
          {section.title ? <AppText variant="caption" tone="secondary" style={styles.sectionTitle}>{section.title}</AppText> : null}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {section.rows.map((row, index) => <Fragment key={row.title}>
              {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.border }]} /> : null}
              <Pressable accessibilityRole="button" accessibilityLabel={row.title} accessibilityHint={row.description}
                disabled={row.disabled} onPress={row.onPress} style={({ pressed }) => [styles.row, (pressed || row.disabled) && styles.pressed]}>
                <View style={[styles.icon, { backgroundColor: row.colors.background }]}><MaterialCommunityIcons name={row.icon} size={22} color={row.destructive ? theme.accent : row.colors.text} /></View>
                <View style={styles.copy}><AppText style={[styles.title, row.destructive && { color: theme.accent }]}>{row.title}</AppText><AppText variant="caption" tone="secondary" style={styles.description}>{row.description}</AppText></View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
              </Pressable>
            </Fragment>)}
          </View>
        </View>)}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 },
  content: { gap: spacing.xl },
  section: { gap: spacing.xs },
  sectionTitle: { fontWeight: '700', paddingHorizontal: spacing.xs },
  card: { borderWidth: 1, borderRadius: radius.xl, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 74, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontWeight: '700' },
  description: { fontSize: 12, lineHeight: 18 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 68, marginRight: spacing.md },
  pressed: { opacity: 0.7 },
});
