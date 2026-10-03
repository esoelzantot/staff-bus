/**
 * PIN hashing for manager / admin accounts (scrypt, per-PIN random salt, constant-time compare).
 * Used by /api/login (verify) and by the provisioning scripts (hash). Stored in credentials/{uid}, a
 * collection the Firestore rules deny to every client.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const N = 16_384;
const R = 8;
const P = 1;
const KEY_LEN = 64;

export const PIN_MIN_LENGTH = 6;
export const PIN_MAX_LENGTH = 64;

function derive(pin: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pin, salt, KEY_LEN, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Format: scrypt$N$r$p$<salt b64>$<hash b64> */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(pin, salt, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  try {
    const key = await derive(pin, Buffer.from(saltB64, 'base64'), { N: Number(n), r: Number(r), p: Number(p) });
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/** Returns an Arabic explanation when the PIN is too weak, otherwise null. */
export function pinProblem(pin: string, id: string): string | null {
  if (pin.length < PIN_MIN_LENGTH) return `الرقم السري لازم يكون ${PIN_MIN_LENGTH} خانات على الأقل.`;
  if (pin.length > PIN_MAX_LENGTH) return `الرقم السري أطول من ${PIN_MAX_LENGTH} خانة.`;
  if (pin.toUpperCase() === id.toUpperCase()) return 'الرقم السري لازم يكون مختلف عن رقم الموظف.';
  if (/^(.)\1+$/.test(pin)) return 'الرقم السري ضعيف (حرف أو رقم مكرر).';
  if (['123456', '1234567', '12345678', '654321', '000000', 'password', 'qwerty'].includes(pin.toLowerCase())) {
    return 'الرقم السري ضعيف جداً ومعروف.';
  }
  return null;
}
