/**
 * Shared server-side helpers for the Vercel functions in /api (the "_lib" folder is not deployed as a route).
 * Relative imports use the ".js" extension on purpose: the project is ESM ("type": "module").
 */
import { randomBytes } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export interface Admin {
  auth: Auth;
  db: Firestore;
}

/** An error with an HTTP status. `code` is a stable, machine-readable reason the web app maps to a message. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Synthetic e-mail domain that links an Employee ID to its Firebase Auth account (server side only). */
export const EMAIL_DOMAIN = process.env.VITE_EMPLOYEE_EMAIL_DOMAIN || 'employees.busapp.local';
export const employeeEmail = (id: string) => `${id.toLowerCase()}@${EMAIL_DOMAIN}`;

/**
 * Firebase Auth still needs a password on every account, but nobody ever signs in with it any more (the web
 * app signs in with a custom token minted by /api/login). It is random, so it cannot be derived or guessed.
 */
export const randomPassword = () => randomBytes(32).toString('base64url');

export const ID_PATTERN = /^[A-Z0-9_-]{3,32}$/;

let cached: Admin | null = null;

export function getAdmin(): Admin {
  if (cached) return cached;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new HttpError(500, 'الخادم غير مُهيّأ: متغير FIREBASE_SERVICE_ACCOUNT مفقود.');
  let credential: ReturnType<typeof cert>;
  try {
    credential = cert(JSON.parse(raw));
  } catch {
    throw new HttpError(500, 'الخادم غير مُهيّأ: قيمة FIREBASE_SERVICE_ACCOUNT غير صالحة.');
  }
  const app = getApps()[0] ?? initializeApp({ credential });
  cached = { auth: getAuth(app), db: getFirestore(app) };
  return cached;
}
