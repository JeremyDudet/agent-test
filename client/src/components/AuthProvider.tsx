import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import useStore from '../store/useStore';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { login, logout } = useStore();

  useEffect(() => {
    console.log('[AUTH] AuthProvider mounted');
    
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[AUTH] Initial session:', session ? 'present' : 'missing');
      if (session) {
        setSession(session);
        setUser(session.user);
        // Sync with app state
        const userData = {
          id: session.user.id,
          email: session.user.email!,
          name: session.user.user_metadata.name || session.user.email!.split('@')[0],
          avatar: session.user.user_metadata.avatar,
        };
        login(userData, session.access_token);
      } else {
        logout();
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('[AUTH] Auth state changed:', _event, 'session:', session ? 'present' : 'missing');
      if (session) {
        setSession(session);
        setUser(session.user);
        // Sync with app state
        const userData = {
          id: session.user.id,
          email: session.user.email!,
          name: session.user.user_metadata.name || session.user.email!.split('@')[0],
          avatar: session.user.user_metadata.avatar,
        };
        login(userData, session.access_token);
      } else {
        setSession(null);
        setUser(null);
        logout();
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [login, logout]);

  return (
    <AuthContext.Provider value={{ session, user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
} 