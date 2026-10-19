import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, PrimaryButton, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { useAuth } from '../src/features/auth/AuthContext';
import { useShiftSchedule } from '../src/features/shifts/ShiftScheduleContext';
import { getTogetherAvailabilityStatusMessage, type TogetherCommonAvailability } from '../src/features/together/commonAvailabilityPresentation';
import { addLocalCalendarDays, countLocalCalendarDays, formatLocalCalendarDate } from '../src/features/together/dayOffProjection';
import { chooseSharedEventSpaceId, selectActiveSharedEventSpaces, type SharedEventSpaceOption } from '../src/features/together/sharedEventSpaceSelection';
import { getTogetherTravelAvailability, getTogetherMemberShiftSchedule, getTogetherMembers, getTogetherSpaces, isTogetherSpaceId, listSharedEvents } from '../src/features/together/togetherServerData';
import { TRAVEL_ACCESS_MINUTES, TRAVEL_AIRPORTS, TRAVEL_STYLES, formatTravelMinutes, type TravelAccessMinutes, type TravelAirport, type TravelStyle } from '../src/features/together/travelDestinationRecommendation';
import { MAX_TRAVEL_NIGHTS, type TravelNights, type TravelRecommendation } from '../src/features/together/travelRecommendation';
import { createTravelLeaveRecommendations, selectCurrentUserTravelSoftEvents, type TravelLeaveResult, type TravelPersonalSoftEvent } from '../src/features/together/travelLeaveSimulation';
import { MAX_SIMULATED_LEAVE_DAYS, parseSimulatedLeaveDays } from '../src/features/together/travelLeavePolicy';

type GroupState = { kind: 'loading' | 'error' } | { kind: 'ready'; owner: string; options: SharedEventSpaceOption[] };
type SearchState = { kind: 'idle' | 'loading' | 'error' } | { kind: 'ready'; result: TravelLeaveResult };
type SearchRequest = { id: number; owner: string; spaceId: string; nights: TravelNights; horizon: 30 | 60 | 90;
  budgets: Record<string, number>; personalSoftEvents: TravelPersonalSoftEvent[] };
const STAYS = [1, 2, 3, 4, 6, 9] as const;
const HORIZONS = [30, 60, 90] as const;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function localTime(iso: string, timezoneName: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezoneName,
  }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.hour + ':' + values.minute;
}

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return `${month}월 ${day}일 (${WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]})`;
}

function ChoiceRow<T extends string | number>({ values, selected, label, onSelect }: {
  values: readonly { value: T; label: string }[];
  selected: T;
  label: string;
  onSelect: (value: T) => void;
}) {
  const theme = useAppTheme();
  return <View style={styles.choiceGroup}>
    <AppText variant="caption" style={styles.choiceLabel}>{label}</AppText>
    <View style={styles.optionRow}>{values.map(({ value, label: optionLabel }) => (
      <Pressable key={String(value)} accessibilityLabel={optionLabel} accessibilityRole="button" accessibilityState={{ selected: selected === value }}
        onPress={() => onSelect(value)} style={[styles.option, { borderColor: theme.border }, selected === value && styles.optionSelected]}>
        <AppText variant="caption" numberOfLines={1} style={selected === value ? styles.optionTextSelected : undefined}>{optionLabel}</AppText>
      </Pressable>
    ))}</View>
  </View>;
}

