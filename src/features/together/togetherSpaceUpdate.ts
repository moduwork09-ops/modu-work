import { isTogetherSpaceType, type TogetherSpaceType } from './types';

export const MAX_TOGETHER_SPACE_NAME_LENGTH = 30;

export type TogetherSpaceUpdate = {
  name: string;
  type: TogetherSpaceType;
};

export function normalizeTogetherSpaceUpdate(name: unknown, type: unknown): TogetherSpaceUpdate | null {
  if (typeof name !== 'string' || !isTogetherSpaceType(type)) return null;
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > MAX_TOGETHER_SPACE_NAME_LENGTH) return null;
  return { name: normalizedName, type };
}
