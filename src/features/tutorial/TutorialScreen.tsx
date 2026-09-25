import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, PrimaryButton, Screen } from '../../components';
import { brandColors, calendarShiftColors, radius, spacing, useAppTheme } from '../../constants';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { pickLocalBackup, restoreLocalBackup } from '../backup/localDataBackup';
import { useShiftSchedule } from '../shifts/ShiftScheduleContext';
import { scheduleFullAvailabilityProjectionSync } from '../together/availabilityProjectionSync';
import { scheduleReplacementDayOffProjectionSync } from '../together/dayOffProjectionSync';
import { useTutorial } from './TutorialContext';

const tutorialPages = [
  { title: '내 근무 패턴을 등록하면\n캘린더에 근무가 자동으로 표시돼요.', description: '직접 등록하거나 기본 프리셋·공유 근무표를 이용할 수 있어요.', accent: '#4A82B8', soft: '#EAF3FB' },
  { title: '근무와 일정을 한눈에 보고\n내가 가능한 시간을 쉽게 찾아보세요.', description: '개인 일정, 메모, 초과근무도 함께 관리할 수 있어요.', accent: '#5F8E68', soft: '#ECF5ED' },
  { title: '가족이나 동료와 근무를 공유하고\n함께 쉴 수 있는 날을 찾아보세요.', description: '공통 휴무 · 겹치는 틈 · 공동 일정', accent: '#7D66A8', soft: '#F1ECF8' },
  { title: '교대근무자의 시간을 더 쉽게.', description: '모두의 근무와 함께 시작해요.', accent: '#D98245', soft: '#FFF1E6' },
] as const;

