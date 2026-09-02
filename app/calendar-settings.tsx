import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { Header } from './shift-types';
import { useCalendarDisplaySettings } from '../src/features/calendar/useCalendarDisplaySettings';
import type { CalendarDisplaySettings } from '../src/features/calendar/calendarDisplaySettings';
const sections = [
  { title: '월간 캘린더', rows: [
    ['showHolidayNames', '공휴일명 표시', '날짜 셀과 상세에서 이름을 표시해요'],
    ['showPersonalEvents', '개인 일정 표시', '날짜 셀에 개인 일정을 표시해요'],
    ['showSharedEvents', '공동 일정 표시', '함께 만든 일정을 캘린더에 표시해요'],
    ['showOvertime', '초과근무 표시', '날짜 셀에 초과근무를 표시해요'],
    ['showEventTime', '일정 시간 표시', '개인·공동 일정 제목 앞에 시간을 표시해요'],
  ] },
  { title: '월간 메모', rows: [
    ['showMonthlyMemoCard', '이번 달 메모 카드 표시', '캘린더 아래에 월간 메모를 표시해요'],
  ] },
] as const;
export default function CalendarSettingsScreen() {
  const router = useRouter(); const theme = useAppTheme(); const insets = useSafeAreaInsets();
  const { settings, ready, saving, error, reload, update } = useCalendarDisplaySettings();
  const change = async (patch: Partial<CalendarDisplaySettings>) => { if (!await update(patch)) Alert.alert('설정을 저장하지 못했어요.', '다시 시도해 주세요.'); };
  return <Screen style={styles.screen}>
    <Header title="캘린더 설정" onBack={() => router.canGoBack() ? router.back() : router.replace('/settings' as never)} />
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]}>
      {error ? <Pressable onPress={() => void reload()}><AppText tone="secondary">설정을 불러오지 못했어요. 눌러서 다시 시도하세요.</AppText></Pressable> : null}
      <View style={styles.section}><AppText variant="caption" tone="secondary" style={styles.sectionTitle}>한 주 시작 요일</AppText>
        <View style={[styles.segment, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {([0, 1] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: settings.weekStartsOn === value, disabled: !ready || saving }} disabled={!ready || saving} onPress={() => void change({ weekStartsOn: value })} style={[styles.choice, settings.weekStartsOn === value && { backgroundColor: theme.primary }]}><AppText style={{ color: settings.weekStartsOn === value ? theme.surface : theme.text, fontWeight: '700' }}>{value === 0 ? '일요일' : '월요일'}</AppText></Pressable>)}
        </View>
      </View>
      {sections.map(section => <View key={section.title} style={styles.section}><AppText variant="caption" tone="secondary" style={styles.sectionTitle}>{section.title}</AppText>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>{section.rows.map(([key, title, description], index) => <Fragment key={key}>
          {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.border }]} /> : null}
          <View style={styles.row}><View style={styles.copy}><AppText style={styles.title}>{title}</AppText><AppText variant="caption" tone="secondary" style={styles.description}>{description}</AppText></View><Switch accessibilityLabel={title} value={settings[key]} disabled={!ready || saving} onValueChange={value => void change({ [key]: value })} trackColor={{ true: theme.primary }} thumbColor={brandColors.white} /></View>
        </Fragment>)}</View>
      </View>)}
    </ScrollView>
  </Screen>;
}
const styles = StyleSheet.create({ screen: { paddingTop: spacing.sm, paddingBottom: 0 }, content: { paddingTop: spacing.lg, gap: spacing.xl }, section: { gap: spacing.xs }, sectionTitle: { fontWeight: '700', paddingHorizontal: spacing.xs }, card: { borderWidth: 1, borderRadius: radius.xl, overflow: 'hidden' }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 74, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }, copy: { flex: 1, minWidth: 0, gap: 2 }, title: { fontWeight: '700' }, description: { fontSize: 12, lineHeight: 18 }, divider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.md }, segment: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.xl, padding: spacing.xs, gap: spacing.xs }, choice: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md } });
