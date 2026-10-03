import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchUser, logout, observeAuthState } from '../services/authService';
import type { User } from '../types';
import { toAppError } from '../utils/errors';

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: User };

interface AuthContextValue {
  state: AuthState;
  /** Set when a stored session could not be restored. */
  error: string | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);

  useEffect(() => {
    return observeAuthState((fbUser) => {
      const current = ++run.current;
      if (!fbUser) {
        setState({ status: 'signedOut' });
        return;
      }
      // A session appeared (fresh sign-in or restored): validate it against Firestore (role + employee link).
      // "loading" also takes the sign-in dialog off the screen while that check runs.
      setState({ status: 'loading' });
      fetchUser(fbUser.uid)
        .then(async (user) => {
          if (current !== run.current) return;
          if (!user) {
            // Set the message first: signing out immediately brings the sign-in dialog back.
            setError('هذا الحساب غير مفعّل لاستخدام التطبيق. تواصل مع المسؤول.');
            await logout();
            setState({ status: 'signedOut' });
            return;
          }
          setError(null);
          setState({ status: 'signedIn', user });
        })
        .catch((err) => {
          if (current !== run.current) return;
          setError(toAppError(err).message);
          setState({ status: 'signedOut' });
        });
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      error,
      logout: async () => {
        await logout();
        setState({ status: 'signedOut' });
      },
    }),
    [state, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
