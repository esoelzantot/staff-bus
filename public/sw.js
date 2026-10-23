/*
 * Staff Bus service worker – shows the daily reminders sent by /api/notify (Web Push).
 * Deliberately NO caching / fetch handler: the app is always loaded fresh from the network, so a new version
 * reaches everyone immediately.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  // Every push MUST show a notification (iOS / Chrome revoke the permission otherwise).
  event.waitUntil(
    self.registration.showNotification(data.title || 'Staff Bus', {
      body: data.body || 'افتح التطبيق وحدّد IN أو OUT.',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag || 'reminder',
      renotify: true,
      lang: 'ar',
      dir: 'rtl',
      data: { url: data.url || '/' },
    }),
  );
});

// The browser renewed this device's push subscription on its own (can happen while the app is closed or nobody is
// signed in): subscribe again with the same key and hand the new one to the server, which moves the reminders over
// from the old one (api/push-renew.ts). Without this, the reminders of this device would silently stop.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      if (!old) return; // nothing to take over from – the employee turns the reminders on again in the app
      const fresh =
        event.newSubscription ||
        (await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: old.options.applicationServerKey,
        }));
      await fetch('/api/push-renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldEndpoint: old.endpoint, subscription: fresh.toJSON() }),
      });
    })().catch(() => undefined),
  );
});

// Tapping the reminder opens the app (or brings an open tab to the front).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) {
        await open.focus();
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
