import { createDefaultSharePolicy } from './sharePolicy';
import type { SharePolicy, TogetherMembership, TogetherSpace } from './types';

const FIXTURE_TIMESTAMP = '2026-08-21T00:00:00.000Z';

export const MOCK_CURRENT_USER_ID = 'user-me';

export const familySpace: TogetherSpace = {
  id: 'space-family-1',
  name: '우리 가족',
  type: 'family',
  createdBy: MOCK_CURRENT_USER_ID,
  createdAt: FIXTURE_TIMESTAMP,
};

export const familyMemberships: TogetherMembership[] = [
  {
    id: 'membership-family-me',
    spaceId: familySpace.id,
    userId: MOCK_CURRENT_USER_ID,
    role: 'owner',
    status: 'active',
    joinedAt: FIXTURE_TIMESTAMP,
  },
  {
    id: 'membership-family-spouse',
    spaceId: familySpace.id,
    userId: 'user-spouse',
    role: 'member',
    status: 'active',
    joinedAt: FIXTURE_TIMESTAMP,
  },
];

export const familySharePolicies: SharePolicy[] = [
  createDefaultSharePolicy('family', {
    id: 'policy-family-me',
    spaceId: familySpace.id,
    ownerUserId: MOCK_CURRENT_USER_ID,
    updatedAt: FIXTURE_TIMESTAMP,
  }),
  createDefaultSharePolicy('family', {
    id: 'policy-family-spouse',
    spaceId: familySpace.id,
    ownerUserId: 'user-spouse',
    updatedAt: FIXTURE_TIMESTAMP,
  }),
];

export const coworkerSpace: TogetherSpace = {
  id: 'space-team-a',
  name: 'A팀',
  type: 'coworker',
  createdBy: MOCK_CURRENT_USER_ID,
  createdAt: FIXTURE_TIMESTAMP,
};

export const coworkerMemberships: TogetherMembership[] = [
  {
    id: 'membership-team-a-me',
    spaceId: coworkerSpace.id,
    userId: MOCK_CURRENT_USER_ID,
    role: 'owner',
    status: 'active',
    joinedAt: FIXTURE_TIMESTAMP,
  },
  {
    id: 'membership-team-a-coworker',
    spaceId: coworkerSpace.id,
    userId: 'user-coworker',
    role: 'member',
    status: 'active',
    joinedAt: FIXTURE_TIMESTAMP,
  },
  {
    id: 'membership-team-a-coworker-2',
    spaceId: coworkerSpace.id,
    userId: 'user-coworker-2',
    role: 'member',
    status: 'active',
    joinedAt: FIXTURE_TIMESTAMP,
  },
  {
    id: 'membership-team-a-coworker-3',
    spaceId: coworkerSpace.id,
    userId: 'user-coworker-3',
    role: 'member',
    status: 'active',
    joinedAt: FIXTURE_TIMESTAMP,
  },
];

export const coworkerSharePolicies: SharePolicy[] = [
  createDefaultSharePolicy('coworker', {
    id: 'policy-team-a-me',
    spaceId: coworkerSpace.id,
    ownerUserId: MOCK_CURRENT_USER_ID,
    updatedAt: FIXTURE_TIMESTAMP,
  }),
];
