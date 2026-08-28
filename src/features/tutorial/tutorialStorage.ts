import AsyncStorage from '@react-native-async-storage/async-storage';

import { getUserScopedStorageKey } from '../storage/userScopedStorageKey';

export const TUTORIAL_COMPLETION_STORAGE_KEY = 'modu-work.tutorial-completion.v1';
export const TUTORIAL_VERSION = 1;

type TutorialStorage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

type PersistedTutorialCompletion = {
  version: typeof TUTORIAL_VERSION;
  completed: true;
};

function isPersistedTutorialCompletion(value: unknown): value is PersistedTutorialCompletion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.version === TUTORIAL_VERSION && record.completed === true;
}

export function createTutorialCompletionStore(storage: TutorialStorage = AsyncStorage) {
  return {
    getStorageKey(userId: string) {
      return getUserScopedStorageKey(userId, TUTORIAL_COMPLETION_STORAGE_KEY);
    },
    async load(userId: string) {
      const raw = await storage.getItem(getUserScopedStorageKey(userId, TUTORIAL_COMPLETION_STORAGE_KEY));
      if (raw === null) return false;
      try {
        return isPersistedTutorialCompletion(JSON.parse(raw));
      } catch {
        return false;
      }
    },
    async complete(userId: string) {
      const value: PersistedTutorialCompletion = { version: TUTORIAL_VERSION, completed: true };
      await storage.setItem(getUserScopedStorageKey(userId, TUTORIAL_COMPLETION_STORAGE_KEY), JSON.stringify(value));
    },
  };
}

export const tutorialCompletionStore = createTutorialCompletionStore();

export function getEntryDestination(input: {
  hasSession: boolean;
  hasCompletedSetup: boolean;
  tutorialCompleted: boolean;
}) {
  if (!input.hasSession) return '/auth' as const;
  if (input.hasCompletedSetup) return '/(tabs)' as const;
  return input.tutorialCompleted ? '/onboarding' as const : '/tutorial' as const;
}