export default function TogetherTravelScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const schedule = useShiftSchedule();
  const params = useLocalSearchParams<{ spaceId?: string | string[] }>();
  const routeSpaceId = typeof params.spaceId === 'string' && isTogetherSpaceId(params.spaceId) ? params.spaceId : undefined;
  const [groupState, setGroupState] = useState<GroupState>({ kind: 'loading' });
  const [spaceId, setSpaceId] = useState<string>();
  const [nights, setNights] = useState<TravelNights>(1);
  const [directNightsOpen, setDirectNightsOpen] = useState(false);
  const [horizon, setHorizon] = useState<30 | 60 | 90>(30);
  const [airport, setAirport] = useState<TravelAirport>('ICN');
  const [accessMinutes, setAccessMinutes] = useState<TravelAccessMinutes>(60);
  const [travelStyle, setTravelStyle] = useState<TravelStyle>('balanced');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leaveBudgets, setLeaveBudgets] = useState<Record<string, number>>({});
  const [customMemberId, setCustomMemberId] = useState<string>();
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' });
  const [searchRequest, setSearchRequest] = useState<SearchRequest>();
  const [retry, setRetry] = useState(0);
  const requestCounter = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const resultsTopRef = useRef<number | null>(null);
  const pendingResultScrollRef = useRef<number | null>(null);
  const lastScrolledSearchRef = useRef<number | null>(null);
  const groupGeneration = useRef(0);
  const searchGeneration = useRef(0);
  const navigationRef = useRef(false);
  const ownerRef = useRef(session?.user.id);
  ownerRef.current = session?.user.id;
  const options = groupState.kind === 'ready' && groupState.owner === session?.user.id ? groupState.options : [];
  const selected = options.find((option) => option.space.id === spaceId);
  const matchingSearch = searchRequest !== undefined && searchRequest.owner === session?.user.id
    && searchRequest.spaceId === selected?.space.id
    && searchRequest.nights === nights && searchRequest.horizon === horizon;
  const visibleSearch = matchingSearch ? search : { kind: 'idle' as const };
  const displayedRecommendations = visibleSearch.kind === 'ready'
    ? [...visibleSearch.result.recommendations, ...(visibleSearch.result.extraLeaveRecommendation ? [visibleSearch.result.extraLeaveRecommendation] : [])]
    : [];
  const activeSelectedMembers = selected?.members.filter((member) => member.status === 'active') ?? [];
  const selectedLeaveTotal = activeSelectedMembers.reduce((total, member) => total + (leaveBudgets[member.userId] ?? 0), 0);
  const scrollToResults = (requestId: number) => {
    if (pendingResultScrollRef.current !== requestId || resultsTopRef.current === null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, resultsTopRef.current - spacing.sm), animated: true });
    lastScrolledSearchRef.current = requestId;
    pendingResultScrollRef.current = null;
  };

  useEffect(() => {
    setLeaveBudgets({});
    setCustomMemberId(undefined);
    setSearchRequest(undefined);
    setSearch({ kind: 'idle' });
  }, [session?.user.id]);

  useEffect(() => {
    if (!searchRequest || (visibleSearch.kind !== 'ready' && visibleSearch.kind !== 'error')
      || lastScrolledSearchRef.current === searchRequest.id) return undefined;
    if (settingsOpen) {
      setSettingsOpen(false);
      return undefined;
    }
    const requestId = searchRequest.id;
    pendingResultScrollRef.current = requestId;
    let nextFrame: number | undefined;
    const frame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => scrollToResults(requestId));
    });
    return () => {
      cancelAnimationFrame(frame);
      if (nextFrame !== undefined) cancelAnimationFrame(nextFrame);
    };
  }, [searchRequest?.id, settingsOpen, visibleSearch.kind]);

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
    if (!searchRequest) return undefined;
    const { owner, spaceId: requestedSpace, nights: requestedNights, horizon: requestedHorizon, budgets, personalSoftEvents } = searchRequest;
    const request = ++searchGeneration.current;
    let active = true;
    setSearch({ kind: 'loading' });
    const from = formatLocalCalendarDate(new Date());
    const to = addLocalCalendarDays(from, requestedHorizon - 1);
    void (async () => {
      const days: TogetherCommonAvailability[] = [];
      for (let start = from; start <= to; start = addLocalCalendarDays(start, 62)) {
        const end = addLocalCalendarDays(start, Math.min(61, Math.max(0, countLocalCalendarDays(start, to) - 1)));
        days.push(...await getTogetherTravelAvailability(requestedSpace, start, end));
      }
      const unavailable = days.find((day) => day.availabilityStatus !== 'ready');
      if (unavailable) return { status: unavailable.availabilityStatus, recommendations: [], extraLeaveRecommendation: null };
      const members = (await getTogetherMembers(requestedSpace)).filter((member) => member.status === 'active');
      if (members.length < 2 || !members.some((member) => member.userId === owner)) throw new Error('Together membership changed');
      const firstShiftDate = addLocalCalendarDays(from, -1);
      const memberShifts = await Promise.all(members.map(async (member) => {
        const shifts = [];
        for (let start = firstShiftDate; start <= to; start = addLocalCalendarDays(start, 62)) {
          const end = addLocalCalendarDays(start, Math.min(61, countLocalCalendarDays(start, to) - 1));
          shifts.push(...await getTogetherMemberShiftSchedule(requestedSpace, member.userId, start, end));
        }
        return { userId: member.userId, displayName: member.displayName?.trim() || '멤버', days: shifts };
      }));
      const events = await listSharedEvents(requestedSpace);
      const stillActive = (await getTogetherMembers(requestedSpace)).filter((member) => member.status === 'active');
      if (stillActive.length !== members.length || stillActive.some((member) => !members.some((original) => original.userId === member.userId))) {
        throw new Error('Together membership changed during travel search');
      }
      return createTravelLeaveRecommendations(requestedSpace, days, memberShifts, budgets, events, personalSoftEvents, requestedNights);
    })().then((result) => {
      if (active && searchGeneration.current === request && ownerRef.current === owner) setSearch({ kind: 'ready', result });
    }).catch(() => {
      if (active && searchGeneration.current === request && ownerRef.current === owner) setSearch({ kind: 'error' });
    });
    return () => { active = false; if (searchGeneration.current === request) searchGeneration.current += 1; };
  }, [searchRequest]);

  const startSearch = () => {
    const owner = session?.user.id;
    if (!owner || !selected || !schedule.isHydrated) return;
    pendingResultScrollRef.current = null;
    setSettingsOpen(false);
    setSearch({ kind: 'loading' });
    setSearchRequest({ id: ++requestCounter.current, owner, spaceId: selected.space.id, nights, horizon,
      budgets: { ...leaveBudgets }, personalSoftEvents: selectCurrentUserTravelSoftEvents(schedule.personalEvents, schedule.dateMemos) });
  };
  const changeLeaveBudget = (memberId: string, value: number) => {
    if (parseSimulatedLeaveDays(value) === null) return;
    setLeaveBudgets((current) => ({ ...current, [memberId]: value }));
    pendingResultScrollRef.current = null;
    setSearchRequest(undefined);
    setSearch({ kind: 'idle' });
  };
  const changeGroup = (nextSpaceId: string) => {
    pendingResultScrollRef.current = null;
    setSpaceId(nextSpaceId);
    setLeaveBudgets({});
    setCustomMemberId(undefined);
    setSearchRequest(undefined);
    setSearch({ kind: 'idle' });
  };
  const changeNights = (value: TravelNights) => {
    pendingResultScrollRef.current = null;
    setNights(value);
    setSearchRequest(undefined);
    setSearch({ kind: 'idle' });
  };
  const changeHorizon = (value: 30 | 60 | 90) => {
    pendingResultScrollRef.current = null;
    setHorizon(value);
    setSearchRequest(undefined);
    setSearch({ kind: 'idle' });
  };
  const openDestinations = (item: TravelRecommendation) => {
    const owner = session?.user.id;
    if (navigationRef.current || !owner || !selected || item.spaceId !== selected.space.id || ownerRef.current !== owner) return;
    navigationRef.current = true;
    router.push({ pathname: '/together-travel-destinations', params: {
      candidate: JSON.stringify(item), owner, airport, accessMinutes: String(accessMinutes), style: travelStyle,
    } });
  };

  return <Screen style={styles.screen}>
    <View style={styles.header}>
      <Pressable accessibilityLabel="뒤로" accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
      </Pressable>
      <AppText variant="button" style={styles.title}>여행 가능일 찾기</AppText>
      <View style={styles.back} />
    </View>
    <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom + 72 }]}
      onContentSizeChange={() => {
        const requestId = pendingResultScrollRef.current;
        if (requestId !== null && (visibleSearch.kind === 'ready' || visibleSearch.kind === 'error')) {
          requestAnimationFrame(() => scrollToResults(requestId));
        }
      }} showsVerticalScrollIndicator={false}>
      <AppText tone="secondary">함께 쉴 수 있는 여행 기간을 찾아보세요</AppText>
      {groupState.kind === 'loading' ? <Card><AppText>함께 그룹을 확인하는 중...</AppText></Card> : null}
      {groupState.kind === 'error' ? <Card style={styles.card}><AppText>그룹을 확인할 수 없어요.</AppText><PrimaryButton label="다시 시도" onPress={() => setRetry((value) => value + 1)} /></Card> : null}
      {groupState.kind === 'ready' && options.length === 0 ? <Card style={styles.card}>
        <AppText>여행 가능일을 찾으려면 함께 그룹이 필요해요.</AppText>
        <PrimaryButton label="그룹 만들기·참여하기" onPress={() => router.push('/together-add')} />
      </Card> : null}
      {options.length > 0 ? <Card style={styles.card}>
        <AppText variant="button">함께할 그룹</AppText>
        {options.length > 1 ? <AppText variant="caption" tone="secondary">추천을 계산할 그룹을 선택해 주세요.</AppText> : null}
        <View style={styles.groupChoices}>{options.map(({ space, members }) => (
          <Pressable key={space.id} accessibilityRole="button" accessibilityState={{ selected: spaceId === space.id }}
            onPress={() => changeGroup(space.id)} style={[styles.groupChip, { borderColor: theme.border }, spaceId === space.id && styles.selectedRow]}>
            <AppText variant="caption" numberOfLines={1} style={styles.groupName}>{space.name}</AppText>
            <AppText variant="caption" tone="secondary">{members.filter((member) => member.status === 'active').length}명</AppText>
          </Pressable>
        ))}</View>
      </Card> : null}
      {selected ? <>
        <Card style={styles.card}>
          <View style={styles.choiceGroup}>
            <AppText variant="caption" style={styles.choiceLabel}>여행 기간</AppText>
            <View style={styles.stayOptions}>{STAYS.map((value) => (
              <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: nights === value }}
                onPress={() => { setDirectNightsOpen(false); changeNights(value); }}
                style={[styles.stayOption, { borderColor: theme.border }, nights === value && styles.optionSelected]}>
                <AppText variant="caption" numberOfLines={1} style={nights === value ? styles.optionTextSelected : undefined}>{value}박{value + 1}일</AppText>
              </Pressable>
            ))}</View>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: directNightsOpen }}
              onPress={() => setDirectNightsOpen((value) => !value)} style={styles.directStayButton}>
              <AppText variant="caption">직접 설정 · {nights}박{nights + 1}일</AppText>
              <MaterialCommunityIcons name={directNightsOpen ? 'chevron-up' : 'chevron-down'} color={theme.textSecondary} size={20} />
            </Pressable>
            {directNightsOpen ? <View style={styles.leaveStepper}>
              <Pressable accessibilityRole="button" accessibilityLabel="여행 기간 하루 줄이기" disabled={nights === 1}
                onPress={() => changeNights((nights - 1) as TravelNights)} style={styles.stepperButton}>
                <MaterialCommunityIcons name="minus" size={20} color={nights === 1 ? theme.textSecondary : theme.text} />
              </Pressable>
              <AppText variant="button">{nights}박{nights + 1}일</AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="여행 기간 하루 늘리기" disabled={nights === MAX_TRAVEL_NIGHTS}
                onPress={() => changeNights((nights + 1) as TravelNights)} style={styles.stepperButton}>
                <MaterialCommunityIcons name="plus" size={20} color={nights === MAX_TRAVEL_NIGHTS ? theme.textSecondary : theme.text} />
              </Pressable>
            </View> : null}
          </View>
          <ChoiceRow label="검색 범위" selected={horizon} onSelect={changeHorizon}
            values={HORIZONS.map((value) => ({ value, label: `${value}일` }))} />
        </Card>
        <Card style={styles.settingsCard}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: settingsOpen }} onPress={() => setSettingsOpen((value) => !value)}
            style={styles.settingsHeader}>
            <View style={styles.settingsCopy}>
              <AppText variant="button">여행 설정</AppText>
              <AppText variant="caption" tone="secondary">{TRAVEL_AIRPORTS.find((item) => item.id === airport)?.label} · {accessMinutes}분 · {TRAVEL_STYLES.find((item) => item.id === travelStyle)?.label} · {selectedLeaveTotal ? `연가 ${selectedLeaveTotal}일` : '연가 안 씀'}</AppText>
            </View>
            <MaterialCommunityIcons name={settingsOpen ? 'chevron-up' : 'chevron-right'} color={theme.textSecondary} size={22} />
          </Pressable>
          {settingsOpen ? <View style={styles.settingsBody}>
            <ChoiceRow label="출발 공항" selected={airport} onSelect={setAirport}
              values={TRAVEL_AIRPORTS.map((item) => ({ value: item.id, label: item.label }))} />
            <ChoiceRow label="공항 접근 시간" selected={accessMinutes} onSelect={setAccessMinutes}
              values={TRAVEL_ACCESS_MINUTES.map((value) => ({ value, label: `${value}분` }))} />
            <ChoiceRow label="여행 스타일" selected={travelStyle} onSelect={setTravelStyle}
              values={TRAVEL_STYLES.map((item) => ({ value: item.id, label: item.label }))} />
            <View style={styles.leaveSection}>
              <AppText variant="button">연가 활용</AppText>
              {activeSelectedMembers.map((member) => {
                const budget = leaveBudgets[member.userId] ?? 0;
                const custom = customMemberId === member.userId || budget > 3;
                return <View key={member.userId} style={styles.leaveMember}>
                  <AppText variant="caption" style={styles.choiceLabel}>{member.displayName?.trim() || '멤버'}</AppText>
                  <View style={styles.optionRow}>
                    {[0, 1, 2, 3].map((days) => <Pressable key={days} accessibilityRole="button"
                      accessibilityLabel={`${member.displayName?.trim() || '멤버'} 연가 ${days === 0 ? '안 씀' : `${days}일`}`}
                      accessibilityState={{ selected: !custom && budget === days }}
                      onPress={() => { setCustomMemberId(undefined); changeLeaveBudget(member.userId, days); }}
                      style={[styles.option, { borderColor: theme.border }, !custom && budget === days && styles.optionSelected]}>
                      <AppText variant="caption" numberOfLines={1} style={!custom && budget === days ? styles.optionTextSelected : undefined}>{days === 0 ? '안 씀' : `${days}일`}</AppText>
                    </Pressable>)}
                    <Pressable accessibilityRole="button" accessibilityLabel={`${member.displayName?.trim() || '멤버'} 연가 직접 설정`}
                      accessibilityState={{ selected: custom }} onPress={() => setCustomMemberId(member.userId)}
                      style={[styles.option, { borderColor: theme.border }, custom && styles.optionSelected]}>
                      <AppText variant="caption" numberOfLines={1} style={custom ? styles.optionTextSelected : undefined}>직접</AppText>
                    </Pressable>
                  </View>
                  {customMemberId === member.userId ? <View style={styles.leaveStepper}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${member.displayName?.trim() || '멤버'} 연가 하루 줄이기`}
                      disabled={budget === 0} onPress={() => changeLeaveBudget(member.userId, budget - 1)} style={styles.stepperButton}>
                      <MaterialCommunityIcons name="minus" size={20} color={budget === 0 ? theme.textSecondary : theme.text} />
                    </Pressable>
                    <AppText variant="button">{budget}일</AppText>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${member.displayName?.trim() || '멤버'} 연가 하루 늘리기`}
                      disabled={budget === MAX_SIMULATED_LEAVE_DAYS} onPress={() => changeLeaveBudget(member.userId, budget + 1)} style={styles.stepperButton}>
                      <MaterialCommunityIcons name="plus" size={20} color={budget === MAX_SIMULATED_LEAVE_DAYS ? theme.textSecondary : theme.text} />
                    </Pressable>
                  </View> : null}
                </View>;
              })}
              <AppText variant="caption" tone="secondary">근무 1회를 연가 1일로 가정해 계산해요. 실제 기관 규정과 다를 수 있어요.</AppText>
            </View>
          </View> : null}
        </Card>
        <PrimaryButton label={visibleSearch.kind === 'loading' ? '검색 중...' : '여행 가능일 검색하기'}
          disabled={visibleSearch.kind === 'loading' || !schedule.isHydrated} onPress={startSearch}
          style={[styles.searchButton, { backgroundColor: brandColors.coral }]} />
        <View style={styles.resultsHeading} onLayout={(event) => {
          resultsTopRef.current = event.nativeEvent.layout.y;
          const requestId = pendingResultScrollRef.current;
          if (requestId !== null && (visibleSearch.kind === 'ready' || visibleSearch.kind === 'error')) {
            requestAnimationFrame(() => scrollToResults(requestId));
          }
        }}>
          <AppText variant="button">추천 여행 기간</AppText>
          <AppText variant="caption" tone="secondary">근무는 차단하고, 개인·공동 일정은 참고 정보로 표시해요</AppText>
        </View>
        {visibleSearch.kind === 'loading' ? <Card><AppText tone="secondary">모두의 근무와 일정을 확인하고 있어요.</AppText></Card> : null}
        {visibleSearch.kind === 'error' ? <Card style={styles.card}>
          <AppText>여행 가능일을 확인하지 못했어요.</AppText>
          <PrimaryButton label="다시 시도" onPress={startSearch} />
        </Card> : null}
        {visibleSearch.kind === 'ready' && visibleSearch.result.status !== 'ready' ? <Card><AppText>{visibleSearch.result.status === 'sharing_disabled'
          ? '여행 추천을 보려면 그룹 멤버 모두 가용시간과 근무 상세 공유를 켜야 해요.'
          : getTogetherAvailabilityStatusMessage({
          localDate: '', availabilityStatus: visibleSearch.result.status, intervals: [], timezoneName: null,
        })}</AppText></Card> : null}
        {visibleSearch.kind === 'ready' && visibleSearch.result.status === 'ready' && visibleSearch.result.recommendations.length === 0
          ? <Card style={styles.card}><AppText>조건에 맞는 여행 기간을 찾지 못했어요.</AppText><AppText variant="caption" tone="secondary">검색 범위를 늘려보세요.</AppText></Card> : null}
        {visibleSearch.kind === 'ready' && displayedRecommendations.map((item, index) => (
          <Pressable key={`${item.startsAt}:${item.endsAt}`} accessibilityRole="button" accessibilityLabel={`${index < 3 ? `${index + 1}위` : '연가 활용'} 여행 기간, ${formatDate(item.startDate)}부터 ${formatDate(item.endDate)}까지`}
            onPress={() => openDestinations(item)} style={({ pressed }) => [
              styles.resultCard, { backgroundColor: theme.surface, borderColor: index === 0 ? brandColors.coral : theme.border },
              pressed && styles.pressed,
            ]}>
            <View style={styles.resultTop}>
              <AppText variant="caption" style={index === 0 ? styles.bestLabel : styles.rankLabel}>{index === 0 ? 'BEST' : index === 3 ? '연가 활용 추천' : `${index + 1}위`}</AppText>
              <MaterialCommunityIcons name="chevron-right" color={theme.textSecondary} size={21} />
            </View>
            <AppText variant="button" style={styles.resultDate}>{formatDate(item.startDate)} ~ {formatDate(item.endDate)}</AppText>
            <AppText variant="caption" tone="secondary">{item.nights}박{item.nights + 1}일 · 함께 자유 {formatTravelMinutes(item.durationMinutes)}</AppText>
            <AppText variant="caption" style={styles.leaveBadge}>{item.totalLeaveDays ? `연가 ${item.totalLeaveDays}일 필요` : '연가 없이 가능'}</AppText>
            {item.leaveUsageByMember?.map((usage) => <AppText key={`${usage.userId}:${usage.shiftDate}`} variant="caption" tone="secondary">
              {usage.displayName} · {formatDate(usage.shiftDate)} {usage.shiftLabel}
            </AppText>)}
            {(item.currentUserPersonalSoftConflictCount || item.sharedSoftConflictCount) ? <AppText variant="caption" tone="secondary">
              확인할 일정 · 내 개인 일정 {item.currentUserPersonalSoftConflictCount ?? 0}개 · 공동 일정 {item.sharedSoftConflictCount ?? 0}개
            </AppText> : null}
            {index === 0 ? <AppText variant="caption" tone="secondary">출발 {localTime(item.startsAt, item.timezoneName)} · 귀가 {localTime(item.endsAt, item.timezoneName)} · 귀가 후 여유 {formatTravelMinutes(item.returnBufferMinutes)}</AppText> : null}
          </Pressable>
        ))}
      </> : null}
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingTop: spacing.xs },
  scroll: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 },
  back: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  title: { fontSize: 18 },
  content: { gap: spacing.md, paddingTop: spacing.sm },
  card: { gap: spacing.sm },
  groupChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  groupChip: { alignItems: 'center', borderRadius: radius.xxl, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, maxWidth: '100%', minHeight: 44, paddingHorizontal: spacing.sm },
  groupName: { flexShrink: 1 },
  selectedRow: { backgroundColor: '#FFF1EA', borderColor: brandColors.coral },
  choiceGroup: { gap: spacing.xs },
  choiceLabel: { fontWeight: '700' },
  optionRow: { flexDirection: 'row', gap: spacing.xs },
  stayOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  stayOption: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, justifyContent: 'center',
    minHeight: 44, paddingHorizontal: spacing.xs, width: '30%' },
  directStayButton: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  option: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flex: 1, minHeight: 44, paddingHorizontal: spacing.xs, justifyContent: 'center' },
  optionSelected: { backgroundColor: '#FFF1EA', borderColor: brandColors.coral },
  optionTextSelected: { color: '#A84D37', fontWeight: '700' },
  searchButton: { marginTop: spacing.xs },
  settingsCard: { paddingVertical: spacing.sm },
  settingsHeader: { alignItems: 'center', flexDirection: 'row', minHeight: 52 },
  settingsCopy: { flex: 1, gap: 2 },
  settingsBody: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E1D9', gap: spacing.md, paddingTop: spacing.md },
  leaveSection: { gap: spacing.sm },
  leaveMember: { gap: spacing.xs },
  leaveStepper: { alignItems: 'center', flexDirection: 'row', gap: spacing.lg, justifyContent: 'center' },
  stepperButton: { alignItems: 'center', borderRadius: radius.md, justifyContent: 'center', minHeight: 44, minWidth: 44 },
  resultsHeading: { gap: spacing.xxs },
  resultCard: { borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs, padding: spacing.md },
  resultTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  bestLabel: { alignSelf: 'flex-start', backgroundColor: '#FFF1EA', borderRadius: radius.sm, color: '#A84D37', fontWeight: '700', overflow: 'hidden', paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs },
  rankLabel: { color: brandColors.deepNavy, fontWeight: '700' },
  leaveBadge: { alignSelf: 'flex-start', backgroundColor: '#FFF1EA', borderRadius: radius.sm, color: '#A84D37', fontWeight: '700', overflow: 'hidden', paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs },
  resultDate: { fontSize: 16, lineHeight: 23 },
  pressed: { opacity: 0.75 },
});
