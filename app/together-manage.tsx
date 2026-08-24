import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, Screen } from '../src/components';
import { radius, spacing, useAppTheme } from '../src/constants';
import { getTogetherSpaceTypeLabel } from '../src/features/together/sharePolicyPresentation';
import { getTogetherSpaces } from '../src/features/together/togetherServerData';
import type { TogetherSpace } from '../src/features/together/types';

function Header() {
  const router = useRouter();
  const theme = useAppTheme();

  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
      </Pressable>
      <AppText variant="button" style={styles.headerTitle}>함께 관리</AppText>
      <Pressable
        accessibilityLabel="함께 추가"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => router.push('/together-add')}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="account-plus-outline" color={theme.text} size={23} />
      </Pressable>
    </View>
  );
}

function GroupCard({ space }: { space: TogetherSpace }) {
  return (
    <Card style={styles.groupCard}>
      <View style={styles.groupTopRow}>
        <View style={styles.groupText}>
          <AppText variant="button" style={styles.groupName}>{space.name}</AppText>
          <AppText variant="caption" tone="secondary">{getTogetherSpaceTypeLabel(space.type)}</AppText>
        </View>
      </View>
    </Card>
  );
}

export default function TogetherManageScreen() {
  const insets = useSafeAreaInsets();
  const [spaces, setSpaces] = useState<TogetherSpace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    setIsLoading(true);
    setHasError(false);

    void getTogetherSpaces()
      .then((nextSpaces) => {
        if (!isCurrent) return;
        setSpaces(nextSpaces);
      })
      .catch(() => {
        if (!isCurrent) return;
        setHasError(true);
      })
      .finally(() => {
        if (!isCurrent) return;
        setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []));

  return (
    <Screen style={styles.screen}>
      <Header />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <AppText variant="heading" style={styles.introTitle}>함께하는 사람과{`\n`}공유할 정보를 그룹별로 설정할 수 있어요.</AppText>
          <AppText variant="caption" tone="secondary">상대마다 내 근무와 일정의 공개 범위를 다르게 설정할 수 있습니다.</AppText>
        </View>

        <View style={styles.groupList}>
          {isLoading ? <AppText tone="secondary" style={styles.stateText}>그룹을 불러오는 중...</AppText> : null}
          {!isLoading && hasError ? <AppText tone="secondary" style={styles.stateText}>그룹 목록을 불러올 수 없어요.</AppText> : null}
          {!isLoading && !hasError && spaces.length === 0 ? <AppText tone="secondary" style={styles.stateText}>아직 만든 그룹이 없어요.</AppText> : null}
          {!isLoading && !hasError ? spaces.map((space) => <GroupCard key={space.id} space={space} />) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingTop: spacing.xs },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 },
  headerButton: { alignItems: 'center', borderRadius: radius.xxl, height: 36, justifyContent: 'center', width: 36 },
  headerTitle: { fontSize: 18, lineHeight: 24 },
  content: { gap: spacing.lg, paddingTop: spacing.md },
  intro: { gap: spacing.xs, paddingHorizontal: spacing.xxs },
  introTitle: { fontSize: 21, lineHeight: 29 },
  groupList: { gap: spacing.sm },
  groupCard: { borderCurve: 'continuous', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  groupTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  groupText: { gap: 1 },
  groupName: { fontSize: 17, lineHeight: 23 },
  stateText: { paddingVertical: spacing.xl, textAlign: 'center' },
  pressed: { opacity: 0.76 },
});
