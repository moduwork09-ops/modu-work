import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Card, PrimaryButton, Screen } from '../../src/components';
import { useFocusedInputScroll } from '../../src/components/useFocusedInputScroll';
import { radius, spacing, useAppTheme } from '../../src/constants';
import { builtinShiftPresets } from '../../src/features/shift-presets/builtinShiftPresets';
import { ShiftPresetCard } from '../../src/features/shift-presets/shift-preset-card';
import { assertValidShiftPreset, type ShiftPreset } from '../../src/features/shift-presets/shiftPreset';
import { cloneShiftPreset } from '../../src/features/shift-presets/shiftPresetDraft';
import { getPublicShiftPreset, resolveShiftPresetShare } from '../../src/features/shift-presets/shiftPresetServer';
import { Header } from '../shift-types';

const colors = ['#FFF640', '#F6C58D', '#BFD9EF', '#DFE3E5', '#D6E3D1', '#F3D6D8'];

export default function PresetPreviewScreen() {
  const params = useLocalSearchParams<{ source?: string | string[]; reference?: string | string[] }>();
  const source = typeof params.source === 'string' ? params.source : '';
  const reference = typeof params.reference === 'string' ? params.reference : '';
  const router = useRouter();
  const theme = useAppTheme();
  const keyboardScroll = useFocusedInputScroll();
  const [draft, setDraft] = useState<ShiftPreset>();
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setDraft(undefined);
    setError(false);
    void (async () => {
      try {
        const preset = source === 'builtin' ? builtinShiftPresets.find((item) => item.id === reference)
          : source === 'public' ? await getPublicShiftPreset(reference)
          : source === 'shared' ? (await resolveShiftPresetShare(reference)).preset : undefined;
        if (!preset) throw new Error('Preset unavailable');
        if (active) setDraft(cloneShiftPreset(preset));
      } catch { if (active) setError(true); }
    })();
    return () => { active = false; };
  }, [reference, source]);

  const updateType = (key: string, field: 'name' | 'abbreviation' | 'color' | 'startTime' | 'endTime', value: string) => {
    setDraft((current) => current ? { ...current, shiftTypes: current.shiftTypes.map((item) => item.key === key ? { ...item, [field]: value } : item) } : current);
  };
  const addStep = (key: string) => setDraft((current) => current ? { ...current, pattern: [...current.pattern, key] } : current);
  const removeStep = (index: number) => setDraft((current) => {
    if (!current) return current;
    const pattern = current.pattern.filter((_, position) => position !== index);
    return { ...current, pattern, conditionalRules: current.conditionalRules?.filter((rule) => pattern.includes(rule.baseShiftKey)) };
  });
  const moveStep = (index: number, direction: -1 | 1) => setDraft((current) => {
    if (!current || index + direction < 0 || index + direction >= current.pattern.length) return current;
    const pattern = [...current.pattern];
    [pattern[index], pattern[index + direction]] = [pattern[index + direction], pattern[index]];
    return { ...current, pattern };
  });

  const continueToApply = () => {
    if (!draft) return;
    try { assertValidShiftPreset(draft); }
    catch { Alert.alert('근무표를 확인해 주세요.', '근무 이름·약어·시간과 반복 패턴을 확인해 주세요.'); return; }
    router.push({ pathname: '/shift-presets/apply' as never, params: { source, reference, draft: JSON.stringify(draft) } });
  };

  return <Screen style={styles.screen}><ScrollView ref={keyboardScroll.scrollRef} onScroll={keyboardScroll.onScroll} scrollEventThrottle={16} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Header title="근무표 미리보기" onBack={() => router.back()} />
    {!draft && !error ? <ActivityIndicator color={theme.primary} style={styles.state} /> : null}
    {error ? <View style={styles.state}><AppText>근무표를 확인할 수 없어요.</AppText></View> : null}
    {draft ? <>
      <ShiftPresetCard preset={draft} />
      <AppText style={styles.heading}>근무유형 편집</AppText>
      <AppText variant="caption" tone="secondary">내 근무에 맞게 이름, 약어, 색상과 시간을 조정하세요. 원본 프리셋은 바뀌지 않아요.</AppText>
      {draft.shiftTypes.map((item) => <Card key={item.key} style={styles.typeCard}>
        <View style={styles.fieldRow}><TextInput accessibilityLabel={`${item.name} 이름`} onFocus={keyboardScroll.onInputFocus} value={item.name} onChangeText={(value) => updateType(item.key, 'name', value)} placeholder="근무 이름" placeholderTextColor={theme.textSecondary} style={[styles.input, styles.nameInput, { color: theme.text, borderColor: theme.border }]} /><TextInput accessibilityLabel={`${item.name} 약어`} onFocus={keyboardScroll.onInputFocus} value={item.abbreviation} onChangeText={(value) => updateType(item.key, 'abbreviation', value)} placeholder="약어" placeholderTextColor={theme.textSecondary} style={[styles.input, styles.shortInput, { color: theme.text, borderColor: theme.border }]} /></View>
        {item.kind === 'work' ? <View style={styles.fieldRow}><TextInput accessibilityLabel={`${item.name} 시작 시간`} onFocus={keyboardScroll.onInputFocus} value={item.startTime} onChangeText={(value) => updateType(item.key, 'startTime', value)} placeholder="09:00" maxLength={5} keyboardType="numbers-and-punctuation" style={[styles.input, styles.timeInput, { color: theme.text, borderColor: theme.border }]} /><AppText>~</AppText><TextInput accessibilityLabel={`${item.name} 종료 시간`} onFocus={keyboardScroll.onInputFocus} value={item.endTime} onChangeText={(value) => updateType(item.key, 'endTime', value)} placeholder="18:00" maxLength={5} keyboardType="numbers-and-punctuation" style={[styles.input, styles.timeInput, { color: theme.text, borderColor: theme.border }]} /></View> : null}
        {item.note ? <AppText variant="caption" tone="secondary">{item.note}</AppText> : null}
        <View style={styles.fieldRow}>{colors.map((color) => <Pressable key={color} accessibilityLabel={`${item.name} 색상 ${color}`} accessibilityRole="button" accessibilityState={{ selected: item.color === color }} onPress={() => updateType(item.key, 'color', color)} style={[styles.colorChip, { backgroundColor: color, borderColor: item.color === color ? theme.text : theme.border }]} />)}</View>
      </Card>)}
      <AppText style={styles.heading}>반복 패턴 편집</AppText>
      <AppText variant="caption" tone="secondary">항목을 누르면 그 위치만 삭제돼요. 화살표로 순서를 바꿀 수 있어요.</AppText>
      <View style={styles.pattern}>{draft.pattern.map((key, index) => { const item = draft.shiftTypes.find((shift) => shift.key === key)!; return <View key={`${key}-${index}`} style={[styles.step, { borderColor: theme.border }]}><Pressable accessibilityLabel={`${index + 1}번째 ${item.name} 삭제`} onPress={() => removeStep(index)} style={[styles.stepBadge, { backgroundColor: item.color }]}><AppText style={{ color: item.textColor, fontWeight: '700' }}>{item.abbreviation}</AppText></Pressable><View style={styles.arrows}><Pressable accessibilityLabel={`${index + 1}번째 왼쪽으로`} disabled={index === 0} onPress={() => moveStep(index, -1)}><AppText tone="secondary">‹</AppText></Pressable><Pressable accessibilityLabel={`${index + 1}번째 오른쪽으로`} disabled={index === draft.pattern.length - 1} onPress={() => moveStep(index, 1)}><AppText tone="secondary">›</AppText></Pressable></View></View>; })}</View>
      <AppText variant="caption" tone="secondary">패턴에 추가</AppText>
      <View style={styles.pattern}>{draft.shiftTypes.map((item) => <Pressable key={item.key} accessibilityRole="button" onPress={() => addStep(item.key)} style={[styles.addChip, { borderColor: theme.border }]}><AppText variant="caption">+ {item.abbreviation} {item.name}</AppText></Pressable>)}</View>
      <PrimaryButton label="적용 날짜와 14일 미리보기" onPress={continueToApply} />
    </> : null}
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 }, content: { gap: spacing.md, paddingBottom: spacing.xxl + 72 }, state: { alignItems: 'center', paddingVertical: spacing.xxl },
  heading: { fontWeight: '700', marginTop: spacing.sm }, typeCard: { gap: spacing.sm }, fieldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  input: { borderWidth: 1, borderRadius: radius.sm, minHeight: 44, paddingHorizontal: spacing.sm }, nameInput: { flex: 1, minWidth: 120 }, shortInput: { width: 64 }, timeInput: { width: 92 },
  colorChip: { width: 32, height: 32, borderWidth: 2, borderRadius: radius.sm }, pattern: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  step: { alignItems: 'center', borderWidth: 1, borderRadius: radius.sm, padding: 3 }, stepBadge: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, paddingHorizontal: spacing.xs }, arrows: { flexDirection: 'row', gap: spacing.md },
  addChip: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, minHeight: 36, justifyContent: 'center' },
});
