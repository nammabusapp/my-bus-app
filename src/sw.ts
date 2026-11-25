import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

interface PrecacheEntry {
  url: string;
  revision: string | null;
}

interface SWNotificationOptions {
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  renotify?: boolean;
  vibrate?: number[];
  data?: Record<string, unknown>;
}

interface SWClient {
  id: string;
  url: string;
  focused?: boolean;
  focus?: () => Promise<SWClient>;
  postMessage: (message: unknown) => void;
}

interface SWRegistration {
  showNotification: (title: string, options?: SWNotificationOptions) => Promise<void>;
}

interface SWClients {
  claim: () => Promise<void>;
  matchAll: (options?: { type?: string; includeUncontrolled?: boolean }) => Promise<SWClient[]>;
  openWindow: (url: string) => Promise<SWClient | null>;
}

interface SWExtendableEvent extends Event {
  waitUntil: (promise: Promise<unknown>) => void;
}

interface SWPushEvent extends SWExtendableEvent {
  data: {
    json: () => unknown;
    text: () => string;
  } | null;
}

interface SWNotificationEvent extends SWExtendableEvent {
  notification: {
    data?: Record<string, unknown>;
    close: () => void;
  };
}

declare global {
  interface Window {
    __WB_MANIFEST: Array<PrecacheEntry | string>;
  }
}

interface SWGlobalScope {
  registration: SWRegistration;
  clients: SWClients;
  location: Location;
  skipWaiting: () => Promise<void>;
  addEventListener: {
    (type: 'install' | 'activate', listener: (event: SWExtendableEvent) => void): void;
    (type: 'push', listener: (event: SWPushEvent) => void): void;
    (type: 'notificationclick', listener: (event: SWNotificationEvent) => void): void;
  };
}

const sw = self as unknown as SWGlobalScope;

cleanupOutdatedCaches();
const manifestEntries = self.__WB_MANIFEST || [];
precacheAndRoute(manifestEntries);

if (manifestEntries.length > 0) {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('/index.html'), {
      denylist: [/^\/api\//],
    })
  );
}

registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/i,
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

registerRoute(
  /\/api\/timings$/i,
  new NetworkFirst({
    cacheName: 'mybus-timings-api',
    networkTimeoutSeconds: 4,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 5,
        maxAgeSeconds: 60 * 60 * 24,
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

registerRoute(
  /^https:\/\/[a-c]\.tile\.openstreetmap\.org\/.*/i,
  new StaleWhileRevalidate({
    cacheName: 'osm-tiles-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 7,
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

sw.addEventListener('install', () => {
  void sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(sw.clients.claim());
});

sw.addEventListener('push', (event) => {
  let title = 'My Bus — Bus Approaching';
  let body = 'Your tracked bus is approaching your selected stop.';
  let tag = 'mybus-approaching';
  let data: Record<string, unknown> = { url: '/' };

  if (event.data) {
    try {
      const parsed = event.data.json() as Record<string, unknown>;
      if (typeof parsed.title === 'string' && parsed.title.trim()) {
        title = parsed.title;
      }
      if (typeof parsed.body === 'string' && parsed.body.trim()) {
        body = parsed.body;
      }
      if (typeof parsed.tag === 'string' && parsed.tag.trim()) {
        tag = parsed.tag;
      }
      data = {
        driverId: parsed.driverId,
        busNo: parsed.busNo,
        stopLabel: parsed.stopLabel,
        distanceKm: parsed.distanceKm,
        etaMinutes: parsed.etaMinutes,
        url: typeof parsed.url === 'string' ? parsed.url : '/',
      };
    } catch {
      const text = event.data.text();
      if (text) body = text;
    }
  }

  event.waitUntil(
    sw.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag,
      renotify: true,
      vibrate: [200, 100, 200],
      data,
    })
  );
});

sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl =
    typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';

  event.waitUntil(
    sw.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(sw.location.origin)) {
            if (typeof client.focus === 'function') {
              await client.focus();
            }
            client.postMessage({
              type: 'MYBUS_NOTIFICATION_CLICK',
              data,
            });
            return;
          }
        }
        await sw.clients.openWindow(targetUrl);
      })
  );
});
