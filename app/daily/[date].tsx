import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Screen } from '../../src/components';
import { radius, spacing, useAppTheme } from '../../src/constants';
import { adjacentDailyDate, buildDailyItems, dailyWorkStatus, parseDailyDate, type DailyItem } from '../../src/features/calendar/dailyPagePresentation';
import { getKoreanHoliday } from '../../src/features/calendar/koreanHolidays';
import { useAuth } from '../../src/features/auth/AuthContext';
import { calculateDailyGaps, formatGapDuration } from '../../src/features/gaps/gapCalculator';
import { createMemoBusyEvents } from '../../src/features/memos/memoBusyEvents';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { getPreviousIsoDate, getShiftForDate, NO_ACTIVE_SCHEDULE_SHIFT_TYPE } from '../../src/features/shifts/shiftSchedule';
import { chooseTogetherHomeSpace } from '../../src/features/together/togetherHomePresentation';
import { createSharedEventCalendarItem, type SharedEventCalendarItem } from '../../src/features/together/sharedEventCalendarPresentation';
import { getTogetherSpaces, listSharedEvents } from '../../src/features/together/togetherServerData';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const SHARED_ACCENT = '#4C7A65';
const PERSONAL_ACCENT = '#466B8D';
const MEMO_ACCENT = '#82689A';
const GAP_ACCENT = '#AD644F';
function localToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function dateLabel(date: string) { const [y, m, d] = date.split('-').map(Number); return `${m}월 ${d}일 (${weekdays[new Date(y, m - 1, d, 12).getDay()]})`; }

