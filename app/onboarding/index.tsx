import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, PrimaryButton, Screen } from '../../src/components';
import { spacing, useAppTheme } from '../../src/constants';

export default function OnboardingScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  return <Screen style={styles.screen}><View style={styles.content}><View><AppText variant="title" style={{ color: theme.primary }}>모두의 근무</AppText><AppText variant="heading" style={styles.tagline}>교대근무자의 시간을 더 쉽게</AppText><Card style={styles.messageCard}><AppText tone="secondary">근무표를 한 번 설정하면{`\n`}내 일정과 사용할 수 있는 틈을{`\n`}자동으로 확인할 수 있어요.</AppText></Card></View><PrimaryButton label="시작하기" onPress={() => router.replace({ pathname: '/shift-types', params: { setup: 'true' } })} style={[styles.startButton, { marginBottom: Math.max(insets.bottom, spacing.md) }]} /></View></Screen>;
}

const styles = StyleSheet.create({ screen: { paddingTop: spacing.xl }, content: { flex: 1, justifyContent: 'space-between', paddingBottom: spacing.lg }, tagline: { marginTop: spacing.sm }, messageCard: { marginTop: spacing.xxl }, startButton: { width: '100%' } });
