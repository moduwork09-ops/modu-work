import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme, type AppTheme } from '../src/constants';
import { calculateLifeBriefing, getBestRecoveryGap, moveBriefingMonth, type DayRun, type MonthSummary, type WeeklyBriefing } from '../src/features/life-briefing/lifeBriefing';
import {
  getBriefingHero,
  getBriefingRecommendationCopy,
  getBriefingTypeSlices,
  shortBriefingDate,
} from '../src/features/life-briefing/lifeBriefingPresentation';
import { useShiftSchedule } from '../src/features/shifts/ShiftScheduleContext';

const pastel = {
  ivory: '#F8F6F1', blue: '#E8F1F8', sage: '#E9F2E8',
  lavender: '#EEEAF6', peach: '#FFF0E5', coral: '#FCE9E3',
  unknown: '#D9DFE3', purple: '#8A79A9',
} as const;
const darkPastel = {
  blue: '#30475B', sage: '#334B41', lavender: '#403B57',
  peach: '#51413C', coral: '#503B39',
} as const;
const chartColors = { work: '#A9C8E5', rest: '#A9D5BF', night: '#C7B8E1', duty: '#F4BBAA', unknown: '#E6E3DE' };
const typeColor = (name: string, index: number) => /당직|24시간/.test(name) ? chartColors.duty
  : /야간|심야/.test(name) ? chartColors.night : [chartColors.work, chartColors.rest, chartColors.duty, chartColors.night][index];
