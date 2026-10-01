import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Screen } from '../src/components';
import { calendarShiftColors, radius, spacing, useAppTheme } from '../src/constants';
import { Header } from './shift-types';
import { useNotificationSettings } from '../src/features/notifications/NotificationProvider';
import { notificationLeadLabel, SHIFT_LEADS, PERSONAL_LEADS, type NotificationSettings } from '../src/features/notifications/notificationSettings';
import { openExactAlarmSettings, showsExactAlarmSettings } from '../src/features/notifications/exactAlarm';

type LeadField = 'shiftLeadMinutes' | 'personalEventLeadMinutes';
export default function NotificationSettingsScreen() {
  const router = useRouter(); const theme = useAppTheme(); const insets = useSafeAreaInsets();
  const { settings, ready, saving, permission, exactCapability, error, update, requestPermission, refresh } = useNotificationSettings();
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  const [picker, setPicker] = useState<LeadField | null>(null); const [busy, setBusy] = useState(false);
  const disabled = !ready || saving || busy;
  const act = async (action: () => Promise<void>) => { if (busy) return; setBusy(true); try { await action(); } catch (e) { Alert.alert('알림 설정', e instanceof Error ? e.message : '설정을 저장하지 못했어요. 다시 시도해 주세요.'); } finally { setBusy(false); } };
  const row = (title: string, description: string, icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'], right: ReactNode, onPress?: () => void) => <Pressable disabled={!onPress || disabled} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} style={styles.row}>
    <View style={[styles.icon, { backgroundColor: calendarShiftColors.annualLeave.background }]}><MaterialCommunityIcons name={icon} size={22} color={calendarShiftColors.annualLeave.text} /></View>
    <View style={styles.copy}><AppText style={styles.title}>{title}</AppText><AppText variant="caption" tone="secondary">{description}</AppText></View>{right}
  </Pressable>;
  const toggle = (field: 'enabled' | 'shiftEnabled' | 'personalEventEnabled', title: string, description: string, icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']) => row(title, description, icon, <Switch accessibilityLabel={title} value={settings[field]} disabled={disabled} onValueChange={value => void act(() => update({ [field]: value }))} trackColor={{ true: theme.primary }} />);
  const section = (title: string, content: ReactNode) => <View style={styles.section}><AppText variant="caption" tone="secondary" style={styles.sectionTitle}>{title}</AppText><View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>{content}</View></View>;
  const divider = <View style={[styles.divider, { backgroundColor: theme.border }]} />;
  return <Screen style={styles.screen}>
    <Header title="알림 설정" onBack={() => router.canGoBack() ? router.back() : router.replace('/settings' as never)} />
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]} showsVerticalScrollIndicator={false}>
      {error ? <Pressable onPress={refresh}><AppText tone="secondary">{error} 눌러서 다시 시도</AppText></Pressable> : null}
      {!permission ? <View style={[styles.notice, { backgroundColor: calendarShiftColors.training.background }]}><AppText>알림 권한을 허용하면 근무와 일정 알림을 받을 수 있어요.</AppText><Pressable disabled={disabled} onPress={() => void act(requestPermission)}><AppText style={{ color: theme.primary, fontWeight: '700' }}>알림 권한 허용</AppText></Pressable><Pressable onPress={() => void Linking.openSettings().catch(() => Alert.alert('기기 설정을 열지 못했어요.'))}><AppText variant="caption" tone="secondary">기기 알림 설정 열기</AppText></Pressable></View> : null}
      {showsExactAlarmSettings ? section('정확한 시간에 알림 받기', <View style={styles.notice}>
        <AppText style={styles.title}>{exactCapability === true ? '허용됨' : exactCapability === false ? '설정 필요' : '상태 확인 필요'}</AppText>
        <AppText variant="caption" tone="secondary">정확한 알림을 허용하면 일정 알림을 설정한 시간에 받을 수 있어요. 허용하지 않아도 알림은 동작하지만 Android 절전 정책에 따라 늦을 수 있어요.</AppText>
        {exactCapability !== true ? <Pressable accessibilityRole="button" disabled={disabled} onPress={() => void act(openExactAlarmSettings)}><AppText style={{ color: theme.primary, fontWeight: '700' }}>알람 및 리마인더 허용</AppText></Pressable> : null}
      </View>) : null}
      {section('전체', toggle('enabled', '알림 받기', '모든 로컬 알림을 한 번에 켜고 꺼요', 'bell-outline'))}
      {section('알림 항목', <>{toggle('shiftEnabled', '근무 시작 알림', '근무 시작 전에 알려드려요', 'briefcase-clock-outline')}{divider}{toggle('personalEventEnabled', '개인 일정 알림', '등록한 일정 전에 알려드려요', 'calendar-clock')}</>)}
      {section('하루 요약', row('오늘의 브리핑', '매일 하루를 정리해 알려드려요', 'weather-sunny', <View style={styles.value}><AppText variant="caption">{settings.briefingEnabled ? settings.briefingTime : '설정 안 함'}</AppText><MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} /></View>, () => router.push('/daily-briefing-settings' as never)))}
      {section('알림 시간', <>{(['shiftLeadMinutes', 'personalEventLeadMinutes'] as const).map((field, i) => <View key={field}>{i > 0 ? divider : null}{row(field === 'shiftLeadMinutes' ? '근무 시작 전' : '개인 일정 전', '알림을 받을 시간을 선택해요', 'clock-outline', <View style={styles.value}><AppText variant="caption">{notificationLeadLabel(settings[field])}</AppText><MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} /></View>, () => setPicker(field))}</View>)}</>)}
      <AppText variant="caption" tone="secondary">근무 시작·개인 일정 알림은 앞으로 14일을 갱신하며 시간 없는 일정과 공동 일정은 제외돼요. 오늘의 브리핑은 별도 설정에 따라 앞으로 30일을 갱신해요. 기기 절전 설정에 따라 알림이 늦어질 수 있어요.</AppText>
    </ScrollView>
    <Modal transparent animationType="slide" visible={picker !== null} onRequestClose={() => setPicker(null)}>
      <View style={styles.overlay}><View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: spacing.lg + insets.bottom }]}>
        <View style={styles.sheetHeader}><AppText variant="heading">{picker === 'shiftLeadMinutes' ? '근무 시작 전' : '개인 일정 전'}</AppText><Pressable accessibilityLabel="닫기" onPress={() => setPicker(null)}><MaterialCommunityIcons name="close" size={24} color={theme.text} /></Pressable></View>
        <ScrollView style={{ flexShrink: 1 }}>{(picker === 'shiftLeadMinutes' ? SHIFT_LEADS : PERSONAL_LEADS).map(minutes => <Pressable key={minutes} accessibilityRole="radio" accessibilityState={{ selected: picker !== null && settings[picker] === minutes }} disabled={disabled} onPress={() => { if (picker) { const field = picker; void act(async () => { await update({ [field]: minutes } as Partial<NotificationSettings>); setPicker(null); }); } }} style={styles.option}><MaterialCommunityIcons name={picker !== null && settings[picker] === minutes ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={theme.primary} /><AppText>{notificationLeadLabel(minutes)}</AppText></Pressable>)}</ScrollView>
      </View></View>
    </Modal>
  </Screen>;
}
const styles = StyleSheet.create({ screen: { paddingTop: spacing.sm, paddingBottom: 0 }, content: { paddingTop: spacing.lg, gap: spacing.xl }, section: { gap: spacing.xs }, sectionTitle: { fontWeight: '700', paddingHorizontal: spacing.xs }, card: { borderWidth: 1, borderRadius: radius.xl, overflow: 'hidden' }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 74, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }, icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1, gap: 2 }, title: { fontWeight: '700' }, divider: { height: StyleSheet.hairlineWidth, marginLeft: 68, marginRight: spacing.md }, value: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs }, notice: { padding: spacing.md, borderRadius: radius.lg, gap: spacing.sm }, overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' }, sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '80%' }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }, option: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', minHeight: 52 } });
