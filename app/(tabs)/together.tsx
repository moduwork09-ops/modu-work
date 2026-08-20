import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, Screen } from '../../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../../src/constants';

const TIMELINE_START_HOUR = 18;
const TIMELINE_END_HOUR = 24;
const MOCK_GAP_START_HOUR = 20;
const MOCK_GAP_END_HOUR = 22.5;

const MOCK_TOGETHER = {
  primaryPerson: {
    initials: '민',
    name: '민지',
    relationship: '배우자',
  },
  companions: [
    { initials: '지', color: '#F8D6CA' },
    { initials: '준', color: '#DDE7EE' },
    { initials: '서', color: '#E3E9D9' },
  ],
  sharedGap: {
    time: '20:00 ~ 22:30',
    description: '배우자와 함께 가능',
  },
  commonDaysOff: ['8/24 (토)', '8/28 (수)', '9/1 (일)'],
} as const;

const activeRangeLeft = (
  (MOCK_GAP_START_HOUR - TIMELINE_START_HOUR)
  / (TIMELINE_END_HOUR - TIMELINE_START_HOUR)
) * 100;
const activeRangeWidth = (
  (MOCK_GAP_END_HOUR - MOCK_GAP_START_HOUR)
  / (TIMELINE_END_HOUR - TIMELINE_START_HOUR)
) * 100;

function showPrototypeAlert(title: string) {
  // TODO: 실제 알림, 사용자 연결, 틈 계산 및 공동 일정 기능이 준비되면 각 동작으로 교체한다.
  Alert.alert(title, '지금은 메인 화면 디자인을 확인하는 단계예요.');
}

function CompactHero() {
  return (
    <View style={styles.hero}>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        source={require('../../assets/together/together-hero.png')}
        style={styles.heroImage}
      />
    </View>
  );
}

function PeopleRow() {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => showPrototypeAlert('함께하는 사람')}
      style={({ pressed }) => [styles.peopleRow, pressed && styles.pressed]}
    >
      <View style={styles.primaryPerson}>
        <View style={styles.primaryAvatar}>
          <AppText variant="button" style={styles.avatarText}>
            {MOCK_TOGETHER.primaryPerson.initials}
          </AppText>
        </View>
        <AppText variant="caption" style={styles.personLabel}>
          {MOCK_TOGETHER.primaryPerson.relationship}
        </AppText>
      </View>

      <AppText tone="secondary" style={styles.plusLabel}>+</AppText>

      <View style={styles.companionGroup}>
        <View style={styles.avatarStack}>
          {MOCK_TOGETHER.companions.map((person, index) => (
            <View
              key={person.initials}
              style={[
                styles.companionAvatar,
                { backgroundColor: person.color, marginLeft: index === 0 ? 0 : -8, zIndex: 3 - index },
              ]}
            >
              <AppText variant="caption" style={styles.companionInitial}>
                {person.initials}
              </AppText>
            </View>
          ))}
        </View>
        <AppText variant="caption" style={styles.personLabel}>
          동료 3명
        </AppText>
      </View>

      <View style={styles.peopleChevron}>
        <MaterialCommunityIcons name="chevron-right" color={theme.text} size={21} />
      </View>
    </Pressable>
  );
}

function GapTimeline() {
  return (
    <View style={styles.timeline}>
      <View style={styles.trackArea}>
        <View style={styles.timelineTrack} />
        <View style={[styles.activeTrack, { left: `${activeRangeLeft}%`, width: `${activeRangeWidth}%` }]} />
        {[0, 1, 2, 3].map((tick) => (
          <View key={tick} style={[styles.majorTick, { left: `${(tick / 3) * 100}%` }]} />
        ))}
      </View>
      <View style={styles.timelineLabels}>
        <AppText variant="caption" style={styles.timelineLabel}>18시</AppText>
        <AppText variant="caption" style={styles.timelineLabel}>20시</AppText>
        <AppText variant="caption" style={styles.timelineLabel}>22시</AppText>
        <AppText variant="caption" style={styles.timelineLabel}>24시</AppText>
      </View>
    </View>
  );
}

function SharedGapCard() {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => showPrototypeAlert('오늘의 함께하는 틈')}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card style={styles.gapCard}>
        <View style={styles.gapTimeRow}>
          <AppText variant="heading" style={styles.gapTime}>
            {MOCK_TOGETHER.sharedGap.time}
          </AppText>
          <View style={styles.bestBadge}>
            <AppText variant="caption" style={styles.bestBadgeText}>BEST</AppText>
          </View>
        </View>

        <View style={styles.gapDescriptionRow}>
          <AppText style={styles.gapDescription}>{MOCK_TOGETHER.sharedGap.description}</AppText>
          <MaterialCommunityIcons name="heart-outline" color={brandColors.coral} size={18} />
        </View>

        <GapTimeline />
      </Card>
    </Pressable>
  );
}

