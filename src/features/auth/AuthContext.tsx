import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useMemo, useState } from 'react';

import { supabase } from '../../lib/supabase';
import { setNotificationOwner } from '../notifications/notificationRuntime';
import { refreshTogetherPushRegistration, unregisterTogetherPushBeforeSignOut } from '../notifications/togetherPushClient';

type AuthResult = { error: Error | null };

type AuthContextValue = {
  isLoading: boolean;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let authEventReceived = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted || authEventReceived) return;
      void setNotificationOwner(data.session?.user.id ?? null).catch(() => console.warn('Unable to clear previous local notifications.'));
      setSession(data.session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      authEventReceived = true;
      void setNotificationOwner(nextSession?.user.id ?? null).catch(() => console.warn('Unable to clear previous local notifications.'));
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      session,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return { error };
      },
      signOut: async () => {
        const owner = session?.user.id;
        try {
          if (owner) await unregisterTogetherPushBeforeSignOut(owner);
        } catch {
          // A stale server token could deliver account A's event to account B on this device.
          return { error: new Error('푸시 알림 연결을 해제하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.') };
        }
        await setNotificationOwner(null);
        const { error } = await supabase.auth.signOut();
        if (error) {
          await setNotificationOwner(owner ?? null);
          if (owner) void refreshTogetherPushRegistration(owner).catch(() => {});
        }
        return { error };
      },
      signUp: async (email, password) => {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password });
        return { error };
      },
    }),
    [isLoading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = use(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
