import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../../components';
import { brandColors, radius, spacing, useAppTheme } from '../../constants';
import { getCalendarDateKind, getKoreanHoliday } from '../calendar/koreanHolidays';
import { getShiftPatternHistoryEntryForDate, type ShiftScheduleInput } from './shiftSchedule';
import { getTeamStatusesForDate, orderTeamsForDisplay, type TeamShiftStatus } from './teamScheduleCalculator';
import { createTeamRotationMetadata, DAY_NIGHT_OFF_REST_TEAM_ROTATION_TEMPLATE, isDayNightOffRestPatternCompatible, type TeamRotationMetadata } from './teamRotation';

type Props = {
  visible: boolean;
  selectedDate: string;
  configurationDate: string;
  displayedMonth: { year: number; month: number };
  schedule: ShiftScheduleInput;
  onClose: () => void;
  onSaveTeamRotation: (date: string, teamRotation: TeamRotationMetadata) => Promise<boolean>;
};

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

function formatDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(year, month - 1, day, 12);
  return `${month}월 ${day}일 ${weekdays[value.getDay()]}요일`;
}

function TeamStatusList({ statuses }: { statuses: TeamShiftStatus[] }) {
  const theme = useAppTheme();
  return <View style={[styles.statusList, { borderColor: theme.border }]}>{statuses.map((status, index) => <View key={status.teamId} style={[styles.statusRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }, status.isMyTeam && styles.myTeamRow]}><View style={styles.teamLabelRow}><AppText style={styles.teamLabel}>{status.teamLabel}</AppText>{status.isMyTeam ? <View style={styles.myTeamBadge}><AppText variant="caption" style={styles.myTeamBadgeText}>내 팀</AppText></View> : null}</View><View style={styles.shiftStatus}><View style={[styles.shiftBadge, { backgroundColor: status.shiftType.color }]}><AppText numberOfLines={1} style={{ color: status.shiftType.textColor, fontWeight: '700' }}>{status.shiftType.name}</AppText></View>{status.shiftType.startTime && status.shiftType.endTime ? <AppText variant="caption" tone="secondary">{status.shiftType.startTime}~{status.shiftType.endTime}</AppText> : null}</View></View>)}</View>;
}

