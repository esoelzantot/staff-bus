import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { EMAIL_DOMAIN, ID_PATTERN, employeeEmail, randomPassword } from '../../api/_lib/core.js';
import { hashPin } from '../../api/_lib/pin.js';

export const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
if (!projectId) {
  throw new Error('VITE_FIREBASE_PROJECT_ID is missing. Create .env from .env.example first.');
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error(
    'GOOGLE_APPLICATION_CREDENTIALS is missing. Point it at a service-account key (Firebase console → Project settings → Service accounts).',
  );
}

const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId });

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
export { FieldValue };

// The ID → Auth account mapping is shared with the /api functions (single source of truth).
export { EMAIL_DOMAIN, ID_PATTERN, employeeEmail };

export const normalizeId = (raw: string) => raw.trim().toUpperCase();

/**
 * Creates the Auth user or, when it already exists, gives it a fresh RANDOM password. Returns the uid.
 * Nobody signs in with that password: the web app signs in through /api/login (custom token), so a
 * derived / guessable password must never be set here.
 */
export async function upsertAuthUser(id: string, displayName?: string): Promise<string> {
  const email = employeeEmail(id);
  const password = randomPassword();
  try {
    const existing = await adminAuth.getUserByEmail(email);
    await adminAuth.updateUser(existing.uid, { password, displayName });
    return existing.uid;
  } catch (err) {
    if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
    const created = await adminAuth.createUser({ email, password, displayName, emailVerified: true });
    return created.uid;
  }
}

/** Stores the PIN (hashed) of a manager / admin in credentials/{uid} and lifts any lock on the account. */
export async function setPin(uid: string, pin: string): Promise<void> {
  await adminDb
    .collection('credentials')
    .doc(uid)
    .set({ pinHash: await hashPin(pin), updatedAt: FieldValue.serverTimestamp() });
  await adminDb.collection('loginAttempts').doc(`uid_${uid}`).delete();
}

export async function setUserProfile(
  uid: string,
  profile: { role: 'employee' | 'manager' | 'admin'; employeeDocId?: string },
): Promise<void> {
  const ref = adminDb.collection('users').doc(uid);
  const snap = await ref.get();
  await ref.set(
    {
      role: profile.role,
      ...(profile.employeeDocId ? { employeeDocId: profile.employeeDocId } : {}),
      ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
