import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Screen } from '../src/components';
import { calendarShiftColors, radius, spacing, useAppTheme } from '../src/constants';
import { Header } from './shift-types';

const sections = [
  { title: '근무표', rows: [
    { title: '근무유형', description: '근무 이름과 색상을 관리해요', icon: 'palette-outline', colors: calendarShiftColors.training, href: '/shift-types' },
    { title: '근무패턴', description: '반복되는 근무 패턴을 관리해요', icon: 'calendar-sync-outline', colors: calendarShiftColors.offDuty, href: '/shift-pattern' },
    { title: '근무표 찾기 · 공유', description: '회사·기관 근무표를 찾거나 공유해요', icon: 'account-switch-outline', colors: calendarShiftColors.rest, href: '/shift-presets' },
  ] },
  { title: '급여', rows: [
    { title: '급여 설정', description: '기본급과 근무별 수당을 설정해요', icon: 'wallet-outline', colors: calendarShiftColors.annualLeave, href: '/salary-settings' },
  ] },
  { title: '계정', rows: [
    { title: '내 정보', description: '이름과 계정 정보를 확인해요', icon: 'account-outline', colors: calendarShiftColors.training, href: '/account' },
  ] },
] as const;

export default function SettingsScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  return <Screen style={styles.screen}>
    <Header title="환경설정" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/my')} />
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]}>
      {sections.map(section => <View key={section.title} style={styles.section}>
        <AppText variant="caption" tone="secondary" style={styles.sectionTitle}>{section.title}</AppText>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {section.rows.map((row, index) => <Fragment key={row.href}>
            {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.border }]} /> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={row.title} accessibilityHint={row.description} onPress={() => router.push(row.href as never)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={[styles.icon, { backgroundColor: row.colors.background }]}><MaterialCommunityIcons name={row.icon} size={22} color={row.colors.text} /></View>
              <View style={styles.copy}><AppText style={styles.title}>{row.title}</AppText><AppText variant="caption" tone="secondary" style={styles.description}>{row.description}</AppText></View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
            </Pressable>
          </Fragment>)}
        </View>
      </View>)}
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 },
  content: { paddingTop: spacing.lg, gap: spacing.xl },
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