export default function DailyPage() {
  const { date: rawDate } = useLocalSearchParams<{ date: string }>();
  const date = parseDailyDate(rawDate) ?? localToday();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { session } = useAuth();
  const owner = session?.user.id;
  const ownerRef = useRef(owner); ownerRef.current = owner;
  const dateRef = useRef(date); dateRef.current = date;
  const requestRef = useRef(0);
  const sharedNavigationRef = useRef(false);
  const schedule = useShiftSchedule();
  const [sharedEvents, setSharedEvents] = useState<SharedEventCalendarItem[]>([]);
  const [sharedOwner, setSharedOwner] = useState<string>();
  const [sharedError, setSharedError] = useState(false);

  useFocusEffect(useCallback(() => {
    const request = ++requestRef.current;
    let active = true;
    sharedNavigationRef.current = false;
    if (!owner) { setSharedEvents([]); setSharedOwner(undefined); return () => { active = false; }; }
    setSharedError(false);
    void getTogetherSpaces().then(async spaces => {
      const results = await Promise.all(spaces.map(space => listSharedEvents(space.id)));
      if (!active || request !== requestRef.current || owner !== ownerRef.current) return;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setSharedEvents(results.flat().map(event => createSharedEventCalendarItem(event, timezone)));
      setSharedOwner(owner);
    }).catch(() => {
      if (!active || request !== requestRef.current || owner !== ownerRef.current) return;
      setSharedEvents([]); setSharedOwner(owner); setSharedError(true);
    });
    return () => { active = false; if (requestRef.current === request) requestRef.current++; };
  }, [owner]));

  const previousDate = getPreviousIsoDate(date);
  const tomorrow = adjacentDailyDate(date, 1);
  const shift = getShiftForDate(date, schedule);
  const previousShift = getShiftForDate(previousDate, schedule);
  const tomorrowShift = getShiftForDate(tomorrow, schedule);
  const availableShared = sharedOwner === owner ? sharedEvents : [];
  const items = buildDailyItems({ date, shift, previousShift, memos: schedule.dateMemos[date] ?? [], personalEvents: schedule.personalEvents, sharedEvents: availableShared, sharedColor: SHARED_ACCENT });
  const tomorrowItems = buildDailyItems({ date: tomorrow, shift: tomorrowShift, previousShift: shift, memos: schedule.dateMemos[tomorrow] ?? [], personalEvents: schedule.personalEvents, sharedEvents: availableShared, sharedColor: SHARED_ACCENT });
  const gaps = calculateDailyGaps({ date, shifts: [previousDate, date].map(day => { const s = getShiftForDate(day, schedule); return { date: day, kind: s.kind, startTime: s.startTime, endTime: s.endTime }; }), personalEvents: createMemoBusyEvents(schedule.dateMemos, schedule.personalEvents) });
  const holiday = getKoreanHoliday(date);
  const hasSchedule = shift.id !== NO_ACTIVE_SCHEDULE_SHIFT_TYPE.id;
  const summaries = [
    { label: '오늘 일정', value: `${items.personalCount}개`, icon: 'calendar-outline' as const, tint: '#EAF2FA', accent: PERSONAL_ACCENT },
    { label: '함께하는 일정', value: `${items.sharedCount}개`, icon: 'account-multiple-outline' as const, tint: '#EDF4ED', accent: SHARED_ACCENT },
    { label: '메모', value: `${items.memos.length}개`, icon: 'note-text-outline' as const, tint: '#F2EDF7', accent: MEMO_ACCENT },
    { label: '오늘의 틈', value: formatGapDuration(gaps.totalGapMinutes), icon: 'clock-outline' as const, tint: '#FCEEE8', accent: GAP_ACCENT },
  ];

  const openCalendarEditor = (action: 'choose' | 'memo' | 'editMemo', memoId?: string) => router.push({ pathname: '/(tabs)/calendar', params: { notificationDate: date, notificationOpenId: String(Date.now()), dailyAction: action, ...(memoId ? { dailyMemoId: memoId } : {}) } });
  const openSharedCreator = async () => {
    if (sharedNavigationRef.current || !owner) return;
    sharedNavigationRef.current = true;
    const request = requestRef.current;
    let navigated = false;
    try {
      const space = chooseTogetherHomeSpace(await getTogetherSpaces());
      if (request !== requestRef.current || owner !== ownerRef.current || date !== dateRef.current) return;
      if (!space) { Alert.alert('공동 일정', '함께 탭에서 함께할 사람을 먼저 설정해 주세요.'); return; }
      router.push({ pathname: '/together-event-create', params: { spaceId: space.id, date } });
      navigated = true;
    } catch {
      if (request === requestRef.current && owner === ownerRef.current) Alert.alert('공동 일정', '함께 공간을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally { if (!navigated) sharedNavigationRef.current = false; }
  };
  const openItem = (item: DailyItem) => {
    if (!item.target) return;
    if (item.target.kind === 'memo') openCalendarEditor('editMemo', item.target.id);
    else if (item.target.kind === 'shared') {
      if (item.target.spaceId) router.push({ pathname: '/together-event-detail', params: { eventId: item.target.id, spaceId: item.target.spaceId } });
      else router.push({ pathname: '/events/[id]', params: { id: item.target.id } });
    }
    else router.push({ pathname: '/events/[id]', params: { id: item.target.id } });
  };

  return <Screen style={styles.screen}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
    <View style={styles.topBar}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" onPress={() => router.back()} style={styles.iconButton}><MaterialCommunityIcons name="arrow-left" size={24} color={theme.primary} /></Pressable>
      <AppText style={[styles.headerTitle, { color: theme.primary }]}>데일리 브리핑</AppText><View style={styles.iconButton} />
    </View>
    <View style={styles.dateNavigation}>
      <Pressable accessibilityRole="button" accessibilityLabel="전날" onPress={() => router.setParams({ date: adjacentDailyDate(date, -1) })} style={styles.iconButton}><MaterialCommunityIcons name="chevron-left" size={28} color={theme.primary} /></Pressable>
      <AppText style={[styles.dateTitle, { color: theme.primary }]}>{dateLabel(date)}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="다음날" onPress={() => router.setParams({ date: tomorrow })} style={styles.iconButton}><MaterialCommunityIcons name="chevron-right" size={28} color={theme.primary} /></Pressable>
    </View>
    <AppText tone="secondary" style={styles.greeting}>좋은 하루 보내세요 ☀️{holiday ? `  ·  ${holiday.name}` : ''}</AppText>

    <View style={[styles.workCard, { backgroundColor: `${shift.color}24`, borderColor: `${shift.color}68` }]}>
      <View style={styles.workHeader}><AppText style={styles.workHeading}>오늘의 근무</AppText><View style={[styles.workIcon, { backgroundColor: theme.surface }]}><MaterialCommunityIcons name={!hasSchedule ? 'calendar-blank-outline' : shift.kind === 'rest' ? 'coffee-outline' : 'briefcase-clock-outline'} size={22} color={theme.primary} /></View></View>
      <View style={styles.workRow}><View style={[styles.shiftBadge, { backgroundColor: shift.color }]}><AppText style={{ color: shift.textColor, fontWeight: '700' }}>{hasSchedule ? shift.name : '근무 없음'}</AppText></View>{hasSchedule && shift.kind === 'work' && shift.startTime && shift.endTime ? <AppText style={[styles.workTime, { color: theme.primary }]}>{shift.startTime} ~ {shift.endTime < shift.startTime ? `다음날 ${shift.endTime}` : shift.endTime}</AppText> : null}</View>
      <AppText tone="secondary" style={styles.workStatus}>{hasSchedule ? dailyWorkStatus(date, shift, new Date()) : '적용된 근무표가 없어요.'}</AppText>
    </View>

    <View style={styles.summaryRow}>{summaries.map(summary => <View key={summary.label} style={[styles.summaryChip, { backgroundColor: summary.tint }]}><View style={[styles.summaryIcon, { backgroundColor: theme.surface }]}><MaterialCommunityIcons name={summary.icon} size={19} color={summary.accent} /></View><View style={styles.summaryCopy}><AppText variant="caption" style={styles.summaryLabel}>{summary.label}</AppText><AppText style={[styles.summaryValue, { color: summary.accent }]}>{summary.value}</AppText></View></View>)}</View>

    <View style={styles.sectionHeader}><AppText variant="heading">오늘의 타임라인</AppText></View>
    <View style={styles.quickActions}>
      <Pressable accessibilityRole="button" onPress={() => openCalendarEditor('choose')} style={[styles.quickAction, { backgroundColor: '#EAF2FA' }]}><MaterialCommunityIcons name="calendar-plus" size={17} color={PERSONAL_ACCENT} /><AppText style={[styles.quickActionText, { color: PERSONAL_ACCENT }]}>+ 일정</AppText></Pressable>
      <Pressable accessibilityRole="button" onPress={() => openCalendarEditor('memo')} style={[styles.quickAction, { backgroundColor: '#F2EDF7' }]}><MaterialCommunityIcons name="note-plus-outline" size={17} color={MEMO_ACCENT} /><AppText style={[styles.quickActionText, { color: MEMO_ACCENT }]}>+ 메모</AppText></Pressable>
      <Pressable accessibilityRole="button" onPress={() => void openSharedCreator()} style={[styles.quickAction, { backgroundColor: '#EDF4ED' }]}><MaterialCommunityIcons name="account-multiple-plus-outline" size={17} color={SHARED_ACCENT} /><AppText style={[styles.quickActionText, { color: SHARED_ACCENT }]}>+ 함께</AppText></Pressable>
    </View>
    {items.untimed.length ? <View style={[styles.allDayBlock, { backgroundColor: theme.surface, borderColor: theme.border }]}><AppText style={styles.blockTitle}>하루 일정</AppText>{items.untimed.map(item => <DailyRow key={item.id} item={item} onPress={() => openItem(item)} />)}</View> : null}
    <View style={[styles.timeline, { borderLeftColor: theme.border }]}>{items.timed.length ? items.timed.map(item => <DailyRow key={item.id} item={item} onPress={() => openItem(item)} timed />) : <View style={styles.emptyTimeline}><AppText style={styles.emptyTimelineTitle}>{items.untimed.length ? '시간이 정해진 일정이 없어요.' : '오늘은 등록된 일정이 없어요.'}</AppText><AppText tone="secondary">{items.untimed.length ? '하루 일정은 위에서 확인할 수 있어요.' : '여유롭게 하루를 보내보세요.'}</AppText><Pressable accessibilityRole="button" onPress={() => openCalendarEditor('choose')} style={[styles.emptyAction, { backgroundColor: '#EAF2FA' }]}><AppText style={{ color: PERSONAL_ACCENT, fontWeight: '700' }}>+ 일정 추가</AppText></Pressable></View>}</View>

    <View style={styles.sectionHeader}><AppText variant="heading">오늘의 틈</AppText><AppText style={{ color: GAP_ACCENT, fontWeight: '700' }}>총 {formatGapDuration(gaps.totalGapMinutes)}</AppText></View>
    {gaps.gaps.length ? gaps.gaps.map(gap => <View key={`${gap.startTime}-${gap.endTime}`} style={styles.gapRow}><MaterialCommunityIcons name="leaf" size={19} color={SHARED_ACCENT} /><AppText style={styles.gapTime}>{gap.startTime} ~ {gap.endTime}</AppText><AppText style={{ color: SHARED_ACCENT, fontWeight: '700' }}>{formatGapDuration(gap.durationMinutes)}</AppText></View>) : <AppText tone="secondary" style={styles.emptyText}>오늘은 여유 시간이 많지 않아요.</AppText>}

    <View style={styles.sectionHeader}><AppText variant="heading">오늘의 메모 ({items.memos.length})</AppText><Pressable accessibilityRole="button" onPress={() => openCalendarEditor('memo')} style={styles.sectionAction}><AppText style={{ color: MEMO_ACCENT, fontWeight: '700' }}>+ 메모 추가</AppText></Pressable></View>
    {items.memos.length ? items.memos.map(memo => <Pressable accessibilityRole="button" key={memo.id} onPress={() => openCalendarEditor('editMemo', memo.id)} style={styles.memoRow}><MaterialCommunityIcons name="note-text-outline" size={19} color={MEMO_ACCENT} /><AppText numberOfLines={2} style={styles.memoText}>{memo.text}</AppText><MaterialCommunityIcons name="chevron-right" size={20} color={MEMO_ACCENT} /></Pressable>) : <AppText tone="secondary" style={styles.emptyText}>등록된 메모가 없어요.</AppText>}

    <Pressable accessibilityRole="button" accessibilityLabel={`내일 미리보기, ${dateLabel(tomorrow)}, ${tomorrowShift.name}, 일정 ${tomorrowItems.personalCount + tomorrowItems.sharedCount}개, 다음날 보기`} onPress={() => router.setParams({ date: tomorrow })} style={[styles.tomorrowCard, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.tomorrowHeader}><AppText style={styles.blockTitle}>내일 미리보기</AppText><MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} /></View><AppText variant="caption" tone="secondary" style={styles.tomorrowDate}>{dateLabel(tomorrow)}</AppText><View style={styles.tomorrowSummary}><View style={[styles.tomorrowBadge, { backgroundColor: tomorrowShift.color }]}><AppText style={{ color: tomorrowShift.textColor, fontWeight: '700' }}>{tomorrowShift.id === NO_ACTIVE_SCHEDULE_SHIFT_TYPE.id ? '근무 없음' : tomorrowShift.name}</AppText></View>{tomorrowShift.kind === 'work' && tomorrowShift.startTime && tomorrowShift.endTime ? <AppText variant="caption" tone="secondary">{tomorrowShift.startTime} ~ {tomorrowShift.endTime}</AppText> : null}<AppText variant="caption" tone="secondary" style={styles.tomorrowCount}>일정 {tomorrowItems.personalCount + tomorrowItems.sharedCount}개</AppText></View></Pressable>
    {sharedError ? <AppText variant="caption" tone="secondary" style={styles.sharedError}>함께 일정을 불러오지 못했어요. 화면을 다시 열면 재시도해요.</AppText> : null}
  </ScrollView></Screen>;
}

function DailyRow({ item, onPress, timed = false }: { item: DailyItem; onPress: () => void; timed?: boolean }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole={item.target ? 'button' : undefined} onPress={item.target ? onPress : undefined} style={timed ? styles.timelineRow : styles.untimedRow}>
    {timed ? <AppText variant="caption" style={[styles.timelineTime, { color: theme.textSecondary }]}>{item.time}</AppText> : null}
    <View style={[styles.timelineDot, { backgroundColor: item.color, borderColor: theme.surface }]} />
    <View style={styles.timelineCopy}><View style={styles.timelineTitleRow}>
      {item.kind === 'shared' ? <MaterialCommunityIcons name="account-multiple-outline" size={17} color={SHARED_ACCENT} /> : null}
      <AppText style={styles.timelineTitle}>{item.title}</AppText>
      {item.kind === 'shared' ? <AppText variant="caption" style={styles.sharedBadge}>함께</AppText> : item.kind === 'personal' ? <AppText variant="caption" style={[styles.kindLabel, { color: PERSONAL_ACCENT }]}>개인</AppText> : <AppText variant="caption" style={[styles.kindLabel, { color: theme.textSecondary }]}>근무</AppText>}
    </View>{item.detail ? <AppText variant="caption" tone="secondary" numberOfLines={2} style={styles.timelineDetail}>{item.detail}</AppText> : null}</View>
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xs, paddingBottom: 0 },
  content: { gap: spacing.sm },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headerTitle: { fontSize: 19, fontWeight: '700', lineHeight: 26 },
  iconButton: { alignItems: 'center', justifyContent: 'center', width: 44, height: 44 },
  dateNavigation: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  dateTitle: { flex: 1, textAlign: 'center', fontSize: 24, lineHeight: 32, fontWeight: '700' },
  greeting: { textAlign: 'center', marginBottom: spacing.sm, fontSize: 14 },
  workCard: { borderWidth: 1, borderRadius: radius.xl, padding: spacing.lg, marginTop: spacing.xs },
  workHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  workHeading: { fontWeight: '700', fontSize: 16 },
  workIcon: { alignItems: 'center', borderRadius: radius.md, justifyContent: 'center', width: 38, height: 38 },
  workRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  shiftBadge: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  workTime: { fontWeight: '700', fontSize: 17 },
  workStatus: { marginTop: spacing.sm, fontSize: 14 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  summaryChip: { alignItems: 'center', borderRadius: radius.lg, flexBasis: '48%', flexDirection: 'row', flexGrow: 1, gap: spacing.xs, minHeight: 80, padding: spacing.sm },
  summaryIcon: { alignItems: 'center', borderRadius: radius.md, justifyContent: 'center', width: 34, height: 34 },
  summaryCopy: { flex: 1 },
  summaryLabel: { color: '#596571', fontSize: 12, lineHeight: 16 },
  summaryValue: { fontWeight: '700', fontSize: 18, lineHeight: 24, marginTop: spacing.xxs },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs, marginTop: spacing.xl },
  sectionAction: { justifyContent: 'center', minHeight: 44 },
  quickActions: { flexDirection: 'row', gap: spacing.xs },
  quickAction: { alignItems: 'center', borderRadius: radius.xl, flex: 1, flexDirection: 'row', gap: spacing.xxs, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.xs },
  quickActionText: { fontSize: 14, fontWeight: '700' },
  allDayBlock: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, marginTop: spacing.xs },
  blockTitle: { fontWeight: '700', fontSize: 16 },
  timeline: { borderLeftWidth: 2, marginLeft: 69, minHeight: 160, marginTop: spacing.xs, paddingVertical: spacing.sm },
  timelineRow: { alignItems: 'flex-start', flexDirection: 'row', minHeight: 82, marginLeft: -71, paddingVertical: spacing.md },
  untimedRow: { alignItems: 'flex-start', flexDirection: 'row', minHeight: 54, paddingVertical: spacing.sm },
  timelineTime: { textAlign: 'right', width: 50, marginRight: 13, fontWeight: '700' },
  timelineDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginTop: 4, marginRight: spacing.md },
  timelineCopy: { flex: 1, paddingBottom: spacing.sm },
  timelineTitleRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  timelineTitle: { fontWeight: '700', fontSize: 16, flexShrink: 1 },
  timelineDetail: { marginTop: spacing.xxs },
  sharedBadge: { color: SHARED_ACCENT, backgroundColor: '#EDF4ED', borderRadius: radius.sm, paddingHorizontal: spacing.xs, fontSize: 11, fontWeight: '700' },
  kindLabel: { fontSize: 11, fontWeight: '700' },
  emptyTimeline: { gap: spacing.xs, padding: spacing.lg, marginLeft: -53 },
  emptyTimelineTitle: { fontWeight: '700' },
  emptyAction: { alignItems: 'center', borderRadius: radius.md, justifyContent: 'center', marginTop: spacing.sm, minHeight: 44, alignSelf: 'flex-start', paddingHorizontal: spacing.md },
  gapRow: { alignItems: 'center', backgroundColor: '#EEF5F1', borderRadius: radius.md, flexDirection: 'row', gap: spacing.sm, minHeight: 54, paddingHorizontal: spacing.md },
  gapTime: { flex: 1, fontWeight: '700' },
  emptyText: { paddingVertical: spacing.sm },
  memoRow: { alignItems: 'center', backgroundColor: '#F6F1F8', borderRadius: radius.md, flexDirection: 'row', gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  memoText: { flex: 1, lineHeight: 22 },
  tomorrowCard: { borderRadius: radius.xl, borderWidth: 1, gap: spacing.xs, marginTop: spacing.xl, padding: spacing.lg },
  tomorrowHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  tomorrowDate: { marginTop: spacing.xs },
  tomorrowSummary: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  tomorrowBadge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  tomorrowCount: { marginLeft: 'auto' },
  sharedError: { textAlign: 'center', marginTop: spacing.sm },
});
