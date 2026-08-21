import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';

const OPTIONS = [
  { title: '새 함께 그룹 만들기', description: '가족, 동료, 친구와 함께할 공간을 만들어요.', icon: 'account-group-outline' as const, route: '/together-group-create' as const },
  { title: '초대 코드로 참여하기', description: '받은 초대 코드로 기존 그룹에 참여해요.', icon: 'ticket-confirmation-outline' as const, route: '/together-invite-join' as const },
];

export default function TogetherAddScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
        </Pressable>
        <AppText variant="button" style={styles.headerTitle}>함께 추가</AppText>
        <View style={styles.headerButton} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <AppText variant="heading" style={styles.introTitle}>어떻게 함께할까요?</AppText>
          <AppText variant="caption" tone="secondary">새 그룹을 만들거나 받은 초대 코드로 참여할 수 있어요.</AppText>
        </View>
        <View style={styles.optionList}>
          {OPTIONS.map((option) => (
            <Pressable key={option.title} accessibilityRole="button" onPress={() => router.push(option.route)} style={({ pressed }) => pressed && styles.pressed}>
              <Card style={styles.optionCard}>
                <View style={styles.optionIcon}><MaterialCommunityIcons name={option.icon} color={brandColors.coral} size={28} /></View>
                <View style={styles.optionText}>
                  <AppText variant="button" style={styles.optionTitle}>{option.title}</AppText>
                  <AppText variant="caption" tone="secondary">{option.description}</AppText>
                </View>
                <MaterialCommunityIcons name="chevron-right" color={theme.textSecondary} size={21} />
              </Card>
            </Pressable>
          ))}
        </View>
        <View style={styles.privacyNote}>
          <MaterialCommunityIcons name="shield-lock-outline" color={brandColors.deepNavy} size={20} />
          <AppText variant="caption" style={styles.privacyText}>그룹에 참여해도 내 정보가 자동으로 모두 공개되지는 않아요.</AppText>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingTop: spacing.xs }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 }, headerButton: { alignItems: 'center', borderRadius: radius.xxl, height: 36, justifyContent: 'center', width: 36 }, headerTitle: { fontSize: 18, lineHeight: 24 }, content: { gap: spacing.lg, paddingTop: spacing.lg }, intro: { gap: spacing.xs }, introTitle: { fontSize: 22, lineHeight: 29 }, optionList: { gap: spacing.sm }, optionCard: { alignItems: 'center', borderCurve: 'continuous', flexDirection: 'row', gap: spacing.md, minHeight: 112, padding: spacing.md }, optionIcon: { alignItems: 'center', backgroundColor: '#FFF0E9', borderRadius: radius.lg, height: 52, justifyContent: 'center', width: 52 }, optionText: { flex: 1, gap: spacing.xxs }, optionTitle: { fontSize: 16, lineHeight: 22 }, privacyNote: { alignItems: 'center', backgroundColor: '#EEF1F3', borderRadius: radius.md, flexDirection: 'row', gap: spacing.sm, padding: spacing.md }, privacyText: { color: brandColors.deepNavy, flex: 1, fontSize: 13, lineHeight: 19 }, pressed: { opacity: 0.76 },
});
