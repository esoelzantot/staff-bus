import { getDoc } from 'firebase/firestore';
import { EMPLOYEE_AUTH_SUFFIX, EMPLOYEE_EMAIL_DOMAIN, EMPLOYEE_ID_PATTERN } from '../config/constants';
import { observeAuth, signInWithEmail, signOutUser, userRef, type FirebaseUser } from '../firebase';
import type { Role, User } from '../types';
import { makeError, toAppError } from '../utils/errors';

export const normalizeEmployeeId = (raw: string) => raw.trim().toUpperCase();

/** The Employee ID maps to a Firebase Auth account (synthetic e-mail + derived password). */
export const employeeIdToEmail = (id: string) => `${id.toLowerCase()}@${EMPLOYEE_EMAIL_DOMAIN}`;
export const employeeIdToPassword = (id: string) => `${id}::${EMPLOYEE_AUTH_SUFFIX}`;

const ROLES: readonly Role[] = ['employee', 'manager', 'admin'];

export async function fetchUser(uid: string): Promise<User | null> {
  const snap = await getDoc(userRef(uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (!ROLES.includes(data.role)) return null;
  return {
    uid,
    role: data.role as Role,
    employeeId: typeof data.employeeDocId === 'string' ? data.employeeDocId : null,
  };
}

/** Signs in with the Employee ID only. The account's role decides which screen opens. */
export async function loginWithId(rawId: string): Promise<User> {
  const id = normalizeEmployeeId(rawId);
  if (!EMPLOYEE_ID_PATTERN.test(id)) throw makeError('invalid-credentials');
  try {
    const fbUser = await signInWithEmail(employeeIdToEmail(id), employeeIdToPassword(id));
    const user = await fetchUser(fbUser.uid);
    if (!user) {
      await signOutUser();
      throw makeError('no-access');
    }
    return user;
  } catch (err) {
    throw toAppError(err);
  }
}

export const logout = () => signOutUser();

export const observeAuthState = (cb: (user: FirebaseUser | null) => void) => observeAuth(cb);
