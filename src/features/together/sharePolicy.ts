import type { ShareCapability, SharePolicy, TogetherSpaceType } from './types';

type SharePolicyIdentity = Pick<SharePolicy, 'id' | 'spaceId' | 'ownerUserId' | 'updatedAt'>;

type SharePolicySettings = Omit<SharePolicy, keyof SharePolicyIdentity>;

type SharePolicyFlags = Pick<
  SharePolicy,
  'shareShiftDetails' | 'sharePersonalEvents' | 'shareDaysOff' | 'shareAvailability' | 'shareSharedEvents'
>;

const DEFAULT_SETTINGS: Record<TogetherSpaceType, SharePolicySettings> = {
  couple: {
    shareShiftDetails: true,
    sharePersonalEvents: true,
    shareDaysOff: true,
    shareAvailability: true,
    shareSharedEvents: true,
  },
  family: {
    shareShiftDetails: true,
    sharePersonalEvents: true,
    shareDaysOff: true,
    shareAvailability: true,
    shareSharedEvents: true,
  },
  coworker: {
    shareShiftDetails: false,
    sharePersonalEvents: false,
    shareDaysOff: true,
    shareAvailability: true,
    shareSharedEvents: true,
  },
  friend: {
    shareShiftDetails: false,
    sharePersonalEvents: false,
    shareDaysOff: false,
    shareAvailability: true,
    shareSharedEvents: true,
  },
  custom: {
    shareShiftDetails: false,
    sharePersonalEvents: false,
    shareDaysOff: false,
    shareAvailability: false,
    shareSharedEvents: false,
  },
};

const CAPABILITY_FIELDS: Record<ShareCapability, keyof SharePolicySettings> = {
  'shift-details': 'shareShiftDetails',
  'personal-events': 'sharePersonalEvents',
  'days-off': 'shareDaysOff',
  availability: 'shareAvailability',
  'shared-events': 'shareSharedEvents',
};

export function createDefaultSharePolicy(
  type: TogetherSpaceType,
  input: SharePolicyIdentity,
): SharePolicy {
  return {
    ...input,
    ...DEFAULT_SETTINGS[type],
  };
}

export function canShare(policy: SharePolicyFlags, capability: ShareCapability): boolean {
  return policy[CAPABILITY_FIELDS[capability]];
}
