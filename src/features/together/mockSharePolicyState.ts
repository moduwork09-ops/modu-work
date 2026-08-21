import { coworkerSharePolicies, familySharePolicies } from './fixtures';
import type { SharePolicy } from './types';

const policies = new Map<string, SharePolicy>(
  [...familySharePolicies, ...coworkerSharePolicies]
    .map((policy) => [getPolicyKey(policy.spaceId, policy.ownerUserId), { ...policy }]),
);

function getPolicyKey(spaceId: string, ownerUserId: string): string {
  return `${spaceId}:${ownerUserId}`;
}

export function getMockSharePolicy(spaceId: string, ownerUserId: string): SharePolicy | undefined {
  const policy = policies.get(getPolicyKey(spaceId, ownerUserId));
  return policy ? { ...policy } : undefined;
}

export function updateMockSharePolicy(policy: SharePolicy): void {
  policies.set(getPolicyKey(policy.spaceId, policy.ownerUserId), { ...policy });
}

export function hasMockSharePolicy(spaceId: string, ownerUserId: string): boolean {
  return policies.has(getPolicyKey(spaceId, ownerUserId));
}
