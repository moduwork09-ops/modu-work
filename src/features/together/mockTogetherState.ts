import {
  coworkerMemberships,
  coworkerSpace,
  familyMemberships,
  familySpace,
  MOCK_CURRENT_USER_ID,
} from './fixtures';
import { updateMockSharePolicy } from './mockSharePolicyState';
import { createDefaultSharePolicy } from './sharePolicy';
import type { TogetherMembership, TogetherSpace, TogetherSpaceType } from './types';

export type MockProfile = {
  displayName: string;
  initials: string;
  userId: string;
};

const initialSpaces = [familySpace, coworkerSpace];
const initialMemberships = [...familyMemberships, ...coworkerMemberships];

let spaces: TogetherSpace[] = initialSpaces.map((space) => ({ ...space }));
let memberships: TogetherMembership[] = initialMemberships.map((membership) => ({ ...membership }));
const profiles = new Map<string, MockProfile>([
  [MOCK_CURRENT_USER_ID, { userId: MOCK_CURRENT_USER_ID, displayName: '나', initials: '나' }],
  ['user-spouse', { userId: 'user-spouse', displayName: '배우자 민지', initials: '민' }],
  ['user-coworker', { userId: 'user-coworker', displayName: '동료 지', initials: '지' }],
  ['user-coworker-2', { userId: 'user-coworker-2', displayName: '동료 준', initials: '준' }],
  ['user-coworker-3', { userId: 'user-coworker-3', displayName: '동료 서', initials: '서' }],
]);
let sequence = 0;

export function getSpaces(): TogetherSpace[] {
  return spaces.map((space) => ({ ...space }));
}

export function getSpaceById(id: string): TogetherSpace | undefined {
  const space = spaces.find((item) => item.id === id);
  return space ? { ...space } : undefined;
}

export function getMemberships(spaceId: string): TogetherMembership[] {
  return memberships.filter((membership) => membership.spaceId === spaceId).map((membership) => ({ ...membership }));
}

export function getMockProfile(userId: string): MockProfile {
  return profiles.get(userId) ?? { userId, displayName: '함께하는 사람', initials: '함' };
}

export function createSpace(input: { name: string; type: TogetherSpaceType }): TogetherSpace {
  const now = new Date().toISOString();
  const suffix = `${Date.now()}-${++sequence}`;
  const space: TogetherSpace = {
    id: `mock-space-${suffix}`,
    name: input.name.trim(),
    type: input.type,
    createdBy: MOCK_CURRENT_USER_ID,
    createdAt: now,
  };
  const ownerMembership: TogetherMembership = {
    id: `mock-membership-owner-${suffix}`,
    spaceId: space.id,
    userId: MOCK_CURRENT_USER_ID,
    role: 'owner',
    status: 'active',
    joinedAt: now,
  };

  spaces = [...spaces, space];
  memberships = [...memberships, ownerMembership];
  updateMockSharePolicy(createDefaultSharePolicy(space.type, {
    id: `mock-policy-${suffix}`,
    spaceId: space.id,
    ownerUserId: MOCK_CURRENT_USER_ID,
    updatedAt: now,
  }));
  return { ...space };
}

export function addMockMember(spaceId: string): TogetherMembership {
  const memberNumber = getMemberships(spaceId).length;
  const userId = `mock-user-${Date.now()}-${++sequence}`;
  const now = new Date().toISOString();
  const membership: TogetherMembership = {
    id: `mock-membership-${userId}`,
    spaceId,
    userId,
    role: 'member',
    status: 'active',
    joinedAt: now,
  };
  profiles.set(userId, { userId, displayName: memberNumber === 1 ? '친구 김' : `함께하는 사람 ${memberNumber}`, initials: memberNumber === 1 ? '김' : '함' });
  memberships = [...memberships, membership];
  return { ...membership };
}

export function resetMockTogetherState(): void {
  spaces = initialSpaces.map((space) => ({ ...space }));
  memberships = initialMemberships.map((membership) => ({ ...membership }));
  sequence = 0;
}

export function generateMockInviteCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const prefix = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  return `${prefix}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
}
