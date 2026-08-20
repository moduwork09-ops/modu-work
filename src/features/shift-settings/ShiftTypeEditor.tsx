import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, PrimaryButton, Screen } from '../../components';
import { radius, spacing, useAppTheme } from '../../constants';
import { colorPalette, formatShiftTime, getRepresentativeShiftColors, type ShiftColorOption, type ShiftKind, type ShiftType } from './mockData';
import { validateShiftTypeDraft } from './shiftTypeValidation';
import { ColorPickerModal } from '../colors/ColorPickerModal';
import { useShiftSchedule } from '../shifts/ShiftScheduleContext';

export type ShiftTypeEditorProps = {
  title: string;
  initialShiftType?: ShiftType;
  onBack: () => void;
  onSave: (shiftType: Omit<ShiftType, 'id'>) => Promise<boolean>;
  onDelete?: () => void;
};

export function ShiftTypeEditor({ title, initialShiftType, onBack, onSave, onDelete }: ShiftTypeEditorProps) {
  const theme = useAppTheme();
  const { shiftTypes } = useShiftSchedule();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initialShiftType?.name ?? '');
  const [abbreviation, setAbbreviation] = useState(initialShiftType?.abbreviation ?? '');
  const [kind, setKind] = useState<ShiftKind>(initialShiftType?.kind ?? 'work');
  const [startTime, setStartTime] = useState(initialShiftType?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(initialShiftType?.endTime ?? '18:00');
  const [note, setNote] = useState(initialShiftType?.note ?? '');
  const [selectedColor, setSelectedColor] = useState<ShiftColorOption>(() => colorPalette.find((item) => item.color === initialShiftType?.color) ?? (initialShiftType ? { name: 'Custom', color: initialShiftType.color, textColor: initialShiftType.textColor } : colorPalette[0]));
  const [isColorPickerVisible, setIsColorPickerVisible] = useState(false);
  const bottomContentPadding = insets.bottom + 80;
  const buttonBottomPadding = Math.max(insets.bottom, spacing.md);
  const preview: Omit<ShiftType, 'id'> = { abbreviation: abbreviation || '유형', name: name || '새 근무유형', note, kind, startTime: kind === 'work' ? startTime : undefined, endTime: kind === 'work' ? endTime : undefined, color: selectedColor.color, textColor: selectedColor.textColor };

  const save = async () => {
    const error = validateShiftTypeDraft({ name, abbreviation, kind, startTime, endTime });
    if (error) {
      Alert.alert('입력 내용을 확인해주세요', error);
      return;
    }

    const saved = await onSave({ ...preview, name: name.trim(), abbreviation: abbreviation.trim(), note: note.trim() || undefined });
    if (!saved) {
      Alert.alert('저장에 실패했어요.', '다시 시도해주세요.');
      return;
    }

    onBack();
  };

  return <Screen style={styles.screen}><KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: bottomContentPadding }]} keyboardShouldPersistTaps="handled"><Header title={title} onBack={onBack} /><View style={styles.form}><Field label="유형 이름" value={name} onChangeText={setName} placeholder="예: 교육근무" maxLength={20} /><Field label="달력 표시 약칭" value={abbreviation} onChangeText={setAbbreviation} placeholder="예: 교" maxLength={2} /><View><AppText style={styles.label}>색상</AppText><View style={styles.palette}>{colorPalette.map((item) => { const selected = item.color === selectedColor.color; return <Pressable key={item.name} accessibilityLabel={`${item.name} 색상`} accessibilityState={{ selected }} onPress={() => setSelectedColor(item)} style={[styles.colorButton, { backgroundColor: item.color }, selected && { borderColor: theme.primary, borderWidth: 3 }]} />; })}<Pressable accessibilityLabel="사용자 지정 색상 선택" onPress={() => setIsColorPickerVisible(true)} style={[styles.colorButton, styles.moreColor, { borderColor: theme.border }]}><AppText variant="heading" tone="secondary">+</AppText></Pressable></View></View><View><AppText style={styles.label}>유형</AppText><View style={styles.kindRow}>{([{ key: 'work', label: '근무' }, { key: 'rest', label: '휴식' }] as const).map((item) => { const selected = kind === item.key; return <Pressable key={item.key} onPress={() => setKind(item.key)} style={[styles.kindButton, { borderColor: theme.border }, selected && { backgroundColor: theme.primary, borderColor: theme.primary }]}><AppText style={{ color: selected ? theme.surface : theme.text, fontWeight: '700' }}>{item.label}</AppText></Pressable>; })}</View></View>{kind === 'work' ? <View style={styles.timeRow}><Field compact label="시작 시간" value={startTime} onChangeText={setStartTime} placeholder="09:00" /><Field compact label="종료 시간" value={endTime} onChangeText={setEndTime} placeholder="18:00" /></View> : <Card style={styles.restNotice}><AppText tone="secondary">휴식 유형은 근무시간을 설정하지 않습니다.</AppText></Card>}<Field label="추가 메모 (선택)" value={note} onChangeText={setNote} placeholder="메모를 입력하세요" multiline /><View><AppText style={styles.label}>미리보기</AppText><Card style={styles.previewCard}><View style={[styles.previewAbbreviation, { backgroundColor: preview.color }]}><AppText variant="heading" style={{ color: preview.textColor }}>{preview.abbreviation}</AppText></View><View style={styles.previewInfo}><AppText style={{ fontWeight: '700' }}>{preview.name}</AppText><AppText variant="caption" tone="secondary">{formatShiftTime(preview as ShiftType)}</AppText></View></Card></View></View><View style={[styles.submitButtonContainer, { paddingBottom: buttonBottomPadding }]}><PrimaryButton label="저장" onPress={() => { void save(); }} style={styles.submitButton} />{onDelete ? <Pressable accessibilityRole="button" onPress={onDelete} style={styles.deleteButton}><AppText style={{ color: theme.accent, fontWeight: '700' }}>근무유형 삭제</AppText></Pressable> : null}</View></ScrollView></KeyboardAvoidingView><ColorPickerModal visible={isColorPickerVisible} initialColor={selectedColor.color} representativeColors={getRepresentativeShiftColors(shiftTypes)} onClose={() => setIsColorPickerVisible(false)} onSelect={(color, textColor) => setSelectedColor({ name: 'Custom', color, textColor })} /></Screen>;
}

