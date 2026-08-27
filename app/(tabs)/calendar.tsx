import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, TextInput, useWindowDimensions, View } from 'react-native';

import { AppText, Card, Screen } from '../../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../../src/constants';
import { calculateDailyGaps, formatGapDuration, type GapCalculationResult } from '../../src/features/gaps/gapCalculator';
import type { ShiftType } from '../../src/features/shift-settings/mockData';
import { formatShiftTime, getRepresentativeShiftColors } from '../../src/features/shift-settings/mockData';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { createMonthlyShiftSchedule, getPatternShiftForDate, getPreviousIsoDate, getShiftForDate, type ShiftScheduleInput } from '../../src/features/shifts/shiftSchedule';
import { ColorPickerModal } from '../../src/features/colors/ColorPickerModal';
import { getReadableTextColor } from '../../src/features/colors/recentColorStorage';
import { DEFAULT_MEMO_COLOR } from '../../src/features/memos/dateMemoStorage';
import type { DateMemo } from '../../src/features/memos/dateMemoStorage';
import { createMemoBusyEvents } from '../../src/features/memos/memoBusyEvents';
import { getMemoCalendarPreview } from '../../src/features/memos/memoCalendarPreview';
import { getCalendarDateKind } from '../../src/features/calendar/koreanHolidays';
import { dismissCalendarDateTip, loadCalendarDateTipDismissed } from '../../src/features/calendar/calendarDateTipStorage';
import { TimePickerSheet } from '../../src/features/events/EventPickerSheets';
import { DEFAULT_PERSONAL_EVENT_COLOR } from '../../src/features/events/personalEventPresentation';
import { formatDateMemoForMonthlyWidget, formatPersonalEventForMonthlyWidget } from '../../src/features/widget/monthlyWidgetPresentation';

type CalendarFilter = '전체' | '근무' | '일정';

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

