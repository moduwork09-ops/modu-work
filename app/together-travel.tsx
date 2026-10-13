import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, PrimaryButton, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { useAuth } from '../src/features/auth/AuthContext';
import { getTogetherAvailabilityStatusMessage, type TogetherCommonAvailability } from '../src/features/together/commonAvailabilityPresentation';
import { addLocalCalendarDays, countLocalCalendarDays, formatLocalCalendarDate } from '../src/features/together/dayOffProjection';
import { chooseSharedEventSpaceId, selectActiveSharedEventSpaces, type SharedEventSpaceOption } from '../src/features/together/sharedEventSpaceSelection';
import { getTogetherTravelAvailability, getTogetherMembers, getTogetherSpaces, isTogetherSpaceId, listSharedEvents } from '../src/features/together/togetherServerData';
import { createTravelRecommendations, type TravelRecommendation, type TravelResult } from '../src/features/together/travelRecommendation';

type GroupState = { kind: 'loading' | 'error' } | { kind: 'ready'; owner: string; options: SharedEventSpaceOption[] };
type SearchState = { kind: 'idle' | 'loading' | 'error' } | { kind: 'ready'; result: TravelResult };
const STAYS = [1, 2, 3] as const;
const HORIZONS = [30, 60, 90] as const;

function localTime(iso: string, timezoneName: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezoneName,
  }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.hour + ':' + values.minute;
}

