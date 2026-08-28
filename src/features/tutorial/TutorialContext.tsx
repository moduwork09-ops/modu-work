import { createContext, use, useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { tutorialCompletionStore } from './tutorialStorage';

type TutorialContextValue = {
  isCompleted: boolean;
  isLoading: boolean;
  completeTutorial: () => Promise<void>;
};

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function TutorialProvider({ children, ownerUserId }: PropsWithChildren<{ ownerUserId?: string }>) {
  const [isCompleted, setIsCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(ownerUserId));

  useEffect(() => {
    let active = true;
    setIsCompleted(false);

    if (!ownerUserId) {
      setIsLoading(false);
      return () => { active = false; };
    }

    setIsLoading(true);
    void tutorialCompletionStore.load(ownerUserId)
      .then((completed) => { if (active) setIsCompleted(completed); })
      .catch(() => { if (active) setIsCompleted(false); })
      .finally(() => { if (active) setIsLoading(false); });

    return () => { active = false; };
  }, [ownerUserId]);

  const completeTutorial = useCallback(async () => {
    if (!ownerUserId) throw new Error('Authenticated user is required');
    await tutorialCompletionStore.complete(ownerUserId);
    setIsCompleted(true);
  }, [ownerUserId]);

  const value = useMemo(() => ({ completeTutorial, isCompleted, isLoading }), [completeTutorial, isCompleted, isLoading]);
  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

export function useTutorial() {
  const context = use(TutorialContext);
  if (!context) throw new Error('useTutorial must be used within TutorialProvider');
  return context;
}
