import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '../../lib/supabase';

export const FEEDBACK_CATEGORIES = [
  { value: 'bug', label: '오류/버그' },
  { value: 'ux', label: '사용하기 불편함' },
  { value: 'feature', label: '기능 제안' },
  { value: 'design', label: '화면/디자인' },
  { value: 'other', label: '기타' },
] as const;

export const FEEDBACK_SCREENS = [
  { value: 'home', label: '홈' },
  { value: 'calendar', label: '캘린더' },
  { value: 'gap', label: '틈' },
  { value: 'together', label: '함께' },
  { value: 'my', label: 'MY' },
  { value: 'shift_settings', label: '근무표 설정' },
  { value: 'widget', label: '위젯' },
  { value: 'other', label: '기타' },
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]['value'];
export type FeedbackScreen = (typeof FEEDBACK_SCREENS)[number]['value'];
export type BetaFeedbackInput = { category: FeedbackCategory; screen: FeedbackScreen; message: string; wantsReply: boolean; contact: string };
type FeedbackMetadata = { appVersion: string | null; versionCode: string | null; platform: string | null; deviceModel: string | null; osVersion: string | null };

export function createBetaFeedbackInsert(userId: string, input: BetaFeedbackInput, metadata: FeedbackMetadata) {
  const message = input.message.trim();
  if (!userId || !FEEDBACK_CATEGORIES.some((item) => item.value === input.category)
    || !FEEDBACK_SCREENS.some((item) => item.value === input.screen)
    || message.length < 1 || message.length > 1000) throw new Error('피드백 내용을 1~1000자로 입력해 주세요.');
  return {
    user_id: userId,
    category: input.category,
    screen: input.screen,
    message,
    wants_reply: input.wantsReply,
    contact: input.wantsReply ? input.contact.trim() || null : null,
    app_version: metadata.appVersion,
    version_code: metadata.versionCode,
    platform: metadata.platform,
    device_model: metadata.deviceModel,
    os_version: metadata.osVersion,
  };
}

function getFeedbackMetadata(): FeedbackMetadata {
  const versionCode = Constants.platform?.android?.versionCode ?? Constants.expoConfig?.android?.versionCode;
  return {
    appVersion: Constants.expoConfig?.version ?? null,
    versionCode: versionCode == null ? null : String(versionCode),
    platform: Platform.OS,
    deviceModel: Platform.OS === 'android' ? Platform.constants.Model : Platform.OS === 'ios' ? Constants.platform?.ios?.model ?? null : null,
    osVersion: Platform.OS === 'android' ? Platform.constants.Release : Platform.OS === 'ios' ? Platform.constants.osVersion : null,
  };
}

export async function submitBetaFeedback(expectedUserId: string, input: BetaFeedbackInput) {
  const { data, error: authError } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (authError || !userId || userId !== expectedUserId) throw new Error('로그인 상태를 다시 확인해 주세요.');
  const payload = createBetaFeedbackInsert(userId, input, getFeedbackMetadata());
  const { error } = await supabase.from('beta_feedback').insert(payload);
  if (error) throw new Error('의견을 보내지 못했어요. 네트워크 연결을 확인하고 다시 시도해 주세요.');
}
