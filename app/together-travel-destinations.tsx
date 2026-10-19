import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, PrimaryButton, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { useAuth } from '../src/features/auth/AuthContext';
import { selectActiveSharedEventSpaces } from '../src/features/together/sharedEventSpaceSelection';
import { getTravelDestinationImageSource } from '../src/features/together/travelDestinationImages';
import { getTogetherMembers, getTogetherSpaces } from '../src/features/together/togetherServerData';
import { createTravelEventPrefill, formatTravelMinutes, isTravelPreferences, parseTravelCandidate, rankTravelDestinations, TRAVEL_STYLES, type TravelDestination, type TravelStyle } from '../src/features/together/travelDestinationRecommendation';
import type { TravelRecommendation } from '../src/features/together/travelRecommendation';

type RouteParams = {
  candidate?: string | string[];
  owner?: string | string[];
  airport?: string | string[];
  accessMinutes?: string | string[];
  style?: string | string[];
};
type AccessState = { kind: 'loading' | 'error' } | { kind: 'ready'; spaceName: string };
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function parseCandidateParam(raw: RouteParams['candidate']): TravelRecommendation | null {
  if (typeof raw !== 'string') return null;
  try { return parseTravelCandidate(JSON.parse(raw)); } catch { return null; }
}

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return `${month}월 ${day}일 (${WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]})`;
}

function shortDate(localDate: string): string {
  const [, month, day] = localDate.split('-').map(Number);
  return `${month}/${day}`;
}

function localTime(iso: string, timezoneName: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezoneName,
  }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.hour + ':' + values.minute;
}

function InfoCell({ icon, label, value }: { icon: 'airplane' | 'home-outline' | 'weather-night'; label: string; value: string }) {
  const theme = useAppTheme();
  return <View style={[styles.infoCell, { backgroundColor: theme.background }]}>
    <MaterialCommunityIcons name={icon} color={brandColors.coral} size={17} />
    <AppText variant="caption" style={styles.infoValue}>{value}</AppText>
    <AppText variant="caption" tone="secondary" style={styles.infoLabel}>{label}</AppText>
  </View>;
}

function DestinationImage({ destinationId, hero }: { destinationId: string; hero: boolean }) {
  const theme = useAppTheme();
  const [failed, setFailed] = useState(false);
  const imageSource = getTravelDestinationImageSource(destinationId);
  return <View style={[hero ? styles.heroImageFrame : styles.thumbnailFrame, { backgroundColor: theme.background }]}>
    {imageSource && !failed
      ? <Image source={imageSource} resizeMode="cover" style={styles.destinationImage} onError={() => setFailed(true)} />
      : <MaterialCommunityIcons name="map-marker-outline" color={theme.textSecondary} size={hero ? 32 : 22} />}
  </View>;
}

export default function TogetherTravelDestinationsScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { session } = useAuth();
  const params = useLocalSearchParams<RouteParams>();
  const candidate = useMemo(() => parseCandidateParam(params.candidate), [params.candidate]);
  const initialPreferences = useMemo(() => {
    const proposed = {
      airport: params.airport,
      accessMinutes: Number(params.accessMinutes),
      style: params.style,
    };
    return isTravelPreferences(proposed) ? proposed : { airport: 'ICN' as const, accessMinutes: 60 as const, style: 'balanced' as const };
  }, [params.accessMinutes, params.airport, params.style]);
  const [style, setStyle] = useState<TravelStyle>(initialPreferences.style);
  const [styleOpen, setStyleOpen] = useState(false);
  const [access, setAccess] = useState<AccessState>({ kind: 'loading' });
  const navigationRef = useRef(false);
  const ownerRef = useRef(session?.user.id);
  ownerRef.current = session?.user.id;
  const routeOwner = typeof params.owner === 'string' ? params.owner : undefined;
  const recommendations = useMemo(() => candidate
    ? rankTravelDestinations(candidate, { ...initialPreferences, style })
    : [], [candidate, initialPreferences, style]);

  useFocusEffect(useCallback(() => {
    navigationRef.current = false;
    const owner = session?.user.id;
    if (!owner || !candidate || routeOwner !== owner) { setAccess({ kind: 'error' }); return undefined; }
    let active = true;
    setAccess({ kind: 'loading' });
    void getTogetherSpaces()
      .then(async (spaces) => {
        const space = spaces.find((item) => item.id === candidate.spaceId);
        if (!space) return [];
        const members = await getTogetherMembers(space.id);
        return selectActiveSharedEventSpaces([{ space, members }], owner);
      })
      .then((options) => {
        if (!active || ownerRef.current !== owner) return;
        setAccess(options.length === 1 ? { kind: 'ready', spaceName: options[0].space.name } : { kind: 'error' });
      })
      .catch(() => { if (active && ownerRef.current === owner) setAccess({ kind: 'error' }); });
    return () => { active = false; };
  }, [candidate, routeOwner, session?.user.id]));

  const save = (destination: TravelDestination) => {
    if (navigationRef.current || access.kind !== 'ready' || !candidate || ownerRef.current !== routeOwner) return;
    navigationRef.current = true;
    router.push({ pathname: '/together-event-create', params: createTravelEventPrefill(candidate, destination) });
  };

  return <Screen style={styles.screen}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.back}>
        <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
      </Pressable>
      <AppText variant="button" style={styles.headerTitle}>추천 여행지</AppText>
      <View style={styles.back} />
    </View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {access.kind === 'loading' ? <Card><AppText tone="secondary">함께 그룹을 확인하고 있어요.</AppText></Card> : null}
      {access.kind === 'error' ? <Card style={styles.card}>
        <AppText>여행 기간을 확인할 수 없어요.</AppText>
        <PrimaryButton label="다른 기간 선택하기" onPress={() => router.back()} />
      </Card> : null}
      {access.kind === 'ready' && candidate ? <>
        <Card style={styles.summaryCard}>
          <AppText variant="caption" tone="secondary">{access.spaceName} · 여행 기간</AppText>
          <AppText variant="heading" style={styles.dateTitle}>{formatDate(candidate.startDate)} ~ {formatDate(candidate.endDate)}</AppText>
          <AppText variant="caption" tone="secondary">{candidate.nights}박{candidate.nights + 1}일 · 함께 자유 {formatTravelMinutes(candidate.durationMinutes)}</AppText>
          <View style={styles.summaryInfoRow}>
            <InfoCell icon="airplane" label="출발 가능" value={`${shortDate(candidate.startDate)} ${localTime(candidate.startsAt, candidate.timezoneName)}`} />
            <InfoCell icon="home-outline" label="귀가 권장" value={`${shortDate(candidate.endDate)} ${localTime(candidate.endsAt, candidate.timezoneName)}`} />
            <InfoCell icon="weather-night" label="귀가 후 여유" value={formatTravelMinutes(candidate.returnBufferMinutes)} />
          </View>
        </Card>
        <View style={styles.noteCard}>
          <MaterialCommunityIcons name="information-outline" color={brandColors.coral} size={20} />
          <View style={styles.noteCopy}>
            <AppText variant="caption" style={styles.noteTitle}>이 시간에 다녀오기 좋은 여행지를 추천했어요</AppText>
            <AppText variant="caption" tone="secondary">비행시간과 체류시간은 계획용 예상값이에요. 실제 항공편은 확인해 주세요.</AppText>
          </View>
        </View>
        <View style={styles.sectionHeader}>
          <AppText variant="button">추천 여행지 TOP 3</AppText>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: styleOpen }} onPress={() => setStyleOpen((value) => !value)}
            style={[styles.styleControl, { borderColor: theme.border }]}>
            <AppText variant="caption">여행 스타일 · {TRAVEL_STYLES.find((item) => item.id === style)?.label}</AppText>
            <MaterialCommunityIcons name={styleOpen ? 'chevron-up' : 'chevron-down'} color={theme.textSecondary} size={18} />
          </Pressable>
        </View>
        {styleOpen ? <View style={styles.styleChoices}>{TRAVEL_STYLES.map((item) => (
          <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: style === item.id }}
            onPress={() => { setStyle(item.id); setStyleOpen(false); }}
            style={[styles.styleChoice, { borderColor: style === item.id ? brandColors.coral : theme.border }, style === item.id && styles.styleChoiceSelected]}>
            <AppText variant="caption" style={style === item.id ? styles.selectedText : undefined}>{item.label}</AppText>
          </Pressable>
        ))}</View> : null}
        {recommendations.length === 0 ? <Card style={styles.card}>
          <AppText>이 시간에는 여유 있게 다녀올 여행지를 찾지 못했어요.</AppText>
          <AppText variant="caption" tone="secondary">여행 스타일을 바꾸거나 다른 기간을 선택해보세요.</AppText>
        </Card> : null}
        {recommendations.map((destination, index) => (
          <Card key={destination.id} style={[styles.destinationCard, { borderColor: index === 0 ? brandColors.coral : theme.border }]}>
            {index === 0 ? <DestinationImage destinationId={destination.id} hero /> : null}
            <View style={styles.destinationHeader}>
              {index === 0 ? null : <DestinationImage destinationId={destination.id} hero={false} />}
              <View style={styles.cityCopy}>
                <AppText variant="caption" tone="secondary">{index + 1}위 · {destination.country}</AppText>
                <AppText variant="heading" style={styles.cityName}>{destination.city}</AppText>
              </View>
              <View style={styles.gradeBadge}><AppText variant="caption" style={styles.gradeText}>{destination.grade}</AppText></View>
            </View>
            {index === 0 ? <>
              <View style={styles.metricsRow}>
                <InfoCell icon="airplane" label="편도" value={`약 ${formatTravelMinutes(destination.flightMinutes)}`} />
                <InfoCell icon="home-outline" label="현지 체류 예상" value={`약 ${formatTravelMinutes(destination.stayMinutes)}`} />
                <InfoCell icon="weather-night" label="귀가 후 여유" value={formatTravelMinutes(destination.returnBufferMinutes)} />
              </View>
              <AppText variant="caption" tone="secondary">{destination.reason}</AppText>
              <PrimaryButton label={`${destination.city} 여행으로 저장`} onPress={() => save(destination)} style={{ backgroundColor: brandColors.coral }} />
            </> : <>
              <AppText variant="caption" tone="secondary">
                편도 {formatTravelMinutes(destination.flightMinutes)} · 현지 체류 약 {formatTravelMinutes(destination.stayMinutes)}
              </AppText>
              <AppText variant="caption" tone="secondary">귀가 후 여유 {formatTravelMinutes(destination.returnBufferMinutes)}</AppText>
              <Pressable accessibilityRole="button" onPress={() => save(destination)} style={styles.compactSave}>
                <AppText variant="caption" style={styles.compactSaveText}>{destination.city} 여행으로 저장</AppText>
                <MaterialCommunityIcons name="chevron-right" color={brandColors.coral} size={19} />
              </Pressable>
            </>}
          </Card>
        ))}
      </> : null}
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingTop: spacing.xs },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 },
  back: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  headerTitle: { fontSize: 18 },
  content: { gap: spacing.md, paddingBottom: spacing.xxl, paddingTop: spacing.sm },
  card: { gap: spacing.sm },
  summaryCard: { gap: spacing.sm },
  dateTitle: { fontSize: 20, lineHeight: 28 },
  summaryInfoRow: { flexDirection: 'row', gap: spacing.xs, paddingTop: spacing.xs },
  infoCell: { alignItems: 'flex-start', borderRadius: radius.md, flex: 1, gap: spacing.xxs, minWidth: 0, padding: spacing.xs },
  infoValue: { fontSize: 12, fontWeight: '700', lineHeight: 17 },
  infoLabel: { fontSize: 11, lineHeight: 15 },
  noteCard: { backgroundColor: '#FFF1EA', borderColor: '#F5D8CC', borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  noteCopy: { flex: 1, gap: spacing.xxs },
  noteTitle: { fontWeight: '700' },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'space-between' },
  styleControl: { alignItems: 'center', borderRadius: radius.xxl, borderWidth: 1, flexDirection: 'row', gap: spacing.xxs, minHeight: 44, paddingHorizontal: spacing.sm },
  styleChoices: { flexDirection: 'row', gap: spacing.xs },
  styleChoice: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.xs },
  styleChoiceSelected: { backgroundColor: '#FFF1EA' },
  selectedText: { color: '#A84D37', fontWeight: '700' },
  destinationCard: { gap: spacing.sm },
  destinationHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  heroImageFrame: { alignItems: 'center', aspectRatio: 16 / 9, borderRadius: radius.md, justifyContent: 'center', overflow: 'hidden', width: '100%' },
  thumbnailFrame: { alignItems: 'center', aspectRatio: 1, borderRadius: radius.md, justifyContent: 'center', overflow: 'hidden', width: 64 },
  destinationImage: { height: '100%', width: '100%' },
  cityCopy: { flex: 1, minWidth: 0 },
  cityName: { fontSize: 20, lineHeight: 26 },
  gradeBadge: { backgroundColor: '#FFF1EA', borderRadius: radius.xxl, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs },
  gradeText: { color: '#A84D37', fontSize: 11, fontWeight: '700' },
  metricsRow: { flexDirection: 'row', gap: spacing.xs },
  compactSave: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end', minHeight: 44 },
  compactSaveText: { color: brandColors.coral, fontWeight: '700' },
});
