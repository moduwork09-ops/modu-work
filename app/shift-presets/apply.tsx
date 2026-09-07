import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, PrimaryButton, Screen } from '../../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../../src/constants';
import { builtinShiftPresets } from '../../src/features/shift-presets/builtinShiftPresets';
import { claimShiftPresetShare, getPublicShiftPreset, ShiftPresetShareError } from '../../src/features/shift-presets/shiftPresetServer';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { Header } from '../shift-types';

const days = ['일', '월', '화', '수', '목', '금', '토'];
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function PresetApplyScreen() {
  const params = useLocalSearchParams<{ source?: string | string[]; reference?: string | string[] }>();
  const source = typeof params.source === 'string' ? params.source : '';
  const reference = typeof params.reference === 'string' ? params.reference : '';
  const router = useRouter();
  const theme = useAppTheme();
  const { applyShiftPreset } = useShiftSchedule();
  const today = new Date();
  const [month, setMonth] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [selectedDate, setSelectedDate] = useState(iso(today));
  const [selectedTeamId, setSelectedTeamId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const active = useRef(true);
  const builtinPreset = source === 'builtin' ? builtinShiftPresets.find((preset) => preset.id === reference) : undefined;
  const teamTemplate = builtinPreset?.teamRotationTemplate;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const cells = useMemo(() => {
    const first = new Date(month.year, month.month - 1, 1, 12).getDay();
    const count = new Date(month.year, month.month, 0).getDate();
    return [...Array<number | null>(first).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }, [month]);

  const move = (offset: number) => {
    const date = new Date(month.year, month.month - 1 + offset, 1, 12);
    setMonth({ year: date.getFullYear(), month: date.getMonth() + 1 });
    setSelectedDate(iso(date));
  };

  const apply = async () => {
    if (teamTemplate && !selectedTeamId) {
      Alert.alert('내 팀을 선택해 주세요.');
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    try {
      const preset = builtinPreset
        ?? (source === 'public' ? await getPublicShiftPreset(reference) : source === 'shared' ? (await claimShiftPresetShare(reference)).preset : undefined);
      if (!active.current) return;
      if (!preset || !await applyShiftPreset({ preset, effectiveFrom: selectedDate, myTeamId: selectedTeamId })) throw new Error();
      if (!active.current) return;
      Alert.alert('근무표가 적용됐어요.', '선택한 날짜부터 새 패턴이 시작돼요.', [{ text: '확인', onPress: () => { if (active.current) { router.dismissAll(); router.replace('/'); } } }]);
    } catch (error) {
      if (!active.current) return;
      lock.current = false;
      setSaving(false);
      Alert.alert(error instanceof ShiftPresetShareError && error.reason === 'already_claimed' ? '이미 사용된 공유 코드예요.' : '근무표를 적용할 수 없어요.', '기존 근무표는 그대로 유지됩니다. 다시 시도해 주세요.');
    }
  };

  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content}><Header title="적용 시작 날짜" onBack={() => router.back()} />
    <AppText tone="secondary">새 프리셋을 적용할 날짜를 선택하세요.</AppText>
    {teamTemplate ? <Card style={styles.teamCard}><AppText style={styles.title}>내 팀을 선택하세요</AppText><View accessibilityRole="radiogroup" style={styles.teamOptions}>{teamTemplate.teams.map((team) => { const selected = selectedTeamId === team.id; return <Pressable key={team.id} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setSelectedTeamId(team.id)} style={[styles.teamOption, { borderColor: theme.border }, selected && { backgroundColor: theme.primary, borderColor: theme.primary }]}><AppText style={{ color: selected ? brandColors.white : theme.text, fontWeight: '700' }}>{team.label}</AppText></Pressable>; })}</View></Card> : null}
    <View style={styles.nav}><Pressable accessibilityLabel="이전 달" onPress={() => move(-1)}><AppText variant="heading">‹</AppText></Pressable><AppText style={styles.title}>{month.year}년 {month.month}월</AppText><Pressable accessibilityLabel="다음 달" onPress={() => move(1)}><AppText variant="heading">›</AppText></Pressable></View>
    <Card style={styles.calendar}><View style={styles.grid}>{days.map((day) => <AppText key={day} variant="caption" tone="secondary" style={styles.cell}>{day}</AppText>)}{cells.map((day, index) => day === null ? <View key={`blank-${index}`} style={styles.cell} /> : <Pressable key={day} onPress={() => setSelectedDate(`${month.year}-${String(month.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)} style={[styles.cell, selectedDate === `${month.year}-${String(month.month).padStart(2, '0')}-${String(day).padStart(2, '0')}` && { backgroundColor: theme.primary, borderRadius: radius.sm }]}><AppText variant="caption" style={{ color: selectedDate === `${month.year}-${String(month.month).padStart(2, '0')}-${String(day).padStart(2, '0')}` ? brandColors.white : theme.text }}>{day}</AppText></Pressable>)}</View></Card>
    <AppText style={styles.selected}>{selectedDate}부터 적용</AppText><PrimaryButton disabled={saving} label={saving ? '적용 중...' : '적용하기'} onPress={() => void apply()} />
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 },
  content: { gap: spacing.md, paddingBottom: spacing.xxl },
  teamCard: { gap: spacing.sm },
  teamOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  teamOption: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, justifyContent: 'center', minHeight: 44, minWidth: 68, paddingHorizontal: spacing.md },
  nav: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  title: { fontWeight: '700' },
  calendar: { padding: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { alignItems: 'center', height: 40, justifyContent: 'center', textAlign: 'center', width: '14.2857%' },
  selected: { fontWeight: '700', textAlign: 'center' },
});
