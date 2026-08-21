import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, PrimaryButton, Screen } from '../src/components';
import { brandColors, spacing } from '../src/constants';

export default function AuthEntryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]} showsVerticalScrollIndicator={false}>
        <View style={styles.copy}>
          <AppText variant="title" style={{ color: brandColors.deepNavy }}>모두의 근무</AppText>
          <AppText tone="secondary">근무와 일정을 안전하게 저장하고{`\n`}함께하는 사람과 시간을 공유해보세요.</AppText>
        </View>
        <View style={styles.actions}>
          <PrimaryButton label="로그인" onPress={() => router.push('/sign-in')} />
          <PrimaryButton label="회원가입" onPress={() => router.push('/sign-up')} style={styles.signUpButton} />
          <AppText variant="caption" tone="secondary" style={styles.notice}>회원가입은 모두의 근무 이용에 필요합니다.</AppText>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 }, content: { flexGrow: 1, justifyContent: 'space-between', paddingTop: spacing.xxl }, copy: { gap: spacing.md }, actions: { gap: spacing.sm }, signUpButton: { backgroundColor: brandColors.coral }, notice: { paddingTop: spacing.xs, textAlign: 'center' },
});
