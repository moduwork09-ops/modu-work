import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { addMockMember, generateMockInviteCode, getSpaceById } from '../src/features/together/mockTogetherState';

export default function TogetherInviteScreen() {
  const params = useLocalSearchParams<{ spaceId?: string | string[] }>();
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const spaceId = Array.isArray(params.spaceId) ? params.spaceId[0] : params.spaceId;
  const space = spaceId ? getSpaceById(spaceId) : undefined;
  const [inviteCode] = useState(generateMockInviteCode);
  if (!space) return <Screen style={styles.screen}><View style={styles.header}><Pressable accessibilityLabel="뒤로" accessibilityRole="button" onPress={() => router.back()} style={styles.headerButton}><MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} /></Pressable><AppText variant="button">사람 초대</AppText><View style={styles.headerButton} /></View></Screen>;
  const selectedSpace = space;

  function simulateAccept() {
    addMockMember(selectedSpace.id);
    Alert.alert('테스트 초대 수락 완료', 'Mock 멤버가 1명 추가되었습니다.', [{ text: '그룹 정보로 돌아가기', onPress: () => router.back() }]);
  }

  return <Screen style={styles.screen}><View style={styles.header}><Pressable accessibilityLabel="뒤로" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}><MaterialCommunityIcons name="chevron-left" color={theme.text} size={25} /></Pressable><AppText variant="button" style={styles.headerTitle}>사람 초대</AppText><View style={styles.headerButton} /></View><ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator={false}>
    <View style={styles.intro}><AppText variant="heading" style={styles.title}>{selectedSpace.name}에 초대하기</AppText><AppText variant="caption" tone="secondary">초대받은 사람이 참여하면 서로 설정한 범위 안에서 근무와 틈을 공유할 수 있어요.</AppText></View>
    <Card style={styles.methodCard}><View style={styles.methodHeader}><View style={styles.iconBox}><MaterialCommunityIcons name="link-variant" color={brandColors.coral} size={23} /></View><View style={styles.methodText}><AppText style={styles.methodTitle}>초대 링크 공유</AppText><AppText variant="caption" tone="secondary">카카오톡이나 문자로 링크를 보내요.</AppText></View></View><Pressable accessibilityRole="button" onPress={() => Alert.alert('초대 링크 공유', '실제 링크 공유는 계정/서버 연결 후 지원합니다.')} style={({ pressed }) => [styles.secondaryButton, { borderColor: theme.border }, pressed && styles.pressed]}><AppText style={styles.secondaryButtonText}>초대 링크 공유</AppText></Pressable></Card>
    <Card style={styles.methodCard}><View style={styles.methodHeader}><View style={styles.iconBox}><MaterialCommunityIcons name="qrcode" color={brandColors.coral} size={23} /></View><View style={styles.methodText}><AppText style={styles.methodTitle}>QR 코드</AppText><AppText variant="caption" tone="secondary">상대방이 모두의 근무에서 QR을 스캔하면 참여할 수 있어요.</AppText></View></View><View style={styles.qrPlaceholder}><MaterialCommunityIcons name="qrcode" color={brandColors.deepNavy} size={62} /></View><Pressable accessibilityRole="button" onPress={() => Alert.alert('QR 크게 보기', '실제 QR 연결은 서버 기능과 함께 지원합니다.')} style={({ pressed }) => [styles.secondaryButton, { borderColor: theme.border }, pressed && styles.pressed]}><AppText style={styles.secondaryButtonText}>QR 크게 보기</AppText></Pressable></Card>
    <Card style={styles.methodCard}><View style={styles.methodHeader}><View style={styles.iconBox}><MaterialCommunityIcons name="key-outline" color={brandColors.coral} size={23} /></View><View style={styles.methodText}><AppText style={styles.methodTitle}>초대 코드</AppText><AppText variant="caption" tone="secondary">초대 코드는 24시간 동안 유효해요.</AppText></View></View><Pressable accessibilityLabel="초대 코드 복사" accessibilityRole="button" onPress={() => Alert.alert('초대 코드', `${inviteCode}\n\n실제 복사는 서버 연결 후 지원합니다.`)} style={styles.codeRow}><AppText selectable style={styles.code}>{inviteCode}</AppText><MaterialCommunityIcons name="content-copy" color={brandColors.deepNavy} size={20} /></Pressable></Card>
    <View style={styles.privacyNote}><MaterialCommunityIcons name="shield-lock-outline" color={brandColors.deepNavy} size={20} /><AppText variant="caption" style={styles.privacyText}>그룹에 참여해도 내 정보가 자동으로 모두 공개되지는 않아요. 참여 후 공유 범위를 직접 선택할 수 있습니다.</AppText></View>
    <Pressable accessibilityRole="button" onPress={simulateAccept} style={({ pressed }) => [styles.testButton, pressed && styles.pressed]}><MaterialCommunityIcons name="flask-outline" color={brandColors.deepNavy} size={19} /><AppText style={styles.testText}>테스트용 · 초대 수락 시뮬레이션</AppText></Pressable>
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0, paddingTop: spacing.xs }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 }, headerButton: { alignItems: 'center', borderRadius: radius.xxl, height: 36, justifyContent: 'center', width: 36 }, headerTitle: { fontSize: 18 }, content: { gap: spacing.sm, paddingTop: spacing.md }, intro: { gap: spacing.xs, paddingBottom: spacing.xs }, title: { fontSize: 22, lineHeight: 29 }, methodCard: { gap: spacing.sm, padding: spacing.md }, methodHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, iconBox: { alignItems: 'center', backgroundColor: '#FFF0E9', borderRadius: radius.md, height: 42, justifyContent: 'center', width: 42 }, methodText: { flex: 1, gap: 1 }, methodTitle: { fontSize: 15, fontWeight: '700' }, secondaryButton: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, justifyContent: 'center', minHeight: 42 }, secondaryButtonText: { color: brandColors.deepNavy, fontSize: 14, fontWeight: '700' }, qrPlaceholder: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#F8F6F1', borderRadius: radius.md, height: 96, justifyContent: 'center', width: 96 }, codeRow: { alignItems: 'center', backgroundColor: '#F8F6F1', borderRadius: radius.md, flexDirection: 'row', justifyContent: 'space-between', minHeight: 54, paddingHorizontal: spacing.md }, code: { color: brandColors.deepNavy, fontSize: 21, fontWeight: '700', letterSpacing: 2 }, privacyNote: { alignItems: 'flex-start', backgroundColor: '#EEF1F3', borderRadius: radius.md, flexDirection: 'row', gap: spacing.sm, padding: spacing.md }, privacyText: { color: brandColors.deepNavy, flex: 1, fontSize: 13, lineHeight: 19 }, testButton: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', gap: spacing.xs, minHeight: 42, paddingHorizontal: spacing.sm }, testText: { color: brandColors.deepNavy, fontSize: 13, fontWeight: '700' }, pressed: { opacity: 0.76 },
});
