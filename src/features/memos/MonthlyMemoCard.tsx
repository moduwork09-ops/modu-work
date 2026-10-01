import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Card, PrimaryButton } from '../../components';
import { useFocusedInputScroll } from '../../components/useFocusedInputScroll';
import { radius, spacing, useAppTheme } from '../../constants';
import { useShiftSchedule } from '../shifts/ShiftScheduleContext';
import { MONTHLY_MEMO_MAX_LENGTH } from './monthlyMemo';

export function MonthlyMemoCard({ month }: { month: string }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const keyboardScroll = useFocusedInputScroll();
  const { monthlyMemos, monthlyMemosReady, saveMonthlyMemo } = useShiftSchedule();
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const memo = monthlyMemos[month];
  const open = () => { setDraft(memo?.text ?? ''); setVisible(true); };
  const close = () => { if (!lock.current) setVisible(false); };
  const save = async () => {
    if (lock.current) return;
    lock.current = true; setSaving(true);
    const saved = await saveMonthlyMemo(month, draft);
    lock.current = false;
    if (!active.current) return;
    setSaving(false);
    if (saved) setVisible(false);
    else Alert.alert('월간 메모를 저장하지 못했어요.', '입력 내용은 유지됩니다. 다시 시도해 주세요.');
  };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={month + ' 이번 달 메모 편집'} disabled={!monthlyMemosReady} onPress={open} style={styles.card}>
      <Card><View style={styles.heading}><AppText style={styles.bold}>이번 달 메모</AppText><AppText style={{ color: theme.primary }}>편집</AppText></View><AppText numberOfLines={3} tone={memo ? 'primary' : 'secondary'} style={styles.preview}>{monthlyMemosReady ? memo?.text ?? '이번 달 메모 남기기' : '월간 메모를 불러오지 못했어요. 화면을 다시 열어 주세요.'}</AppText></Card>
    </Pressable>
    <Modal transparent animationType="slide" visible={visible} onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: spacing.lg + insets.bottom }]}>
          <View style={styles.heading}><AppText variant="heading">{month} 월간 메모</AppText><Pressable accessibilityRole="button" accessibilityLabel="월간 메모 닫기" disabled={saving} onPress={close} hitSlop={8}><AppText>닫기</AppText></Pressable></View>
          <ScrollView ref={keyboardScroll.scrollRef} onScroll={keyboardScroll.onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" style={styles.editorScroll}><TextInput accessibilityLabel="월간 메모 내용" multiline autoFocus onFocus={keyboardScroll.onInputFocus} textAlignVertical="top" maxLength={MONTHLY_MEMO_MAX_LENGTH} editable={!saving} value={draft} onChangeText={setDraft} placeholder="이번 달에 기억할 일을 자유롭게 적어 주세요." placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.border }]} /></ScrollView>
          <AppText variant="caption" tone="secondary">{draft.length}/{MONTHLY_MEMO_MAX_LENGTH} · 내용을 비우고 저장하면 삭제돼요.</AppText>
          <PrimaryButton label={saving ? '저장 중...' : '저장'} disabled={saving} onPress={() => void save()} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}
const styles = StyleSheet.create({ card: { marginTop: spacing.md, marginBottom: spacing.xl }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, bold: { fontWeight: '700' }, preview: { marginTop: spacing.sm }, overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' }, sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md, maxHeight: '88%' }, editorScroll: { flexShrink: 1 }, input: { minHeight: 220, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, fontSize: 16 } });
