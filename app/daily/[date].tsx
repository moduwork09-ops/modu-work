import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Screen } from '../../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../../src/constants';
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
  const items = buildDailyItems({ date, shift, previousShift, memos: schedule.dateMemos[date] ?? [], personalEvents: schedule.personalEvents, sharedEvents: availableShared, sharedColor: brandColors.coral });
  const tomorrowItems = buildDailyItems({ date: tomorrow, shift: tomorrowShift, previousShift: shift, memos: schedule.dateMemos[tomorrow] ?? [], personalEvents: schedule.personalEvents, sharedEvents: availableShared, sharedColor: brandColors.coral });
  const gaps = calculateDailyGaps({ date, shifts: [previousDate, date].map(day => { const s = getShiftForDate(day, schedule); return { date: day, kind: s.kind, startTime: s.startTime, endTime: s.endTime }; }), personalEvents: createMemoBusyEvents(schedule.dateMemos, schedule.personalEvents) });
  const holiday = getKoreanHoliday(date);
  const hasSchedule = shift.id !== NO_ACTIVE_SCHEDULE_SHIFT_TYPE.id;

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
    else if (item.target.kind === 'shared') router.push({ pathname: '/together-event-detail', params: { eventId: item.target.id } });
    else router.push({ pathname: '/events/[id]', params: { id: item.target.id } });
  };

  return <Screen style={styles.screen}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
    <View style={styles.topBar}><Pressable accessibilityLabel="뒤로가기" onPress={() => router.back()} style={styles.iconButton}><MaterialCommunityIcons name="arrow-left" size={24} color={theme.primary} /></Pressable><AppText variant="heading">하루 보기</AppText><View style={styles.iconButton} /></View>
    <View style={styles.dateNavigation}><Pressable accessibilityLabel="전날" onPress={() => router.setParams({ date: adjacentDailyDate(date, -1) })} style={styles.iconButton}><MaterialCommunityIcons name="chevron-left" size={28} color={theme.primary} /></Pressable><AppText variant="heading" style={styles.dateTitle}>{dateLabel(date)}</AppText><Pressable accessibilityLabel="다음날" onPress={() => router.setParams({ date: tomorrow })} style={styles.iconButton}><MaterialCommunityIcons name="chevron-right" size={28} color={theme.primary} /></Pressable></View>
    <AppText tone="secondary" style={styles.greeting}>좋은 하루 보내세요 ☀️{holiday ? `  ·  ${holiday.name}` : ''}</AppText>

    <View style={[styles.workCard, { backgroundColor: theme.surface, borderColor: theme.border }]}><AppText variant="caption" tone="secondary">오늘의 근무</AppText><View style={styles.workRow}><View style={[styles.shiftBadge, { backgroundColor: shift.color }]}><AppText style={{ color: shift.textColor, fontWeight: '700' }}>{hasSchedule ? shift.name : '근무 없음'}</AppText></View>{hasSchedule && shift.kind === 'work' && shift.startTime && shift.endTime ? <AppText style={styles.workTime}>{shift.startTime} ~ {shift.endTime < shift.startTime ? `다음날 ${shift.endTime}` : shift.endTime}</AppText> : null}</View><AppText tone="secondary" style={styles.workStatus}>{hasSchedule ? dailyWorkStatus(date, shift, new Date()) : '적용된 근무표가 없어요.'}</AppText></View>
    <View style={styles.summaryRow}>{[['오늘 일정', `${items.personalCount}개`], ['함께 일정', `${items.sharedCount}개`], ['메모', `${items.memos.length}개`], ['오늘의 틈', formatGapDuration(gaps.totalGapMinutes)]].map(([label, value]) => <View key={label} style={[styles.summaryChip, { backgroundColor: theme.surface, borderColor: theme.border }]}><AppText variant="caption" tone="secondary">{label}</AppText><AppText style={styles.summaryValue}>{value}</AppText></View>)}</View>

    <View style={styles.sectionHeader}><AppText variant="heading">오늘의 타임라인</AppText></View>
    <View style={styles.quickActions}><Pressable onPress={() => openCalendarEditor('choose')} style={[styles.quickAction, { borderColor: theme.border }]}><AppText style={{ color: theme.primary, fontWeight: '700' }}>+ 일정</AppText></Pressable><Pressable onPress={() => openCalendarEditor('memo')} style={[styles.quickAction, { borderColor: theme.border }]}><AppText style={{ color: theme.primary, fontWeight: '700' }}>+ 메모</AppText></Pressable><Pressable onPress={() => void openSharedCreator()} style={[styles.quickAction, { borderColor: theme.border }]}><AppText style={{ color: theme.primary, fontWeight: '700' }}>+ 함께</AppText></Pressable></View>
    {items.untimed.length ? <View style={[styles.allDayBlock, { backgroundColor: theme.surface, borderColor: theme.border }]}><AppText style={styles.blockTitle}>하루 일정</AppText>{items.untimed.map(item => <DailyRow key={item.id} item={item} onPress={() => openItem(item)} />)}</View> : null}
    <View style={styles.timeline}>{items.timed.length ? items.timed.map(item => <DailyRow key={item.id} item={item} onPress={() => openItem(item)} timed />) : <View style={styles.emptyTimeline}><AppText tone="secondary">{items.untimed.length ? '시간이 정해진 일정이 없어요.' : '등록된 일정이 없어요.'}</AppText><Pressable onPress={() => openCalendarEditor('choose')}><AppText style={{ color: theme.primary, fontWeight: '700' }}>+ 일정 추가</AppText></Pressable></View>}</View>

    <View style={styles.sectionHeader}><AppText variant="heading">오늘의 틈</AppText><AppText style={{ color: theme.accent, fontWeight: '700' }}>총 {formatGapDuration(gaps.totalGapMinutes)}</AppText></View>{gaps.gaps.length ? gaps.gaps.map(gap => <View key={`${gap.startTime}-${gap.endTime}`} style={styles.gapRow}><AppText>{gap.startTime} ~ {gap.endTime}</AppText><AppText tone="secondary">{formatGapDuration(gap.durationMinutes)}</AppText></View>) : <AppText tone="secondary" style={styles.emptyText}>오늘은 여유 시간이 많지 않아요.</AppText>}
    <View style={styles.sectionHeader}><AppText variant="heading">오늘의 메모 ({items.memos.length})</AppText><Pressable onPress={() => openCalendarEditor('memo')}><AppText style={{ color: theme.primary, fontWeight: '700' }}>+ 메모 추가</AppText></Pressable></View>{items.memos.length ? items.memos.map(memo => <Pressable key={memo.id} onPress={() => openCalendarEditor('editMemo', memo.id)} style={styles.memoRow}><MaterialCommunityIcons name="note-text-outline" size={19} color="#82689A" /><AppText numberOfLines={2} style={styles.memoText}>{memo.text}</AppText><MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} /></Pressable>) : <AppText tone="secondary" style={styles.emptyText}>등록된 메모가 없어요.</AppText>}
    <Pressable onPress={() => router.setParams({ date: tomorrow })} style={[styles.tomorrowCard, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={styles.tomorrowHeader}><AppText style={styles.blockTitle}>내일 미리보기</AppText><MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} /></View><AppText>{dateLabel(tomorrow)}  ·  {tomorrowShift.id === NO_ACTIVE_SCHEDULE_SHIFT_TYPE.id ? '근무 없음' : tomorrowShift.name}</AppText><AppText variant="caption" tone="secondary">일정 {tomorrowItems.personalCount + tomorrowItems.sharedCount}개</AppText></Pressable>
    {sharedError ? <AppText variant="caption" tone="secondary" style={styles.sharedError}>함께 일정을 불러오지 못했어요. 화면을 다시 열면 재시도해요.</AppText> : null}
  </ScrollView></Screen>;
}