function getMonthGrid(year: number, month: number, days: CalendarDay[]) {
  const firstWeekday = new Date(year, month - 1, 1, 12).getDay();
  const remainingCells = 42 - firstWeekday - days.length;

  return [
    ...Array<CalendarDay | null>(firstWeekday).fill(null),
    ...days,
    ...Array<CalendarDay | null>(remainingCells).fill(null),
  ];
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
  const theme = useAppTheme();
  const { height: windowHeight } = useWindowDimensions();
  const router = useRouter();
  const schedule = useShiftSchedule();
  const today = new Date();
  const todayDate = toLocalIsoDate(today);
  const [selectedFilter, setSelectedFilter] = useState<CalendarFilter>('전체');
  const [displayedMonth, setDisplayedMonth] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() + 1 }));
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [isMemoEditorVisible, setIsMemoEditorVisible] = useState(false);
  const [editorMode, setEditorMode] = useState<'list' | 'edit'>('list');
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
  const [isReminderSheetVisible, setIsReminderSheetVisible] = useState(false);
  const [selectedShiftTypeId, setSelectedShiftTypeId] = useState('');
  const [showDateTip, setShowDateTip] = useState(false);
  const calendarDays: CalendarDay[] = createMonthlyShiftSchedule(displayedMonth.year, displayedMonth.month, schedule).map((item) => {
    return {
      day: item.day,
      date: item.date,
      shift: item.shift,
    };
  });
  const selectedDay = calendarDays.find((day) => day.date === selectedDate) ?? calendarDays[0];
  const selectedGapResult = getGapResultForDate(selectedDay.date, schedule);
  const selectedMemos = schedule.dateMemos[selectedDay.date] ?? [];
  const selectedEvents = schedule.personalEvents.filter((event) => event.date === selectedDay.date).sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const selectedDetailShift = schedule.shiftTypes.find((shift) => shift.id === selectedShiftTypeId) ?? selectedDay.shift;
  const showMemosInMonth = selectedFilter !== '근무';
  const calendarGrid = getMonthGrid(displayedMonth.year, displayedMonth.month, calendarDays);
  const calendarRowHeight = Math.max(78, Math.min(80, Math.floor((windowHeight - 274) / 6)));

  useEffect(() => {
    if (!schedule.isHydrated || !schedule.hasCompletedSetup) return;
    let active = true;
    void loadCalendarDateTipDismissed().then((dismissed) => { if (active) setShowDateTip(!dismissed); });
    return () => { active = false; };
  }, [schedule.hasCompletedSetup, schedule.isHydrated]);

  const hideDateTip = () => {
    setShowDateTip(false);
    void dismissCalendarDateTip();
  };

  const moveMonth = (offset: number) => {
    const nextMonth = new Date(displayedMonth.year, displayedMonth.month - 1 + offset, 1, 12);
    const nextYear = nextMonth.getFullYear();
    const nextMonthNumber = nextMonth.getMonth() + 1;

    setDisplayedMonth({ year: nextYear, month: nextMonthNumber });
    setSelectedDate(toLocalIsoDate(new Date(nextYear, nextMonthNumber - 1, 1, 12)));
  };

  const openDateDetails = () => {
    setSelectedShiftTypeId(selectedDay.shift.id);
    setEditorMode('list');
    setIsMemoEditorVisible(true);
  };

  const openDateDetailsForDay = (day: CalendarDay) => {
    if (showDateTip) hideDateTip();
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

  const addScheduleByType = (type: 'timed' | 'untimed') => {
    openMemoEditor();
    setMemoTimeEnabled(type !== 'untimed');
    setMemoAllDay(false);
    setIsScheduleTypeVisible(false);
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
      <View style={styles.content}>
        <View style={styles.header}>
          <AppText variant="heading">캘린더</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="선택 날짜 일정 관리" onPress={openDateDetails} style={styles.headerIcon}>
            <MaterialCommunityIcons name="calendar-edit-outline" size={23} color={theme.primary} />
          </Pressable>
        </View>

        <View style={[styles.monthNavigation, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Pressable accessibilityLabel="이전 달" onPress={() => moveMonth(-1)} style={styles.monthButton}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={theme.textSecondary} />
          </Pressable>
          <AppText variant="heading">{displayedMonth.year}년 {displayedMonth.month}월</AppText>
          <Pressable accessibilityLabel="다음 달" onPress={() => moveMonth(1)} style={styles.monthButton}>
            <MaterialCommunityIcons name="chevron-right" size={24} color={theme.textSecondary} />
          </Pressable>
        </View>

        <View accessibilityRole="tablist" style={styles.filterRow}>
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
        </View>

        {showDateTip ? <Pressable accessibilityRole="button" accessibilityLabel="날짜 일정 추가 안내 닫기" onPress={hideDateTip} style={[styles.dateTip, { backgroundColor: brandColors.deepNavy }]}><AppText variant="caption" style={styles.dateTipText}>날짜를 눌러 일정을 추가할 수 있어요</AppText><View style={[styles.dateTipPointer, { borderTopColor: brandColors.deepNavy }]} /></Pressable> : null}

        <Card style={styles.calendarCard}>
          <View style={styles.weekdayRow}>
            {weekdays.map((weekday, index) => (
              <AppText
                key={`weekday-${index}-${weekday}`}
                variant="caption"
                style={[styles.weekday, { color: index === 0 ? theme.accent : theme.textSecondary }]}
              >
                {weekday}
              </AppText>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendarGrid.map((day, index) => {
              if (!day) {
                return <View key={`blank-${index}`} style={styles.calendarCell} />;
              }

              const shift = day.shift;
              const memos = showMemosInMonth ? schedule.dateMemos[day.date] ?? [] : [];
              const events = showMemosInMonth ? schedule.personalEvents.filter((event) => event.date === day.date) : [];
              const calendarPreviewItems = [
                ...getMemoCalendarPreview(memos).visible.map((memo) => ({ id: `memo-${memo.id}`, text: formatDateMemoForMonthlyWidget(memo), color: memo.color, shared: false })),
                ...events.map((event) => ({
                  id: `event-${event.id}`,
                  text: formatPersonalEventForMonthlyWidget(event),
                  color: event.kind === 'shared' ? brandColors.coral : event.color ?? DEFAULT_PERSONAL_EVENT_COLOR,
                  shared: event.kind === 'shared',
                })),
              ].slice(0, 2);
              const remainingPreviewCount = Math.max(0, memos.length + events.length - calendarPreviewItems.length);
              const isSelected = day.date === selectedDay.date;
              const isToday = day.date === todayDate;
              const dateKind = getCalendarDateKind(day.date);
              const dateColor = dateKind === 'holiday' || dateKind === 'sunday'
                ? holidayDateColor
                : dateKind === 'saturday'
                  ? saturdayDateColor
                  : weekdayDateColor;

              return (
                <Pressable
                  key={day.date}
                  accessibilityLabel={`${formatCalendarDate(day.date)}, ${shift.name}`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => openDateDetailsForDay(day)}
                  style={[
                    styles.calendarCell,
                    { height: calendarRowHeight },
                    isToday && { borderColor: theme.accent, borderWidth: 1 },
                    isSelected && { backgroundColor: brandColors.warmIvory, borderColor: theme.primary, borderWidth: 2 },
                  ]}
                >
                  <AppText variant="caption" style={[styles.dayNumber, { color: dateColor }]}>
                    {day.day}
                  </AppText>
                  <View style={[styles.shiftChip, { backgroundColor: shift.color }]}>
                    <AppText style={[styles.shiftLabel, { color: shift.textColor }]}>{shift.abbreviation}</AppText>
                  </View>
                  <View style={styles.memoSlot}>
                    {calendarPreviewItems.map((item, itemIndex) => <View key={item.id} style={[styles.monthSchedulePostIt, { backgroundColor: item.color }]}>{item.shared ? <MaterialCommunityIcons name="account-multiple-outline" size={8} color={brandColors.white} /> : null}<AppText numberOfLines={1} ellipsizeMode="tail" style={[styles.memoPreview, { color: getReadableTextColor(item.color) }]}>{item.text}{itemIndex === calendarPreviewItems.length - 1 && remainingPreviewCount > 0 ? ` +${remainingPreviewCount}` : ''}</AppText><View style={styles.postItFold} /></View>)}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>

      </View>

      <Modal transparent animationType="slide" visible={isMemoEditorVisible} onRequestClose={() => setIsMemoEditorVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={[styles.memoModal, { backgroundColor: theme.surface }]}>
            <View style={styles.sheetHeader}><Pressable accessibilityLabel="닫기" onPress={() => editorMode === 'edit' ? setEditorMode('list') : setIsMemoEditorVisible(false)} style={styles.sheetIcon}><MaterialCommunityIcons name={editorMode === 'list' ? 'chevron-left' : 'close'} size={24} color={theme.text} /></Pressable><AppText variant="heading">{editorMode === 'list' ? formatCalendarDate(selectedDay.date) : editingMemoId ? '일정 편집' : '일정 추가'}</AppText><View style={styles.sheetIcon} /></View>
            {editorMode === 'list' ? <>
            <View style={[styles.detailShiftCard, { borderColor: theme.border }]}><AppText variant="caption" tone="secondary">근무</AppText><View style={styles.shiftCardRow}><View style={[styles.detailShiftBadge, { backgroundColor: selectedDetailShift.color }]}><AppText style={{ color: selectedDetailShift.textColor, fontWeight: '700' }}>{selectedDetailShift.name}</AppText></View><AppText style={{ fontWeight: '700' }}>{formatShiftTime(selectedDetailShift)}</AppText></View>
            <View style={styles.shiftOptions}>{schedule.shiftTypes.map((shiftType) => { const selected = selectedShiftTypeId === shiftType.id; return <Pressable key={shiftType.id} onPress={() => setSelectedShiftTypeId(shiftType.id)} style={[styles.shiftOption, { borderColor: theme.border }, selected && { backgroundColor: shiftType.color, borderColor: shiftType.color }]}><AppText style={{ color: selected ? shiftType.textColor : theme.text, fontWeight: '700' }}>{shiftType.abbreviation}</AppText></Pressable>; })}</View>
            {schedule.shiftDateOverrides[selectedDay.date] ? <Pressable onPress={() => void restorePatternShift()} style={styles.restoreButton}><AppText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>기본 근무로 되돌리기</AppText></Pressable> : null}</View>
            <View style={styles.sectionHeader}><AppText style={{ fontWeight: '700' }}>일정 ({selectedMemos.length + selectedEvents.length})</AppText><Pressable onPress={() => { setIsMemoEditorVisible(false); setIsScheduleTypeVisible(true); }}><AppText style={{ color: theme.primary, fontWeight: '700' }}>+ 일정 추가</AppText></Pressable></View>
            {selectedMemos.map((memo) => <Pressable key={memo.id} onPress={() => openMemoEditor(memo)} style={[styles.scheduleListRow, { borderColor: theme.border }]}><View style={[styles.scheduleDot, { backgroundColor: memo.color }]} /><View style={styles.scheduleListCopy}><AppText style={{ fontWeight: '700' }}>{memo.text}</AppText><AppText variant="caption" tone="secondary">{!memo.timeEnabled ? '시간 지정 없음' : memo.allDay ? '하루 종일' : `${memo.startTime} ~ ${memo.endTime}`}</AppText></View>{memo.reminderMinutes !== null ? <MaterialCommunityIcons name="bell-outline" size={18} color={theme.primary} /> : null}<MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} /></Pressable>)}
            {selectedEvents.map((event) => <Pressable key={event.id} onPress={() => event.kind === 'shared' ? router.push({ pathname: '/together-event-detail', params: { eventId: event.id } }) : router.push({ pathname: '/events/[id]', params: { id: event.id } })} style={[styles.scheduleListRow, { borderColor: theme.border }]}><View style={[styles.scheduleDot, { backgroundColor: event.kind === 'shared' ? brandColors.coral : event.color ?? DEFAULT_PERSONAL_EVENT_COLOR }]} />{event.kind === 'shared' ? <MaterialCommunityIcons name="account-multiple-outline" size={17} color={brandColors.coral} /> : null}<View style={styles.scheduleListCopy}><AppText style={{ fontWeight: '700' }}>{event.title}</AppText><AppText variant="caption" tone="secondary">{event.allDay ? '하루 종일' : `${event.startTime} ~ ${event.endTime}`}</AppText></View><MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} /></Pressable>)}
            {selectedMemos.length + selectedEvents.length === 0 ? <AppText variant="caption" tone="secondary" style={styles.emptyEvents}>등록된 일정이 없어요.</AppText> : null}
            <View style={[styles.gapDetail, { backgroundColor: '#FDE7E1', borderColor: theme.accent }]}><View style={styles.gapDetailHeader}><AppText style={{ color: theme.accent, fontWeight: '700' }}>오늘의 틈</AppText><AppText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>총 {formatGapDuration(selectedGapResult.totalGapMinutes)}</AppText></View>{selectedGapResult.gaps.map((gap) => <View key={`${gap.startTime}-${gap.endTime}`} style={styles.gapDetailRow}><AppText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>{gap.startTime} ~ {gap.endTime}</AppText><AppText variant="caption" style={{ color: theme.accent }}>{formatGapDuration(gap.durationMinutes)}</AppText></View>)}</View>
            <Pressable onPress={() => void saveShiftEdits()} style={[styles.primarySheetButton, { backgroundColor: theme.primary }]}><AppText style={{ color: theme.surface, fontWeight: '700' }}>완료</AppText></Pressable>
            </> : <>
            <AppText style={styles.editorLabel}>일정 제목</AppText>
            <TextInput
              accessibilityLabel="일정 제목 입력"
              autoFocus
              placeholder="일정 제목을 입력하세요"
              placeholderTextColor={theme.textSecondary}
              value={memoInput}
              onChangeText={setMemoInput}
              style={[styles.memoInput, { borderColor: theme.border, color: theme.text }]}
            />
            <View style={styles.toggleRow}>
              <View style={styles.toggleCopy}>
                <AppText style={{ fontWeight: '700' }}>시간 지정</AppText>
                <AppText variant="caption" tone="secondary">지정한 시간은 오늘의 틈 계산에 반영됩니다.</AppText>
              </View>
              <Switch value={memoTimeEnabled} onValueChange={setMemoTimeEnabled} trackColor={{ true: theme.primary }} />
            </View>
            {memoTimeEnabled ? (
              <>
                <View style={styles.toggleRow}>
                  <AppText style={{ fontWeight: '700' }}>하루 종일</AppText>
                  <Switch value={memoAllDay} onValueChange={setMemoAllDay} trackColor={{ true: theme.primary }} />
                </View>
                {!memoAllDay ? (
                  <>
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
                  <View style={styles.toggleRow}><AppText style={{ fontWeight: '700' }}>알림</AppText><Switch value={memoReminderMinutes !== null} onValueChange={(enabled) => setMemoReminderMinutes(enabled ? 10 : null)} trackColor={{ true: theme.primary }} /></View>
                  {memoReminderMinutes !== null ? <><AppText style={styles.editorLabel}>알림 시간</AppText><Pressable onPress={() => { setIsMemoEditorVisible(false); setIsReminderSheetVisible(true); }} style={[styles.selectionRow, { borderColor: theme.border }]}><AppText>{memoReminderMinutes === 0 ? '정각' : memoReminderMinutes === 60 ? '1시간 전' : `${memoReminderMinutes}분 전`}</AppText><MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} /></Pressable></> : null}
                  </>
                ) : <AppText variant="caption" tone="secondary" style={styles.allDayNotice}>하루 종일 일정은 하루 전체를 사용합니다.</AppText>}
              </>
            ) : null}
            <AppText style={styles.editorLabel}>일정 색상</AppText>
            <View style={styles.memoPalette}>{memoColors.map((color) => <Pressable key={color} accessibilityLabel={`${color} 일정 색상`} onPress={() => setMemoColor(color)} style={[styles.memoColor, { backgroundColor: color }, memoColor === color && { borderColor: theme.primary, borderWidth: 3 }]} />)}<Pressable accessibilityLabel="사용자 지정 일정 색상" onPress={() => { setIsMemoEditorVisible(false); setIsColorPickerVisible(true); }} style={[styles.memoColor, styles.customColor, { borderColor: theme.border }]}><AppText variant="heading" tone="secondary">+</AppText></Pressable></View>
            {editingMemoId ? <Pressable onPress={() => void deleteSchedule()} style={styles.deleteButton}><AppText style={{ color: theme.accent, fontWeight: '700' }}>일정 삭제</AppText></Pressable> : null}
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" onPress={() => setEditorMode('list')} style={[styles.modalButton, { borderColor: theme.border }]}>
                <AppText style={{ fontWeight: '700' }}>취소</AppText>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => { void saveSchedule(); }} style={[styles.modalButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                <AppText style={{ color: theme.surface, fontWeight: '700' }}>저장</AppText>
              </Pressable>
            </View>
            </>}
          </ScrollView>
        </View>
      </Modal>
      <Modal transparent animationType="slide" visible={isScheduleTypeVisible} onRequestClose={() => setIsScheduleTypeVisible(false)}>
        <View style={styles.modalOverlay}><View style={[styles.compactSheet, { backgroundColor: theme.surface }]}><View style={styles.sheetHeader}><AppText variant="heading">일정 추가</AppText><Pressable onPress={() => setIsScheduleTypeVisible(false)} style={styles.sheetIcon}><MaterialCommunityIcons name="close" size={24} color={theme.text} /></Pressable></View>{([
          { id: 'timed', icon: 'clock-outline', title: '시간 있는 일정', description: '시작/종료 시간을 설정하는 일정' },
          { id: 'untimed', icon: 'bookmark-outline', title: '시간 없는 일정', description: '시간은 없지만 기억할 일정' },
        ] as const).map((option) => <Pressable key={option.id} onPress={() => addScheduleByType(option.id)} style={[styles.typeCard, { borderColor: theme.border }]}><MaterialCommunityIcons name={option.icon} size={24} color={theme.primary} /><View style={styles.scheduleListCopy}><AppText style={{ fontWeight: '700' }}>{option.title}</AppText><AppText variant="caption" tone="secondary">{option.description}</AppText></View><MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} /></Pressable>)}</View></View>
      </Modal>
      <Modal transparent animationType="slide" visible={isReminderSheetVisible} onRequestClose={() => { setIsReminderSheetVisible(false); setIsMemoEditorVisible(true); }}>
        <View style={styles.modalOverlay}><View style={[styles.compactSheet, { backgroundColor: theme.surface }]}><View style={styles.sheetHeader}><AppText variant="heading">알림 시간 선택</AppText><Pressable onPress={() => { setIsReminderSheetVisible(false); setIsMemoEditorVisible(true); }} style={styles.sheetIcon}><MaterialCommunityIcons name="close" size={24} color={theme.text} /></Pressable></View>{([null, 0, 5, 10, 30, 60] as const).map((minutes) => { const selected = memoReminderMinutes === minutes; const label = minutes === null ? '알림 없음' : minutes === 0 ? '정각' : minutes === 60 ? '1시간 전' : `${minutes}분 전`; return <Pressable key={String(minutes)} onPress={() => setMemoReminderMinutes(minutes)} style={styles.radioRow}><MaterialCommunityIcons name={selected ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={selected ? theme.primary : theme.textSecondary} /><AppText>{label}</AppText></Pressable>; })}<Pressable onPress={() => { setIsReminderSheetVisible(false); setIsMemoEditorVisible(true); }} style={[styles.primarySheetButton, { backgroundColor: theme.primary }]}><AppText style={{ color: theme.surface, fontWeight: '700' }}>확인</AppText></Pressable></View></View>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: spacing.sm,
    paddingBottom: 0,
  },
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
  calendarCell: {
    alignItems: 'center',
    borderRadius: radius.sm,
    overflow: 'hidden',
    paddingTop: 2,
    width: '14.2857%',
  },
  dayNumber: {
    fontSize: 14.5,
    fontWeight: '600',
    lineHeight: 19,
  },
  shiftChip: {
    alignItems: 'center',
    borderRadius: radius.sm,
    justifyContent: 'center',
    marginTop: 2,
    height: 22,
    minWidth: 32,
    paddingHorizontal: spacing.xs,
    paddingVertical: 0,
  },
  shiftLabel: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 17,
  },
  memoPreview: {
    fontSize: 10,
    lineHeight: 11,
    flex: 1,
  },
  memoSlot: { alignItems: 'center', gap: 2, height: 26, marginTop: 3, position: 'relative', width: '94%' },
  monthSchedulePostIt: { alignItems: 'center', borderCurve: 'continuous', borderRadius: 2, flexDirection: 'row', gap: 1, height: 12, justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 3, position: 'relative', width: '90%' },
  postItFold: { borderLeftColor: 'transparent', borderLeftWidth: 3, borderTopColor: 'rgba(255,255,255,0.78)', borderTopWidth: 3, bottom: 0, height: 0, position: 'absolute', right: 0, width: 0 },
  dateTip: { alignItems: 'center', borderCurve: 'continuous', borderRadius: radius.md, left: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, position: 'absolute', right: spacing.md, top: 112, zIndex: 10 },
  dateTipText: { color: brandColors.white, fontWeight: '700', textAlign: 'center' },
  dateTipPointer: { borderLeftColor: 'transparent', borderLeftWidth: 7, borderRightColor: 'transparent', borderRightWidth: 7, borderTopWidth: 7, bottom: -7, height: 0, position: 'absolute', width: 0 },
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
  memoModal: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '92%',
    padding: spacing.md,
  },
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