function Header({ title, onBack }: { title: string; onBack: () => void }) { const theme = useAppTheme(); return <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" onPress={onBack} style={styles.backButton}><AppText variant="heading" style={{ color: theme.primary }}>‹</AppText></Pressable><AppText variant="heading">{title}</AppText><View style={styles.backButton} /></View>; }
function Field({ compact, label, ...props }: { compact?: boolean; label: string } & React.ComponentProps<typeof TextInput>) { const theme = useAppTheme(); return <View style={[styles.field, compact && styles.compactField]}><AppText style={styles.label}>{label}</AppText><TextInput {...props} style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} placeholderTextColor={theme.textSecondary} /></View>; }
const styles = StyleSheet.create({ screen: { paddingTop: spacing.sm, paddingBottom: 0 }, keyboardAvoiding: { flex: 1 }, scrollView: { flex: 1 }, content: { paddingBottom: 0 }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 }, backButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, form: { gap: spacing.xl, marginTop: spacing.lg }, field: {}, compactField: { flex: 1 }, label: { fontWeight: '700', marginBottom: spacing.sm }, input: { borderRadius: radius.md, borderWidth: 1, minHeight: 48, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, palette: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, colorButton: { borderColor: 'transparent', borderRadius: radius.xxl, borderWidth: 1, height: 36, width: 36 }, moreColor: { alignItems: 'center', backgroundColor: 'transparent', justifyContent: 'center' }, kindRow: { flexDirection: 'row', gap: spacing.sm }, kindButton: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flex: 1, minHeight: 48, justifyContent: 'center' }, timeRow: { flexDirection: 'row', gap: spacing.sm }, restNotice: { padding: spacing.md }, previewCard: { alignItems: 'center', flexDirection: 'row' }, previewAbbreviation: { alignItems: 'center', borderRadius: radius.md, height: 48, justifyContent: 'center', width: 48 }, previewInfo: { marginLeft: spacing.md }, submitButtonContainer: { width: '100%' }, submitButton: { marginTop: spacing.xl }, deleteButton: { alignItems: 'center', minHeight: 44, justifyContent: 'center', marginTop: spacing.sm }, });
