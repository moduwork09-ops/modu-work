import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, PrimaryButton, Screen } from '../src/components';
import { brandColors, radius, spacing, useAppTheme } from '../src/constants';
import { useAuth } from '../src/features/auth/AuthContext';
import { FEEDBACK_CATEGORIES, FEEDBACK_SCREENS, submitBetaFeedback, type FeedbackCategory, type FeedbackScreen } from '../src/features/feedback/betaFeedback';
import { Header } from './shift-types';

export default function BetaFeedbackScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [screen, setScreen] = useState<FeedbackScreen>('home');
  const [message, setMessage] = useState('');
  const [wantsReply, setWantsReply] = useState(false);
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);
  const lock = useRef(false);

  const send = async () => {
    if (lock.current) return;
    if (!message.trim()) { Alert.alert('내용을 입력해 주세요.'); return; }
    const owner = session?.user.id;
    if (!owner) { Alert.alert('로그인 상태를 다시 확인해 주세요.'); return; }
    lock.current = true;
    setSending(true);
    try {
      await submitBetaFeedback(owner, { category, screen, message, wantsReply, contact });
      Alert.alert('의견 보내주셔서 감사합니다.', '보내주신 내용은 앱을 개선하는 데 참고할게요.', [{ text: '확인', onPress: () => router.back() }]);
    } catch (error) {
      Alert.alert('의견을 보내지 못했어요.', error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      lock.current = false;
      setSending(false);
    }
  };

  const chips = <T extends string,>(items: readonly { value: T; label: string }[], selected: T, onSelect: (value: T) => void) =>
    <View style={styles.chips}>{items.map((item) => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ selected: selected === item.value }} disabled={sending} onPress={() => onSelect(item.value)} style={[styles.chip, { borderColor: selected === item.value ? theme.primary : theme.border, backgroundColor: selected === item.value ? theme.primary : theme.surface }]}><AppText variant="caption" style={{ color: selected === item.value ? brandColors.white : theme.text, fontWeight: '700' }}>{item.label}</AppText></Pressable>)}</View>;

  return <Screen style={styles.screen}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + insets.bottom }]}>
    <Header title="베타 피드백" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/my')} />
    <AppText tone="secondary">모두의 근무를 사용하면서 불편했던 점이나 필요한 기능을 알려주세요.{`\n`}작은 의견도 앱을 개선하는 데 큰 도움이 됩니다.</AppText>
    <Card style={styles.card}><AppText style={styles.label}>피드백 유형</AppText>{chips(FEEDBACK_CATEGORIES, category, setCategory)}</Card>
    <Card style={styles.card}><AppText style={styles.label}>대상 화면</AppText>{chips(FEEDBACK_SCREENS, screen, setScreen)}</Card>
    <Card style={styles.card}><AppText style={styles.label}>내용</AppText><TextInput accessibilityLabel="피드백 내용" multiline maxLength={1000} editable={!sending} value={message} onChangeText={setMessage} placeholder="의견을 자유롭게 적어주세요" placeholderTextColor={theme.textSecondary} textAlignVertical="top" style={[styles.messageInput, { color: theme.text, borderColor: theme.border }]} /><AppText variant="caption" tone="secondary" style={styles.counter}>{message.length}/1000</AppText></Card>
    <Card style={styles.card}><View style={styles.replyRow}><View style={styles.replyCopy}><AppText style={styles.label}>답변 희망</AppText><AppText variant="caption" tone="secondary">답변이 필요하면 연락처를 남겨주세요.</AppText></View><Switch accessibilityLabel="답변 희망" value={wantsReply} disabled={sending} onValueChange={setWantsReply} trackColor={{ true: theme.primary }} /></View>{wantsReply ? <TextInput accessibilityLabel="연락처" editable={!sending} value={contact} onChangeText={setContact} placeholder="이메일 또는 연락처 (선택)" placeholderTextColor={theme.textSecondary} style={[styles.contactInput, { color: theme.text, borderColor: theme.border }]} /> : null}</Card>
    <PrimaryButton disabled={sending || !message.trim()} label={sending ? '보내는 중...' : '의견 보내기'} onPress={() => void send()} />
    <View style={styles.note}><MaterialCommunityIcons name="information-outline" size={16} color={theme.textSecondary} /><AppText variant="caption" tone="secondary">앱·기기 정보가 함께 전송돼요.</AppText></View>
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: 0 }, content: { gap: spacing.md },
  card: { gap: spacing.sm }, label: { fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderRadius: radius.xl, justifyContent: 'center', minHeight: 38, paddingHorizontal: spacing.sm },
  messageInput: { borderWidth: 1, borderRadius: radius.md, minHeight: 150, padding: spacing.md },
  counter: { textAlign: 'right' }, replyRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  replyCopy: { flex: 1, gap: 2 }, contactInput: { borderWidth: 1, borderRadius: radius.md, minHeight: 48, paddingHorizontal: spacing.md },
  note: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
});
