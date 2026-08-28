export const TOGETHER_SPACE_TYPES = ['family', 'couple', 'coworker', 'friend', 'custom'] as const;

export type TogetherSpaceType = typeof TOGETHER_SPACE_TYPES[number];

export function isTogetherSpaceType(value: unknown): value is TogetherSpaceType {
  return typeof value === 'string' && TOGETHER_SPACE_TYPES.some((type) => type === value);
}

export type TogetherSpace = {
  id: string;
  name: string;
  type: TogetherSpaceType;
  createdBy: string;
  createdAt: string;
};

export type MembershipRole = 'owner' | 'member';

export type MembershipStatus = 'invited' | 'active' | 'left';

export type TogetherMembership = {
  id: string;
  spaceId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  joinedAt?: string;
};

export type SharePolicy = {
  id: string;
  spaceId: string;
  ownerUserId: string;
  shareShiftDetails: boolean;
  sharePersonalEvents: boolean;
  shareDaysOff: boolean;
  shareAvailability: boolean;
  shareSharedEvents: boolean;
  updatedAt: string;
};

export type ShareCapability =
  | 'shift-details'
  | 'personal-events'
  | 'days-off'
  | 'availability'
  | 'shared-events';

export type AvailabilityWindow = {
  participantUserIds: string[];
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
};

export type TogetherSharedEvent = {
  id: string;
  spaceId: string;
  creatorUserId: string;
  participantUserIds: string[];
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location?: string;
  memo?: string;
  createdAt: string;
  updatedAt: string;
};
