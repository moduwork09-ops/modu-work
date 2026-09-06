import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Screen } from '../../src/components';
import { calendarShiftColors, spacing } from '../../src/constants';
import { SettingsGroup, SettingsIcon, SettingsRow } from '../../src/features/settings/SettingsGroup';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { Header } from '../shift-types';

const sharingChoices = [
  { icon: 'share-variant-outline', title: '이 근무표 공유하기', description: '내 근무표를 다른 사람과 공유해요', href: '/shift-presets/share', colors: calendarShiftColors.annualLeave },
  { icon: 'ticket-confirmation-outline', title: '공유 코드로 근무표 받기', description: '다른 사람이 공유한 근무표를 받아요', href: '/shift-presets/receive', colors: calendarShiftColors.training },
  { icon: 'briefcase-search-outline', title: '회사 · 기관에서 근무표 찾기', description: '회사·기관 근무표를 찾아서 사용해요', href: '/shift-presets/search', colors: calendarShiftColors.rest },
] as const;

// The onboarding entry uses this route too; retain its four existing setup choices.
const setupChoices = [
  { icon: 'briefcase-search-outline', title: '회사·기관에서 찾기', description: '회사·기관명 또는 근무형태를 검색해요', href: '/shift-presets/search', colors: calendarShiftColors.rest },
  { icon: 'ticket-confirmation-outline', title: '공유 코드로 받기', description: '동료가 보내준 근무표를 불러와요', href: '/shift-presets/receive', colors: calendarShiftColors.training },
  { icon: 'view-grid-outline', title: '기본 프리셋', description: '주간·2교대·3교대 등에서 골라요', href: '/shift-presets/builtin', colors: calendarShiftColors.offDuty },
  { icon: 'pencil-outline', title: '직접 만들기', description: '내 근무형태와 패턴을 직접 만들어요', href: '/shift-types?setup=true', colors: calendarShiftColors.annualLeave },
] as const;

export default function ShiftPresetsEntryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hasCompletedSetup } = useShiftSchedule();
  const choices = hasCompletedSetup ? sharingChoices : setupChoices;
  return <Screen style={styles.screen}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]}>
      <Header title={hasCompletedSetup ? '근무표 찾기 · 공유' : '근무표 설정'}
        onBack={() => router.canGoBack() ? router.back() : router.replace(hasCompletedSetup ? '/(tabs)/my' : '/onboarding')} />
      <View style={styles.intro}>
        {!hasCompletedSetup ? <AppText variant="heading">근무표를 설정해볼까요?</AppText> : null}
        <AppText tone="secondary">{hasCompletedSetup
          ? '다른 사람의 근무표를 찾거나\n내 근무표를 공유할 수 있어요.'
          : '내게 맞는 방법을 선택해 주세요.'}</AppText>
      </View>
      <View style={styles.list}>
        <SettingsGroup>
          {choices.map(row => <SettingsRow key={row.href} title={row.title} description={row.description}
            leading={<SettingsIcon name={row.icon} colors={row.colors} />}
            onPress={() => router.push(row.href as never)} />)}
        </SettingsGroup>
      </View>
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 },
  content: { paddingBottom: spacing.xxl },
  intro: { gap: spacing.xs, marginTop: spacing.xl },
  list: { marginTop: spacing.xl },
});
