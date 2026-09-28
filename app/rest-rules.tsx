import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Card, PrimaryButton, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { selectShiftTypesForDate } from '../src/features/shifts/activeShiftTypes';
import { readCurrentRestRules, type CurrentRestRuleSettings } from '../src/features/shifts/currentRestRules';
import { getShiftPatternHistoryEntryForDate } from '../src/features/shifts/shiftSchedule';
import { useShiftSchedule } from '../src/features/shifts/ShiftScheduleContext';
import { Header } from './shift-types';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const toDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function RestRulesScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const schedule = useShiftSchedule();
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(toDate(today));
  const [month, setMonth] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [override, setOverride] = useState<{ date: string; settings: CurrentRestRuleSettings }>();
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const entry = getShiftPatternHistoryEntryForDate(selectedDate, schedule.patternHistory);
  const pattern = entry?.pattern ?? schedule.shiftPattern;
  const available = selectShiftTypesForDate(selectedDate, schedule);
  const workTypes = available.filter((type) => type.kind === 'work' && pattern.includes(type.id));
  const restTypes = available.filter((type) => type.kind === 'rest');
  const storedSettings = readCurrentRestRules(entry?.conditionalRules, schedule.shiftTypes, pattern);
  const settings = override?.date === selectedDate ? override.settings : storedSettings;
  const update = (next: CurrentRestRuleSettings) => setOverride({ date: selectedDate, settings: next });
  const invalid = !settings || ((settings.weekendEnabled || settings.holidayEnabled) && !settings.targetShiftTypeIds.length);
  const cells = useMemo(() => {
    const first = new Date(month.year, month.month - 1, 1, 12).getDay();
    const count = new Date(month.year, month.month, 0).getDate();
    return [...Array<number | null>(first).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }, [month]);
  const move = (offset: number) => {
    const next = new Date(month.year, month.month - 1 + offset, 1, 12);
    setMonth({ year: next.getFullYear(), month: next.getMonth() + 1 });
    setSelectedDate(toDate(next));
    setOverride(undefined);
  };
  const save = async () => {
    if (invalid || !settings || lock.current) return;
    lock.current = true;
    setSaving(true);
    try {
      const success = await schedule.saveCurrentRestRules(selectedDate, settings);
      if (!success) throw new Error('Save failed');
      Alert.alert('휴무 규칙을 저장했어요.', `${selectedDate}부터 새 규칙이 적용돼요.`, [{ text: '확인', onPress: () => router.back() }]);
    } catch {
      Alert.alert('저장하지 못했어요.', '날짜와 근무유형을 확인한 뒤 다시 시도해 주세요.');
    } finally { lock.current = false; setSaving(false); }
  };

  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Header title="휴무 규칙" onBack={() => router.back()} />
    <AppText tone="secondary">선택한 날짜부터 주말·공휴일에 해당 근무를 휴무로 표시해요. 반복 주기는 계속 진행됩니다.</AppText>
    {settings ? <Card style={styles.card}>
      <View style={styles.row}><AppText>주말 휴무 적용</AppText><Switch accessibilityLabel="주말 휴무 적용" value={settings.weekendEnabled} disabled={saving} onValueChange={(weekendEnabled) => update({ ...settings, weekendEnabled })} trackColor={{ true: theme.primary }} /></View>
      <View style={styles.row}><AppText>공휴일 포함</AppText><Switch accessibilityLabel="공휴일 포함" value={settings.holidayEnabled} disabled={saving} onValueChange={(holidayEnabled) => update({ ...settings, holidayEnabled })} trackColor={{ true: theme.primary }} /></View>
      <AppText style={styles.heading}>휴무 처리할 근무유형</AppText>
      <View style={styles.options}>{workTypes.map((type) => { const selected = settings.targetShiftTypeIds.includes(type.id); return <Pressable key={type.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} disabled={saving} onPress={() => update({ ...settings, targetShiftTypeIds: selected ? settings.targetShiftTypeIds.filter((id) => id !== type.id) : [...settings.targetShiftTypeIds, type.id] })} style={[styles.option, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primary : theme.surface }]}><AppText style={{ color: selected ? brandColors.white : theme.text }}>{selected ? '✓ ' : ''}{type.name}</AppText></Pressable>; })}</View>
      {restTypes.length > 1 ? <><AppText style={styles.heading}>적용할 휴무 유형</AppText><View style={styles.options}>{restTypes.map((type) => <Pressable key={type.id} accessibilityRole="radio" accessibilityState={{ selected: settings.restShiftTypeId === type.id }} disabled={saving} onPress={() => update({ ...settings, restShiftTypeId: type.id })} style={[styles.option, { borderColor: settings.restShiftTypeId === type.id ? theme.primary : theme.border }]}><AppText>{type.name}</AppText></Pressable>)}</View></> : null}
      {invalid ? <AppText variant="caption" tone="secondary">휴무 처리할 근무유형을 하나 이상 선택해 주세요.</AppText> : null}
    </Card> : <Card><AppText>이 근무표의 휴무 규칙을 안전하게 편집할 수 없어요. 기존 규칙은 변경하지 않았습니다.</AppText></Card>}
    <AppText style={styles.heading}>적용 시작일</AppText>
    <View style={styles.nav}><Pressable accessibilityLabel="이전 달" disabled={saving} onPress={() => move(-1)}><AppText variant="heading">‹</AppText></Pressable><AppText style={styles.heading}>{month.year}년 {month.month}월</AppText><Pressable accessibilityLabel="다음 달" disabled={saving} onPress={() => move(1)}><AppText variant="heading">›</AppText></Pressable></View>
    <Card style={styles.calendar}><View style={styles.grid}>{weekdays.map((day) => <AppText key={day} variant="caption" tone="secondary" style={styles.cell}>{day}</AppText>)}{cells.map((day, index) => day === null ? <View key={`blank-${index}`} style={styles.cell} /> : <Pressable key={day} disabled={saving} onPress={() => { setSelectedDate(`${month.year}-${String(month.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`); setOverride(undefined); }} style={[styles.cell, selectedDate === `${month.year}-${String(month.month).padStart(2, '0')}-${String(day).padStart(2, '0')}` && { backgroundColor: theme.primary, borderRadius: radius.sm }]}><AppText variant="caption" style={{ color: selectedDate === `${month.year}-${String(month.month).padStart(2, '0')}-${String(day).padStart(2, '0')}` ? brandColors.white : theme.text }}>{day}</AppText></Pressable>)}</View></Card>
    <AppText style={styles.date}>{selectedDate}부터 적용</AppText>
    <PrimaryButton label={saving ? '저장 중...' : '저장'} disabled={saving || invalid || !entry && schedule.patternHistory.length > 0} onPress={() => void save()} />
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 }, content: { gap: spacing.md, paddingBottom: spacing.xxl },
  card: { gap: spacing.sm }, row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontWeight: '700' }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  option: { borderRadius: radius.md, borderWidth: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.sm },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calendar: { padding: spacing.sm }, grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.2857%', height: 40, textAlign: 'center', alignItems: 'center', justifyContent: 'center' },
  date: { fontWeight: '700', textAlign: 'center' },
});