export function TutorialScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { mode } = useLocalSearchParams<{ mode?: string | string[] }>();
  const replay = mode === 'replay';
  const { completeTutorial } = useTutorial();
  const { session } = useAuth();
  const { reloadPersistedData } = useShiftSchedule();
  const scrollRef = useRef<ScrollView>(null);
  const actionLock = useRef(false);
  const [pageWidth, setPageWidth] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);

  const onLayout = (event: LayoutChangeEvent) => setPageWidth(event.nativeEvent.layout.width);
  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPageIndex(Math.max(0, Math.min(3, Math.round(event.nativeEvent.contentOffset.x / pageWidth))));
  };
  const advance = () => {
    const next = Math.min(pageIndex + 1, tutorialPages.length - 1);
    scrollRef.current?.scrollTo({ animated: true, x: next * pageWidth });
    setPageIndex(next);
  };
  const finish = async () => {
    if (actionLock.current) return;
    if (replay) {
      if (router.canGoBack()) router.back(); else router.replace('/(tabs)/my');
      return;
    }
    actionLock.current = true;
    setIsCompleting(true);
    try {
      await completeTutorial();
      router.replace('/shift-presets');
    } catch {
      Alert.alert('완료 상태를 저장하지 못했어요.', '잠시 후 다시 시도해 주세요.');
      setIsCompleting(false);
      actionLock.current = false;
    }
  };

  const restoreBackup = async () => {
    if (actionLock.current || replay) return;
    actionLock.current = true;
    setIsCompleting(true);
    const release = () => { actionLock.current = false; setIsCompleting(false); };
    try {
      const backup = await pickLocalBackup();
      if (!backup) { release(); return; }
      Alert.alert('데이터를 복원할까요?', '현재 데이터가 백업 파일의 데이터로 변경됩니다.', [
        { text: '취소', style: 'cancel', onPress: release },
        { text: '복원하기', style: 'destructive', onPress: () => { void (async () => {
          try {
            const currentSession = await supabase.auth.getSession();
            if (!session?.user.id || currentSession.data.session?.user.id !== session.user.id) throw new Error('Account changed');
            await restoreLocalBackup(backup);
            await reloadPersistedData();
            if (session) await scheduleReplacementDayOffProjectionSync(session.user.id);
            if (session) await scheduleFullAvailabilityProjectionSync(session.user.id);
            await completeTutorial();
            Alert.alert('복원이 완료됐어요.', '백업 파일의 데이터로 복원했어요.', [{ text: '확인', onPress: () => router.replace('/') }]);
          } catch {
            Alert.alert('복원하지 못했어요.', '백업 파일을 확인한 뒤 다시 시도해주세요.');
          } finally { release(); }
        })(); } },
      ]);
    } catch {
      Alert.alert('복원하지 못했어요.', '백업 파일을 확인한 뒤 다시 시도해주세요.');
      release();
    }
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.topBar}>
        <AppText variant="button" style={{ color: theme.primary }}>모두의 근무</AppText>
        {replay ? <Pressable accessibilityLabel="사용 방법 닫기" hitSlop={8} onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/my'); }} style={styles.closeButton}><MaterialCommunityIcons name="close" size={24} color={theme.text} /></Pressable> : <View style={styles.closeButton} />}
      </View>
      <View onLayout={onLayout} style={styles.pager}>
        <ScrollView ref={scrollRef} horizontal pagingEnabled bounces={false} onMomentumScrollEnd={onMomentumScrollEnd} showsHorizontalScrollIndicator={false}>
          {tutorialPages.map((page, index) => (
            <ScrollView key={page.title} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} style={{ width: pageWidth }}>
              <Card style={[styles.card, { borderColor: page.accent, backgroundColor: theme.surface }]}>
                <View style={[styles.numberBadge, { backgroundColor: page.soft }]}><AppText variant="caption" style={{ color: page.accent, fontWeight: '700' }}>{index + 1}</AppText></View>
                <View style={styles.copy}>
                  <AppText variant="heading" style={styles.title}>{page.title}</AppText>
                  <AppText tone="secondary" style={styles.description}>{page.description}</AppText>
                </View>
                <View style={[styles.preview, { backgroundColor: page.soft }]}><TutorialPreview index={index} accent={page.accent} /></View>
              </Card>
            </ScrollView>
          ))}
        </ScrollView>
      </View>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View accessible accessibilityLabel={`${tutorialPages.length}페이지 중 ${pageIndex + 1}페이지`} style={styles.dots}>
          {tutorialPages.map((page, index) => <View key={page.title} style={[styles.dot, { backgroundColor: index === pageIndex ? tutorialPages[pageIndex].accent : theme.border }, index === pageIndex && styles.activeDot]} />)}
        </View>
        <PrimaryButton
          accessibilityLabel={pageIndex === 3 ? (replay ? '사용 방법 닫기' : '내 근무표 설정하기') : `다음 페이지, ${pageIndex + 2}페이지`}
          disabled={isCompleting}
          label={pageIndex === 3 ? (replay ? '닫기' : isCompleting ? '진행 중...' : '내 근무표 설정하기') : '다음'}
          onPress={() => pageIndex === 3 ? void finish() : advance()}
          style={styles.action}
        />
        {pageIndex === 3 && !replay ? <Pressable accessibilityRole="button" accessibilityLabel="백업에서 복원하기" disabled={isCompleting} onPress={() => void restoreBackup()} style={styles.restoreAction}><AppText variant="button" style={{ color: theme.primary }}>백업에서 복원하기</AppText></Pressable> : null}
      </View>
    </Screen>
  );
}

function TutorialPreview({ index, accent }: { index: number; accent: string }) {
  if (index === 0) return <ShiftPreview />;
  if (index === 1) return <CalendarPreview />;
  if (index === 2) return <TogetherPreview accent={accent} />;
  return <GapPreview accent={accent} />;
}

function ShiftPreview() {
  const shifts = [calendarShiftColors.day, calendarShiftColors.night, calendarShiftColors.offDuty, calendarShiftColors.rest];
  const labels = ['주', '야', '비', '휴'];
  return <View style={styles.monthPreview}><View style={styles.weekdays}>{['월', '화', '수', '목', '금', '토', '일'].map((day) => <AppText key={day} variant="caption" tone="secondary" style={styles.weekday}>{day}</AppText>)}</View><View style={styles.shiftGrid}>{Array.from({ length: 14 }, (_, index) => { const shiftIndex = index % shifts.length; return <View key={index} style={[styles.shiftBadge, { backgroundColor: shifts[shiftIndex].background }]}><AppText style={[styles.shiftBadgeText, { color: shifts[shiftIndex].text }]}>{labels[shiftIndex]}</AppText></View>; })}</View></View>;
}

