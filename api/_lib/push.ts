/** Shared Web Push helpers for /api/notify and /api/push-renew. */
import { createHash } from 'node:crypto';

/** Push services a subscription may point at (the server must never POST to arbitrary URLs). */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

export function isPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

/** pushSubscriptions/{id}: the same id the web app computes (src/services/pushService.ts subscriptionId). */
export const subscriptionDocId = (endpoint: string) =>
  createHash('sha256').update(endpoint).digest('hex').slice(0, 40);
