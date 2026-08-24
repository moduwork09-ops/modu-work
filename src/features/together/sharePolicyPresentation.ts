import { canShare } from './sharePolicy';
import type { ShareCapability, SharePolicy, TogetherSpaceType } from './types';

type SharePolicyFlags = Pick<
  SharePolicy,
  'shareShiftDetails' | 'sharePersonalEvents' | 'shareDaysOff' | 'shareAvailability' | 'shareSharedEvents'
>;

const CAPABILITY_LABELS: Array<{ capability: ShareCapability; label: string }> = [
  { capability: 'shift-details', label: '근무' },
  { capability: 'personal-events', label: '개인 일정' },
  { capability: 'days-off', label: '휴무' },
  { capability: 'availability', label: '틈' },
  { capability: 'shared-events', label: '공동 일정' },
];

const SPACE_TYPE_LABELS: Record<TogetherSpaceType, string> = {
  family: '가족',
  couple: '배우자/연인',
  coworker: '직장 동료',
  friend: '친구',
  custom: '직접 설정',
};

export function getTogetherSpaceTypeLabel(type: TogetherSpaceType): string {
  return SPACE_TYPE_LABELS[type];
}

export function getSharePolicySummary(policy: SharePolicyFlags): string {
  const enabledLabels = CAPABILITY_LABELS
    .filter(({ capability }) => canShare(policy, capability))
    .map(({ label }) => label);

  if (enabledLabels.length === CAPABILITY_LABELS.length) return '전체 공유';
  if (enabledLabels.length === 0) return '공유 안 함';
  return enabledLabels.join(' · ');
}

export function getSharePolicyStatus(policy: SharePolicyFlags): {
  description: string;
  icon: 'check-circle-outline' | 'lock-outline';
  title: string;
} {
  const summary = getSharePolicySummary(policy);

  if (summary === '전체 공유') {
    return {
      icon: 'check-circle-outline',
      title: '전체 공유 중',
      description: '이 그룹에서는 근무, 개인 일정, 휴무, 함께 가능한 시간과 공동 일정을 모두 공유합니다.',
    };
  }

  if (summary === '공유 안 함') {
    return {
      icon: 'lock-outline',
      title: '공유 안 함',
      description: '이 그룹에는 내 근무와 일정 정보를 공유하지 않습니다.',
    };
  }

  return {
    icon: 'lock-outline',
    title: `${summary} 공유 중`,
    description: '켜지 않은 근무 상세와 개인 일정은 이 그룹 사람들에게 보이지 않아요.',
  };
}
