import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { AppText, Card, PrimaryButton, Screen } from '../../src/components';
import { useFocusedInputScroll } from '../../src/components/useFocusedInputScroll';
import { radius, spacing, useAppTheme } from '../../src/constants';
import { createServerShiftPreset, createShiftPresetShare, submitShiftPresetCandidate, type ShiftPresetShareMode, type ShiftPresetVisibility } from '../../src/features/shift-presets/shiftPresetServer';
import { createShiftPresetSnapshot } from '../../src/features/shift-presets/shiftPresetSnapshot';
import type { ShiftPreset } from '../../src/features/shift-presets/shiftPreset';
import { useShiftSchedule } from '../../src/features/shifts/ShiftScheduleContext';
import { Header } from '../shift-types';

export default function PresetShareScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { shiftTypes, shiftPattern, anchorPatternIndex, patternHistory, teamRotation } = useShiftSchedule();
  const [name, setName] = useState('내 근무표');
  const [org, setOrg] = useState('');
  const [visibility, setVisibility] = useState<ShiftPresetVisibility>('unlisted');
  const [code, setCode] = useState('');
  const [created, setCreated] = useState<{ id: string; preset: ShiftPreset }>();
  const [jobRole, setJobRole] = useState('');
  const [department, setDepartment] = useState('');
  const [candidateSubmitted, setCandidateSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const lock = useRef(false);
  const keyboardScroll = useFocusedInputScroll();

  async function create(mode: ShiftPresetShareMode) {
    if (lock.current || !name.trim()) return;
    lock.current = true;
    setLoading(true);
    try {
      const snapshot = createShiftPresetSnapshot({ name, organizationName: org, shiftTypes, pattern: shiftPattern, anchorPatternIndex, patternHistory, teamRotation });
      const id = await createServerShiftPreset(snapshot, 'unlisted');
      const shareCode = await createShiftPresetShare(id, mode);
      setCreated({ id, preset: snapshot });
      setCode(shareCode);
      if (visibility === 'public') {
        try {
          await submitShiftPresetCandidate(id, snapshot, { jobRole, workplaceName: snapshot.organizationName, department });
          setCandidateSubmitted(true);
        } catch {
          Alert.alert('검색 공개 요청을 제출하지 못했어요.', '공유 코드는 사용할 수 있어요. 아래에서 다시 제출해 주세요.');
        }
      }
    } catch { Alert.alert('공유 코드를 만들 수 없어요.', '잠시 후 다시 시도해 주세요.'); }
    finally { lock.current = false; setLoading(false); }
  }

  async function submitCandidate() {
    if (!created || lock.current || candidateSubmitted) return;
    lock.current = true;
    setLoading(true);
    try {
      await submitShiftPresetCandidate(created.id, created.preset, { jobRole, workplaceName: created.preset.organizationName, department });
      setCandidateSubmitted(true);
      Alert.alert(visibility === 'public' ? '검색 공개 요청을 접수했어요.' : '프리셋 후보를 제출했어요.', '검토 승인 후 검색에 표시됩니다.');
    } catch { Alert.alert('후보를 제출하지 못했어요.', '공유 코드는 그대로 사용할 수 있어요. 잠시 후 다시 시도해 주세요.'); }
    finally { lock.current = false; setLoading(false); }
  }

  const link = code ? Linking.createURL('shift-presets/receive', { queryParams: { code } }) : '';
  async function share() { if (code) await Share.share({ message: `모두의 근무 근무표를 공유했어요.\n공유 코드: ${code}\n${link}` }); }

  return <Screen style={styles.screen}><ScrollView ref={keyboardScroll.scrollRef} onScroll={keyboardScroll.onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Header title="근무 프리셋 공유" onBack={() => router.back()} />
    <TextInput value={name} onFocus={keyboardScroll.onInputFocus} onChangeText={setName} maxLength={60} placeholder="프리셋 이름" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]} />
    <TextInput value={org} onFocus={keyboardScroll.onInputFocus} onChangeText={setOrg} maxLength={80} placeholder="회사·기관명 (선택)" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]} />
    <AppText style={styles.label}>공개 방식</AppText>
    <View style={styles.row}>{(['unlisted', 'public'] as const).map((value) => <Pressable key={value} disabled={loading || Boolean(code)} onPress={() => setVisibility(value)} style={[styles.option, { borderColor: theme.border }, visibility === value && { backgroundColor: theme.primary }]}><AppText style={{ color: visibility === value ? theme.surface : theme.text }}>{value === 'unlisted' ? '공유 코드/링크만' : '검색 공개 요청'}</AppText></Pressable>)}</View>
    {visibility === 'public' ? <Card style={styles.result}>
      <AppText style={styles.label}>검색 공개 요청</AppText>
      <AppText variant="caption" tone="secondary">공유 코드를 만들면 검토 후보로 제출돼요. 승인 후 검색에 표시되며, 공유 코드는 바로 사용할 수 있어요.</AppText>
      <TextInput value={jobRole} editable={!candidateSubmitted} onFocus={keyboardScroll.onInputFocus} onChangeText={setJobRole} maxLength={80} placeholder="직군 (선택)" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.border }]} />
      <TextInput value={department} editable={!candidateSubmitted} onFocus={keyboardScroll.onInputFocus} onChangeText={setDepartment} maxLength={80} placeholder="부서·근무형태 (선택)" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.border }]} />
      {code ? <PrimaryButton label={candidateSubmitted ? '검토 요청 접수됨' : loading ? '제출 중...' : '검색 공개 요청 다시 제출'} disabled={candidateSubmitted || loading} onPress={() => void submitCandidate()} /> : null}
    </Card> : null}
    {code ? <>
      <Card style={styles.result}><AppText variant="heading" selectable>{code}</AppText><AppText variant="caption" tone="secondary" selectable>{link}</AppText><PrimaryButton label="공유하기" onPress={() => void share()} /></Card>
      {visibility === 'unlisted' ? <Card style={styles.result}>
        <AppText style={styles.label}>익명 프리셋 후보 제공</AppText>
        <AppText variant="caption" tone="secondary">다른 교대근무자가 사용할 수 있도록 이 근무표를 검토 후보로 제출할까요? 후보 내용에는 개인 일정·메모·급여·이름·이메일을 넣지 않아요. 제출 이력은 계정 ID로 관리하며, 제출은 선택 사항이에요.</AppText>
        <TextInput value={jobRole} onFocus={keyboardScroll.onInputFocus} onChangeText={setJobRole} maxLength={80} placeholder="직군 (선택)" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.border }]} />
        <TextInput value={department} onFocus={keyboardScroll.onInputFocus} onChangeText={setDepartment} maxLength={80} placeholder="부서·근무형태 (선택)" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.border }]} />
        <PrimaryButton label={candidateSubmitted ? '제출했어요' : loading ? '제출 중...' : '프리셋 제공 동의'} disabled={candidateSubmitted || loading} onPress={() => void submitCandidate()} />
      </Card> : null}
    </> : <><PrimaryButton disabled={loading} label={loading ? '만드는 중...' : '한 사람에게 공유'} onPress={() => void create('single')} /><PrimaryButton disabled={loading} label="여러 사람에게 공유" onPress={() => void create('reusable')} /></>}
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 }, content: { gap: spacing.md, paddingBottom: spacing.xxl + 72 },
  input: { borderRadius: radius.md, borderWidth: 1, minHeight: 50, paddingHorizontal: spacing.md },
  label: { fontWeight: '700' }, row: { flexDirection: 'row', gap: spacing.sm },
  option: { borderRadius: radius.md, borderWidth: 1, flex: 1, padding: spacing.sm }, result: { gap: spacing.md },
});
