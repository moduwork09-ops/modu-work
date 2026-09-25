import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { AppText, Card, PrimaryButton, Screen } from '../../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../../src/constants';
import { getCalendarDateKind } from '../../src/features/calendar/koreanHolidays';
import { builtinShiftPresets } from '../../src/features/shift-presets/builtinShiftPresets';
import { configurePresetRestRules, getPresetRestRuleSettings, type PresetRestRuleSettings } from '../../src/features/shift-presets/presetRestRuleSettings';
import { claimShiftPresetShare, getPublicShiftPreset, resolveShiftPresetShare, ShiftPresetShareError } from '../../src/features/shift-presets/shiftPresetServer';
import type { ShiftPreset } from '../../src/features/shift-presets/shiftPreset';
import { createShiftPresetPreview, parseShiftPresetDraft } from '../../src/features/shift-presets/shiftPresetDraft';
import { UNSUPPORTED_HOLIDAY_SHIFT_TYPE } from '../../src/features/shifts/conditionalShiftRule';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { Header } from '../shift-types';

const days = ['일', '월', '화', '수', '목', '금', '토'];
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function PresetApplyScreen() {
  const params = useLocalSearchParams<{ source?: string | string[]; reference?: string | string[]; draft?: string | string[] }>();
  const source = typeof params.source === 'string' ? params.source : '';
  const reference = typeof params.reference === 'string' ? params.reference : '';
  const router = useRouter();
  const theme = useAppTheme();
  const { applyShiftPreset } = useShiftSchedule();
  const today = new Date();
  const [month, setMonth] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [selectedDate, setSelectedDate] = useState(iso(today));
  const [selectedTeamId, setSelectedTeamId] = useState<string>();
  const [remoteResult, setRemoteResult] = useState<{ lookup: string; preset: ShiftPreset }>();
  const [loadingError, setLoadingError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ruleOverride, setRuleOverride] = useState<{ preset: ShiftPreset; settings: PresetRestRuleSettings }>();
  const lock = useRef(false);
  const active = useRef(true);
  const builtinPreset = source === 'builtin' ? builtinShiftPresets.find((preset) => preset.id === reference) : undefined;
  const lookup = `${source}:${reference}`;
  const remotePreset = remoteResult?.lookup === lookup ? remoteResult.preset : undefined;
  const draftParam = typeof params.draft === 'string' ? params.draft : undefined;
  const parsedDraft = useMemo(() => {
    if (!draftParam) return undefined;
    try { return parseShiftPresetDraft(draftParam, source, source === 'shared' ? undefined : reference); } catch { return null; }
  }, [draftParam, source, reference]);
  const basePreset = parsedDraft ?? (source === 'builtin' ? builtinPreset : remotePreset);
  const defaultRuleSettings = useMemo(() => basePreset ? getPresetRestRuleSettings(basePreset) : null, [basePreset]);
  const ruleSettings = ruleOverride && ruleOverride.preset === basePreset ? ruleOverride.settings : defaultRuleSettings;
  const missingRuleTarget = Boolean(ruleSettings && (ruleSettings.weekendEnabled || ruleSettings.holidayEnabled) && ruleSettings.targetShiftKeys.length === 0);
  const preset = useMemo(() => {
    if (!basePreset || !ruleSettings || missingRuleTarget) return basePreset;
    return configurePresetRestRules(basePreset, ruleSettings);
  }, [basePreset, ruleSettings, missingRuleTarget]);
  const ruleWorkTypes = basePreset?.shiftTypes.filter((type) => type.kind === 'work' && basePreset.pattern.includes(type.key)) ?? [];
  const updateRules = (next: PresetRestRuleSettings) => { if (basePreset) setRuleOverride({ preset: basePreset, settings: next }); };
  const teamTemplate = preset?.teamRotationTemplate;

  useEffect(() => { setSelectedTeamId(undefined); }, [lookup]);

  useEffect(() => {
    if (source === 'builtin') return;
    let current = true;
    setRemoteResult(undefined);
    setLoadingError(false);
    void (async () => {
      try {
        const result = source === 'public' ? await getPublicShiftPreset(reference) : source === 'shared' ? (await resolveShiftPresetShare(reference)).preset : undefined;
        if (!result) throw new Error('Preset unavailable');
        if (current) setRemoteResult({ lookup, preset: result });
      } catch { if (current) setLoadingError(true); }
    })();
    return () => { current = false; };
  }, [lookup, reference, source]);

  const preview = useMemo(() => {
    if (!preset || (teamTemplate && !selectedTeamId)) return [];
    try { return createShiftPresetPreview(preset, selectedDate, selectedTeamId); } catch { return []; }
  }, [preset, selectedDate, selectedTeamId, teamTemplate]);
  const hasUnsupportedHoliday = preview.some((day) => day.shiftTypeId === UNSUPPORTED_HOLIDAY_SHIFT_TYPE.id);
  const legend = [...new Map(preview.map((day) => [day.shiftTypeId, day])).values()];

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
    if (!preset || parsedDraft === null || loadingError || preview.length !== 14 || hasUnsupportedHoliday || missingRuleTarget) {
      Alert.alert('근무표를 확인할 수 없어요.', '이전 화면에서 근무표를 다시 확인해 주세요.');
      return;
    }
    if (teamTemplate && !selectedTeamId) {
      Alert.alert('내 팀을 선택해 주세요.');
      return;
    }
    if (lock.current) {
      return;
    }
    lock.current = true;
    setSaving(true);
    try {
      const confirmed = source === 'builtin' ? builtinPreset
        : source === 'public' ? await getPublicShiftPreset(reference)
        : source === 'shared' ? (await claimShiftPresetShare(reference)).preset : undefined;

      if (!active.current) {
        return;
      }

      if (!confirmed || confirmed.id !== preset.id) {
        throw new Error('confirmed preset mismatch');
      }
      const applied = await applyShiftPreset({ preset, effectiveFrom: selectedDate, myTeamId: selectedTeamId });

      if (!applied) throw new Error('local apply returned false');
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
    {teamTemplate ? <Card style={styles.teamCard}><AppText style={styles.title}>내 팀을 선택하세요</AppText><View accessibilityRole="radiogroup" style={styles.teamOptions}>{teamTemplate.teams.map((team) => { const selected = selectedTeamId === team.id; return <Pressable key={team.id} accessibilityRole="radio" accessibilityState={{ selected }} disabled={saving} onPress={() => setSelectedTeamId(team.id)} style={[styles.teamOption, { borderColor: theme.border }, selected && { backgroundColor: theme.primary, borderColor: theme.primary }]}><AppText style={{ color: selected ? brandColors.white : theme.text, fontWeight: '700' }}>{team.label}</AppText></Pressable>; })}</View></Card> : null}
    {ruleSettings ? <Card style={styles.ruleCard}>
      <AppText style={styles.title}>주말·공휴일 근무 규칙</AppText>
      <View style={styles.ruleRow}><AppText>주말 휴무 적용</AppText><Switch accessibilityLabel="주말 휴무 적용" value={ruleSettings.weekendEnabled} disabled={saving} onValueChange={(weekendEnabled) => updateRules({ ...ruleSettings, weekendEnabled })} trackColor={{ true: theme.primary }} /></View>
      <View style={styles.ruleRow}><AppText>공휴일 포함</AppText><Switch accessibilityLabel="공휴일 포함" value={ruleSettings.holidayEnabled} disabled={saving} onValueChange={(holidayEnabled) => updateRules({ ...ruleSettings, holidayEnabled })} trackColor={{ true: theme.primary }} /></View>
      <AppText variant="caption" tone="secondary">휴무 처리할 근무유형</AppText>
      <View style={styles.ruleTargets}>{ruleWorkTypes.map((type) => { const selected = ruleSettings.targetShiftKeys.includes(type.key); return <Pressable key={type.key} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`${type.name} 휴무 처리`} disabled={saving} onPress={() => updateRules({ ...ruleSettings, targetShiftKeys: selected ? ruleSettings.targetShiftKeys.filter((key) => key !== type.key) : [...ruleSettings.targetShiftKeys, type.key] })} style={[styles.ruleTarget, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primary : theme.surface }]}><AppText style={{ color: selected ? brandColors.white : theme.text }}>{selected ? '✓ ' : ''}{type.name}</AppText></Pressable>; })}</View>
      {missingRuleTarget ? <AppText variant="caption" tone="secondary">규칙을 적용할 근무유형을 하나 이상 선택해 주세요.</AppText> : null}
    </Card> : null}
    <View style={styles.nav}><Pressable accessibilityLabel="이전 달" disabled={saving} onPress={() => move(-1)}><AppText variant="heading">‹</AppText></Pressable><AppText style={styles.title}>{month.year}년 {month.month}월</AppText><Pressable accessibilityLabel="다음 달" disabled={saving} onPress={() => move(1)}><AppText variant="heading">›</AppText></Pressable></View>
    <Card style={styles.calendar}><View style={styles.grid}>{days.map((day) => <AppText key={day} variant="caption" tone="secondary" style={styles.cell}>{day}</AppText>)}{cells.map((day, index) => day === null ? <View key={`blank-${index}`} style={styles.cell} /> : <Pressable key={day} disabled={saving} onPress={() => setSelectedDate(`${month.year}-${String(month.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)} style={[styles.cell, selectedDate === `${month.year}-${String(month.month).padStart(2, '0')}-${String(day).padStart(2, '0')}` && { backgroundColor: theme.primary, borderRadius: radius.sm }]}><AppText variant="caption" style={{ color: selectedDate === `${month.year}-${String(month.month).padStart(2, '0')}-${String(day).padStart(2, '0')}` ? brandColors.white : theme.text }}>{day}</AppText></Pressable>)}</View></Card>
    <AppText style={styles.selected}>{selectedDate}부터 적용</AppText>
    {parsedDraft === null || loadingError ? <AppText>근무표를 확인할 수 없어요. 이전 화면에서 다시 선택해 주세요.</AppText> : null}
    {hasUnsupportedHoliday ? <AppText tone="secondary">이 연도의 공휴일 자료가 없어 조건부 근무를 정확히 계산할 수 없어요. 지원되는 날짜를 선택해 주세요.</AppText> : null}
    {preset && (!teamTemplate || selectedTeamId) ? <Card style={styles.previewCard}>
      <AppText style={styles.title}>적용 후 14일 미리보기</AppText>
      <AppText variant="caption" tone="secondary">선택한 날짜와 팀을 기준으로 실제 근무 계산을 보여줘요.</AppText>
      <View style={styles.previewGrid}>
        {Array.from({ length: 7 }, (_, index) => <View key={`weekday-${index}`} style={styles.previewCell}><AppText variant="caption" tone="secondary">{days[((preview[0]?.weekday ?? 0) + index) % 7]}</AppText></View>)}
        {preview.map((item, index) => { const kind = getCalendarDateKind(item.date); const dateText = item.date.slice(0, 7) === selectedDate.slice(0, 7) ? String(Number(item.date.slice(-2))) : `${Number(item.date.slice(5, 7))}/${Number(item.date.slice(-2))}`; return <View key={item.date} style={[styles.previewCell, styles.previewDay, { borderColor: index === 0 ? theme.primary : theme.border }]}><AppText variant="caption" style={{ color: kind === 'holiday' || kind === 'sunday' ? '#E53935' : kind === 'saturday' ? '#1976D2' : theme.text, fontWeight: '700' }}>{dateText}</AppText><View style={[styles.previewBadge, { backgroundColor: item.color }]}><AppText numberOfLines={1} style={{ color: item.textColor, fontSize: 12, fontWeight: '700' }}>{item.abbreviation}</AppText></View></View>; })}
      </View>
      <View style={styles.legend}>{legend.map((item) => <View key={item.shiftTypeId} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: item.color }]} /><AppText variant="caption">{item.abbreviation} = {item.shiftName}</AppText></View>)}</View>
    </Card> : null}
    <PrimaryButton disabled={saving || !preset || parsedDraft === null || loadingError || preview.length !== 14 || hasUnsupportedHoliday || missingRuleTarget} label={saving ? '적용 중...' : '적용하기'} onPress={() => void apply()} />
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 },
  content: { gap: spacing.md, paddingBottom: spacing.xxl },
  teamCard: { gap: spacing.sm },
  teamOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  teamOption: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, justifyContent: 'center', minHeight: 44, minWidth: 68, paddingHorizontal: spacing.md },
  ruleCard: { gap: spacing.sm },
  ruleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  ruleTargets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  ruleTarget: { borderRadius: radius.md, borderWidth: 1, minHeight: 38, justifyContent: 'center', paddingHorizontal: spacing.sm },
  nav: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  title: { fontWeight: '700' },
  calendar: { padding: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { alignItems: 'center', height: 40, justifyContent: 'center', textAlign: 'center', width: '14.2857%' },
  selected: { fontWeight: '700', textAlign: 'center' },
  previewCard: { gap: spacing.sm },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  previewCell: { alignItems: 'center', justifyContent: 'center', width: '14.2857%' },
  previewDay: { borderRadius: radius.sm, borderWidth: 1, gap: 4, minHeight: 58, paddingVertical: 5 },
  previewBadge: { alignItems: 'center', borderRadius: radius.sm, minWidth: 25, paddingHorizontal: 3, paddingVertical: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  legendDot: { borderRadius: 4, height: 8, width: 8 },
});
