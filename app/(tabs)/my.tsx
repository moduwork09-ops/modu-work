import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, Screen } from '../../src/components';
import { spacing, useAppTheme } from '../../src/constants';

export default function MyScreen() {
  const router = useRouter();
  const theme = useAppTheme();

  return (
    <Screen>
      <AppText variant="title">MY</AppText>
      <Pressable accessibilityLabel="근무 설정" onPress={() => router.push('/shift-types')}>
        <Card style={styles.card}>
          <View style={styles.settingRow}>
            <View><AppText style={styles.settingTitle}>근무 설정</AppText><AppText variant="caption" tone="secondary">근무유형과 반복 패턴을 설정하세요.</AppText></View>
            <MaterialCommunityIcons name="chevron-right" size={24} color={theme.textSecondary} />
          </View>
        </Card>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.xl,
  },
  settingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  settingTitle: { fontWeight: '700' },
});
