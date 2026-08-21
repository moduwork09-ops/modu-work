import type { AuthError, Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useMemo, useState } from 'react';

import { supabase } from '../../lib/supabase';

type AuthResult = { error: AuthError | null };

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

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
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
        const { error } = await supabase.auth.signOut();
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
