/**
 * Shared server-side helpers for the Vercel functions in /api (the "_lib" folder is not deployed as a route).
 * Relative imports use the ".js" extension on purpose: the project is ESM ("type": "module").
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

/** Calendar day (yyyy-mm-dd) in Cairo, DST-aware – the "day" of every trip and every IN record. */
export function cairoDay(now: Date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

let cached: Admin | null = null;

export function getAdmin(): Admin {
  if (cached) return cached;
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  // Local development: reuse the key file the scripts already use (GOOGLE_APPLICATION_CREDENTIALS in .env).
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!raw && keyFile) {
    try {
      raw = readFileSync(resolve(process.cwd(), keyFile), 'utf8');
    } catch {
      throw new HttpError(500, `الخادم غير مُهيّأ: تعذّرت قراءة ملف المفتاح ${keyFile}.`);
    }
  }
  if (!raw) {
    throw new HttpError(
      500,
      'الخادم غير مُهيّأ: متغير FIREBASE_SERVICE_ACCOUNT مفقود (أو GOOGLE_APPLICATION_CREDENTIALS محلياً).',
    );
  }
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