export function TeamScheduleSheet({ visible, selectedDate, configurationDate, displayedMonth, schedule, onClose, onSaveTeamRotation }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'today' | 'month'>('today');
  const [detailDate, setDetailDate] = useState<string>();
  const [setupStep, setSetupStep] = useState<'confirm' | 'team'>();
  const [selectedTeamId, setSelectedTeamId] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTab('today');
    setDetailDate(undefined);
    setSetupStep(undefined);
    setSelectedTeamId(undefined);
    setSaving(false);
  }, [visible]);

  const monthDates = useMemo(() => Array.from({ length: new Date(displayedMonth.year, displayedMonth.month, 0).getDate() }, (_, index) => `${displayedMonth.year}-${String(displayedMonth.month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`), [displayedMonth.month, displayedMonth.year]);
  const monthRows = useMemo(() => monthDates.map((date) => ({ date, result: getTeamStatusesForDate(date, schedule) })), [monthDates, schedule]);
  const monthTeams = useMemo(() => {
    const teams = new Map<string, string>();
    monthRows.forEach(({ result }) => { if (result.status === 'available') result.statuses.forEach((status) => teams.set(status.teamId, status.teamLabel)); });
    return orderTeamsForDisplay([...teams].map(([id, label]) => ({ id, label })));
  }, [monthRows]);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const visibleDate = detailDate ?? selectedDate;
  const result = getTeamStatusesForDate(visibleDate, schedule);

  const confirmSupportedPattern = () => {
    const entry = getShiftPatternHistoryEntryForDate(configurationDate, schedule.patternHistory);
    const pattern = entry?.pattern ?? schedule.shiftPattern;
    if (!isDayNightOffRestPatternCompatible(pattern, schedule.shiftTypes)) {
      Alert.alert('팀 정보를 연결할 수 없어요.', '현재 근무 패턴과 4조 주·야·비·휴 순환이 일치하지 않아요.');
      return;
    }
    setSetupStep('team');
  };

  const saveTeam = async () => {
    if (!selectedTeamId || saving) return;
    const metadata = createTeamRotationMetadata(DAY_NIGHT_OFF_REST_TEAM_ROTATION_TEMPLATE, selectedTeamId, 'user_configured');
    if (!metadata) return;
    setSaving(true);
    if (!await onSaveTeamRotation(configurationDate, metadata)) {
      setSaving(false);
      Alert.alert('팀 정보를 저장하지 못했어요.', '다시 시도해 주세요.');
      return;
    }
    setSetupStep(undefined);
    setSelectedTeamId(undefined);
    setSaving(false);
  };

  const renderUnavailable = () => <View style={styles.empty}><MaterialCommunityIcons name="account-group-outline" size={36} color={theme.textSecondary} /><AppText style={styles.emptyTitle}>이 근무표에서는 아직 다른 팀 근무를 계산할 수 없어요.</AppText><AppText variant="caption" tone="secondary" style={styles.emptyCopy}>팀 순환 정보가 있는 근무 패턴에서 사용할 수 있습니다.</AppText><Pressable accessibilityRole="button" onPress={() => setSetupStep('confirm')} style={[styles.setupButton, { backgroundColor: theme.primary }]}><AppText style={{ color: brandColors.white, fontWeight: '700' }}>팀 정보 설정</AppText></Pressable></View>;

  return <Modal transparent animationType="slide" visible={visible} onRequestClose={() => setupStep ? setSetupStep(undefined) : detailDate ? setDetailDate(undefined) : onClose()}><View style={styles.overlay}><View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: spacing.md + insets.bottom }]}><View style={styles.header}><Pressable accessibilityLabel={detailDate || setupStep ? '뒤로' : '닫기'} onPress={() => setupStep ? setSetupStep(undefined) : detailDate ? setDetailDate(undefined) : onClose()} style={styles.iconButton}><MaterialCommunityIcons name={detailDate || setupStep ? 'chevron-left' : 'close'} size={24} color={theme.text} /></Pressable><AppText variant="heading">팀별 근무 현황</AppText><View style={styles.iconButton} /></View>
    {setupStep === 'confirm' ? <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.setupContent}><AppText style={styles.setupTitle}>현재 근무가 4조 주·야·비·휴 순환인가요?</AppText><AppText tone="secondary" style={styles.patternCopy}>주간 → 야간 → 비번 → 휴무</AppText><View style={styles.actions}><Pressable onPress={() => setSetupStep(undefined)} style={[styles.actionButton, { borderColor: theme.border }]}><AppText style={styles.actionText}>아니요</AppText></Pressable><Pressable onPress={confirmSupportedPattern} style={[styles.actionButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}><AppText style={[styles.actionText, { color: brandColors.white }]}>맞아요</AppText></Pressable></View></ScrollView>
      : setupStep === 'team' ? <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.setupContent}><AppText style={styles.setupTitle}>내 팀을 선택하세요</AppText><View accessibilityRole="radiogroup" style={styles.teamChoices}>{DAY_NIGHT_OFF_REST_TEAM_ROTATION_TEMPLATE.teams.map((team) => { const selected = selectedTeamId === team.id; return <Pressable key={team.id} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setSelectedTeamId(team.id)} style={[styles.teamChoice, { borderColor: theme.border }, selected && { backgroundColor: theme.primary, borderColor: theme.primary }]}><AppText style={{ color: selected ? brandColors.white : theme.text, fontWeight: '700' }}>{team.label}</AppText></Pressable>; })}</View><Pressable disabled={!selectedTeamId || saving} onPress={() => void saveTeam()} style={[styles.saveButton, { backgroundColor: theme.primary }, (!selectedTeamId || saving) && styles.disabled]}><AppText style={{ color: brandColors.white, fontWeight: '700' }}>{saving ? '저장 중...' : '완료'}</AppText></Pressable></ScrollView>
      : <><View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: theme.background }]}>{(['today', 'month'] as const).map((item) => { const selected = tab === item; return <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => { setTab(item); setDetailDate(undefined); }} style={[styles.tab, selected && { backgroundColor: theme.primary }]}><AppText style={{ color: selected ? brandColors.white : theme.textSecondary, fontWeight: '700' }}>{item === 'today' ? '오늘' : '월간'}</AppText></Pressable>; })}</View>
        {tab === 'today' || detailDate ? <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}><AppText style={styles.dateTitle}>{formatDate(visibleDate)}</AppText>{result.status === 'available' ? <TeamStatusList statuses={result.statuses} /> : renderUnavailable()}</ScrollView>
          : <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.monthContent}>
            <View style={[styles.monthHeader, { borderBottomColor: theme.border }]}><View style={styles.monthDate} />{monthTeams.map((team) => <View key={team.id} style={styles.monthColumn}><AppText numberOfLines={1} style={styles.monthHeaderText}>{team.label}</AppText></View>)}</View>
            {monthRows.map(({ date, result: dayResult }) => { const kind = getCalendarDateKind(date); const holiday = getKoreanHoliday(date); return <Pressable key={date} accessibilityRole="button" accessibilityLabel={`${formatDate(date)} 팀별 근무 상세`} onPress={() => setDetailDate(date)} style={[styles.monthRow, { borderBottomColor: theme.border }, date === today && styles.todayMonthRow]}>
              <View style={styles.monthDate}><AppText style={[styles.monthDay, { color: kind === 'holiday' || kind === 'sunday' ? '#E53935' : kind === 'saturday' ? '#1976D2' : theme.text }]}>{Number(date.slice(5, 7))}/{Number(date.slice(-2))} {weekdays[new Date(`${date}T12:00:00`).getDay()]}</AppText>{holiday ? <AppText numberOfLines={1} style={styles.monthHoliday}>{holiday.name}</AppText> : null}</View>
              {monthTeams.map((team) => { const status = dayResult.status === 'available' ? dayResult.statuses.find((item) => item.teamId === team.id) : undefined; return <View key={team.id} style={styles.monthColumn}>{status ? <View style={[styles.monthBadge, { backgroundColor: status.shiftType.color }, status.isMyTeam && styles.myMonthBadge]}><AppText numberOfLines={1} style={[styles.monthBadgeText, { color: status.shiftType.textColor }]}>{status.shiftType.abbreviation}</AppText></View> : <AppText variant="caption" tone="secondary">–</AppText>}</View>; })}
            </Pressable>; })}
          </ScrollView>}
      </>}
  </View></View></Modal>;
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: 'rgba(0,0,0,0.35)', flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '88%', minHeight: '58%', padding: spacing.md },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  tabs: { borderRadius: radius.md, flexDirection: 'row', marginTop: spacing.sm, padding: spacing.xxs },
  bodyScroll: { flexShrink: 1 },
  tab: { alignItems: 'center', borderRadius: radius.sm, flex: 1, justifyContent: 'center', minHeight: 40 },
  scrollContent: { paddingBottom: spacing.xl },
  dateTitle: { fontWeight: '700', marginVertical: spacing.md, textAlign: 'center' },
  statusList: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  statusRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 64, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  myTeamRow: { backgroundColor: '#F5F9FF' },
  teamLabelRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  teamLabel: { fontWeight: '700' },
  myTeamBadge: { backgroundColor: '#DCEBFA', borderRadius: radius.xl, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  myTeamBadgeText: { color: brandColors.deepNavy, fontWeight: '700' },
  shiftStatus: { alignItems: 'flex-end', flexShrink: 1, gap: 3 },
  shiftBadge: { borderRadius: radius.sm, maxWidth: 180, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  empty: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xxl },
  emptyTitle: { fontWeight: '700', marginTop: spacing.md, textAlign: 'center' },
  emptyCopy: { marginTop: spacing.xs, textAlign: 'center' },
  setupButton: { borderRadius: radius.md, marginTop: spacing.lg, minHeight: 46, justifyContent: 'center', paddingHorizontal: spacing.lg },
  setupContent: { paddingBottom: spacing.xl, paddingTop: spacing.lg },
  setupTitle: { fontWeight: '700', textAlign: 'center' },
  patternCopy: { marginTop: spacing.sm, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  actionButton: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48 },
  actionText: { fontWeight: '700' },
  teamChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  teamChoice: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, minHeight: 48, justifyContent: 'center', width: '47%' },
  saveButton: { alignItems: 'center', borderRadius: radius.md, justifyContent: 'center', marginTop: spacing.lg, minHeight: 48 },
  disabled: { opacity: 0.5 },
  monthContent: { paddingBottom: spacing.xl, paddingTop: spacing.sm },
  monthHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 34 },
  monthHeaderText: { fontSize: 11, fontWeight: '700' },
  monthRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 42, paddingVertical: 3 },
  todayMonthRow: { backgroundColor: '#F5F9FF' },
  monthDate: { justifyContent: 'center', paddingRight: 2, width: 61 },
  monthDay: { fontSize: 11, fontWeight: '700' },
  monthHoliday: { color: '#E53935', fontSize: 9 },
  monthColumn: { alignItems: 'center', flex: 1, minWidth: 0 },
  monthBadge: { alignItems: 'center', borderRadius: radius.sm, justifyContent: 'center', minHeight: 25, width: 25 },
  myMonthBadge: { borderColor: brandColors.deepNavy, borderWidth: 1.5 },
  monthBadgeText: { fontSize: 11, fontWeight: '700' },
});