const softShadow = '0 5px 18px rgba(36, 52, 71, 0.07)';
const monthNow = () => {
  const date = new Date();
  return String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0');
};
const localToday = () => {
  const date = new Date();
  return String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
};
const runRange = (run: DayRun) => run ? shortBriefingDate(run.start) + '–' + shortBriefingDate(run.end) : '없음';
type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export default function LifeBriefingScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const schedule = useShiftSchedule();
  const [month, setMonth] = useState(monthNow);
  const today = localToday();
  const { month: summary, previous, next, week } = useMemo(
    () => calculateLifeBriefing(month, today, schedule),
    [month, today, schedule],
  );
  const hero = getBriefingHero(summary, previous);
  const recommendations = getBriefingRecommendationCopy(week, schedule);
  const slices = getBriefingTypeSlices(summary);
  const recoveryGap = useMemo(() => getBestRecoveryGap(month, schedule), [month, schedule]);
  const showDelta = summary.unknownDays === 0 && previous.unknownDays === 0;
  const light = theme.background === brandColors.warmIvory;
  const tint = light ? pastel : darkPastel;
  const tileWidth = Math.max(0, (windowWidth - spacing.lg * 2 - spacing.sm) / 2);

  return <Screen style={styles.screen}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" hitSlop={10} style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={theme.primary} />
        </Pressable>
        <AppText style={[styles.pageTitle, { color: theme.primary }]} numberOfLines={1}>생활 브리핑</AppText>
        <View style={[styles.monthPicker, { backgroundColor: theme.surface }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="이전 달" style={styles.monthArrow} onPress={() => setMonth(value => moveBriefingMonth(value, -1))}>
            <MaterialCommunityIcons name="chevron-left" size={21} color={theme.primary} />
          </Pressable>
          <AppText style={[styles.monthLabel, { color: theme.primary }]}>{month.slice(0, 4)}.{Number(month.slice(5))}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="다음 달" style={styles.monthArrow} onPress={() => setMonth(value => moveBriefingMonth(value, 1))}>
            <MaterialCommunityIcons name="chevron-right" size={21} color={theme.primary} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.hero, { backgroundColor: light ? pastel.blue : theme.surface, boxShadow: softShadow }]}>
        <HeroArtwork light={light} />
        <View style={styles.heroCopy}>
          <View style={styles.heroBadge}><View style={[styles.heroBadgeDot, { backgroundColor: theme.accent }]} /><AppText style={styles.heroBadgeText}>{Number(month.slice(5))}월 생활 브리핑</AppText></View>
          <AppText style={[styles.heroTitle, { color: theme.primary }]} numberOfLines={2}>{hero.title}</AppText>
          <AppText style={[styles.heroDetail, { color: theme.textSecondary }]} numberOfLines={2}>{hero.detail}</AppText>
        </View>
      </View>

      <View style={styles.kpiGrid}>
        <KpiTile width={tileWidth} icon="briefcase-outline" label="근무일" value={summary.workDays} unit="일" delta={showDelta ? summary.workDays - previous.workDays : null} tint={tint.blue} theme={theme} />
        <KpiTile width={tileWidth} icon="weather-sunny" label="휴무일" value={summary.restDays} unit="일" delta={showDelta ? summary.restDays - previous.restDays : null} tint={tint.sage} theme={theme} />
        <KpiTile width={tileWidth} icon="weather-night" label="야간·당직" value={summary.nightShifts} unit="회" delta={showDelta ? summary.nightShifts - previous.nightShifts : null} tint={tint.lavender} theme={theme} />
        <KpiTile width={tileWidth} icon="calendar-range" label="최장 연속휴무" value={summary.longestRest?.days ?? 0} unit="일" delta={showDelta ? (summary.longestRest?.days ?? 0) - (previous.longestRest?.days ?? 0) : null} tint={tint.peach} theme={theme} />
      </View>
      {summary.unknownDays > 0 ? <AppText variant="caption" tone="secondary" style={styles.unknownNote}>미확인 {summary.unknownDays}일은 휴무로 추정하지 않았어요.</AppText> : null}

      <View style={styles.section}>
        <SectionHeading title="주간 밸런스" subtitle="이번 달의 근무와 쉼" theme={theme} />
        <View style={[styles.chartCard, { backgroundColor: theme.surface, boxShadow: softShadow }]}>
          <WeeklyColumns weekly={summary.weekly} theme={theme} />
          <View style={styles.legend}>
            <Legend color={chartColors.work} label="근무" />
            <Legend color={chartColors.night} label="야간" />
            <Legend color={chartColors.duty} label="당직·24시간" />
            <Legend color={chartColors.rest} label="휴무" />
            <Legend color={chartColors.unknown} label="미확인" />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeading title="생활 포인트" theme={theme} />
        <View style={[styles.recommendation, { backgroundColor: tint.sage }]}>
          <AppText style={[styles.recommendationTitle, { color: theme.primary }]}>회복 여유가 좋은 날</AppText>
          <AppText style={[styles.recommendationDate, { color: theme.primary }]}>{recoveryGap ? shortBriefingDate(recoveryGap.date) : '—'}</AppText>
          <AppText variant="caption" tone="secondary">{recoveryGap ? `이전 근무 종료부터 다음 근무까지 ${recoveryGap.hours}시간` : '확인 가능한 근무 간격이 없어요.'}</AppText>
        </View>
        <View style={styles.highlightGrid}>
          <HighlightTile icon="briefcase-outline" title="가장 바쁜 구간" run={summary.longestWork} tint={tint.blue} theme={theme} />
          <HighlightTile icon="weather-sunny" title="가장 여유로운 구간" run={summary.longestRest} tint={tint.sage} theme={theme} />
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeading title="이번 주 생활 브리핑" subtitle={shortBriefingDate(week.start) + '–' + shortBriefingDate(week.end)} theme={theme} />
        <WeeklyTimeline week={week} today={today} theme={theme} />
        <RecommendationCard date={recommendations.rest?.date ?? null} reason={recommendations.rest?.reason ?? '추천 가능한 날이 없어요.'} tint={tint.sage} theme={theme} />
      </View>

      <View style={styles.section}>
        <SectionHeading title="근무 유형 비율" theme={theme} />
        <View style={[styles.donutCard, { backgroundColor: theme.surface, boxShadow: softShadow }]}>
          <DonutChart slices={slices} total={summary.workDays} theme={theme} />
          <View style={styles.typeLegend}>
            {slices.length ? slices.map((item, index) => <View key={item.id} style={styles.typeLine}>
              <View style={[styles.typeDot, { backgroundColor: typeColor(item.name, index) }]} />
              <View style={styles.typeCopy}>
                <AppText variant="caption" style={styles.typeName} numberOfLines={1}>{item.name}</AppText>
                <AppText style={[styles.typePercent, { color: theme.textSecondary }]}>{summary.workDays ? Math.round(item.count / summary.workDays * 100) : 0}%</AppText>
              </View>
              <AppText style={[styles.typeCount, { color: theme.primary }]}>{item.count}일</AppText>
            </View>) : <AppText variant="caption" tone="secondary">집계할 근무가 없어요.</AppText>}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeading title="주말·공휴일 근무" theme={theme} />
        <View style={styles.highlightGrid}>
          <PreviewMetric width={tileWidth} label="토·일 근무" value={summary.weekendWorkDays} unit="일" tint={tint.blue} theme={theme} />
          <PreviewMetric width={tileWidth} label="공휴일 근무" value={summary.holidayWorkDays ?? 0} unit={summary.holidayWorkDays === null ? '일 (미확인)' : '일'} tint={tint.peach} theme={theme} />
        </View>
        {showDelta && summary.holidayWorkDays !== null && previous.holidayWorkDays !== null ? <AppText variant="caption" tone="secondary">지난달 대비 주말 {summary.weekendWorkDays - previous.weekendWorkDays > 0 ? '+' : ''}{summary.weekendWorkDays - previous.weekendWorkDays}일 · 공휴일 {summary.holidayWorkDays - previous.holidayWorkDays > 0 ? '+' : ''}{summary.holidayWorkDays - previous.holidayWorkDays}일</AppText> : null}
      </View>

      <View style={styles.section}>
        <SectionHeading title="다음 달 미리보기" subtitle={next.month.replace('-', '.') + ' 예상'} theme={theme} />
        <View style={styles.previewGrid}>
          <PreviewMetric width={tileWidth} label="근무" value={next.workDays} unit="일" tint={tint.blue} theme={theme} />
          <PreviewMetric width={tileWidth} label="휴무" value={next.restDays} unit="일" tint={tint.sage} theme={theme} />
          <PreviewMetric width={tileWidth} label="야간·당직" value={next.nightShifts} unit="회" tint={tint.lavender} theme={theme} />
          <PreviewMetric width={tileWidth} label="최장 휴무" value={next.longestRest?.days ?? 0} unit="일" tint={tint.peach} theme={theme} />
        </View>
        <MiniWeekPreview weekly={next.weekly} theme={theme} />
        {next.unknownDays > 0 ? <AppText variant="caption" tone="secondary">미확인 {next.unknownDays}일 제외</AppText> : null}
      </View>

      <AppText variant="caption" tone="secondary" style={styles.footnote}>근무표와 근무시간만으로 계산한 참고 정보예요.</AppText>
    </ScrollView>
  </Screen>;
}