function CommonDaysOff() {
  const theme = useAppTheme();

  return (
    <View style={styles.dayChipRow}>
      {MOCK_TOGETHER.commonDaysOff.map((day) => (
        <View key={day} style={[styles.dayChip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <AppText variant="button" style={styles.dayChipText}>{day}</AppText>
        </View>
      ))}
    </View>
  );
}

function SharedScheduleButton() {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => showPrototypeAlert('공동 일정 만들기')}
      hitSlop={2}
      style={({ pressed }) => [styles.scheduleButton, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name="account-group-outline" color={brandColors.white} size={18} />
      <AppText variant="button" style={styles.scheduleButtonText}>공동 일정 만들기</AppText>
    </Pressable>
  );
}

export default function TogetherScreen() {
  const theme = useAppTheme();

  return (
    <Screen style={styles.screen}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <AppText variant="title" style={styles.headerTitle}>함께</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="알림"
            onPress={() => showPrototypeAlert('알림')}
            hitSlop={8}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="bell-outline" color={theme.text} size={21} />
          </Pressable>
        </View>

        <CompactHero />
        <PeopleRow />

        <View style={styles.section}>
          <AppText variant="button" style={styles.sectionTitle}>오늘의 함께하는 틈</AppText>
          <SharedGapCard />
        </View>

        <View style={[styles.section, styles.sectionSeparated]}>
          <AppText variant="button" style={styles.sectionTitle}>이번 주 공통 휴무</AppText>
          <CommonDaysOff />
        </View>

        <View style={[styles.section, styles.sectionSeparated]}>
          <AppText variant="button" style={styles.sectionTitle}>추천 약속</AppText>
          <SharedScheduleButton />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 0,
    paddingTop: spacing.xs,
  },
  content: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 38,
  },
  headerTitle: {
    fontSize: 24,
    lineHeight: 31,
  },
  headerButton: {
    alignItems: 'center',
    borderRadius: radius.xxl,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  hero: {
    aspectRatio: 2.35,
    borderColor: '#F5D8CC',
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    width: '100%',
  },
  heroImage: {
    height: '100%',
    width: '100%',
  },
  peopleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 60,
    paddingHorizontal: spacing.xs,
  },
  primaryPerson: {
    alignItems: 'center',
    gap: spacing.xxs,
  },
  primaryAvatar: {
    alignItems: 'center',
    backgroundColor: '#F8D6CA',
    borderColor: '#F2B9A3',
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  avatarText: {
    color: brandColors.deepNavy,
  },
  personLabel: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  plusLabel: {
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
  },
  companionGroup: {
    alignItems: 'center',
    gap: spacing.xxs,
  },
  avatarStack: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 40,
  },
  companionAvatar: {
    alignItems: 'center',
    borderColor: brandColors.white,
    borderRadius: 20,
    borderWidth: 2,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  companionInitial: {
    color: brandColors.deepNavy,
    fontWeight: '700',
  },
  peopleChevron: {
    alignItems: 'flex-end',
    flex: 1,
  },
  section: {
    gap: 6,
  },
  sectionSeparated: {
    marginTop: spacing.xxs,
  },
  sectionTitle: {
    fontWeight: '700',
  },
  gapCard: {
    borderCurve: 'continuous',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  gapTimeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  gapTime: {
    color: brandColors.coral,
    fontSize: 23,
    lineHeight: 29,
  },
  bestBadge: {
    backgroundColor: '#FFF0E9',
    borderRadius: radius.xxl,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  bestBadgeText: {
    color: brandColors.coral,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  gapDescriptionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  gapDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  timeline: {
    gap: 2,
    paddingTop: spacing.xxs,
  },
  trackArea: {
    height: 15,
    justifyContent: 'center',
    position: 'relative',
  },
  timelineTrack: {
    backgroundColor: '#E9EBED',
    borderRadius: 4,
    height: 2,
    width: '100%',
  },
  activeTrack: {
    backgroundColor: brandColors.coral,
    borderRadius: 5,
    height: 7,
    position: 'absolute',
    top: 4,
  },
  majorTick: {
    backgroundColor: '#B7BDC3',
    bottom: 0,
    height: 4,
    position: 'absolute',
    width: StyleSheet.hairlineWidth,
  },
  timelineLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timelineLabel: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  dayChipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  dayChip: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.xs,
  },
  dayChipText: {
    fontSize: 13,
    textAlign: 'center',
  },
  scheduleButton: {
    alignItems: 'center',
    backgroundColor: brandColors.coral,
    borderCurve: 'continuous',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  scheduleButtonText: {
    color: brandColors.white,
    fontSize: 14,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.78,
  },
});