function DailyRow({ item, onPress, timed = false }: { item: DailyItem; onPress: () => void; timed?: boolean }) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole={item.target ? 'button' : undefined} onPress={item.target ? onPress : undefined} style={timed ? styles.timelineRow : styles.untimedRow}><AppText variant="caption" style={[styles.timelineTime, { color: theme.textSecondary }]}>{timed ? item.time : '•'}</AppText><View style={[styles.timelineDot, { backgroundColor: item.color }]} /><View style={styles.timelineCopy}><View style={styles.timelineTitleRow}>{item.kind === 'shared' ? <MaterialCommunityIcons name="account-multiple-outline" size={17} color={brandColors.coral} /> : null}<AppText style={styles.timelineTitle}>{item.title}</AppText>{item.kind === 'shared' ? <AppText variant="caption" style={{ color: brandColors.coral }}>함께</AppText> : null}</View>{item.detail ? <AppText variant="caption" tone="secondary" numberOfLines={2}>{item.detail}</AppText> : null}</View></Pressable>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 }, content: { gap: spacing.sm }, topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, iconButton: { alignItems: 'center', justifyContent: 'center', width: 44, height: 44 },
  dateNavigation: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm }, dateTitle: { flex: 1, textAlign: 'center', color: brandColors.deepNavy }, greeting: { textAlign: 'center', marginBottom: spacing.sm },
  workCard: { borderWidth: 1, borderRadius: radius.xl, padding: spacing.lg }, workRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }, shiftBadge: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }, workTime: { fontWeight: '700' }, workStatus: { marginTop: spacing.sm },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }, summaryChip: { borderRadius: radius.md, borderWidth: 1, flexBasis: '48%', flexGrow: 1, padding: spacing.sm }, summaryValue: { fontWeight: '700', marginTop: spacing.xxs },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl }, quickActions: { flexDirection: 'row', gap: spacing.xs }, quickAction: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flex: 1, minHeight: 42, justifyContent: 'center' },
  allDayBlock: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.sm }, blockTitle: { fontWeight: '700' }, timeline: { borderLeftColor: '#DCDDDC', borderLeftWidth: 1, marginLeft: 53, minHeight: 150, paddingVertical: spacing.sm }, timelineRow: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 64, marginLeft: -54, paddingVertical: spacing.sm }, untimedRow: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 54, paddingVertical: spacing.xs }, timelineTime: { textAlign: 'right', width: 48, marginRight: spacing.sm }, timelineDot: { width: 11, height: 11, borderRadius: 6, marginTop: 4, marginRight: spacing.sm }, timelineCopy: { flex: 1, paddingBottom: spacing.sm }, timelineTitleRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, timelineTitle: { fontWeight: '700', flexShrink: 1 }, emptyTimeline: { gap: spacing.sm, padding: spacing.lg },
  gapRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }, emptyText: { paddingVertical: spacing.sm }, memoRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 52, paddingVertical: spacing.xs }, memoText: { flex: 1 }, tomorrowCard: { borderRadius: radius.xl, borderWidth: 1, gap: spacing.xs, marginTop: spacing.xl, padding: spacing.lg }, tomorrowHeader: { flexDirection: 'row', justifyContent: 'space-between' }, sharedError: { textAlign: 'center', marginTop: spacing.sm },
});
