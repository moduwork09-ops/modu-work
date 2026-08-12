import { StyleSheet } from 'react-native';

import { AppText, Card, Screen } from '../../src/components';
import { spacing } from '../../src/constants';

export default function MyScreen() {
  return (
    <Screen>
      <AppText variant="title">MY</AppText>
      <Card style={styles.card}>
        <AppText tone="secondary">MY 화면 기본 구조를 준비하고 있습니다.</AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.xl,
  },
});
