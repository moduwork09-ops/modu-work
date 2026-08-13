import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, PrimaryButton, Screen } from '../../src/components';
import { radius, spacing, useAppTheme } from '../../src/constants';
import { colorPalette, formatShiftTime, type ShiftColorOption, type ShiftKind, type ShiftType } from '../../src/features/shift-settings/mockData';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { Header } from './index';

export default function NewShiftTypeScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { addShiftType } = useShiftSchedule();
  const insets = useSafeAreaInsets();
  const bottomContentPadding = insets.bottom + 80;
  const buttonBottomPadding = Math.max(insets.bottom, spacing.md);
  const [name, setName] = useState('');
  const [abbreviation, setAbbreviation] = useState('');
  const [kind, setKind] = useState<ShiftKind>('work');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [note, setNote] = useState('');
  const [selectedColor, setSelectedColor] = useState<ShiftColorOption>(colorPalette[0]);
  const preview: ShiftType = { id: 'new-shift-preview', abbreviation: abbreviation || '유형', name: name || '새 근무유형', startTime, endTime, kind, color: selectedColor.color, textColor: selectedColor.textColor };

  return (
    <Screen style={styles.screen}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: bottomContentPadding }]}
        keyboardShouldPersistTaps="handled"
      >
        <Header title="근무유형 추가" onBack={() => router.back()} />
        <View style={styles.form}>
          <Field label="유형 이름" value={name} onChangeText={setName} placeholder="예: 교육근무" maxLength={20} />
          <Field label="달력 표시 약칭" value={abbreviation} onChangeText={setAbbreviation} placeholder="예: 교" maxLength={2} />

          <View style={styles.section}>
            <AppText style={styles.label}>색상</AppText>
            <View style={styles.palette}>
              {colorPalette.map((item) => {
                const selected = item.name === selectedColor.name;
                return (
                  <Pressable key={item.name} accessibilityLabel={`${item.name} 색상`} accessibilityState={{ selected }} onPress={() => setSelectedColor(item)} style={[styles.colorButton, { backgroundColor: item.color }, selected && { borderColor: theme.primary, borderWidth: 3 }]} />
                );
              })}
              <View accessibilityLabel="사용자 색상 추가 기능 준비 중" style={[styles.colorButton, styles.moreColor, { borderColor: theme.border }]}>
                <AppText variant="heading" tone="secondary">+</AppText>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <AppText style={styles.label}>유형</AppText>
            <View style={styles.kindRow}>
              {([{ key: 'work', label: '근무' }, { key: 'rest', label: '휴식' }] as const).map((item) => {
                const selected = kind === item.key;
                return <Pressable key={item.key} onPress={() => setKind(item.key)} style={[styles.kindButton, { borderColor: theme.border }, selected && { backgroundColor: theme.primary, borderColor: theme.primary }]}><AppText style={{ color: selected ? theme.surface : theme.text, fontWeight: '700' }}>{item.label}</AppText></Pressable>;
              })}
            </View>
          </View>

          {kind === 'work' ? <View style={styles.timeRow}><Field compact label="시작 시간" value={startTime} onChangeText={setStartTime} placeholder="09:00" /><Field compact label="종료 시간" value={endTime} onChangeText={setEndTime} placeholder="18:00" /></View> : <Card style={styles.restNotice}><AppText tone="secondary">휴식 유형은 근무시간을 설정하지 않습니다.</AppText></Card>}
          <Field label="추가 메모 (선택)" value={note} onChangeText={setNote} placeholder="메모를 입력하세요" multiline />

          <View style={styles.section}>
            <AppText style={styles.label}>미리보기</AppText>
            <Card style={styles.previewCard}>
              <View style={[styles.previewAbbreviation, { backgroundColor: preview.color }]}><AppText variant="heading" style={{ color: preview.textColor }}>{preview.abbreviation}</AppText></View>
              <View style={styles.previewInfo}><AppText style={{ fontWeight: '700' }}>{preview.name}</AppText><AppText variant="caption" tone="secondary">{formatShiftTime(preview)}</AppText></View>
            </Card>
          </View>
        </View>
        <View style={[styles.submitButtonContainer, { paddingBottom: buttonBottomPadding }]}>
          <PrimaryButton label="근무유형 추가" onPress={() => { addShiftType(preview); Alert.alert('근무유형 추가 완료', '근무패턴에서 이 근무유형을 선택할 수 있습니다.', [{ text: '확인', onPress: () => router.back() }]); }} style={styles.submitButton} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function Field({ compact, label, ...props }: { compact?: boolean; label: string } & React.ComponentProps<typeof TextInput>) {
  const theme = useAppTheme();
  return <View style={[styles.field, compact && styles.compactField]}><AppText style={styles.label}>{label}</AppText><TextInput {...props} style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} placeholderTextColor={theme.textSecondary} /></View>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 }, scrollView: { flex: 1 }, content: { paddingBottom: 0 }, form: { gap: spacing.xl, marginTop: spacing.lg }, section: {}, field: {}, compactField: { flex: 1 }, label: { fontWeight: '700', marginBottom: spacing.sm }, input: { borderRadius: radius.md, borderWidth: 1, minHeight: 48, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, palette: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, colorButton: { borderColor: 'transparent', borderRadius: radius.xxl, borderWidth: 1, height: 36, width: 36 }, moreColor: { alignItems: 'center', backgroundColor: 'transparent', justifyContent: 'center' }, kindRow: { flexDirection: 'row', gap: spacing.sm }, kindButton: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flex: 1, minHeight: 48, justifyContent: 'center' }, timeRow: { flexDirection: 'row', gap: spacing.sm }, restNotice: { padding: spacing.md }, previewCard: { alignItems: 'center', flexDirection: 'row' }, previewAbbreviation: { alignItems: 'center', borderRadius: radius.md, height: 48, justifyContent: 'center', width: 48 }, previewInfo: { marginLeft: spacing.md }, submitButtonContainer: { width: '100%' }, submitButton: { marginTop: spacing.xl },
});
