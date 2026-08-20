import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../../components';
import { brandColors, radius, spacing, useAppTheme } from '../../constants';
import { getCalendarDateKind } from '../calendar/koreanHolidays';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const calendarWeekCount = 6;
const calendarColumnCount = 7;
const calendarCellHeight = 40;
const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const minuteOptions = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'));
const wheelItemHeight = 48;
const visibleWheelItems = 5;
const wheelViewportHeight = wheelItemHeight * visibleWheelItems;
const wheelCenterOffset = wheelItemHeight * Math.floor(visibleWheelItems / 2);
const wheelRepeatCount = 101;
const middleRepeat = Math.floor(wheelRepeatCount / 2);

function toIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

function dateAtNoon(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, day, 12);
}

export function formatReadableDate(value: string) {
  const { year, month, day } = parseIsoDate(value);
  const weekday = dateAtNoon(year, month - 1, day).getDay();
  return `${year}년 ${month}월 ${day}일 (${weekdays[weekday]})`;
}

type DatePickerSheetProps = {
  visible: boolean;
  value: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
};

export function DatePickerSheet({ visible, value, onClose, onConfirm }: DatePickerSheetProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(value);
  const [month, setMonth] = useState(() => {
    const parsed = parseIsoDate(value);
    return { year: parsed.year, month: parsed.month };
  });

  useEffect(() => {
    if (!visible) return;
    const parsed = parseIsoDate(value);
    setDraft(value);
    setMonth({ year: parsed.year, month: parsed.month });
  }, [value, visible]);

  const cells = useMemo(() => {
    const firstWeekday = dateAtNoon(month.year, month.month - 1, 1).getDay();
    return Array.from({ length: calendarWeekCount * calendarColumnCount }, (_, index) => {
      const day = index - firstWeekday + 1;
      const daysInMonth = dateAtNoon(month.year, month.month, 0).getDate();
      if (day < 1 || day > daysInMonth) return null;
      return {
        date: toIsoDate(month.year, month.month, day),
        day,
      };
    });
  }, [month]);

  const moveMonth = (offset: number) => {
    const next = dateAtNoon(month.year, month.month - 1 + offset, 1);
    setMonth({ year: next.getFullYear(), month: next.getMonth() + 1 });
  };

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="날짜 선택 닫기" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <View style={styles.sheetHeader}>
            <AppText variant="heading">날짜 선택</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="날짜 선택 닫기" hitSlop={8} onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={24} color={theme.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.monthHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="이전 달" onPress={() => moveMonth(-1)} style={styles.iconButton}>
              <MaterialCommunityIcons name="chevron-left" size={28} color={theme.text} />
            </Pressable>
            <AppText style={styles.monthTitle}>{month.year}년 {month.month}월</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="다음 달" onPress={() => moveMonth(1)} style={styles.iconButton}>
              <MaterialCommunityIcons name="chevron-right" size={28} color={theme.text} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {weekdays.map((item, index) => (
              <AppText key={item} variant="caption" style={[styles.weekCell, { color: index === 0 ? '#E53935' : index === 6 ? '#1976D2' : theme.textSecondary }]}>
                {item}
              </AppText>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {cells.map((cell, index) => {
              if (!cell) return <View key={`empty-${index}`} style={styles.dayCell} />;
              const { date, day } = cell;
              const selected = date === draft;
              const kind = getCalendarDateKind(date);
              const dateColor = kind === 'holiday' || kind === 'sunday' ? '#E53935' : kind === 'saturday' ? '#1976D2' : theme.text;
              return (
                <Pressable
                  key={date}
                  accessibilityRole="button"
                  accessibilityLabel={formatReadableDate(date)}
                  accessibilityState={{ selected }}
                  hitSlop={2}
                  onPress={() => setDraft(date)}
                  style={({ pressed }) => [styles.dayCell, selected && { backgroundColor: theme.primary }, pressed && !selected && { backgroundColor: theme.border }]}
                >
                  <AppText style={{ color: selected ? brandColors.white : dateColor, fontWeight: selected ? '700' : '400' }}>
                    {day}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <Pressable accessibilityRole="button" onPress={() => onConfirm(draft)} style={({ pressed }) => [styles.primaryAction, { backgroundColor: theme.primary, opacity: pressed ? 0.78 : 1 }]}>
            <AppText style={[styles.actionText, { color: theme.surface }]}>선택 완료</AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

type TimePickerSheetProps = {
  visible: boolean;
  title: string;
  value: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
};

type WheelProps = {
  active: boolean;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  label: string;
};

function Wheel({ active, options, value, onChange, label }: WheelProps) {
  const theme = useAppTheme();
  const ref = useRef<ScrollView>(null);
  const repeatedOptions = useMemo(() => Array.from({ length: options.length * wheelRepeatCount }, (_, index) => options[index % options.length]), [options]);
  const valueIndex = Math.max(0, options.indexOf(value));
  const middleIndex = middleRepeat * options.length + valueIndex;

  const scrollToMiddle = useCallback((animated: boolean) => {
    ref.current?.scrollTo({ y: middleIndex * wheelItemHeight, animated });
  }, [middleIndex]);

  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => scrollToMiddle(false));
    return () => cancelAnimationFrame(frame);
  }, [active, scrollToMiddle]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const rawIndex = Math.round(event.nativeEvent.contentOffset.y / wheelItemHeight);
    const optionIndex = ((rawIndex % options.length) + options.length) % options.length;
    onChange(options[optionIndex]);
    const centeredIndex = middleRepeat * options.length + optionIndex;
    if (rawIndex !== centeredIndex) {
      requestAnimationFrame(() => ref.current?.scrollTo({ y: centeredIndex * wheelItemHeight, animated: false }));
    }
  };

  return (
    <View style={styles.wheel}>
      <View pointerEvents="none" style={[styles.wheelHighlight, { backgroundColor: theme.border }]} />
      <ScrollView
        ref={ref}
        accessibilityLabel={label}
        accessibilityRole="adjustable"
        bounces={false}
        decelerationRate="fast"
        nestedScrollEnabled
        onMomentumScrollEnd={settle}
        onScrollEndDrag={(event) => {
          if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < 0.05) settle(event);
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        snapToInterval={wheelItemHeight}
        contentContainerStyle={styles.wheelContent}
      >
        {repeatedOptions.map((option, index) => (
          <View key={`${option}-${index}`} style={styles.wheelItem}>
            <AppText style={[styles.wheelText, { color: theme.text }, option !== value && styles.unselectedWheelText]}>{option}</AppText>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export function TimePickerSheet({ visible, title, value, onClose, onConfirm }: TimePickerSheetProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [hour, setHour] = useState(value.slice(0, 2));
  const [minute, setMinute] = useState(() => minuteOptions.includes(value.slice(3, 5)) ? value.slice(3, 5) : '00');

  useEffect(() => {
    if (!visible) return;
    setHour(hourOptions.includes(value.slice(0, 2)) ? value.slice(0, 2) : '00');
    setMinute(minuteOptions.includes(value.slice(3, 5)) ? value.slice(3, 5) : '00');
  }, [value, visible]);

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="시간 선택 닫기" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <View style={styles.sheetHeader}>
            <AppText variant="heading">{title}</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="시간 선택 닫기" hitSlop={8} onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={24} color={theme.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.wheels}>
            <Wheel active={visible} options={hourOptions} value={hour} onChange={setHour} label={`시 선택, 현재 ${hour}시`} />
            <AppText accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.colon, { color: theme.text }]}>:</AppText>
            <Wheel active={visible} options={minuteOptions} value={minute} onChange={setMinute} label={`분 선택, 현재 ${minute}분, 5분 단위`} />
          </View>

          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.actionButton, { borderColor: theme.border, opacity: pressed ? 0.72 : 1 }]}>
              <AppText style={styles.actionText}>취소</AppText>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => onConfirm(`${hour}:${minute}`)} style={({ pressed }) => [styles.actionButton, { backgroundColor: theme.primary, borderColor: theme.primary, opacity: pressed ? 0.78 : 1 }]}>
              <AppText style={[styles.actionText, { color: theme.surface }]}>확인</AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: 'rgba(0, 0, 0, 0.38)', flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  grabber: { alignSelf: 'center', borderRadius: 3, height: 5, marginBottom: spacing.xs, opacity: 0.9, width: 40 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  closeButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  monthHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  monthTitle: { fontSize: 18, fontVariant: ['tabular-nums'], fontWeight: '700' },
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  weekRow: { flexDirection: 'row', marginTop: spacing.xs },
  weekCell: { fontWeight: '600', textAlign: 'center', width: '14.2857%' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', height: calendarCellHeight * calendarWeekCount, marginTop: spacing.xxs },
  dayCell: { alignItems: 'center', borderCurve: 'continuous', borderRadius: radius.sm, height: calendarCellHeight, justifyContent: 'center', width: `${100 / calendarColumnCount}%` },
  primaryAction: { alignItems: 'center', borderCurve: 'continuous', borderRadius: radius.md, justifyContent: 'center', marginTop: spacing.md, minHeight: 50 },
  wheels: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'center', marginVertical: spacing.lg },
  wheel: { height: wheelViewportHeight, overflow: 'hidden', position: 'relative', width: 96 },
  wheelContent: { paddingVertical: wheelCenterOffset },
  wheelItem: { alignItems: 'center', height: wheelItemHeight, justifyContent: 'center' },
  wheelHighlight: { borderCurve: 'continuous', borderRadius: radius.md, height: wheelItemHeight, left: 0, opacity: 0.7, position: 'absolute', right: 0, top: wheelCenterOffset },
  wheelText: { fontSize: 24, fontVariant: ['tabular-nums'], fontWeight: '700', lineHeight: 30 },
  unselectedWheelText: { opacity: 0.38 },
  colon: { fontSize: 28, fontWeight: '700', height: wheelItemHeight, lineHeight: wheelItemHeight, textAlignVertical: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  actionButton: { alignItems: 'center', borderCurve: 'continuous', borderRadius: radius.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 50 },
  actionText: { fontWeight: '700' },
});
