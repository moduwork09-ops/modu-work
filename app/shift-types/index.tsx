import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, PrimaryButton, Screen } from '../../src/components';
import { radius, spacing, useAppTheme } from '../../src/constants';
import { formatShiftTime } from '../../src/features/shift-settings/mockData';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { selectEditableShiftTypes } from '../../src/features/shifts/activeShiftTypes';

export default function ShiftTypesScreen() {
  const router = useRouter();
  const { setup } = useLocalSearchParams<{ setup?: string }>();
  const isSetupFlow = setup === 'true';
  const theme = useAppTheme();
  const { shiftTypes, shiftPattern, patternHistory, shiftDateOverrides } = useShiftSchedule();
  const editableShiftTypes = selectEditableShiftTypes({ shiftTypes, shiftPattern, patternHistory, shiftDateOverrides });

  return (
    <Screen style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Header title="근무유형" onBack={() => router.canGoBack() ? router.back() : router.replace('/onboarding')} />
        {isSetupFlow ? <AppText variant="caption" tone="secondary" style={styles.progress}>1 / 3 · 근무유형</AppText> : null}
        <AppText tone="secondary" style={styles.description}>
          {'내 근무에 사용하는 유형을 설정하세요.\n근무시간은 나중에 언제든 변경할 수 있어요.'}
        </AppText>

        <View style={styles.list}>
          {editableShiftTypes.map((shiftType) => (
            <Pressable key={shiftType.id} accessibilityLabel={`${shiftType.name} 수정`} onPress={() => router.push({ pathname: '/shift-types/[id]', params: { id: shiftType.id } })} style={({ pressed }) => [pressed && styles.pressed]}>
              <Card style={styles.shiftCard}>
                <View style={[styles.abbreviation, { backgroundColor: shiftType.color }]}>
                  <AppText variant="heading" style={{ color: shiftType.textColor }}>
                    {shiftType.abbreviation}
                  </AppText>
                </View>
                <View style={styles.shiftInfo}>
                  <AppText style={styles.shiftName}>{shiftType.name}</AppText>
                  <AppText variant="caption" tone="secondary">
                    {formatShiftTime(shiftType)}
                  </AppText>
                </View>
                <View style={[styles.colorDot, { backgroundColor: shiftType.color }]} />
                <MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} />
              </Card>
            </Pressable>
          ))}
        </View>

        <PrimaryButton label="+ 근무유형 추가" onPress={() => router.push('/shift-types/new')} style={styles.addButton} />
        {!isSetupFlow ? <PrimaryButton label="이 근무표 공유하기" onPress={() => router.push('/shift-presets/share' as never)} style={styles.shareButton} /> : null}
        {!isSetupFlow ? <PrimaryButton label="공유 코드로 근무표 받기" onPress={() => router.push('/shift-presets/receive' as never)} style={styles.shareButton} /> : null}
        {!isSetupFlow ? <PrimaryButton label="회사·기관에서 근무표 찾기" onPress={() => router.push('/shift-presets/search' as never)} style={styles.shareButton} /> : null}
        <PrimaryButton label="다음: 근무패턴 설정" disabled={shiftTypes.length === 0} onPress={() => router.push({ pathname: '/shift-pattern', params: isSetupFlow ? { setup: 'true' } : {} })} style={styles.nextButton} />
      </ScrollView>
    </Screen>
  );
}

export function Header({ title, onBack }: { title: string; onBack: () => void }) {
  const theme = useAppTheme();
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" onPress={onBack} style={styles.backButton}>
        <MaterialCommunityIcons name="chevron-left" size={28} color={theme.primary} />
      </Pressable>
      <AppText variant="heading" style={styles.headerTitle}>{title}</AppText>
      <View style={styles.backButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 },
  content: { paddingBottom: spacing.xxl },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  headerTitle: { textAlign: 'center' },
  backButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  description: { marginTop: spacing.lg },
  progress: { marginTop: spacing.sm },
  list: { gap: spacing.sm, marginTop: spacing.xl },
  shiftCard: { alignItems: 'center', flexDirection: 'row', padding: spacing.md },
  abbreviation: { alignItems: 'center', borderRadius: radius.md, height: 48, justifyContent: 'center', width: 48 },
  shiftInfo: { flex: 1, marginLeft: spacing.md },
  shiftName: { fontWeight: '700' },
  colorDot: { borderRadius: 6, height: 12, marginRight: spacing.sm, width: 12 },
  addButton: { marginTop: spacing.xl },
  shareButton: { marginTop: spacing.sm },
  nextButton: { marginTop: spacing.sm },
  pressed: { opacity: 0.8 },
});
