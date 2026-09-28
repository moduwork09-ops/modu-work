import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText, Card, PrimaryButton, Screen } from '../src/components';
import { spacing, radius, useAppTheme } from '../src/constants';
import { useAuth } from '../src/features/auth/AuthContext';
import { entitlementPeriod, entitlementTitle, isEntitlementActive, redeemResultMessage, type UserEntitlement } from '../src/features/entitlements/entitlementModel';
import { listUserEntitlements, redeemEntitlementCode } from '../src/features/entitlements/entitlements';
import { Header } from './shift-types';

export default function EntitlementsScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [owned, setOwned] = useState<{ userId: string; items: UserEntitlement[] }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const redeemLock = useRef(false);
  const visible = owned && owned.userId === userId ? owned.items.filter((item) => isEntitlementActive(item)) : [];

  const refresh = useCallback(async () => {
    if (!userId) return;
    const request = ++generation.current;
    setLoading(true);
    setError(false);
    try {
      const items = await listUserEntitlements(userId);
      if (request === generation.current) setOwned({ userId, items });
    } catch { if (request === generation.current) setError(true); }
    finally { if (request === generation.current) setLoading(false); }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => { generation.current += 1; };
  }, [refresh]));

  const redeem = async () => {
    if (!userId || !code.trim() || redeemLock.current) return;
    redeemLock.current = true;
    setBusy(true);
    const owner = userId;
    const request = generation.current;
    try {
      const result = await redeemEntitlementCode(code.trim(), owner);
      if (generation.current !== request || userId !== owner) return;
      Alert.alert('이벤트 코드', redeemResultMessage(result));
      if (result === 'redeemed') { setCode(''); await refresh(); }
    } catch { if (generation.current === request && userId === owner) Alert.alert('코드를 등록하지 못했어요.', '네트워크 연결을 확인한 뒤 다시 시도해 주세요.'); }
    finally { redeemLock.current = false; setBusy(false); }
  };

  return <Screen style={styles.screen}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Header title="이용권" onBack={() => router.back()} />
    <Card style={styles.card}>
      <AppText variant="heading">현재 이용권</AppText>
      {loading && owned?.userId !== userId ? <AppText tone="secondary">이용권을 확인하고 있어요.</AppText>
        : error ? <AppText tone="secondary">이용권을 확인하지 못했어요. 다시 시도해 주세요.</AppText>
          : visible.length ? visible.map((item) => <View key={item.id} style={styles.entitlement}><AppText style={styles.title}>{entitlementTitle(item)}</AppText><AppText tone="secondary">{entitlementPeriod(item)}</AppText></View>)
            : <AppText tone="secondary">이용 중인 특별 이용권이 없습니다.</AppText>}
      {error ? <PrimaryButton label="다시 확인" onPress={() => void refresh()} /> : null}
    </Card>
    <Card style={styles.card}>
      <AppText variant="heading">이벤트 코드</AppText>
      <TextInput value={code} onChangeText={setCode} maxLength={100} autoCapitalize="characters" autoCorrect={false} placeholder="이벤트 코드 입력" placeholderTextColor={theme.textSecondary} style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]} />
      <PrimaryButton label={busy ? '등록 중...' : '등록하기'} disabled={busy || !code.trim()} onPress={() => void redeem()} />
    </Card>
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 }, content: { gap: spacing.lg, paddingBottom: spacing.xxl },
  card: { gap: spacing.md }, entitlement: { gap: spacing.xs }, title: { fontWeight: '700' },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md },
});
