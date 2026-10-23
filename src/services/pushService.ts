import { deleteDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { pushSubscriptionRef } from '../firebase';
import { AppError, makeError, toAppError } from '../utils/errors';

/**
 * Daily reminders (Web Push): 07:00 "Going IN / OUT?" and 16:00 "Returning IN / OUT?", Sunday – Thursday.
 * This device subscribes with the browser's push service; the subscription is stored in
 * pushSubscriptions/{id} and /api/notify sends to it. Nothing is sent from the browser itself.
 *
 * The choice is PERSISTENT: once an employee turns the reminders on, they keep arriving on this device whether
 * the app is open or closed, and also after "تغيير الموظف" (signing out) – until the employee taps
 * "إيقاف التنبيهات", or another employee turns them on for themselves on the same device.
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
  /** This device receives the reminders of ANOTHER employee (shared phone); "فعّل" moves them to the current one. */
  | 'other-user'
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

const isPermissionDenied = (err: unknown) => toAppError(err).code === 'permission-denied';

/**
 * The reminders' state on this device for `owner`. When the device is subscribed, the subscription is saved
 * again for the signed-in employee: it keeps pushSubscriptions current (the browser may have renewed it, or the
 * server removed it after a failed send) and tells whether it belongs to this employee or to a colleague
 * (the rules only let the owner write it).
 */
export async function getPushState(owner?: PushOwner): Promise<PushState> {
  if (!VAPID_PUBLIC_KEY) return 'not-configured';
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!hasPushApis()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = await reg?.pushManager.getSubscription();
  if (!subscription) return 'off';
  if (!owner) return 'on';
  try {
    await save(owner, subscription);
    return 'on';
  } catch (err) {
    if (isPermissionDenied(err)) return 'other-user';
    console.warn('Reminder subscription was not refreshed', err);
    return 'on'; // offline / transient: the stored subscription is still there
  }
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
      if (!isPermissionDenied(err)) throw err;
      await subscription.unsubscribe();
      subscription = await subscribe();
      await save(owner, subscription);
    }
  } catch (err) {
    throw err instanceof AppError ? err : toAppError(err, 'push-unavailable');
  }
}

/** Turns the reminders off for this device ("إيقاف التنبيهات" – the only thing that does). */
export async function disablePush(): Promise<void> {
  if (!hasPushApis()) return;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = await reg?.pushManager.getSubscription();
  if (!subscription) return;
  await deleteDoc(pushSubscriptionRef(await subscriptionId(subscription.endpoint))).catch(() => undefined);
  await subscription.unsubscribe();
}
