import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

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

// These three MUST match src/config/constants.ts so the web app can sign in with just the ID.
const EMPLOYEE_EMAIL_DOMAIN = process.env.VITE_EMPLOYEE_EMAIL_DOMAIN || 'employees.busapp.local';
const EMPLOYEE_AUTH_SUFFIX = process.env.VITE_AUTH_SUFFIX || 'staff-bus-access';
export const ID_PATTERN = /^[A-Z0-9_-]{3,32}$/;

export const normalizeId = (raw: string) => raw.trim().toUpperCase();
export const employeeEmail = (id: string) => `${id.toLowerCase()}@${EMPLOYEE_EMAIL_DOMAIN}`;
export const employeePassword = (id: string) => `${id}::${EMPLOYEE_AUTH_SUFFIX}`;

/** Creates the Auth user or, when it already exists, resets its password. Returns the uid. */
export async function upsertAuthUser(id: string, displayName?: string): Promise<string> {
  const email = employeeEmail(id);
  const password = employeePassword(id);
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
