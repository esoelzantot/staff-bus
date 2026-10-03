import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithCustomToken,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { firebaseApp } from './config';

export const auth = getAuth(firebaseApp);

// Persist the session across refreshes / browser restarts.
void setPersistence(auth, browserLocalPersistence);

export type { FirebaseUser };

/** Signs in with the custom token minted by /api/login (the browser never handles a password). */
export async function signInWithToken(token: string): Promise<FirebaseUser> {
  const credential = await signInWithCustomToken(auth, token);
  return credential.user;
}

export function signOutUser(): Promise<void> {
  return signOut(auth);
}

export function observeAuth(callback: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}
