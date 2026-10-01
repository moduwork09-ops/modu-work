import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsGroup, SettingsIcon, SettingsRow } from '../../src/features/settings/SettingsGroup';
import { AppText, Card, Screen } from '../../src/components';
import { useFocusedInputScroll } from '../../src/components/useFocusedInputScroll';
import { brandColors, calendarShiftColors, radius, spacing, useAppTheme } from '../../src/constants';
import { calculateDailyGaps, formatGapDuration, type GapCalculationResult } from '../../src/features/gaps/gapCalculator';
import type { ShiftType } from '../../src/features/shift-settings/mockData';
import { formatShiftTime, getRepresentativeShiftColors } from '../../src/features/shift-settings/mockData';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { selectShiftTypesForDate } from '../../src/features/shifts/activeShiftTypes';
import { createMonthlyShiftSchedule, getPatternShiftForDate, getPreviousIsoDate, getShiftForDate, type ShiftScheduleInput } from '../../src/features/shifts/shiftSchedule';
import { TeamScheduleSheet } from '../../src/features/shifts/TeamScheduleSheet';
import { ColorPickerModal } from '../../src/features/colors/ColorPickerModal';
import { DEFAULT_MEMO_COLOR } from '../../src/features/memos/dateMemoStorage';
import { MonthlyMemoCard } from '../../src/features/memos/MonthlyMemoCard';
import type { DateMemo } from '../../src/features/memos/dateMemoStorage';
import { createMemoBusyEvents } from '../../src/features/memos/memoBusyEvents';
import { isNotificationDate } from '../../src/features/notifications/notificationPlan';
import { useCalendarDisplaySettings } from '../../src/features/calendar/useCalendarDisplaySettings';
import { createCalendarMonthGrid, getCalendarWeekdays, getCalendarEventCategory, formatMonthlyCalendarEventTitle, selectMonthlyCalendarItems } from '../../src/features/calendar/calendarDisplayPresentation';
import { getCalendarDateKind, getKoreanHoliday } from '../../src/features/calendar/koreanHolidays';
import { addCalendarDays, createTwoWeekAgendaItems, createTwoWeekDates } from '../../src/features/calendar/twoWeekCalendar';
import { CALENDAR_SELECTION_BACKGROUND, getCalendarCellVisualState } from '../../src/features/calendar/calendarCellVisualState';
import { TimePickerSheet } from '../../src/features/events/EventPickerSheets';
import { DEFAULT_PERSONAL_EVENT_COLOR } from '../../src/features/events/personalEventPresentation';
import { useAuth } from '../../src/features/auth/AuthContext';
import { createSharedEventCalendarItem, type SharedEventCalendarItem } from '../../src/features/together/sharedEventCalendarPresentation';
import { chooseTogetherHomeSpace } from '../../src/features/together/togetherHomePresentation';
import { getTogetherSpaces, listSharedEvents } from '../../src/features/together/togetherServerData';
import {
  formatOvertimeCalendarBadge,
  formatOvertimeDuration,
  getOvertimeDateTotalMinutes,
  getOvertimeDurationMinutes,
  getOvertimeMonthTotalMinutes,
} from '../../src/features/overtime/overtime';

type CalendarFilter = '전체' | '근무' | '일정';
type CalendarView = 'month' | 'twoWeek';

type CalendarDay = {
  day: number;
  date: string;
  shift: ShiftType;
};

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const filterOptions: CalendarFilter[] = ['전체', '근무', '일정'];
const memoColors = ['#F8C8D8', '#FFF1A8', '#D7EDB5', '#BFE7F5', '#DDD0F3', '#EADCC8', '#F7B267', '#B9E5D8', '#F59E8B', '#BCC9D6'];
const weekdayDateColor = '#5F6873';
const holidayDateColor = '#E53935';
const saturdayDateColor = '#1976D2';

function toLocalIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getDateFromIso(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function formatCalendarDate(isoDate: string) {
  const date = getDateFromIso(isoDate);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekdays[date.getDay()]}요일`;
}

function getPersonalEventEditorTitle(editingMemoId: string | null) {
  return editingMemoId ? '개인 일정 편집' : '개인 일정 추가';
}


type GapSchedule = ShiftScheduleInput & {
  personalEvents: ReturnType<typeof useShiftSchedule>['personalEvents'];
  dateMemos: ReturnType<typeof useShiftSchedule>['dateMemos'];
};

function getGapResultForDate(date: string, schedule: GapSchedule): GapCalculationResult {
  const previousDate = getPreviousIsoDate(date);
  const shifts = [date, previousDate].map((shiftDate) => {
    const shift = getShiftForDate(shiftDate, schedule);

    return {
      date: shiftDate,
      kind: shift.kind,
      startTime: shift.startTime,
      endTime: shift.endTime,
    };
  });

  return calculateDailyGaps({
    date,
    shifts,
    personalEvents: createMemoBusyEvents(schedule.dateMemos, schedule.personalEvents),
  });
}

export default function CalendarScreen() {
  const { notificationDate, notificationOpenId, notificationOpenDetail } = useLocalSearchParams<{ notificationDate?: string; notificationOpenId?: string; notificationOpenDetail?: string }>();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const router = useRouter();
  const { session } = useAuth();
  const schedule = useShiftSchedule();
  const modalKeyboardScroll = useFocusedInputScroll();
  const { settings: calendarSettings } = useCalendarDisplaySettings();
  const today = new Date();
  const todayDate = toLocalIsoDate(today);
  const [selectedFilter, setSelectedFilter] = useState<CalendarFilter>('전체');
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
  const calendarScrollRef = useRef<ScrollView>(null);
  const agendaListTopRef = useRef<number | null>(null);
  const agendaDayTopRef = useRef<Record<string, number>>({});
  const pendingAgendaDateRef = useRef<string | null>(null);
  const agendaLayoutPeriodRef = useRef<string | null>(null);
  const [displayedMonth, setDisplayedMonth] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() + 1 }));
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [twoWeekAnchorDate, setTwoWeekAnchorDate] = useState(todayDate);
  useEffect(() => {
    if (!isNotificationDate(notificationDate)) return;
    const [year, month] = notificationDate.split('-').map(Number);
    setDisplayedMonth({ year, month });
    setSelectedDate(notificationDate);
    setTwoWeekAnchorDate(notificationDate);
  }, [notificationDate, notificationOpenId]);
  const [isMemoEditorVisible, setIsMemoEditorVisible] = useState(false);
  const [isTeamScheduleVisible, setIsTeamScheduleVisible] = useState(false);
  const [editorMode, setEditorMode] = useState<'list' | 'edit' | 'overtime'>('list');
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [isColorPickerVisible, setIsColorPickerVisible] = useState(false);
  const [memoInput, setMemoInput] = useState('');
  const [memoColor, setMemoColor] = useState(DEFAULT_MEMO_COLOR);
  const [memoTimeEnabled, setMemoTimeEnabled] = useState(false);
  const [memoAllDay, setMemoAllDay] = useState(false);
  const [memoStartTime, setMemoStartTime] = useState('11:00');
  const [memoEndTime, setMemoEndTime] = useState('12:00');
  const [memoTimePicker, setMemoTimePicker] = useState<'start' | 'end' | null>(null);
  const [memoReminderMinutes, setMemoReminderMinutes] = useState<DateMemo['reminderMinutes']>(null);
  const [isScheduleTypeVisible, setIsScheduleTypeVisible] = useState(false);
  const isPersonalEditor = editorMode === 'edit' && !isScheduleTypeVisible;
  useEffect(() => {
    if (!isPersonalEditor || !isMemoEditorVisible) return;
    const hidden = Keyboard.addListener('keyboardDidHide', () => modalKeyboardScroll.scrollRef.current?.scrollTo({ y: 0, animated: true }));
    return () => hidden.remove();
  }, [isPersonalEditor, isMemoEditorVisible]);
  useEffect(() => {
    if (notificationOpenDetail !== '1' || !isNotificationDate(notificationDate)) return;
    setEditorMode('list');
    setIsScheduleTypeVisible(false);
    setIsMemoEditorVisible(true);
  }, [notificationDate, notificationOpenId, notificationOpenDetail]);
  const creatingSharedRef = useRef(false);
  const pendingSharedNavigationRef = useRef<{ spaceId: string; date: string; requestId: number; owner: string } | null>(null);
  const calendarOwnerRef = useRef(session?.user.id);
  calendarOwnerRef.current = session?.user.id;
  const memoEditorVisibleRef = useRef(isMemoEditorVisible);
  memoEditorVisibleRef.current = isMemoEditorVisible;
  const [selectedShiftTypeId, setSelectedShiftTypeId] = useState('');
  const [sharedEvents, setSharedEvents] = useState<SharedEventCalendarItem[]>([]);
  const [sharedEventsOwnerUserId, setSharedEventsOwnerUserId] = useState<string>();
  const [hasSharedEventsError, setHasSharedEventsError] = useState(false);
  const [sharedEventsRetryKey, setSharedEventsRetryKey] = useState(0);
  const sharedEventsRequestRef = useRef(0);
  const [overtimeStartTime, setOvertimeStartTime] = useState('18:00');
  const [overtimeEndTime, setOvertimeEndTime] = useState('20:00');
  const [overtimeMemo, setOvertimeMemo] = useState('');
  const [overtimeTimePicker, setOvertimeTimePicker] = useState<'start' | 'end' | null>(null);
  const [isSavingOvertime, setIsSavingOvertime] = useState(false);
  const isSavingOvertimeRef = useRef(false);
  const calendarDays: CalendarDay[] = createMonthlyShiftSchedule(displayedMonth.year, displayedMonth.month, schedule).map((item) => {
    return {
      day: item.day,
      date: item.date,
      shift: item.shift,
    };
  });
  const selectedDay = calendarDays.find((day) => day.date === selectedDate)
    ?? { date: selectedDate, day: getDateFromIso(selectedDate).getDate(), shift: getShiftForDate(selectedDate, schedule) };
  const selectedGapResult = getGapResultForDate(selectedDay.date, schedule);
  const selectedHoliday = calendarSettings.showHolidayNames ? getKoreanHoliday(selectedDay.date) : undefined;
  const selectedMemos = schedule.dateMemos[selectedDay.date] ?? [];
  const selectedEvents = schedule.personalEvents.filter((event) => event.date === selectedDay.date).sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const currentSharedEvents = sharedEventsOwnerUserId === session?.user.id ? sharedEvents : [];
  const selectedSharedEvents = currentSharedEvents.filter((event) => event.localDate === selectedDay.date);
  const selectedOvertimeEntries = schedule.overtimeEntries
    .filter((entry) => entry.date === selectedDay.date)
    .sort((left, right) => left.startTime.localeCompare(right.startTime));
  const monthlyOvertimeMinutes = getOvertimeMonthTotalMinutes(schedule.overtimeEntries, displayedMonth.year, displayedMonth.month);
  const dateShiftTypes = selectShiftTypesForDate(selectedDay.date, schedule);
  const selectedDetailShift = schedule.shiftTypes.find((shift) => shift.id === selectedShiftTypeId) ?? selectedDay.shift;
  const showEventsInMonth = selectedFilter !== '근무';
  const calendarGrid = createCalendarMonthGrid(displayedMonth.year, displayedMonth.month, calendarDays, calendarSettings.weekStartsOn);
  const twoWeekDates = createTwoWeekDates(twoWeekAnchorDate, calendarSettings.weekStartsOn);
  const twoWeekStartDate = twoWeekDates[0].date;
  const twoWeekEndDate = twoWeekDates[13].date;
  const calendarRowHeight = Math.max(78, Math.min(80, Math.floor((windowHeight - 274) / 6)));

  const syncAgendaLayoutPeriod = () => {
    if (agendaLayoutPeriodRef.current === twoWeekStartDate) return;
    agendaLayoutPeriodRef.current = twoWeekStartDate;
    agendaListTopRef.current = null;
    agendaDayTopRef.current = {};
    pendingAgendaDateRef.current = null;
  };

  const scrollToAgendaDate = (date: string) => {
    syncAgendaLayoutPeriod();
    const listTop = agendaListTopRef.current;
    const dayTop = agendaDayTopRef.current[date];
    if (listTop === null || dayTop === undefined || !calendarScrollRef.current) {
      pendingAgendaDateRef.current = date;
      return;
    }
    pendingAgendaDateRef.current = null;
    calendarScrollRef.current.scrollTo({ y: Math.max(0, listTop + dayTop - spacing.xs), animated: true });
  };

  const flushPendingAgendaScroll = () => {
    if (pendingAgendaDateRef.current) scrollToAgendaDate(pendingAgendaDateRef.current);
  };

  useFocusEffect(useCallback(() => {
    const requestId = ++sharedEventsRequestRef.current;
    const userId = session?.user.id;
    let isCurrent = true;
    setHasSharedEventsError(false);
    if (!userId) {
      setSharedEvents([]);
      setSharedEventsOwnerUserId(undefined);
      return () => {
        isCurrent = false;
      };
    }

    const timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void getTogetherSpaces()
      .then(async (spaces) => {
        const results = await Promise.all(spaces.map((space) => listSharedEvents(space.id)));
        if (!isCurrent || sharedEventsRequestRef.current !== requestId) return;
        const monthPrefix = `${displayedMonth.year}-${String(displayedMonth.month).padStart(2, '0')}-`;
        const nextSharedEvents = results.flat()
          .map((event) => createSharedEventCalendarItem(event, timezoneName))
          .filter((event) => event.localDate.startsWith(monthPrefix)
            || (calendarView === 'twoWeek' && event.localDate >= twoWeekStartDate && event.localDate <= twoWeekEndDate));
        setSharedEvents(nextSharedEvents);
        setSharedEventsOwnerUserId(userId);
        schedule.publishWidgetSharedEvents(userId, monthPrefix.slice(0, 7), nextSharedEvents.filter((event) => event.localDate.startsWith(monthPrefix)));
      })
      .catch(() => {
        if (!isCurrent || sharedEventsRequestRef.current !== requestId) return;
        setSharedEvents([]);
        setSharedEventsOwnerUserId(userId);
        setHasSharedEventsError(true);
      });

    return () => {
      isCurrent = false;
      if (sharedEventsRequestRef.current === requestId) sharedEventsRequestRef.current += 1;
    };
  }, [calendarView, displayedMonth.month, displayedMonth.year, schedule.publishWidgetSharedEvents, session?.user.id, sharedEventsRetryKey, twoWeekEndDate, twoWeekStartDate]));

  const moveMonth = (offset: number) => {
    const nextMonth = new Date(displayedMonth.year, displayedMonth.month - 1 + offset, 1, 12);
    const nextYear = nextMonth.getFullYear();
    const nextMonthNumber = nextMonth.getMonth() + 1;

    setDisplayedMonth({ year: nextYear, month: nextMonthNumber });
    setSelectedDate(toLocalIsoDate(new Date(nextYear, nextMonthNumber - 1, 1, 12)));
  };

  const moveTwoWeeks = (offset: number) => {
    const nextDate = addCalendarDays(twoWeekAnchorDate, offset * 14);
    const next = getDateFromIso(nextDate);
    setTwoWeekAnchorDate(nextDate);
    setSelectedDate(nextDate);
    setDisplayedMonth({ year: next.getFullYear(), month: next.getMonth() + 1 });
  };

  const openDateDetails = () => {
    setSelectedShiftTypeId(selectedDay.shift.id);
    setEditorMode('list');
    setIsMemoEditorVisible(true);
  };

  const openDateDetailsForDay = (day: CalendarDay) => {
    setSelectedDate(day.date);
    setSelectedShiftTypeId(day.shift.id);
    setEditorMode('list');
    setIsMemoEditorVisible(true);
  };

  const openMemoEditor = (memo?: DateMemo) => {
    setEditingMemoId(memo?.id ?? null);
    setMemoInput(memo?.text ?? '');
    setMemoColor(memo?.color ?? DEFAULT_MEMO_COLOR);
    setMemoTimeEnabled(memo?.timeEnabled ?? false);
    setMemoAllDay(memo?.allDay ?? false);
    setMemoStartTime(memo?.startTime ?? '11:00');
    setMemoEndTime(memo?.endTime ?? '12:00');
    setMemoReminderMinutes(memo?.reminderMinutes ?? null);
    setEditorMode('edit');
    setIsMemoEditorVisible(true);
  };

  const addSharedSchedule = async () => {
    if (creatingSharedRef.current || pendingSharedNavigationRef.current) return;
    creatingSharedRef.current = true;
    const requestId = sharedEventsRequestRef.current;
    const date = selectedDay.date;
    const owner = session?.user.id;
    setIsScheduleTypeVisible(false);
    try {
      const space = session?.user.id ? chooseTogetherHomeSpace(await getTogetherSpaces()) : undefined;
      if (requestId !== sharedEventsRequestRef.current || owner !== calendarOwnerRef.current || !memoEditorVisibleRef.current) return;
      if (!space) {
        Alert.alert('공동 일정', '함께 탭에서 함께할 사람을 먼저 설정해 주세요.');
        return;
      }
      if (!owner) return;
      pendingSharedNavigationRef.current = { spaceId: space.id, date, requestId, owner };
      setIsMemoEditorVisible(false);
    } catch {
      if (requestId === sharedEventsRequestRef.current && owner === calendarOwnerRef.current && memoEditorVisibleRef.current) Alert.alert('공동 일정', '함께 공간을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally { creatingSharedRef.current = false; }
  };

  const finishSharedNavigation = () => {
    const pending = pendingSharedNavigationRef.current;
    pendingSharedNavigationRef.current = null;
    if (!pending || pending.requestId !== sharedEventsRequestRef.current || pending.owner !== calendarOwnerRef.current) return;
    router.push({ pathname: '/together-event-create', params: { spaceId: pending.spaceId, date: pending.date } });
  };
  // iOS waits for native dismissal; Android navigates after the closed-modal render commits.
  useEffect(() => {
    if (!isMemoEditorVisible && Platform.OS !== 'ios') finishSharedNavigation();
  }, [isMemoEditorVisible]);

  const addScheduleByType = (type: 'timed' | 'untimed') => {
    openMemoEditor();
    setMemoTimeEnabled(type !== 'untimed');
    setMemoAllDay(false);
    setIsScheduleTypeVisible(false);
  };

  const openOvertimeEditor = () => {
    setOvertimeStartTime('18:00');
    setOvertimeEndTime('20:00');
    setOvertimeMemo('');
    setEditorMode('overtime');
  };

  const saveOvertime = async () => {
    if (isSavingOvertimeRef.current) return;
    if (getOvertimeDurationMinutes(overtimeStartTime, overtimeEndTime) === null) {
      Alert.alert('시간을 확인해주세요.', '시작 시간과 종료 시간은 같을 수 없습니다.');
      return;
    }
    isSavingOvertimeRef.current = true;
    setIsSavingOvertime(true);
    const now = new Date().toISOString();
    const normalizedMemo = overtimeMemo.trim();
    try {
      const saved = await schedule.saveOvertimeEntry({
        id: Crypto.randomUUID(),
        date: selectedDay.date,
        startTime: overtimeStartTime,
        endTime: overtimeEndTime,
        ...(normalizedMemo ? { memo: normalizedMemo } : {}),
        createdAt: now,
      });
      if (!saved) {
        Alert.alert('초과근무 저장에 실패했어요.', '잠시 후 다시 시도해주세요.');
        return;
      }
      setEditorMode('list');
    } catch {
      Alert.alert('초과근무 저장에 실패했어요.', '잠시 후 다시 시도해주세요.');
    } finally {
      isSavingOvertimeRef.current = false;
      setIsSavingOvertime(false);
    }
  };

  const deleteOvertime = async (id: string) => {
    if (!await schedule.deleteOvertimeEntry(id)) {
      Alert.alert('초과근무 삭제에 실패했어요.', '잠시 후 다시 시도해주세요.');
    }
  };

  const saveSchedule = async () => {
    if (!memoInput.trim()) { Alert.alert('일정 제목을 입력해주세요.'); return; }
    if (memoInput.trim() && memoTimeEnabled && !memoAllDay && memoStartTime >= memoEndTime) {
      Alert.alert('시간을 확인해주세요.', '종료 시간은 시작 시간보다 늦어야 합니다.');
      return;
    }
    const previous = editingMemoId ? selectedMemos.find((memo) => memo.id === editingMemoId) : undefined;
    const memoSaved = await schedule.saveDateMemo(selectedDay.date, {
      id: editingMemoId ?? `date-schedule-${Date.now()}`,
      text: memoInput.trim(),
      color: memoColor,
      timeEnabled: memoTimeEnabled,
      allDay: memoTimeEnabled && memoAllDay,
      startTime: memoTimeEnabled && !memoAllDay ? memoStartTime : null,
      endTime: memoTimeEnabled && !memoAllDay ? memoEndTime : null,
      reminderMinutes: memoTimeEnabled && !memoAllDay ? memoReminderMinutes : null,
      notificationId: previous?.notificationId ?? null,
    });
    if (!memoSaved) { Alert.alert('일정 저장에 실패했어요.', '알림 시간과 권한을 확인해주세요.'); return; }
    setEditorMode('list');
  };

  const saveShiftEdits = async () => {
    const baseShift = getPatternShiftForDate(selectedDay.date, schedule);
    const shiftSaved = selectedShiftTypeId === baseShift.id
      ? await schedule.removeShiftDateOverride(selectedDay.date)
      : await schedule.saveShiftDateOverride(selectedDay.date, selectedShiftTypeId);
    if (!shiftSaved) {
      Alert.alert('저장에 실패했어요.', '다시 시도해주세요.');
      return;
    }
    setIsMemoEditorVisible(false);
  };

  const deleteSchedule = async () => {
    if (!editingMemoId || !await schedule.deleteDateMemo(selectedDay.date, editingMemoId)) { Alert.alert('일정 삭제에 실패했어요.'); return; }
    setEditorMode('list');
  };

  const restorePatternShift = async () => {
    if (!await schedule.removeShiftDateOverride(selectedDay.date)) {
      Alert.alert('변경 취소에 실패했어요.', '다시 시도해주세요.');
      return;
    }
    setSelectedShiftTypeId(getPatternShiftForDate(selectedDay.date, schedule).id);
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView ref={calendarScrollRef} style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <AppText variant="heading">캘린더</AppText>
          <View style={styles.headerActions}><Pressable accessibilityRole="button" accessibilityLabel="다른 팀 보기" onPress={() => setIsTeamScheduleVisible(true)} style={styles.headerIcon}><MaterialCommunityIcons name="account-group-outline" size={23} color={theme.primary} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="선택 날짜 일정 관리" onPress={openDateDetails} style={styles.headerIcon}><MaterialCommunityIcons name="calendar-edit-outline" size={23} color={theme.primary} /></Pressable></View>
        </View>

        <View accessibilityRole="tablist" style={[styles.viewSwitcher, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {([['month', '월'], ['twoWeek', '2주']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: calendarView === value }} onPress={() => { if (value === 'twoWeek' && calendarView !== 'twoWeek') setTwoWeekAnchorDate(selectedDate); setCalendarView(value); }} style={[styles.viewSwitchButton, calendarView === value && { backgroundColor: theme.primary }]}><AppText variant="button" style={{ color: calendarView === value ? brandColors.white : theme.textSecondary }}>{label}</AppText></Pressable>)}
        </View>

        {calendarView === 'month' ? <View style={[styles.monthNavigation, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Pressable accessibilityLabel="이전 달" onPress={() => moveMonth(-1)} style={styles.monthButton}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={theme.textSecondary} />
          </Pressable>
          <View style={styles.monthTitleGroup}>
            <AppText variant="heading">{displayedMonth.year}년 {displayedMonth.month}월</AppText>
            <AppText variant="caption" tone="secondary">이번 달 초과근무 {formatOvertimeDuration(monthlyOvertimeMinutes)}</AppText>
          </View>
          <Pressable accessibilityLabel="다음 달" onPress={() => moveMonth(1)} style={styles.monthButton}>
            <MaterialCommunityIcons name="chevron-right" size={24} color={theme.textSecondary} />
          </Pressable>
        </View> : <View style={[styles.monthNavigation, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Pressable accessibilityLabel="이전 2주" onPress={() => moveTwoWeeks(-1)} style={styles.monthButton}><MaterialCommunityIcons name="chevron-left" size={24} color={theme.textSecondary} /></Pressable>
          <AppText variant="button" style={styles.twoWeekPeriod}>{`${twoWeekStartDate.replaceAll('-', '.')} – ${twoWeekEndDate.replaceAll('-', '.')}`}</AppText>
          <Pressable accessibilityLabel="다음 2주" onPress={() => moveTwoWeeks(1)} style={styles.monthButton}><MaterialCommunityIcons name="chevron-right" size={24} color={theme.textSecondary} /></Pressable>
        </View>}

        {calendarView === 'twoWeek' ? <View style={[styles.twoWeekSummary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.twoWeekSummaryGrid}>
            {twoWeekDates.map(({ date, day, weekday }, index) => {
              const shift = getShiftForDate(date, schedule);
              const dateKind = getCalendarDateKind(date);
              const dateColor = dateKind === 'holiday' || dateKind === 'sunday' ? holidayDateColor : dateKind === 'saturday' ? saturdayDateColor : weekdayDateColor;
              const isSelected = date === selectedDate;
              const dateLabel = index === 0 || day === 1 ? `${Number(date.slice(5, 7))}/${day}` : String(day);
              return <Pressable key={date} accessibilityRole="button" accessibilityLabel={`${formatCalendarDate(date)}, ${shift.name}`} accessibilityState={{ selected: isSelected }} onPress={() => { setSelectedDate(date); scrollToAgendaDate(date); }} style={[styles.twoWeekSummaryCell, { borderColor: isSelected ? theme.primary : 'transparent' }, isSelected && { backgroundColor: CALENDAR_SELECTION_BACKGROUND }]}>
                <AppText style={[styles.twoWeekSummaryDate, { color: dateColor }]}>{dateLabel}</AppText>
                <AppText variant="caption" style={{ color: dateColor }}>{weekdays[weekday]}</AppText>
                <View style={[styles.twoWeekSummaryShift, { backgroundColor: shift.color }]}><AppText numberOfLines={1} style={[styles.twoWeekSummaryShiftText, { color: shift.textColor }]}>{shift.abbreviation}</AppText></View>
              </Pressable>;
            })}
          </View>
        </View> : null}

        {calendarView === 'month' ? <View accessibilityRole="tablist" style={styles.filterRow}>
          {filterOptions.map((filter) => {
            const isSelected = selectedFilter === filter;
            return (
              <Pressable
                key={`filter-${filter}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                onPress={() => setSelectedFilter(filter)}
                style={[styles.filterButton, { borderColor: theme.border }, isSelected && { backgroundColor: theme.primary, borderColor: theme.primary }]}
              >
                <AppText variant="caption" style={{ color: isSelected ? brandColors.white : theme.textSecondary, fontWeight: '700' }}>
                  {filter}
                </AppText>
              </Pressable>
            );
          })}
        </View> : null}

        {calendarView === 'month' ? <Card style={styles.calendarCard}>
          <View style={styles.weekdayRow}>
            {getCalendarWeekdays(calendarSettings.weekStartsOn).map((weekday, index) => (
              <AppText
                key={`weekday-${index}-${weekday}`}
                variant="caption"
                style={[styles.weekday, { color: weekday === '일' ? theme.accent : theme.textSecondary }]}
              >
                {weekday}
              </AppText>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendarGrid.map((day, index) => {
              if (!day) {
                return <View key={`blank-${index}`} style={[styles.calendarCell, { height: calendarRowHeight }]} />;
              }

              const shift = day.shift;
              const memos = showEventsInMonth ? schedule.dateMemos[day.date] ?? [] : [];
              const events = showEventsInMonth ? schedule.personalEvents.filter((event) => event.date === day.date) : [];
              const serverEvents = showEventsInMonth ? currentSharedEvents.filter((event) => event.localDate === day.date) : [];
              const overtimeMinutes = getOvertimeDateTotalMinutes(schedule.overtimeEntries, day.date);
              const monthPreview = selectMonthlyCalendarItems([
                // Calendar-created schedules use DateMemo storage, including untimed schedules.
                ...memos.map((memo) => ({ category: 'personalEvent' as const, id: `memo-${memo.id}`, text: formatMonthlyCalendarEventTitle(memo.text, memo.timeEnabled && !memo.allDay ? memo.startTime : null, false), color: memo.color, source: 'personal' as const, priority: memo.timeEnabled && !memo.allDay && memo.startTime ? 0 : 3, time: memo.startTime ?? '' })),
                ...events.map((event) => ({
                  category: getCalendarEventCategory(event),
                  id: `event-${event.id}`,
                  text: formatMonthlyCalendarEventTitle(event.title, event.allDay ? null : event.startTime, false),
                  color: event.kind === 'shared' ? brandColors.coral : event.color ?? DEFAULT_PERSONAL_EVENT_COLOR,
                  source: 'personal' as const,
                  priority: !event.allDay && event.startTime ? 0 : 1,
                  time: event.startTime ?? '',
                })),
                ...serverEvents.map((event) => ({
                  category: 'sharedEvent' as const,
                  id: event.displayKey,
                  text: formatMonthlyCalendarEventTitle(event.title, event.startTime, false),
                  color: brandColors.coral,
                  source: event.source,
                  priority: event.startTime ? 0 : 1,
                  time: event.startTime ?? '',
                })),
                ...(overtimeMinutes > 0 ? [{ category: 'overtime' as const, id: `overtime-${day.date}`, text: formatOvertimeCalendarBadge(overtimeMinutes), color: '#F7B267', source: 'personal' as const, priority: 2, time: '' }] : []),
              ].sort((left, right) => left.priority - right.priority || left.time.localeCompare(right.time)), calendarSettings);
              const calendarPreviewItems = monthPreview.visible;
              const remainingPreviewCount = monthPreview.remainingCount;
              const isSelected = day.date === selectedDay.date;
              const cellVisualState = getCalendarCellVisualState(day.date, todayDate, selectedDay.date);
              const holiday = calendarSettings.showHolidayNames ? getKoreanHoliday(day.date) : undefined;
              const dateKind = getCalendarDateKind(day.date);
              const dateColor = dateKind === 'holiday' || dateKind === 'sunday'
                ? holidayDateColor
                : dateKind === 'saturday'
                  ? saturdayDateColor
                  : weekdayDateColor;

              return (
                <Pressable
                  key={day.date}
                  accessibilityLabel={`${formatCalendarDate(day.date)}${holiday ? `, ${holiday.name}` : ''}, ${shift.name}`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => openDateDetailsForDay(day)}
                  style={[
                    styles.calendarCell,
                    { height: calendarRowHeight },
                    cellVisualState === 'today' && { borderColor: theme.accent, borderWidth: 1.5 },
                    cellVisualState === 'selected' && { backgroundColor: CALENDAR_SELECTION_BACKGROUND, borderColor: theme.primary, borderWidth: 2 },
                  ]}
                >
                  <View style={[styles.dateHeader, holiday && styles.holidayDateHeader]}>
                    <AppText variant="caption" style={[styles.dayNumber, holiday && styles.holidayDayNumber, { color: dateColor }]}>{day.day}</AppText>
                    {holiday ? <AppText numberOfLines={1} ellipsizeMode="tail" style={[styles.holidayName, { color: holidayDateColor }]}>{holiday.name}</AppText> : null}
                  </View>
                  <View style={[styles.shiftChip, { backgroundColor: shift.color }]}>
                    <AppText style={[styles.shiftLabel, { color: shift.textColor }]}>{shift.abbreviation}</AppText>
                  </View>
                  <View style={styles.memoSlot}>
                    {calendarPreviewItems.map((item, itemIndex) => <View key={item.id} style={styles.monthScheduleRow}><View style={[styles.monthScheduleDot, { backgroundColor: item.color }]} /><AppText numberOfLines={1} ellipsizeMode="tail" style={[styles.memoPreview, { color: theme.textSecondary }]}>{item.text}</AppText>{itemIndex === calendarPreviewItems.length - 1 && remainingPreviewCount > 0 ? <AppText style={[styles.morePreview, { color: theme.primary }]}>{`+${remainingPreviewCount}`}</AppText> : null}</View>)}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card> : <View style={styles.agendaList} onLayout={(event) => { syncAgendaLayoutPeriod(); agendaListTopRef.current = event.nativeEvent.layout.y; flushPendingAgendaScroll(); }}>
          {twoWeekDates.map(({ date, day, weekday }) => {
            const shift = getShiftForDate(date, schedule);
            const holiday = calendarSettings.showHolidayNames ? getKoreanHoliday(date) : undefined;
            const dateKind = getCalendarDateKind(date);
            const dateColor = dateKind === 'holiday' || dateKind === 'sunday' ? holidayDateColor : dateKind === 'saturday' ? saturdayDateColor : weekdayDateColor;
            const items = createTwoWeekAgendaItems({
              memos: schedule.dateMemos[date] ?? [],
              personalEvents: schedule.personalEvents.filter((event) => event.date === date),
              sharedEvents: currentSharedEvents.filter((event) => event.localDate === date),
              showPersonalEvents: calendarSettings.showPersonalEvents,
              showSharedEvents: calendarSettings.showSharedEvents,
              showEventTime: calendarSettings.showEventTime,
              sharedColor: brandColors.coral,
            });
            const overtimeMinutes = calendarSettings.showOvertime ? getOvertimeDateTotalMinutes(schedule.overtimeEntries, date) : 0;
            const hasDetails = items.length > 0 || overtimeMinutes > 0;
            return <Pressable key={date} onLayout={(event) => { syncAgendaLayoutPeriod(); agendaDayTopRef.current[date] = event.nativeEvent.layout.y; if (pendingAgendaDateRef.current === date) flushPendingAgendaScroll(); }} accessibilityRole="button" accessibilityLabel={`${formatCalendarDate(date)}${holiday ? `, ${holiday.name}` : ''}, ${shift.name}`} onPress={() => openDateDetailsForDay({ date, day, shift })} style={[styles.agendaDay, !hasDetails && styles.agendaDayCompact, { backgroundColor: theme.surface, borderColor: date === selectedDate ? theme.primary : theme.border }]}>
              <View style={styles.agendaHeader}><View style={styles.agendaDateGroup}><AppText style={[styles.agendaDate, { color: dateColor }]}>{Number(date.slice(5, 7))}월 {day}일 ({weekdays[weekday]})</AppText>{holiday ? <AppText variant="caption" style={{ color: holidayDateColor, flexShrink: 1 }}>{holiday.name}</AppText> : null}</View><View style={[styles.agendaShift, { backgroundColor: shift.color }]}><AppText variant="caption" style={{ color: shift.textColor, fontWeight: '800' }}>{shift.abbreviation}</AppText></View></View>
              {hasDetails ? <View style={styles.agendaItems}>{items.map((item) => <View key={item.id} style={styles.agendaItem}><MaterialCommunityIcons name={item.kind === 'shared' ? 'account-multiple-outline' : item.kind === 'memo' ? 'note-text-outline' : item.time ? 'clock-outline' : 'calendar-blank-outline'} size={16} color={item.color} style={styles.agendaItemIcon} /><View style={styles.agendaItemCopy}>{item.time ? <AppText variant="caption" style={{ color: theme.textSecondary }}>{item.time}</AppText> : null}<AppText style={[styles.agendaItemTitle, { color: theme.text }]}>{item.title}</AppText></View></View>)}{overtimeMinutes > 0 ? <View style={styles.agendaItem}><View style={[styles.agendaDot, { backgroundColor: '#F7B267' }]} /><AppText style={{ color: theme.text }}>{formatOvertimeCalendarBadge(overtimeMinutes)}</AppText></View> : null}</View> : null}
            </Pressable>;
          })}
        </View>}

        {calendarView === 'month' && calendarSettings.showMonthlyMemoCard ? <MonthlyMemoCard key={displayedMonth.year + '-' + displayedMonth.month} month={String(displayedMonth.year).padStart(4, '0') + '-' + String(displayedMonth.month).padStart(2, '0')} /> : null}
      </ScrollView>

      <TeamScheduleSheet visible={isTeamScheduleVisible} selectedDate={selectedDay.date} configurationDate={todayDate} displayedMonth={displayedMonth} schedule={schedule} onClose={() => setIsTeamScheduleVisible(false)} onSaveTeamRotation={schedule.saveCurrentTeamRotation} />

      <Modal key={isScheduleTypeVisible ? 'schedule-choice' : isPersonalEditor ? 'personal-editor' : 'date-detail'} transparent={!isPersonalEditor} animationType="slide" visible={isMemoEditorVisible} onDismiss={finishSharedNavigation} onRequestClose={() => isScheduleTypeVisible ? setIsScheduleTypeVisible(false) : editorMode !== 'list' ? setEditorMode('list') : setIsMemoEditorVisible(false)}>
        <View style={isPersonalEditor ? styles.fullEditorOverlay : styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={isPersonalEditor ? styles.fullEditorKeyboardAvoider : styles.modalKeyboardAvoider}>
          {isScheduleTypeVisible ? <Pressable accessibilityRole="button" accessibilityLabel="일정 추가 닫기" onPress={() => setIsScheduleTypeVisible(false)} style={styles.modalBackdrop} /> : null}
          {isScheduleTypeVisible ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.memoContent, { paddingBottom: spacing.lg + insets.bottom }]} style={[styles.memoModal, styles.scheduleChoiceModal, { backgroundColor: theme.background }]}>
            <View style={styles.sheetHeader}><Pressable accessibilityLabel="닫기" onPress={() => isScheduleTypeVisible ? setIsScheduleTypeVisible(false) : editorMode !== 'list' ? setEditorMode('list') : setIsMemoEditorVisible(false)} style={styles.sheetIcon}><MaterialCommunityIcons name={editorMode === 'list' ? 'chevron-left' : 'close'} size={24} color={theme.text} /></Pressable><AppText variant="heading">{isScheduleTypeVisible ? '일정 추가' : editorMode === 'list' ? formatCalendarDate(selectedDay.date) : editorMode === 'overtime' ? '초과근무 등록' : getPersonalEventEditorTitle(editingMemoId)}</AppText><View style={styles.sheetIcon} /></View>
            <View style={styles.audienceChoices}>
              <SettingsGroup>
                <SettingsRow title="개인 일정" description="내 캘린더에만 등록"
                  leading={<SettingsIcon name="account-outline" colors={calendarShiftColors.training} />}
                  onPress={() => addScheduleByType('untimed')} />
                <SettingsRow title="공동 일정" description="함께하는 사람과 공유"
                  leading={<SettingsIcon name="account-multiple-outline" colors={calendarShiftColors.annualLeave} />}
                  onPress={() => void addSharedSchedule()} />
              </SettingsGroup>
              <Pressable accessibilityRole="button" onPress={() => setIsScheduleTypeVisible(false)} style={styles.cancelChoice}><AppText tone="secondary">취소</AppText></Pressable>
            </View>
          </ScrollView> : <ScrollView key={isPersonalEditor ? 'personal-editor-scroll' : editorMode} ref={modalKeyboardScroll.scrollRef} onScroll={modalKeyboardScroll.onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.memoContent, isPersonalEditor && { paddingTop: insets.top + spacing.sm }, { paddingBottom: spacing.lg + insets.bottom }]} style={[isPersonalEditor ? styles.fullEditorScroll : styles.memoModal, { backgroundColor: editorMode === 'edit' ? theme.background : theme.surface }]}>
            <View style={styles.sheetHeader}><Pressable accessibilityLabel="닫기" onPress={() => editorMode !== 'list' ? setEditorMode('list') : setIsMemoEditorVisible(false)} style={styles.sheetIcon}><MaterialCommunityIcons name={editorMode === 'list' ? 'chevron-left' : 'close'} size={24} color={theme.text} /></Pressable><AppText variant="heading">{editorMode === 'list' ? formatCalendarDate(selectedDay.date) : editorMode === 'overtime' ? '초과근무 등록' : getPersonalEventEditorTitle(editingMemoId)}</AppText><View style={styles.sheetIcon} /></View>
            {editorMode === 'list' ? <>
            {selectedHoliday ? <AppText style={{ color: holidayDateColor, textAlign: 'center' }}>{selectedHoliday.name}</AppText> : null}
            <View style={[styles.detailShiftCard, { borderColor: theme.border }]}><AppText variant="caption" tone="secondary">근무</AppText><View style={styles.shiftCardRow}><View style={[styles.detailShiftBadge, { backgroundColor: selectedDetailShift.color }]}><AppText style={{ color: selectedDetailShift.textColor, fontWeight: '700' }}>{selectedDetailShift.name}</AppText></View><AppText style={{ fontWeight: '700' }}>{formatShiftTime(selectedDetailShift)}</AppText></View>
            <View style={styles.shiftOptions}>{dateShiftTypes.map((shiftType) => { const selected = selectedShiftTypeId === shiftType.id; return <Pressable key={shiftType.id} onPress={() => setSelectedShiftTypeId(shiftType.id)} style={[styles.shiftOption, { borderColor: theme.border }, selected && { backgroundColor: shiftType.color, borderColor: shiftType.color }]}><AppText style={{ color: selected ? shiftType.textColor : theme.text, fontWeight: '700' }}>{shiftType.abbreviation}</AppText></Pressable>; })}</View>
            {schedule.shiftDateOverrides[selectedDay.date] ? <Pressable onPress={() => void restorePatternShift()} style={styles.restoreButton}><AppText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>기본 근무로 되돌리기</AppText></Pressable> : null}</View>
            <View style={styles.sectionHeader}><AppText style={{ fontWeight: '700' }}>일정 ({selectedMemos.length + selectedEvents.length + selectedSharedEvents.length})</AppText><Pressable accessibilityRole="button" accessibilityLabel="일정 추가" onPress={() => setIsScheduleTypeVisible(true)}><AppText style={{ color: theme.primary, fontWeight: '700' }}>+ 일정 추가</AppText></Pressable></View>
            {selectedMemos.map((memo) => <Pressable key={memo.id} onPress={() => openMemoEditor(memo)} style={[styles.scheduleListRow, { borderColor: theme.border }]}><View style={[styles.scheduleDot, { backgroundColor: memo.color }]} /><View style={styles.scheduleListCopy}><AppText style={{ fontWeight: '700' }}>{memo.text}</AppText><AppText variant="caption" tone="secondary">{!memo.timeEnabled ? '시간 지정 없음' : memo.allDay ? '하루 종일' : `${memo.startTime} ~ ${memo.endTime}`}</AppText></View><MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} /></Pressable>)}
            {selectedEvents.map((event) => <Pressable key={event.id} onPress={() => event.kind === 'shared' ? router.push({ pathname: '/together-event-detail', params: { eventId: event.id } }) : router.push({ pathname: '/events/[id]', params: { id: event.id } })} style={[styles.scheduleListRow, { borderColor: theme.border }]}><View style={[styles.scheduleDot, { backgroundColor: event.kind === 'shared' ? brandColors.coral : event.color ?? DEFAULT_PERSONAL_EVENT_COLOR }]} />{event.kind === 'shared' ? <MaterialCommunityIcons name="account-multiple-outline" size={17} color={brandColors.coral} /> : null}<View style={styles.scheduleListCopy}><AppText style={{ fontWeight: '700' }}>{event.title}</AppText><AppText variant="caption" tone="secondary">{event.allDay ? '하루 종일' : `${event.startTime} ~ ${event.endTime}`}</AppText></View><MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} /></Pressable>)}
            {selectedSharedEvents.map((event) => <View key={event.displayKey} style={[styles.scheduleListRow, { borderColor: theme.border }]}><View style={[styles.scheduleDot, { backgroundColor: brandColors.coral }]} /><MaterialCommunityIcons name="account-multiple-outline" size={17} color={brandColors.coral} /><View style={styles.scheduleListCopy}><AppText style={{ fontWeight: '700' }}>{event.title}</AppText><AppText variant="caption" tone="secondary">{event.startTime} ~ {event.endTime}{event.placeName ? ` · ${event.placeName}` : ''}</AppText></View></View>)}
            {hasSharedEventsError && sharedEventsOwnerUserId === session?.user.id ? <Pressable accessibilityRole="button" onPress={() => setSharedEventsRetryKey((current) => current + 1)}><AppText variant="caption" style={styles.sharedEventsError}>공동 일정을 불러오지 못했어요. 다시 시도</AppText></Pressable> : null}
            {selectedMemos.length + selectedEvents.length + selectedSharedEvents.length === 0 ? <AppText variant="caption" tone="secondary" style={styles.emptyEvents}>등록된 일정이 없어요.</AppText> : null}
            <View style={styles.sectionHeader}><AppText style={{ fontWeight: '700' }}>초과근무 ({selectedOvertimeEntries.length})</AppText><Pressable onPress={openOvertimeEditor}><AppText style={{ color: theme.primary, fontWeight: '700' }}>+ 초과근무 등록</AppText></Pressable></View>
            {selectedOvertimeEntries.map((entry) => {
              const duration = getOvertimeDurationMinutes(entry.startTime, entry.endTime) ?? 0;
              return <View key={entry.id} style={[styles.overtimeRow, { borderColor: theme.border }]}><View style={styles.scheduleListCopy}><View style={styles.overtimeTitleRow}><AppText style={{ fontWeight: '700' }}>{entry.startTime} ~ {entry.endTime}</AppText><AppText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>{formatOvertimeDuration(duration)}</AppText></View>{entry.memo ? <AppText variant="caption" tone="secondary">{entry.memo}</AppText> : null}</View><Pressable accessibilityLabel={`${entry.startTime} 초과근무 삭제`} hitSlop={8} onPress={() => void deleteOvertime(entry.id)}><MaterialCommunityIcons name="trash-can-outline" size={21} color={theme.accent} /></Pressable></View>;
            })}
            {selectedOvertimeEntries.length === 0 ? <AppText variant="caption" tone="secondary" style={styles.emptyEvents}>등록된 초과근무가 없어요.</AppText> : null}
            <View style={[styles.gapDetail, { backgroundColor: '#FDE7E1', borderColor: theme.accent }]}><View style={styles.gapDetailHeader}><AppText style={{ color: theme.accent, fontWeight: '700' }}>오늘의 틈</AppText><AppText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>총 {formatGapDuration(selectedGapResult.totalGapMinutes)}</AppText></View>{selectedGapResult.gaps.map((gap) => <View key={`${gap.startTime}-${gap.endTime}`} style={styles.gapDetailRow}><AppText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>{gap.startTime} ~ {gap.endTime}</AppText><AppText variant="caption" style={{ color: theme.accent }}>{formatGapDuration(gap.durationMinutes)}</AppText></View>)}</View>
            <Pressable onPress={() => void saveShiftEdits()} style={[styles.primarySheetButton, { backgroundColor: theme.primary }]}><AppText style={{ color: theme.surface, fontWeight: '700' }}>완료</AppText></Pressable>
            </> : editorMode === 'edit' ? <>
            <AppText style={styles.editorLabel}>일정 제목</AppText>
            <TextInput
              accessibilityLabel="일정 제목 입력"
              onFocus={modalKeyboardScroll.onInputFocus}
              placeholder="일정 제목을 입력하세요"
              placeholderTextColor={theme.textSecondary}
              value={memoInput}
              onChangeText={setMemoInput}
              style={[styles.memoInput, { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }]}
            />
            <AppText style={styles.editorLabel}>일정 시간</AppText>
            <View style={[styles.timeMode, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              {([{ id: 'timed', title: '시간 있음' }, { id: 'allDay', title: '하루 종일' }, { id: 'untimed', title: '시간 없음' }] as const).map(option => {
                const selected = option.id === (!memoTimeEnabled ? 'untimed' : memoAllDay ? 'allDay' : 'timed');
                return <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={option.title} accessibilityState={{ selected }}
                  onPress={() => { setMemoTimeEnabled(option.id !== 'untimed'); setMemoAllDay(option.id === 'allDay'); }}
                  style={[styles.timeModeOption, selected && { backgroundColor: theme.primary }]}>
                  <AppText style={{ color: selected ? theme.surface : theme.text, fontWeight: '700', textAlign: 'center' }}>{option.title}</AppText>
                </Pressable>;
              })}
            </View>
            {memoTimeEnabled && !memoAllDay ? <>
                  <View style={styles.timeRow}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`시작 시간 ${memoStartTime}`} onPress={() => { setIsMemoEditorVisible(false); setMemoTimePicker('start'); }} style={[styles.timeButton, { borderColor: theme.border }]}>
                      <AppText variant="caption" tone="secondary">시작</AppText>
                      <AppText style={styles.timeValue}>{memoStartTime}</AppText>
                    </Pressable>
                    <AppText tone="secondary">~</AppText>
                    <Pressable accessibilityRole="button" accessibilityLabel={`종료 시간 ${memoEndTime}`} onPress={() => { setIsMemoEditorVisible(false); setMemoTimePicker('end'); }} style={[styles.timeButton, { borderColor: theme.border }]}>
                      <AppText variant="caption" tone="secondary">종료</AppText>
                      <AppText style={styles.timeValue}>{memoEndTime}</AppText>
                    </Pressable>
                  </View>
                  <AppText variant="caption" tone="secondary">개인 일정 알림은 환경설정 → 알림 설정에서 관리해요.</AppText>
            </> : memoTimeEnabled ? <AppText variant="caption" tone="secondary" style={styles.allDayNotice}>하루 종일 일정은 하루 전체를 사용합니다.</AppText> : null}
            <AppText style={styles.editorLabel}>일정 색상</AppText>
            <View style={styles.memoPalette}>{memoColors.map((color) => <Pressable key={color} accessibilityLabel={`${color} 일정 색상`} onPress={() => setMemoColor(color)} style={[styles.memoColor, { backgroundColor: color }, memoColor === color && { borderColor: theme.primary, borderWidth: 3 }]} />)}<Pressable accessibilityLabel="사용자 지정 일정 색상" onPress={() => { setIsMemoEditorVisible(false); setIsColorPickerVisible(true); }} style={[styles.memoColor, styles.customColor, { borderColor: theme.border }]}><AppText variant="heading" tone="secondary">+</AppText></Pressable></View>
            {editingMemoId ? <Pressable onPress={() => void deleteSchedule()} style={styles.deleteButton}><AppText style={{ color: theme.accent, fontWeight: '700' }}>일정 삭제</AppText></Pressable> : null}
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" onPress={() => setEditorMode('list')} style={[styles.modalButton, { borderColor: theme.border }]}>
                <AppText style={{ fontWeight: '700' }}>취소</AppText>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => { void saveSchedule(); }} style={[styles.modalButton, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                <AppText style={{ color: theme.surface, fontWeight: '700' }}>저장</AppText>
              </Pressable>
            </View>
            </> : <>
            <AppText variant="caption" tone="secondary" style={styles.modalDate}>{formatCalendarDate(selectedDay.date)}</AppText>
            <View style={styles.timeRow}>
              <Pressable accessibilityRole="button" accessibilityLabel={`초과근무 시작 시간 ${overtimeStartTime}`} onPress={() => { setIsMemoEditorVisible(false); setOvertimeTimePicker('start'); }} style={[styles.timeButton, { borderColor: theme.border }]}><AppText variant="caption" tone="secondary">시작</AppText><AppText style={styles.timeValue}>{overtimeStartTime}</AppText></Pressable>
              <AppText tone="secondary">~</AppText>
              <Pressable accessibilityRole="button" accessibilityLabel={`초과근무 종료 시간 ${overtimeEndTime}`} onPress={() => { setIsMemoEditorVisible(false); setOvertimeTimePicker('end'); }} style={[styles.timeButton, { borderColor: theme.border }]}><AppText variant="caption" tone="secondary">종료</AppText><AppText style={styles.timeValue}>{overtimeEndTime}</AppText></Pressable>
            </View>
            {overtimeEndTime < overtimeStartTime ? <AppText variant="caption" tone="secondary" style={styles.overnightNotice}>종료 시간은 다음날로 계산돼요.</AppText> : null}
            <AppText style={styles.editorLabel}>메모 (선택)</AppText>
            <TextInput accessibilityLabel="초과근무 메모" onFocus={modalKeyboardScroll.onInputFocus} maxLength={200} onChangeText={setOvertimeMemo} placeholder="예: 업무 마무리" placeholderTextColor={theme.textSecondary} style={[styles.memoInput, { borderColor: theme.border, color: theme.text }]} value={overtimeMemo} />
            <View style={styles.modalActions}><Pressable accessibilityRole="button" onPress={() => setEditorMode('list')} style={[styles.modalButton, { borderColor: theme.border }]}><AppText style={{ fontWeight: '700' }}>취소</AppText></Pressable><Pressable accessibilityRole="button" disabled={isSavingOvertime} onPress={() => void saveOvertime()} style={[styles.modalButton, { backgroundColor: theme.primary, borderColor: theme.primary }, isSavingOvertime && styles.disabled]}><AppText style={{ color: theme.surface, fontWeight: '700' }}>{isSavingOvertime ? '저장 중...' : '저장'}</AppText></Pressable></View>
            </>}
          </ScrollView>}
          </KeyboardAvoidingView>
        </View>
      </Modal>


      <ColorPickerModal visible={isColorPickerVisible} initialColor={memoColor} representativeColors={getRepresentativeShiftColors(schedule.shiftTypes)} onClose={() => { setIsColorPickerVisible(false); setIsMemoEditorVisible(true); }} onSelect={(color) => setMemoColor(color)} />
      <TimePickerSheet
        visible={memoTimePicker !== null}
        title={memoTimePicker === 'start' ? '시작 시간' : '종료 시간'}
        value={memoTimePicker === 'start' ? memoStartTime : memoEndTime}
        onClose={() => { setMemoTimePicker(null); setIsMemoEditorVisible(true); }}
        onConfirm={(value) => {
          if (memoTimePicker === 'start') setMemoStartTime(value);
          if (memoTimePicker === 'end') setMemoEndTime(value);
          setMemoTimePicker(null);
          setIsMemoEditorVisible(true);
        }}
      />
      <TimePickerSheet
        visible={overtimeTimePicker !== null}
        title={overtimeTimePicker === 'start' ? '초과근무 시작 시간' : '초과근무 종료 시간'}
        value={overtimeTimePicker === 'start' ? overtimeStartTime : overtimeEndTime}
        onClose={() => { setOvertimeTimePicker(null); setIsMemoEditorVisible(true); }}
        onConfirm={(value) => {
          if (overtimeTimePicker === 'start') setOvertimeStartTime(value);
          if (overtimeTimePicker === 'end') setOvertimeEndTime(value);
          setOvertimeTimePicker(null);
          setIsMemoEditorVisible(true);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: spacing.sm,
    paddingBottom: 0,
  },
  audienceChoices: { paddingTop: spacing.sm },
  cancelChoice: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  memoContent: { paddingBottom: spacing.xl },
  timeMode: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.md, padding: spacing.xxs, marginTop: spacing.xs },
  timeModeOption: { flex: 1, borderRadius: radius.sm, minHeight: 44, justifyContent: 'center', padding: spacing.xxs },
  content: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  headerIcon: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerActions: { flexDirection: 'row' },
  viewSwitcher: { borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', marginTop: spacing.sm, padding: 3 },
  viewSwitchButton: { alignItems: 'center', borderRadius: radius.sm, flex: 1, justifyContent: 'center', minHeight: 36 },
  monthNavigation: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  monthButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  monthTitleGroup: { alignItems: 'center' },
  twoWeekPeriod: { flex: 1, textAlign: 'center' },
  twoWeekSummary: { borderRadius: radius.md, borderWidth: 1, marginTop: spacing.xs, padding: spacing.xxs },
  twoWeekSummaryGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  twoWeekSummaryCell: { alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, justifyContent: 'center', minHeight: 68, paddingHorizontal: 1, paddingVertical: spacing.xxs, width: '14.2857%' },
  twoWeekSummaryDate: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  twoWeekSummaryShift: { alignItems: 'center', borderRadius: radius.sm, justifyContent: 'center', marginTop: 2, minHeight: 18, minWidth: 25, maxWidth: '100%', paddingHorizontal: 3 },
  twoWeekSummaryShiftText: { fontSize: 10, fontWeight: '700' },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  filterButton: {
    alignItems: 'center',
    borderRadius: radius.xxl,
    borderWidth: 1,
    flex: 1,
    minHeight: 32,
    justifyContent: 'center',
  },
  calendarCard: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: spacing.xxs,
  },
  weekday: {
    textAlign: 'center',
    width: '14.2857%',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  agendaList: { gap: spacing.xs, marginTop: spacing.xs },
  agendaDay: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  agendaDayCompact: { paddingVertical: spacing.xs },
  agendaHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  agendaDateGroup: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm },
  agendaDate: { fontSize: 16, fontWeight: '700' },
  agendaShift: { borderRadius: radius.sm, minWidth: 34, paddingHorizontal: spacing.sm, paddingVertical: 3, alignItems: 'center' },
  agendaItems: { gap: spacing.xs, paddingTop: spacing.sm },
  agendaItem: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  agendaItemIcon: { marginTop: 2, width: 17 },
  agendaDot: { borderRadius: 3, height: 6, marginTop: 7, width: 6 },
  agendaItemCopy: { flex: 1, flexDirection: 'row', gap: spacing.xs },
  agendaItemTitle: { flex: 1 },
  calendarCell: {
    alignItems: 'center',
    borderRadius: radius.sm,
    // Android can retain an empty clip after the selection border is removed.
    // Clip preview rows themselves, never the entire date cell.
    overflow: 'visible',
    paddingTop: 1,
    width: '14.2857%',
  },
  dateHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', height: 17, width: '94%', gap: 2 },
  holidayDateHeader: { justifyContent: 'flex-start', gap: 1 },
  holidayDayNumber: { width: 20, flexShrink: 0, fontSize: 12.5, textAlign: 'center' },
  holidayName: { flex: 1, minWidth: 0, fontSize: 8.5, lineHeight: 17 },
  dayNumber: {
    fontSize: 14.5,
    fontWeight: '600',
    lineHeight: 17,
  },
  shiftChip: {
    alignItems: 'center',
    borderRadius: radius.sm,
    justifyContent: 'center',
    marginTop: 1,
    height: 19,
    minWidth: 32,
    paddingHorizontal: spacing.xs,
    paddingVertical: 0,
  },
  shiftLabel: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 15,
  },
  memoPreview: {
    fontSize: 9.5,
    fontWeight: '600',
    lineHeight: 10.5,
    includeFontPadding: false,
    flex: 1,
  },
  memoSlot: { gap: 0, height: 42, marginTop: 0, position: 'relative', width: '100%' },
  monthScheduleRow: { alignItems: 'center', flexDirection: 'row', gap: 1, height: 10.5, overflow: 'hidden', paddingHorizontal: 0, width: '100%' },
  monthScheduleDot: { borderRadius: 2, flexShrink: 0, height: 3, width: 3 },
  morePreview: { fontSize: 9.5, fontWeight: '800', lineHeight: 10.5, includeFontPadding: false },
  fold: { borderBottomWidth: 6, borderLeftColor: 'transparent', borderLeftWidth: 6, bottom: 0, height: 0, position: 'absolute', right: 0, width: 0 },
  detailSection: {
    marginTop: spacing.xxl,
  },
  detailCard: {
    marginTop: spacing.md,
  },
  shiftSummary: {
    borderRadius: radius.md,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  memoDetail: {
    borderRadius: radius.sm,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  memoDetailHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  memoDetailText: {
    marginTop: spacing.xs,
  },
  addMemoRow: {
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  eventsSection: { borderTopWidth: 1, marginTop: spacing.md, paddingTop: spacing.md },
  eventCard: { borderRadius: radius.md, borderWidth: 1, marginTop: spacing.sm, padding: spacing.md },
  eventTitleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  eventTitle: { fontWeight: '700', paddingRight: spacing.sm },
  eventTimeRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  emptyEvents: { marginTop: spacing.sm },
  sharedEventsError: { color: brandColors.coral, marginTop: spacing.sm },
  overtimeRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 58, paddingVertical: spacing.sm },
  overtimeTitleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  overnightNotice: { marginTop: spacing.xs },
  disabled: { opacity: 0.55 },
  editDateButton: { alignItems: 'center', borderRadius: radius.md, justifyContent: 'center', marginTop: spacing.md, minHeight: 46 },
  gapDetail: {
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  gapDetailHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  gapDetailRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  modalOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalKeyboardAvoider: { flex: 1, justifyContent: 'flex-end' },
  fullEditorOverlay: { flex: 1 },
  fullEditorKeyboardAvoider: { flex: 1 },
  fullEditorScroll: { flex: 1, paddingHorizontal: spacing.md },
  modalBackdrop: { flex: 1 },
  memoModal: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
    padding: spacing.md,
  },
  scheduleChoiceModal: { flexGrow: 0, maxHeight: '40%' },
  modalDate: {
    marginTop: spacing.xs,
  },
  memoInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.md,
    minHeight: 48,
    padding: spacing.sm,
  },
  toggleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  toggleCopy: { flex: 1, paddingRight: spacing.md },
  timeRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  timeButton: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flex: 1, padding: spacing.sm },
  timeValue: { fontSize: 18, fontWeight: '700', marginTop: spacing.xxs },
  reminderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  reminderButton: { borderRadius: radius.xl, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  deleteButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  sheetIcon: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  detailShiftCard: { borderRadius: radius.md, borderWidth: 1, marginTop: spacing.sm, padding: spacing.md },
  shiftCardRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  detailShiftBadge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg },
  scheduleListRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 58, paddingVertical: spacing.sm },
  scheduleDot: { borderRadius: 5, height: 10, width: 10 },
  scheduleListCopy: { flex: 1 },
  selectionRow: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, minHeight: 46, paddingHorizontal: spacing.md },
  allDayNotice: { marginTop: spacing.sm },
  primarySheetButton: { alignItems: 'center', borderRadius: radius.md, justifyContent: 'center', marginTop: spacing.md, minHeight: 48 },
  compactSheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xl },
  typeCard: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, minHeight: 68, padding: spacing.md },
  radioRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 46 },
  editorLabel: { fontWeight: '700', marginTop: spacing.md },
  shiftOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  shiftOption: { alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, height: 42, justifyContent: 'center', minWidth: 42, paddingHorizontal: spacing.sm },
  restoreButton: { alignSelf: 'flex-start', marginTop: spacing.sm, paddingVertical: spacing.xxs },
  memoPalette: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm, marginTop: spacing.sm },
  memoColor: { borderColor: 'transparent', borderRadius: 16, borderWidth: 1, height: 32, width: 32 },
  customColor: { alignItems: 'center', backgroundColor: 'transparent', justifyContent: 'center' },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  modalButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
});
