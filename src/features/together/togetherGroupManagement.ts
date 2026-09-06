export type TogetherGroupManagementAction = 'delete' | 'leave';

type MembershipLike = {
  role: string;
  status: string;
  userId: string;
};

export function getTogetherGroupManagementAction(
  members: MembershipLike[],
  userId?: string,
): TogetherGroupManagementAction | undefined {
  if (!userId) return undefined;
  const membership = members.find((member) => member.userId === userId && member.status === 'active');
  if (membership?.role === 'owner') return 'delete';
  if (membership?.role === 'member') return 'leave';
  return undefined;
}
