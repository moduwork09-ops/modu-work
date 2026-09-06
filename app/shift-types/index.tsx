import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, PrimaryButton, Screen } from '../../src/components';
import { calendarShiftColors, radius, spacing, useAppTheme } from '../../src/constants';
import { formatShiftTime } from '../../src/features/shift-settings/mockData';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SettingsGroup, SettingsIcon, SettingsRow } from '../../src/features/settings/SettingsGroup';
import { selectEditableShiftTypes } from '../../src/features/shifts/activeShiftTypes';

export default function ShiftTypesScreen() {
  const router = useRouter();
  const { setup } = useLocalSearchParams<{ setup?: string }>();
  const isSetupFlow = setup === 'true';
  const insets = useSafeAreaInsets();
  const { shiftTypes, shiftPattern, patternHistory, shiftDateOverrides } = useShiftSchedule();
  const editableShiftTypes = selectEditableShiftTypes({ shiftTypes, shiftPattern, patternHistory, shiftDateOverrides });

  return (
    <Screen style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]}>
        <Header title="근무유형" onBack={() => router.canGoBack() ? router.back() : router.replace(isSetupFlow ? '/onboarding' : '/(tabs)/my')} />
        {isSetupFlow ? <AppText variant="caption" tone="secondary" style={styles.progress}>1 / 3 · 근무유형</AppText> : null}
        <AppText tone="secondary" style={styles.description}>
          {'내 근무에 사용하는 유형을 설정하세요.\n근무시간은 나중에 언제든 변경할 수 있어요.'}
        </AppText>

        <View style={styles.list}>
          <AppText variant="caption" tone="secondary" style={styles.sectionTitle}>등록된 근무유형</AppText>
          <SettingsGroup>
            {editableShiftTypes.map((shiftType) => (
              <SettingsRow key={shiftType.id} title={shiftType.name} description={formatShiftTime(shiftType)}
                accessibilityLabel={shiftType.name + ' 수정'}
                onPress={() => router.push({ pathname: '/shift-types/[id]', params: { id: shiftType.id } })}
                leading={<View style={[styles.abbreviation, { backgroundColor: shiftType.color }]}>
                  <AppText variant="heading" style={{ color: shiftType.textColor }}>{shiftType.abbreviation}</AppText>
                </View>} />
            ))}
          </SettingsGroup>
        </View>

        <View style={styles.addGroup}>
          <SettingsGroup>
            <SettingsRow title="근무유형 추가" description="새로운 근무유형을 추가해요"
              leading={<SettingsIcon name="plus" colors={calendarShiftColors.training} />}
              onPress={() => router.push('/shift-types/new')} />
          </SettingsGroup>
        </View>
        {isSetupFlow ? <PrimaryButton label="다음: 근무패턴 설정" disabled={shiftTypes.length === 0}
          onPress={() => router.push({ pathname: '/shift-pattern', params: { setup: 'true' } })} style={styles.nextButton} /> : null}
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
  list: { gap: spacing.xs, marginTop: spacing.xl },
  sectionTitle: { fontWeight: '700', paddingHorizontal: spacing.xs },
  abbreviation: { alignItems: 'center', borderRadius: radius.md, minHeight: 48, justifyContent: 'center', width: 48, flexShrink: 0, paddingVertical: spacing.xxs },
  addGroup: { marginTop: spacing.xl },
  nextButton: { marginTop: spacing.xl },
});
