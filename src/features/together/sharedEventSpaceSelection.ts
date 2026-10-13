import type { TogetherMember } from './togetherServerData';
import type { TogetherSpace } from './types';

export type SharedEventSpaceOption = {
  space: TogetherSpace;
  members: TogetherMember[];
};

export function selectActiveSharedEventSpaces(
  options: readonly SharedEventSpaceOption[],
  userId: string,
): SharedEventSpaceOption[] {
  return options.filter(({ members }) =>
    members.some((member) => member.userId === userId && member.status === 'active'));
}

export function chooseSharedEventSpaceId(
  options: readonly SharedEventSpaceOption[],
  routeSpaceId?: string,
  currentSpaceId?: string,
): string | undefined {
  const hasSpace = (id?: string) => id && options.some(({ space }) => space.id === id) ? id : undefined;
  return hasSpace(currentSpaceId) ?? hasSpace(routeSpaceId) ?? (options.length === 1 ? options[0].space.id : undefined);
}