function CalendarPreview() {
  return <View style={styles.calendarPreview}><View style={styles.calendarDate}><AppText variant="heading">27</AppText><View style={[styles.previewShift, { backgroundColor: calendarShiftColors.day.background }]}><AppText variant="caption" style={{ color: calendarShiftColors.day.text, fontWeight: '700' }}>주간</AppText></View></View><View style={styles.previewRows}><View style={[styles.previewRow, { backgroundColor: '#D7EDB5' }]}><AppText variant="caption" numberOfLines={1}>11:00 병원</AppText></View><View style={[styles.previewRow, { backgroundColor: '#BFE7F5' }]}><AppText variant="caption" numberOfLines={1}>아이 하원</AppText></View></View></View>;
}

function GapPreview({ accent }: { accent: string }) {
  return <View style={styles.gapPreview}><View><AppText variant="caption" tone="secondary">오늘의 틈</AppText><AppText variant="heading" style={{ color: accent }}>총 2시간 30분</AppText></View>{['08:00 ~ 09:30', '12:30 ~ 13:30', '18:30 ~ 19:00'].map((time, index) => <View key={time} style={styles.gapRow}><View style={[styles.gapBar, { backgroundColor: accent, width: `${88 - index * 15}%` }]} /><AppText variant="caption" style={styles.gapTime}>{time}</AppText></View>)}</View>;
}

function TogetherPreview({ accent }: { accent: string }) {
  return <View style={styles.togetherPreview}><View style={styles.togetherHeader}><View><AppText style={{ fontWeight: '700' }}>우리 가족</AppText><AppText variant="caption" tone="secondary">3명</AppText></View><View style={styles.avatars}>{[0, 1, 2].map((item) => <View key={item} style={[styles.avatar, { backgroundColor: item === 0 ? accent : brandColors.sage }]} />)}</View></View><View style={styles.togetherRow}><AppText variant="caption" tone="secondary">공통 휴무</AppText><AppText style={{ fontWeight: '700' }}>8월 30일</AppText></View><View style={styles.togetherRow}><AppText variant="caption" tone="secondary">함께 가능한 시간</AppText><AppText style={{ color: accent, fontWeight: '700' }}>18:00 ~ 21:00</AppText></View></View>;
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingHorizontal: 0, paddingTop: spacing.sm },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: spacing.lg },
  closeButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  pager: { flex: 1 },
  page: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  card: { borderCurve: 'continuous', borderRadius: radius.xxl, borderWidth: 1, flex: 1, gap: spacing.md, justifyContent: 'space-between', padding: spacing.lg },
  numberBadge: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  copy: { gap: spacing.xs },
  title: { fontSize: 23 },
  description: { lineHeight: 23 },
  preview: { borderCurve: 'continuous', borderRadius: radius.xl, flex: 1, justifyContent: 'center', maxHeight: 260, minHeight: 190, padding: spacing.md },
  footer: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  dots: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 24 },
  dot: { borderRadius: 4, height: 8, width: 8 },
  activeDot: { width: 24 },
  action: { width: '100%' },
  restoreAction: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  monthPreview: { gap: spacing.sm },
  weekdays: { flexDirection: 'row' },
  weekday: { fontSize: 11, textAlign: 'center', width: '14.2857%' },
  shiftGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  shiftBadge: { alignItems: 'center', borderRadius: radius.sm, height: 30, justifyContent: 'center', width: '12.5%' },
  shiftBadgeText: { fontSize: 11, fontWeight: '700' },
  calendarPreview: { alignItems: 'center', flexDirection: 'row', gap: spacing.lg, justifyContent: 'center' },
  calendarDate: { alignItems: 'center', gap: spacing.xs },
  previewShift: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  previewRows: { flex: 1, gap: spacing.sm, maxWidth: 180 },
  previewRow: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  gapPreview: { gap: spacing.sm },
  gapRow: { gap: spacing.xxs },
  gapBar: { borderRadius: 4, height: 8 },
  gapTime: { fontVariant: ['tabular-nums'] },
  togetherPreview: { gap: spacing.md },
  togetherHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  avatars: { flexDirection: 'row' },
  avatar: { borderColor: brandColors.white, borderRadius: 16, borderWidth: 2, height: 32, marginLeft: -6, width: 32 },
  togetherRow: { backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: radius.md, gap: spacing.xxs, padding: spacing.sm },
});
