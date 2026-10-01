import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Screen } from '../src/components';
import { calendarShiftColors, radius, spacing, useAppTheme } from '../src/constants';
import { TimePickerSheet } from '../src/features/events/EventPickerSheets';
import { useNotificationSettings } from '../src/features/notifications/NotificationProvider';
import type { NotificationSettings } from '../src/features/notifications/notificationSettings';
import { Header } from './shift-types';

type Toggle = 'briefingEnabled' | 'briefingIncludeShift' | 'briefingIncludePersonal' | 'briefingIncludeShared' | 'briefingIncludeMemo' | 'briefingNotifyEmpty';

export default function DailyBriefingSettingsScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { settings, ready, saving, update, error } = useNotificationSettings();
  const [timeVisible, setTimeVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const disabled = !ready || saving || busy;
  const save = async (patch: Partial<NotificationSettings>) => {
    if (disabled) return;
    setBusy(true);
    try { await update(patch); }
    catch (cause) { Alert.alert('오늘의 브리핑', cause instanceof Error ? cause.message : '설정을 저장하지 못했어요.'); }
    finally { setBusy(false); }
  };
  const toggle = (field: Toggle, title: string, description?: string) => <View style={styles.row}>
    <View style={styles.copy}><AppText style={styles.title}>{title}</AppText>{description ? <AppText variant="caption" tone="secondary">{description}</AppText> : null}</View>
    <Switch accessibilityLabel={title} disabled={disabled} value={settings[field]} onValueChange={value => void save({ [field]: value })} trackColor={{ true: theme.primary }} />
  </View>;
  const divider = <View style={[styles.divider, { backgroundColor: theme.border }]} />;
  return <Screen style={styles.screen}>
    <Header title="오늘의 브리핑" onBack={() => router.canGoBack() ? router.back() : router.replace('/notification-settings' as never)} />
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]} showsVerticalScrollIndicator={false}>
      {error ? <AppText variant="caption" tone="secondary">{error}</AppText> : null}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {toggle('briefingEnabled', '오늘의 브리핑', '매일 설정한 시각에 오늘을 알려드려요')}
        {divider}
        <Pressable accessibilityRole="button" disabled={disabled} onPress={() => setTimeVisible(true)} style={styles.row}>
          <View style={styles.copy}><AppText style={styles.title}>브리핑 시간</AppText></View>
          <AppText style={{ color: theme.primary, fontWeight: '700' }}>{settings.briefingTime}</AppText>
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.section}>
        <AppText variant="caption" tone="secondary" style={styles.sectionTitle}>포함할 항목</AppText>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {toggle('briefingIncludeShift', '근무')}{divider}
          {toggle('briefingIncludePersonal', '개인 일정')}{divider}
          {toggle('briefingIncludeShared', '공동 일정')}{divider}
          {toggle('briefingIncludeMemo', '메모')}
        </View>
      </View>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {toggle('briefingNotifyEmpty', '일정 없는 날에도 알림', '근무와 일정, 메모가 모두 없는 날에도 받아요')}
      </View>
      <View style={[styles.notice, { backgroundColor: calendarShiftColors.annualLeave.background }]}>
        <MaterialCommunityIcons name="weather-sunny" size={20} color={calendarShiftColors.annualLeave.text} />
        <AppText variant="caption" tone="secondary" style={styles.copy}>앱을 열 때 앞으로 30일의 브리핑을 갱신해요. 기기 알림 권한과 절전 설정에 따라 도착 시간이 달라질 수 있어요.</AppText>
      </View>
    </ScrollView>
    <TimePickerSheet visible={timeVisible} title="브리핑 시간" value={settings.briefingTime} onClose={() => setTimeVisible(false)} onConfirm={value => { setTimeVisible(false); void save({ briefingTime: value }); }} />
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 },
  content: { paddingTop: spacing.lg, gap: spacing.lg },
  section: { gap: spacing.xs },
  sectionTitle: { fontWeight: '700', paddingHorizontal: spacing.xs },
  card: { borderWidth: 1, borderRadius: radius.xl, overflow: 'hidden' },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  copy: { flex: 1, gap: 2 },
  title: { fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.md },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg },
});