function HeroArtwork({ light }: { light: boolean }) {
  return <View pointerEvents="none" style={StyleSheet.absoluteFillObject}><Svg width="100%" height="100%" viewBox="0 0 360 200" preserveAspectRatio="xMidYMid slice">
    <Defs>
      <LinearGradient id="heroGradient" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={light ? '#E6F3F7' : '#30475B'} />
        <Stop offset="1" stopColor={light ? '#DDEEDC' : '#3D574D'} />
      </LinearGradient>
    </Defs>
    <Path d="M0 0h360v200H0z" fill="url(#heroGradient)" />
    <Circle cx="311" cy="54" r="48" fill={light ? '#FFF8E9' : '#708780'} opacity="0.8" />
    <Circle cx="329" cy="41" r="66" fill={light ? '#FFFFFF' : '#9DB2AB'} opacity="0.2" />
    <Path d="M174 200 C220 126 260 173 305 116 C325 91 343 94 360 102 L360 200Z" fill={light ? '#C9DFC9' : '#5A7769'} opacity="0.88" />
    <Path d="M130 200 C185 158 222 173 270 143 C302 124 338 141 360 126 L360 200Z" fill={light ? '#B8D1D3' : '#557184'} opacity="0.85" />
    <Path d="M215 200 C253 179 294 174 360 155 L360 200Z" fill={light ? '#A7C9C6' : '#436070'} opacity="0.7" />
    <Circle cx="247" cy="104" r="7" fill={light ? '#F28C72' : '#DA8F78'} opacity="0.9" />
  </Svg></View>;
}

