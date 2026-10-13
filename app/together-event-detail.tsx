import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { useAuth } from '../src/features/auth/AuthContext';
import { DatePickerSheet, formatReadableDate, TimePickerSheet } from '../src/features/events/EventPickerSheets';
import { createSharedEventCalendarItem } from '../src/features/together/sharedEventCalendarPresentation';
import type { SharedEvent } from '../src/features/together/sharedEventContract';
import { createSharedEventIsoRange } from '../src/features/together/sharedEventDateTime';
import { deleteSharedEvent, getSharedEvent, getTogetherMembers, getTogetherSpace, isTogetherSpaceId, updateSharedEvent } from '../src/features/together/togetherServerData';

type LoadedDetail = { event: SharedEvent; spaceName: string; creatorName: string };
type DetailState = { status: 'loading' | 'missing' | 'error' } | { status: 'ready'; ownerId: string; detail: LoadedDetail };
type Picker = 'date' | 'start' | 'end' | null;

export default function TogetherEventDetailScreen() {
  const { eventId, spaceId } = useLocalSearchParams<{ eventId?: string; spaceId?: string }>();
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const ownerId = session?.user.id;
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;
  const requestRef = useRef(0);
  const busyRef = useRef(false);
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';

  useFocusEffect(useCallback(() => {
    const request = ++requestRef.current;
    let active = true;
    setEditing(false);
    setState({ status: 'loading' });
    if (!ownerId || !isTogetherSpaceId(spaceId) || !isTogetherSpaceId(eventId)) {
      setState({ status: 'missing' });
      return () => { active = false; requestRef.current++; };
    }
    void getSharedEvent(spaceId, eventId).then(async (event) => {
      if (!event) {
        if (active && request === requestRef.current && ownerId === ownerRef.current) setState({ status: 'missing' });
        return;
      }
      const [space, members] = await Promise.all([getTogetherSpace(spaceId), getTogetherMembers(spaceId)]);
      if (!active || request !== requestRef.current || ownerId !== ownerRef.current) return;
      const creator = members.find((member) => member.userId === event.createdBy);
      setState({ status: 'ready', ownerId, detail: {
        event,
        spaceName: space.name,
        creatorName: event.createdBy === ownerId ? '나' : creator?.displayName || '이전 멤버',
      } });
    }).catch(() => {
      if (active && request === requestRef.current && ownerId === ownerRef.current) setState({ status: 'error' });
    });
    return () => { active = false; if (requestRef.current === request) requestRef.current++; };
  }, [eventId, ownerId, retryKey, spaceId]));

  const detail = state.status === 'ready' && state.ownerId === ownerId ? state.detail : null;
  const event = detail?.event;
  const canManage = !!event && event.createdBy === ownerId;
  const eventDisplay = event ? createSharedEventCalendarItem(event, timezone) : null;

  const beginEdit = () => {
    if (!canManage || !event || !eventDisplay || busyRef.current) return;
    setTitle(event.title);
    setMemo(event.memo ?? '');
    setDate(eventDisplay.localDate);
    setStartTime(eventDisplay.startTime);
    setEndTime(eventDisplay.endTime);
    setEditing(true);
  };

  const save = async () => {
    if (!canManage || !event || !spaceId || busyRef.current) return;
    if (!title.trim()) { Alert.alert('일정 제목을 입력해주세요.'); return; }
    let range: { startsAt: string; endsAt: string };
    try {
      range = createSharedEventIsoRange(date, { startTime, endTime }, timezone);
    } catch {
      Alert.alert('시간을 확인해주세요.', '종료 시간은 시작 시간보다 늦어야 해요.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const request = requestRef.current;
    const owner = ownerId;
    try {
      const updated = await updateSharedEvent({
        spaceId, eventId: event.id, title, memo, ...range,
      });
      if (request === requestRef.current && owner === ownerRef.current) {
        setState({ status: 'ready', ownerId: owner!, detail: { ...detail!, event: updated } });
        setEditing(false);
      }
    } catch {
      if (request === requestRef.current && owner === ownerRef.current) Alert.alert('공동 일정을 수정하지 못했어요.', '권한이나 네트워크 상태를 확인한 뒤 다시 시도해 주세요.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    if (!canManage || !event || !spaceId || busyRef.current) return;
    const target = { spaceId, eventId: event.id, title: event.title };
    const request = requestRef.current;
    const owner = ownerId;
    Alert.alert('공동 일정을 삭제할까요?', '"' + target.title + '" 일정이 함께 공간에서도 삭제됩니다.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => {
        if (busyRef.current || request !== requestRef.current || owner !== ownerRef.current) return;
        busyRef.current = true;
        setBusy(true);
        void deleteSharedEvent(target.spaceId, target.eventId).then(() => {
          if (request === requestRef.current && owner === ownerRef.current) router.back();
        }).catch(() => {
          if (request === requestRef.current && owner === ownerRef.current) {
            Alert.alert('공동 일정을 삭제하지 못했어요.', '권한이나 네트워크 상태를 확인한 뒤 다시 시도해 주세요.');
            setRetryKey((current) => current + 1);
          }
        }).finally(() => {
          busyRef.current = false;
          setBusy(false);
        });
      } },
    ]);
  };

  return <Screen style={styles.screen}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" onPress={() => router.back()} style={styles.back}>
            <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
          </Pressable>
          <AppText variant="button" style={styles.headerTitle}>공동 일정</AppText>
          <View style={styles.back} />
        </View>
        {state.status !== 'ready' ? <Card style={styles.stateCard}>
          <AppText>{state.status === 'loading' ? '공동 일정을 불러오는 중이에요.' : state.status === 'missing' ? '일정을 찾을 수 없거나 접근 권한이 없어요.' : '공동 일정을 불러오지 못했어요.'}</AppText>
          {state.status === 'error' ? <Pressable accessibilityRole="button" onPress={() => setRetryKey((value) => value + 1)}><AppText style={{ color: theme.primary }}>다시 시도</AppText></Pressable> : null}
        </Card> : null}
        {detail && event && eventDisplay ? <>
          <Card style={styles.summary}>
            <AppText variant="heading" style={styles.title}>{event.title}</AppText>
            <AppText tone="secondary">{formatReadableDate(eventDisplay.localDate)}</AppText>
            <AppText style={styles.time}>{eventDisplay.startTime} ~ {eventDisplay.endTime}</AppText>
          </Card>
          <Card style={styles.info}>
            <AppText style={styles.label}>함께 공간</AppText><AppText>{detail.spaceName}</AppText>
            <AppText style={styles.label}>작성자</AppText><AppText>{detail.creatorName}</AppText>
            <AppText style={styles.label}>장소</AppText><AppText>{event.placeName || '등록된 장소가 없어요.'}</AppText>
            {event.placeAddress ? <AppText tone="secondary">{event.placeAddress}</AppText> : null}
            <AppText style={styles.label}>메모</AppText><AppText>{event.memo || '등록된 메모가 없어요.'}</AppText>
          </Card>
          {canManage && !editing ? <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={beginEdit} style={[styles.action, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <AppText variant="button">일정 수정</AppText>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={confirmDelete} style={[styles.action, styles.destructive]}>
              <AppText variant="button" style={styles.deleteText}>삭제</AppText>
            </Pressable>
          </View> : null}
          {!canManage ? <AppText tone="secondary">작성자만 이 일정을 수정하거나 삭제할 수 있어요.</AppText> : null}
          {canManage && editing ? <Card style={styles.editor}>
            <AppText variant="heading">공동 일정 수정</AppText>
            <AppText style={styles.label}>날짜</AppText>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => setPicker('date')} style={[styles.field, { borderColor: theme.border }]}>
              <AppText>{formatReadableDate(date)}</AppText>
            </Pressable>
            <View style={styles.timeFields}>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => setPicker('start')} style={[styles.field, styles.half, { borderColor: theme.border }]}><AppText>시작 {startTime}</AppText></Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => setPicker('end')} style={[styles.field, styles.half, { borderColor: theme.border }]}><AppText>종료 {endTime}</AppText></Pressable>
            </View>
            <AppText style={styles.label}>제목</AppText>
            <TextInput accessibilityLabel="공동 일정 제목" value={title} onChangeText={setTitle} maxLength={100} style={[styles.field, { borderColor: theme.border, color: theme.text }]} />
            <AppText style={styles.label}>메모</AppText>
            <TextInput accessibilityLabel="공동 일정 메모" value={memo} onChangeText={setMemo} multiline textAlignVertical="top" style={[styles.field, styles.memoInput, { borderColor: theme.border, color: theme.text }]} />
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => setEditing(false)} style={[styles.action, { borderColor: theme.border }]}><AppText>취소</AppText></Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[styles.action, { backgroundColor: theme.primary }]}><AppText style={styles.saveText}>{busy ? '저장 중...' : '저장'}</AppText></Pressable>
            </View>
          </Card> : null}
        </> : null}
      </ScrollView>
    </KeyboardAvoidingView>
    {date ? <DatePickerSheet visible={picker === 'date'} value={date} onClose={() => setPicker(null)} onConfirm={(value) => { setDate(value); setPicker(null); }} /> : null}
    {startTime ? <TimePickerSheet visible={picker === 'start'} title="시작 시간 선택" value={startTime} onClose={() => setPicker(null)} onConfirm={(value) => { setStartTime(value); setPicker(null); }} /> : null}
    {endTime ? <TimePickerSheet allowEndOfDay visible={picker === 'end'} title="종료 시간 선택" value={endTime} onClose={() => setPicker(null)} onConfirm={(value) => { setEndTime(value); setPicker(null); }} /> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xs, paddingBottom: 0 },
  flex: { flex: 1 },
  content: { gap: spacing.md },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 },
  back: { alignItems: 'center', justifyContent: 'center', width: 36, height: 36 },
  headerTitle: { fontSize: 18 },
  stateCard: { gap: spacing.sm, padding: spacing.lg },
  summary: { backgroundColor: '#FFF1EA', borderColor: '#F5D8CC', gap: spacing.xs, padding: spacing.md },
  title: { color: brandColors.deepNavy, fontSize: 21 },
  time: { color: brandColors.coral, fontSize: 20, fontWeight: '700' },
  info: { gap: spacing.xs, padding: spacing.md },
  label: { fontSize: 13, fontWeight: '700', marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.xs },
  action: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 46 },
  destructive: { backgroundColor: '#FFF0ED', borderColor: '#F4D0C9' },
  deleteText: { color: '#B94638' },
  editor: { gap: spacing.xs, padding: spacing.md },
  field: { borderRadius: radius.md, borderWidth: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  timeFields: { flexDirection: 'row', gap: spacing.xs },
  half: { flex: 1 },
  memoInput: { minHeight: 90, paddingVertical: spacing.xs },
  saveText: { color: '#FFFFFF', fontWeight: '700' },
});