function formatDate(localDate: string) {
  const [, month, day] = localDate.split('-');
  return Number(month) + '월 ' + Number(day) + '일';
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

export default function TogetherTravelScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ spaceId?: string | string[] }>();
  const routeSpaceId = typeof params.spaceId === 'string' && isTogetherSpaceId(params.spaceId) ? params.spaceId : undefined;
  const [groupState, setGroupState] = useState<GroupState>({ kind: 'loading' });
  const [spaceId, setSpaceId] = useState<string>();
  const [nights, setNights] = useState<1 | 2 | 3>(1);
  const [horizon, setHorizon] = useState<30 | 60 | 90>(30);
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' });
  const [retry, setRetry] = useState(0);
  const groupGeneration = useRef(0);
  const searchGeneration = useRef(0);
  const navigationRef = useRef(false);
  const ownerRef = useRef(session?.user.id);
  ownerRef.current = session?.user.id;
  const options = groupState.kind === 'ready' && groupState.owner === session?.user.id ? groupState.options : [];
  const selected = options.find((option) => option.space.id === spaceId);

  useFocusEffect(useCallback(() => {
    navigationRef.current = false;
    const owner = session?.user.id;
    const request = ++groupGeneration.current;
    if (!owner) { setGroupState({ kind: 'error' }); return undefined; }
    setGroupState({ kind: 'loading' });
    void getTogetherSpaces()
      .then(async (spaces) => Promise.all(spaces.map(async (space) => ({
        space, members: await getTogetherMembers(space.id),
      }))))
      .then((all) => {
        if (groupGeneration.current !== request || ownerRef.current !== owner) return;
        const active = selectActiveSharedEventSpaces(all, owner);
        setGroupState({ kind: 'ready', owner, options: active });
        setSpaceId((current) => chooseSharedEventSpaceId(active, routeSpaceId, current));
      })
      .catch(() => {
        if (groupGeneration.current === request && ownerRef.current === owner) setGroupState({ kind: 'error' });
      });
    return () => { groupGeneration.current += 1; };
  }, [retry, routeSpaceId, session?.user.id]));

  useEffect(() => {
    const owner = session?.user.id;
    const currentSpace = selected?.space.id;
    if (!owner || !currentSpace) { setSearch({ kind: 'idle' }); return undefined; }
    const request = ++searchGeneration.current;
    let active = true;
    setSearch({ kind: 'loading' });
    const from = formatLocalCalendarDate(new Date());
    const to = addLocalCalendarDays(from, horizon - 1);
    void (async () => {
      const days: TogetherCommonAvailability[] = [];
      for (let start = from; start <= to; start = addLocalCalendarDays(start, 62)) {
        const end = addLocalCalendarDays(start, Math.min(61, Math.max(0, countLocalCalendarDays(start, to) - 1)));
        days.push(...await getTogetherTravelAvailability(currentSpace, start, end));
      }
      const events = await listSharedEvents(currentSpace);
      return createTravelRecommendations(currentSpace, days, events, nights);
    })().then((result) => {
      if (active && searchGeneration.current === request && ownerRef.current === owner) setSearch({ kind: 'ready', result });
    }).catch(() => {
      if (active && searchGeneration.current === request && ownerRef.current === owner) setSearch({ kind: 'error' });
    });
    return () => { active = false; if (searchGeneration.current === request) searchGeneration.current += 1; };
  }, [horizon, nights, retry, selected?.space.id, session?.user.id]);

  const save = (item: TravelRecommendation) => {
    if (navigationRef.current || !selected || item.spaceId !== selected.space.id || ownerRef.current !== session?.user.id) return;
    navigationRef.current = true;
    const timezone = item.timezoneName;
    router.push({ pathname: '/together-event-create', params: {
      spaceId: item.spaceId,
      date: item.startDate,
      endDate: item.endDate,
      startTime: localTime(item.startsAt, timezone),
      endTime: localTime(item.endsAt, timezone),
      title: '여행',
      source: 'travel',
      timezoneName: timezone,
    } });
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="뒤로" accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
          <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
        </Pressable>
        <AppText variant="button" style={styles.title}>여행 가능일 찾기</AppText>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {groupState.kind === 'loading' ? <Card><AppText>함께 그룹을 확인하는 중...</AppText></Card> : null}
        {groupState.kind === 'error' ? <Card style={styles.card}><AppText>그룹을 확인할 수 없어요.</AppText><PrimaryButton label="다시 시도" onPress={() => setRetry((value) => value + 1)} /></Card> : null}
        {groupState.kind === 'ready' && options.length === 0 ? <Card style={styles.card}>
          <AppText>여행 가능일을 찾으려면 함께 그룹이 필요해요.</AppText>
          <PrimaryButton label="그룹 만들기·참여하기" onPress={() => router.push('/together-add')} />
        </Card> : null}
        {options.length > 0 ? <Card style={styles.card}>
          <AppText variant="button">함께할 그룹</AppText>
          {options.length > 1 ? <AppText variant="caption" tone="secondary">추천을 계산할 그룹을 선택해 주세요.</AppText> : null}
          {options.map(({ space, members }) => (
            <Pressable key={space.id} accessibilityRole="button" accessibilityState={{ selected: spaceId === space.id }}
              onPress={() => setSpaceId(space.id)} style={[styles.groupRow, spaceId === space.id && styles.selectedRow]}>
              <AppText style={styles.groupName}>{space.name}</AppText>
              <AppText variant="caption" tone="secondary">{members.filter((member) => member.status === 'active').length}명</AppText>
            </Pressable>
          ))}
        </Card> : null}
        {selected ? <>
          <Card style={styles.card}>
            <AppText variant="button">숙박 기간</AppText>
            <View style={styles.optionRow}>{STAYS.map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: nights === value }}
              onPress={() => setNights(value)} style={[styles.option, nights === value && styles.optionSelected]}>
              <AppText style={nights === value && styles.optionTextSelected}>{value}박{value + 1}일</AppText>
            </Pressable>)}</View>
            <AppText variant="button">검색 범위</AppText>
            <View style={styles.optionRow}>{HORIZONS.map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: horizon === value }}
              onPress={() => setHorizon(value)} style={[styles.option, horizon === value && styles.optionSelected]}>
              <AppText style={horizon === value && styles.optionTextSelected}>{value}일</AppText>
            </Pressable>)}</View>
          </Card>
          <AppText variant="button">추천 여행 기간</AppText>
          {search.kind === 'loading' ? <Card><AppText tone="secondary">모두의 근무와 일정을 확인하고 있어요.</AppText></Card> : null}
          {search.kind === 'error' ? <Card style={styles.card}><AppText>여행 가능일을 확인하지 못했어요.</AppText><PrimaryButton label="다시 시도" onPress={() => setRetry((value) => value + 1)} /></Card> : null}
          {search.kind === 'ready' && search.result.status !== 'ready' ? <Card><AppText>{getTogetherAvailabilityStatusMessage({
            localDate: '', availabilityStatus: search.result.status, intervals: [], timezoneName: null,
          })}</AppText></Card> : null}
          {search.kind === 'ready' && search.result.status === 'ready' && search.result.recommendations.length === 0
            ? <Card><AppText>이 기간에는 조건에 맞는 연박 자유시간이 없어요.</AppText></Card> : null}
          {search.kind === 'ready' && search.result.recommendations.map((item) => (
            <Card key={item.startsAt} style={styles.card}>
              <AppText variant="button">{formatDate(item.startDate)} {localTime(item.startsAt, item.timezoneName)} ~ {formatDate(item.endDate)} {localTime(item.endsAt, item.timezoneName)}</AppText>
              <AppText>{item.nights}박{item.nights + 1}일 가능 · 공동 자유시간 {formatMinutes(item.durationMinutes)}</AppText>
              <AppText variant="caption" tone="secondary">귀가 후 공동 자유시간 {formatMinutes(item.returnBufferMinutes)}</AppText>
              <PrimaryButton label="공동 일정으로 저장" onPress={() => save(item)} />
            </Card>
          ))}
        </> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingTop: spacing.xs },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 },
  back: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  title: { fontSize: 18 },
  content: { gap: spacing.md, paddingBottom: spacing.lg, paddingTop: spacing.sm },
  card: { gap: spacing.sm },
  groupRow: { alignItems: 'center', borderRadius: radius.md, flexDirection: 'row', minHeight: 48, paddingHorizontal: spacing.sm },
  groupName: { flex: 1 },
  selectedRow: { backgroundColor: '#FFF1EA' },
  optionRow: { flexDirection: 'row', gap: spacing.xs },
  option: { alignItems: 'center', borderColor: '#E5E1D9', borderRadius: radius.md, borderWidth: 1, flex: 1, minHeight: 42, justifyContent: 'center' },
  optionSelected: { backgroundColor: brandColors.coral, borderColor: brandColors.coral },
  optionTextSelected: { color: brandColors.white },
});
