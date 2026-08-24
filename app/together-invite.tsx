import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import {
  createTogetherInvitation,
  isTogetherSpaceId,
  type TogetherInvitation,
} from '../src/features/together/togetherServerData';

function formatExpiresAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '만료 시각을 확인할 수 없어요.';
  return `${new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)}까지 유효해요.`;
}

export default function TogetherInviteScreen() {
  const params = useLocalSearchParams<{ spaceId?: string | string[] }>();
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const rawSpaceId = params.spaceId;
  const spaceId = typeof rawSpaceId === 'string' && isTogetherSpaceId(rawSpaceId) ? rawSpaceId : undefined;
  const [invitation, setInvitation] = useState<TogetherInvitation>();
  const [isCreating, setIsCreating] = useState(false);
  const isCreatingRef = useRef(false);
  const isMountedRef = useRef(true);
  const inviteUrl = invitation
    ? Linking.createURL('together-invite-join', { queryParams: { code: invitation.inviteCode } })
    : undefined;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  async function createInvitation() {
    if (!spaceId || isCreatingRef.current) return;

    isCreatingRef.current = true;
    setIsCreating(true);
    try {
      const nextInvitation = await createTogetherInvitation(spaceId);
      isCreatingRef.current = false;
      if (!isMountedRef.current) return;
      setInvitation(nextInvitation);
      setIsCreating(false);
    } catch {
      isCreatingRef.current = false;
      if (!isMountedRef.current) return;
      setIsCreating(false);
      Alert.alert('초대 코드를 만들 수 없어요.', '잠시 후 다시 시도해 주세요.');
    }
  }

  async function shareInviteCode() {
    if (!invitation) return;
    try {
      await Share.share({ message: `모두의 근무 초대 코드: ${invitation.inviteCode}` });
    } catch {
      if (isMountedRef.current) Alert.alert('초대 코드를 공유할 수 없어요.');
    }
  }

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} />
        </Pressable>
        <AppText variant="button" style={styles.headerTitle}>사람 초대</AppText>
        <View style={styles.headerButton} />
      </View>

      {!spaceId ? <View style={styles.state}><AppText>초대할 그룹 정보를 확인할 수 없어요.</AppText></View> : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <AppText variant="heading" style={styles.title}>함께 그룹에 초대하기</AppText>
            <AppText variant="caption" tone="secondary">초대받은 사람이 참여하면 서로 설정한 범위 안에서 근무와 틈을 공유할 수 있어요.</AppText>
          </View>

          <Card style={styles.methodCard}>
            <View style={styles.methodHeader}><View style={styles.iconBox}><MaterialCommunityIcons name="link-variant" color={brandColors.coral} size={23} /></View><View style={styles.methodText}><AppText style={styles.methodTitle}>초대 링크 공유</AppText><AppText variant="caption" tone="secondary">초대 링크는 다음 단계에서 연결할 기능이에요.</AppText></View></View>
          </Card>

          <Card style={styles.methodCard}>
            <View style={styles.methodHeader}><View style={styles.iconBox}><MaterialCommunityIcons name="qrcode" color={brandColors.coral} size={23} /></View><View style={styles.methodText}><AppText style={styles.methodTitle}>QR 코드</AppText><AppText variant="caption" tone="secondary">QR을 스캔하면 초대 코드 입력 화면이 열려요.</AppText></View></View>
            {inviteUrl ? (
              <View style={styles.qrCode}><QRCode backgroundColor={brandColors.white} color={brandColors.deepNavy} quietZone={12} size={180} value={inviteUrl} /></View>
            ) : (
              <View style={styles.qrPlaceholder}><AppText variant="caption" tone="secondary" style={styles.qrPlaceholderText}>초대 코드를 만들면 QR 코드가 표시돼요.</AppText></View>
            )}
          </Card>

          <Card style={styles.methodCard}>
            <View style={styles.methodHeader}><View style={styles.iconBox}><MaterialCommunityIcons name="key-outline" color={brandColors.coral} size={23} /></View><View style={styles.methodText}><AppText style={styles.methodTitle}>초대 코드</AppText><AppText variant="caption" tone="secondary">필요할 때 코드를 만들어 상대방에게 보내세요.</AppText></View></View>
            {invitation ? (
              <>
                <View style={styles.codeRow}><AppText adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} selectable style={styles.code}>{invitation.inviteCode}</AppText></View>
                <AppText variant="caption" tone="secondary" style={styles.expiry}>{formatExpiresAt(invitation.expiresAt)}</AppText>
                <Pressable accessibilityRole="button" onPress={() => void shareInviteCode()} style={({ pressed }) => [styles.secondaryButton, { borderColor: theme.border }, pressed && styles.pressed]}><AppText style={styles.secondaryButtonText}>초대 코드 공유</AppText></Pressable>
                <Pressable accessibilityRole="button" disabled={isCreating} onPress={() => void createInvitation()} style={({ pressed }) => [styles.secondaryButton, { borderColor: theme.border }, isCreating && styles.disabled, pressed && styles.pressed]}><AppText style={styles.secondaryButtonText}>{isCreating ? '새 코드 만드는 중...' : '새 코드 만들기'}</AppText></Pressable>
              </>
            ) : (
              <Pressable accessibilityRole="button" disabled={isCreating} onPress={() => void createInvitation()} style={({ pressed }) => [styles.createButton, isCreating && styles.disabled, pressed && styles.pressed]}><AppText style={styles.createButtonText}>{isCreating ? '초대 코드 만드는 중...' : '초대 코드 만들기'}</AppText></Pressable>
            )}
          </Card>

          <View style={styles.privacyNote}><MaterialCommunityIcons name="shield-lock-outline" color={brandColors.deepNavy} size={20} /><AppText variant="caption" style={styles.privacyText}>그룹에 참여해도 내 정보가 자동으로 모두 공개되지는 않아요. 참여 후 공유 범위를 직접 선택할 수 있습니다.</AppText></View>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingTop: spacing.xs },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 },
  headerButton: { alignItems: 'center', borderRadius: radius.xxl, height: 36, justifyContent: 'center', width: 36 },
  headerTitle: { fontSize: 18 },
  content: { gap: spacing.sm, paddingTop: spacing.md },
  intro: { gap: spacing.xs, paddingBottom: spacing.xs },
  title: { fontSize: 22, lineHeight: 29 },
  methodCard: { gap: spacing.sm, padding: spacing.md },
  methodHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  iconBox: { alignItems: 'center', backgroundColor: '#FFF0E9', borderRadius: radius.md, height: 42, justifyContent: 'center', width: 42 },
  methodText: { flex: 1, gap: 1 },
  methodTitle: { fontSize: 15, fontWeight: '700' },
  qrPlaceholder: { alignItems: 'center', alignSelf: 'stretch', backgroundColor: '#F8F6F1', borderRadius: radius.md, justifyContent: 'center', minHeight: 112, padding: spacing.md },
  qrPlaceholderText: { textAlign: 'center' },
  qrCode: { alignItems: 'center', alignSelf: 'center', backgroundColor: brandColors.white, borderRadius: radius.md, justifyContent: 'center', padding: spacing.sm },
  codeRow: { alignItems: 'center', backgroundColor: '#F8F6F1', borderRadius: radius.md, justifyContent: 'center', minHeight: 54, paddingHorizontal: spacing.md },
  code: { color: brandColors.deepNavy, fontSize: 21, fontWeight: '700', includeFontPadding: false, letterSpacing: 2, textAlign: 'center', width: '100%' },
  expiry: { textAlign: 'center' },
  createButton: { alignItems: 'center', backgroundColor: brandColors.coral, borderRadius: radius.md, justifyContent: 'center', minHeight: 44 },
  createButtonText: { color: brandColors.white, fontSize: 14, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, justifyContent: 'center', minHeight: 42 },
  secondaryButtonText: { color: brandColors.deepNavy, fontSize: 14, fontWeight: '700' },
  privacyNote: { alignItems: 'flex-start', backgroundColor: '#EEF1F3', borderRadius: radius.md, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  privacyText: { color: brandColors.deepNavy, flex: 1, fontSize: 13, lineHeight: 19 },
  state: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.76 },
});
