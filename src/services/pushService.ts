import { deleteDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { pushSubscriptionRef } from '../firebase';
import { AppError, makeError, toAppError } from '../utils/errors';

/**
 * Daily reminders (Web Push): 07:00 "Going IN / OUT?" and 16:00 "Returning IN / OUT?", Sunday – Thursday.
 * This device subscribes with the browser's push service; the subscription is stored in
 * pushSubscriptions/{id} and /api/notify sends to it. Nothing is sent from the browser itself.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

/** What the reminders card shows. */
export type PushState =
  /** VITE_VAPID_PUBLIC_KEY is not set for this build → the feature is hidden. */
  | 'not-configured'
  /** The browser has no Web Push (old browser, in-app browser…). */
  | 'unsupported'
  /** iPhone / iPad: Web Push works only once the app is added to the home screen and opened from there. */
  | 'needs-install'
  /** The user blocked notifications for the site. */
  | 'denied'
  | 'off'
  | 'on';

export interface PushOwner {
  uid: string;
  employeeId: string;
}

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const hasPushApis = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** The service worker that shows the reminders (public/sw.js). Registering again returns the same one. */
async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

/** Same device → same document id, so a device never registers twice. */
async function subscriptionId(endpoint: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

/** The VAPID key is base64url; the Push API wants the raw bytes. */
function keyBytes(base64url: string): Uint8Array {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function save(owner: PushOwner, subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw makeError('push-unavailable');
  await setDoc(pushSubscriptionRef(await subscriptionId(json.endpoint)), {
    uid: owner.uid,
    employeeId: owner.employeeId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    updatedAt: serverTimestamp(),
  });
}

export async function getPushState(): Promise<PushState> {
  if (!VAPID_PUBLIC_KEY) return 'not-configured';
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!hasPushApis()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const existing = await navigator.serviceWorker.getRegistration('/sw.js');
  return (await existing?.pushManager.getSubscription()) ? 'on' : 'off';
}

/**
 * Turns the reminders on for this device (must run from a tap: browsers only ask for permission then).
 * If the device is still registered for another employee (shared phone, no "تغيير الموظف"), a fresh
 * subscription is made for the current one.
 */
export async function enablePush(owner: PushOwner): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !hasPushApis()) throw makeError('push-unavailable');
  try {
    if ((await Notification.requestPermission()) !== 'granted') throw makeError('push-denied');
    const reg = await registration();
    const subscribe = () =>
      reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
    let subscription = (await reg.pushManager.getSubscription()) ?? (await subscribe());
    try {
      await save(owner, subscription);
    } catch (err) {
      if (!(toAppError(err).code === 'permission-denied')) throw err;
      await subscription.unsubscribe();
      subscription = await subscribe();
      await save(owner, subscription);
    }
  } catch (err) {
    throw err instanceof AppError ? err : toAppError(err, 'push-unavailable');
  }
}

/**
 * Re-saves this device's subscription when the app opens (the browser may have renewed it, or the employee signed
 * in again). Silent: never asks for permission, never throws.
 */
export async function syncPush(owner: PushOwner): Promise<void> {
  try {
    if ((await getPushState()) !== 'on') return;
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = await reg?.pushManager.getSubscription();
    if (subscription) await save(owner, subscription);
  } catch (err) {
    console.warn('Reminder subscription was not refreshed', err);
  }
}

/** Turns the reminders off for this device (also used by "تغيير الموظف", so the next person gets none). */
export async function disablePush(): Promise<void> {
  if (!hasPushApis()) return;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = await reg?.pushManager.getSubscription();
  if (!subscription) return;
  await deleteDoc(pushSubscriptionRef(await subscriptionId(subscription.endpoint))).catch(() => undefined);
  await subscription.unsubscribe();
}
