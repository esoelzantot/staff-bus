import { readFileSync } from 'node:fs';
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
checkServiceAccountKey(process.env.GOOGLE_APPLICATION_CREDENTIALS, projectId);

/**
 * Fails early with a message that says what is wrong with the key (empty secret, pasted half, wrong project…)
 * instead of the SDK's "Unexpected end of JSON input" or a later PERMISSION_DENIED.
 */
function checkServiceAccountKey(path: string, expectedProject: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8').trim();
  } catch {
    throw new Error(`The service-account key file "${path}" cannot be read.`);
  }
  if (!raw) {
    throw new Error(
      'The service-account key is EMPTY. On GitHub: Settings → Secrets and variables → Actions → set FIREBASE_SERVICE_ACCOUNT to the whole JSON key file.',
    );
  }
  let key: Record<string, unknown>;
  try {
    key = JSON.parse(raw);
  } catch {
    throw new Error(
      'The service-account key is not valid JSON (often only part of the file was pasted into the secret). Paste the WHOLE file, from { to }.',
    );
  }
  const missing = ['type', 'project_id', 'private_key', 'client_email'].filter((k) => typeof key[k] !== 'string');
  if (key.type !== 'service_account' || missing.length > 0) {
    throw new Error(`This is not a service-account key (missing: ${missing.join(', ') || 'type=service_account'}).`);
  }
  if (key.project_id !== expectedProject) {
    throw new Error(
      `The service-account key belongs to project "${String(key.project_id)}", but the reset targets "${expectedProject}".`,
    );
  }
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
