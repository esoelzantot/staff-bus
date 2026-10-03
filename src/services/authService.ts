import { getDoc } from 'firebase/firestore';
import { EMPLOYEE_ID_PATTERN } from '../config/constants';
import { observeAuth, signInWithToken, signOutUser, userRef, type FirebaseUser } from '../firebase';
import type { Role, User } from '../types';
import { makeError, toAppError, type AppErrorCode } from '../utils/errors';

export const normalizeEmployeeId = (raw: string) => raw.trim().toUpperCase();

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

/** Reasons /api/login can answer with (see api/login.ts) that the UI has a dedicated message for. */
const LOGIN_ERROR_CODES: readonly AppErrorCode[] = [
  'invalid-credentials',
  'pin-required',
  'invalid-pin',
  'pin-not-set',
  'no-access',
  'locked',
  'too-many-requests',
];

/**
 * Asks the server to check the ID (and the PIN for managers / admins) and returns a Firebase custom token.
 * The browser never holds a credential that could be reused: there is no password derived from the ID.
 */
async function requestToken(id: string, pin: string | undefined): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, pin: pin || undefined }),
    });
  } catch {
    throw makeError('network');
  }

  const data = (await res.json().catch(() => null)) as { token?: string; error?: string; message?: string } | null;
  if (res.ok && data?.token) return data.token;

  if (res.status === 404 && !data) {
    throw makeError('unknown', 'خدمة تسجيل الدخول غير متاحة في هذه البيئة (تعمل على Vercel فقط – محلياً استخدم: npx vercel dev).');
  }
  const code = LOGIN_ERROR_CODES.find((c) => c === data?.error);
  throw code ? makeError(code) : makeError('unknown', res.status >= 500 ? data?.message : undefined);
}

/**
 * Signs in. Employees: Employee ID only. Managers / admins: Employee ID + PIN – when the PIN is missing
 * the promise rejects with code "pin-required" so the dialog can ask for it.
 * The session is picked up by AuthContext (onAuthStateChanged), which validates the role against Firestore.
 */
export async function loginWithId(rawId: string, pin?: string): Promise<void> {
  const id = normalizeEmployeeId(rawId);
  if (!EMPLOYEE_ID_PATTERN.test(id)) throw makeError('invalid-credentials');
  const token = await requestToken(id, pin);
  try {
    await signInWithToken(token);
  } catch (err) {
    throw toAppError(err);
  }
}

export const logout = () => signOutUser();

export const observeAuthState = (cb: (user: FirebaseUser | null) => void) => observeAuth(cb);