function SectionHeading({ title, subtitle, theme }: { title: string; subtitle?: string; theme: AppTheme }) {
  return <View style={styles.sectionHeading}>
    <AppText style={[styles.sectionTitle, { color: theme.primary }]}>{title}</AppText>
    {subtitle ? <AppText style={[styles.sectionSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>{subtitle}</AppText> : null}
  </View>;
}

function KpiTile({ width, icon, label, value, unit, delta, tint, theme }: {
  width: number; icon: IconName; label: string; value: number; unit: string; delta: number | null; tint: string; theme: AppTheme;
}) {
  return <View style={[styles.kpiTile, { width, backgroundColor: tint }]}>
    <View style={styles.kpiHeading}>
      <View style={[styles.kpiIcon, { backgroundColor: theme.surface }]}>
        <MaterialCommunityIcons name={icon} size={18} color={theme.primary} />
      </View>
      <AppText style={[styles.kpiLabel, { color: theme.textSecondary }]} numberOfLines={1}>{label}</AppText>
    </View>
    <View style={styles.kpiValueRow}>
      <AppText style={[styles.kpiNumber, { color: theme.primary }]}>{value}<AppText style={styles.kpiUnit}>{unit}</AppText></AppText>
      {delta !== null ? <AppText style={[styles.kpiDelta, { color: theme.textSecondary }]} numberOfLines={1}>전월 {delta > 0 ? '▲' : delta < 0 ? '▼' : '–'}{delta ? ' ' + Math.abs(delta) : ''}</AppText> : null}
    </View>
  </View>;
}

function WeeklyColumns({ weekly, theme }: { weekly: MonthSummary['weekly']; theme: AppTheme }) {
  return <View style={styles.columns}>{weekly.map((item, index) => {
    const days = item.work + item.rest + item.unknown;
    return <View key={item.start} style={styles.column} accessibilityRole="image" accessibilityLabel={String(index + 1) + '주 근무 ' + item.work + '일 야간 ' + item.night + '일 당직 ' + item.duty + '일 휴무 ' + item.rest + '일 회복 여유 ' + item.recovery + '일 미확인 ' + item.unknown + '일'}>
      <View style={styles.columnPlot}>
        <View style={[styles.stackedBar, { height: Math.max(4, Math.round(142 * days / 7)) }]}>
          {item.unknown > 0 ? <View style={{ flex: item.unknown, backgroundColor: chartColors.unknown }} /> : null}
          {item.rest > 0 ? <View style={{ flex: item.rest, backgroundColor: chartColors.rest }} /> : null}
          {item.work - item.night - item.duty > 0 ? <View style={{ flex: item.work - item.night - item.duty, backgroundColor: chartColors.work }} /> : null}
          {item.night > 0 ? <View style={{ flex: item.night, backgroundColor: chartColors.night }} /> : null}
          {item.duty > 0 ? <View style={{ flex: item.duty, backgroundColor: chartColors.duty }} /> : null}
        </View>
      </View>
      <AppText style={[styles.columnTitle, { color: theme.primary }]}>{index + 1}주</AppText>
      <AppText style={[styles.columnRange, { color: theme.textSecondary }]} numberOfLines={1}>{Number(item.start.slice(8))}–{Number(item.end.slice(8))}일</AppText>
      <AppText style={[styles.columnRecovery, { color: theme.textSecondary }]}>회복 {item.recovery}</AppText>
    </View>;
  })}</View>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><AppText style={styles.legendLabel}>{label}</AppText></View>;
}

function WeeklyTimeline({ week, today, theme }: { week: WeeklyBriefing; today: string; theme: AppTheme }) {
  return <View style={[styles.timeline, { backgroundColor: theme.surface, boxShadow: softShadow }]}>{week.days.map((day, index) => {
    const label = day.state === 'unknown' ? '미확인' : day.state === 'rest' ? '휴무' : day.overnight ? '야간' : '근무';
    const color = day.state === 'unknown' ? chartColors.unknown : day.state === 'rest' ? chartColors.rest : day.overnight ? chartColors.night : chartColors.work;
    return <View key={day.date} style={[styles.timelineDay, day.date === today ? { backgroundColor: theme.background } : null]} accessibilityLabel={'월화수목금토일'[index] + '요일 ' + Number(day.date.slice(8)) + '일 ' + label}>
      <AppText style={[styles.timelineWeekday, { color: theme.textSecondary }]}>{'월화수목금토일'[index]}</AppText>
      <AppText style={[styles.timelineDate, { color: theme.primary }]}>{Number(day.date.slice(8))}</AppText>
      <View style={[styles.timelineDot, { backgroundColor: color }]} />
      <AppText style={[styles.timelineStatus, { color: theme.textSecondary }]} numberOfLines={1}>{label}</AppText>
    </View>;
  })}</View>;
}

function RecommendationCard({ date, reason, tint, theme }: {
  date: string | null; reason: string; tint: string; theme: AppTheme;
}) {
  const accent = theme.rest;
  return <View style={[styles.recommendation, { backgroundColor: tint }]}>
    <View pointerEvents="none" style={[styles.recommendationOrb, { backgroundColor: accent }]} />
    <View style={styles.recommendationTop}>
      <View style={[styles.recommendationIcon, { backgroundColor: theme.surface }]}><MaterialCommunityIcons name="coffee-outline" size={23} color={accent} /></View>
      <AppText style={[styles.recommendationDate, { color: theme.primary }]}>{date ? shortBriefingDate(date) : '—'}</AppText>
    </View>
    <AppText style={[styles.recommendationTitle, { color: theme.primary }]} numberOfLines={1}>쉬기 좋은 날</AppText>
    <AppText style={[styles.recommendationReason, { color: theme.textSecondary }]} numberOfLines={1}>{reason}</AppText>
  </View>;
}

function HighlightTile({ icon, title, run, tint, theme }: { icon: IconName; title: string; run: DayRun; tint: string; theme: AppTheme }) {
  return <View style={[styles.highlightTile, { backgroundColor: tint }]}>
    <MaterialCommunityIcons name={icon} size={20} color={theme.primary} />
    <AppText style={[styles.highlightTitle, { color: theme.textSecondary }]} numberOfLines={1}>{title}</AppText>
    <AppText style={[styles.highlightRange, { color: theme.primary }]} numberOfLines={1}>{runRange(run)}</AppText>
    <AppText style={[styles.highlightDays, { color: theme.primary }]}>{run ? run.days + '일' : '—'}<AppText style={styles.highlightSuffix}> {run ? '연속' : '기록 없음'}</AppText></AppText>
  </View>;
}

function DonutChart({ slices, total, theme }: { slices: ReturnType<typeof getBriefingTypeSlices>; total: number; theme: AppTheme }) {
  const circumference = 2 * Math.PI * 44;
  let offset = 0;
  return <View style={styles.donutWrap} accessibilityRole="image" accessibilityLabel={'근무 유형 비율, 총 ' + total + '일'}>
    <Svg width={132} height={132} viewBox="0 0 132 132">
      <Circle cx={66} cy={66} r={44} stroke={theme.border} strokeWidth={16} fill="none" />
      {slices.map((item, index) => {
        const length = total ? circumference * item.count / total : 0;
        const start = offset;
        offset += length;
        return <Circle key={item.id} cx={66} cy={66} r={44} fill="none" stroke={typeColor(item.name, index)} strokeWidth={16} strokeDasharray={String(length) + ' ' + String(circumference)} strokeDashoffset={-start} rotation={-90} origin="66, 66" />;
      })}
    </Svg>
    <View pointerEvents="none" style={styles.donutCenter}>
      <AppText style={[styles.donutTotal, { color: theme.primary }]}>{total}</AppText>
      <AppText style={[styles.donutUnit, { color: theme.textSecondary }]}>근무일</AppText>
    </View>
  </View>;
}

function PreviewMetric({ width, label, value, unit, tint, theme }: { width: number; label: string; value: number; unit: string; tint: string; theme: AppTheme }) {
  return <View style={[styles.previewMetric, { width, backgroundColor: tint }]}>
    <AppText style={[styles.previewLabel, { color: theme.textSecondary }]} numberOfLines={1}>{label}</AppText>
    <AppText style={[styles.previewValue, { color: theme.primary }]}>{value}<AppText style={styles.previewUnit}>{unit}</AppText></AppText>
  </View>;
}

function MiniWeekPreview({ weekly, theme }: { weekly: MonthSummary['weekly']; theme: AppTheme }) {
  return <View style={styles.miniPreview}>
    <AppText style={[styles.miniTitle, { color: theme.textSecondary }]}>주차별 근무 · 휴무</AppText>
    <View style={styles.miniWeeks} accessibilityLabel="다음 달 주차별 근무와 휴무 미리보기">{weekly.map(item => <View key={item.start} style={styles.miniWeek}>
      {item.work - item.night - item.duty > 0 ? <View style={{ flex: item.work - item.night - item.duty, backgroundColor: chartColors.work }} /> : null}
      {item.night > 0 ? <View style={{ flex: item.night, backgroundColor: chartColors.night }} /> : null}
      {item.duty > 0 ? <View style={{ flex: item.duty, backgroundColor: chartColors.duty }} /> : null}
      {item.rest > 0 ? <View style={{ flex: item.rest, backgroundColor: chartColors.rest }} /> : null}
      {item.unknown > 0 ? <View style={{ flex: item.unknown, backgroundColor: chartColors.unknown }} /> : null}
    </View>)}</View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xs, paddingBottom: 0 },
  content: { gap: spacing.xl },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  backButton: { width: 28, height: 40, justifyContent: 'center' },
  pageTitle: { flex: 1, minWidth: 0, fontSize: 22, lineHeight: 29, fontWeight: '800' },
  monthPicker: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: spacing.xxs, height: 38 },
  monthArrow: { width: 29, height: 36, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { minWidth: 54, textAlign: 'center', fontSize: 13, fontWeight: '800' },
  hero: { minHeight: 200, borderRadius: 28, borderCurve: 'continuous', overflow: 'hidden', justifyContent: 'center', padding: spacing.lg },
  heroCopy: { maxWidth: '74%', gap: spacing.sm },
  heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.72)' },
  heroBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  heroBadgeText: { fontSize: 11, color: brandColors.deepNavy, fontWeight: '800' },
  heroTitle: { fontSize: 23, lineHeight: 31, fontWeight: '800', letterSpacing: -0.5 },
  heroDetail: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kpiTile: { minWidth: 0, minHeight: 119, borderRadius: radius.xl, borderCurve: 'continuous', padding: spacing.md, justifyContent: 'space-between' },
  kpiHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  kpiIcon: { width: 30, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  kpiLabel: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '700' },
  kpiValueRow: { gap: 2 },
  kpiNumber: { fontSize: 30, lineHeight: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  kpiUnit: { fontSize: 13, fontWeight: '700' },
  kpiDelta: { fontSize: 10, fontWeight: '600' },
  unknownNote: { marginTop: -spacing.sm, fontSize: 11 },
  section: { gap: spacing.sm },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.xs, marginBottom: spacing.xxs },
  sectionTitle: { flexShrink: 1, fontSize: 19, lineHeight: 26, fontWeight: '800' },
  sectionSubtitle: { flexShrink: 1, textAlign: 'right', fontSize: 11 },
  chartCard: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, borderRadius: radius.xxl, borderCurve: 'continuous' },
  columns: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xxs },
  column: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3 },
  columnPlot: { height: 167, width: '100%', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6 },
  stackedBar: { width: 32, maxWidth: '75%', borderRadius: 10, overflow: 'hidden' },
  columnTitle: { fontSize: 12, fontWeight: '800' },
  columnRange: { fontSize: 9 },
  columnRecovery: { fontSize: 9 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, paddingTop: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendLabel: { fontSize: 10 },
  timeline: { flexDirection: 'row', borderRadius: radius.xl, borderCurve: 'continuous', paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  timelineDay: { flex: 1, minWidth: 0, alignItems: 'center', gap: 5, borderRadius: radius.md, paddingVertical: spacing.xs },
  timelineWeekday: { fontSize: 10, fontWeight: '600' },
  timelineDate: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timelineStatus: { fontSize: 9 },
  recommendation: { minHeight: 132, borderRadius: radius.xxl, borderCurve: 'continuous', overflow: 'hidden', padding: spacing.lg, gap: 4 },
  recommendationOrb: { position: 'absolute', width: 128, height: 128, borderRadius: 64, opacity: 0.12, right: -28, top: -47 },
  recommendationTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xxs },
  recommendationIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  recommendationDate: { fontSize: 25, fontWeight: '800', fontVariant: ['tabular-nums'] },
  recommendationTitle: { fontSize: 18, fontWeight: '800' },
  recommendationReason: { fontSize: 12, fontWeight: '500' },
  highlightGrid: { flexDirection: 'row', gap: spacing.sm },
  highlightTile: { flex: 1, minWidth: 0, minHeight: 150, borderRadius: radius.xl, borderCurve: 'continuous', padding: spacing.md, gap: spacing.xs },
  highlightTitle: { fontSize: 11, fontWeight: '700' },
  highlightRange: { fontSize: 16, lineHeight: 21, fontWeight: '800', letterSpacing: -0.5 },
  highlightDays: { fontSize: 26, fontWeight: '800' },
  highlightSuffix: { fontSize: 11, fontWeight: '600' },
  donutCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.xxl, borderCurve: 'continuous', padding: spacing.lg },
  donutWrap: { width: 132, height: 132 },
  donutCenter: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  donutTotal: { fontSize: 30, fontWeight: '800', lineHeight: 34 },
  donutUnit: { fontSize: 11 },
  typeLegend: { flex: 1, minWidth: 0, gap: spacing.xs },
  typeLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  typeCopy: { flex: 1, minWidth: 0 },
  typeName: { fontSize: 11, fontWeight: '700' },
  typePercent: { fontSize: 10 },
  typeCount: { fontSize: 11, fontWeight: '800' },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  previewMetric: { minWidth: 0, minHeight: 78, borderRadius: radius.lg, borderCurve: 'continuous', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, justifyContent: 'space-between' },
  previewLabel: { fontSize: 11, fontWeight: '700' },
  previewValue: { fontSize: 23, fontWeight: '800', fontVariant: ['tabular-nums'] },
  previewUnit: { fontSize: 11, fontWeight: '600' },
  miniPreview: { gap: spacing.xs, paddingHorizontal: spacing.xxs },
  miniTitle: { fontSize: 10, fontWeight: '700' },
  miniWeeks: { height: 12, flexDirection: 'row', gap: spacing.xs },
  miniWeek: { flex: 1, flexDirection: 'row', borderRadius: 7, overflow: 'hidden' },
  comments: { gap: spacing.sm },
  commentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52 },
  commentIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  commentCopy: { flex: 1, minWidth: 0 },
  commentTitle: { fontWeight: '800' },
  footnote: { textAlign: 'center', fontSize: 11, paddingTop: spacing.sm, paddingBottom: spacing.md },
});
