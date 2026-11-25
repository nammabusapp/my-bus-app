export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function isServiceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

export function isPushManagerSupported(): boolean {
  return (
    isNotificationSupported() &&
    isServiceWorkerSupported() &&
    'PushManager' in window
  );
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (!isNotificationSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function ensureServiceWorkerReady(
  timeoutMs = 5000
): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing && existing.active) {
      return existing;
    }
    const readyPromise = navigator.serviceWorker.ready;
    const timeoutPromise = new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), timeoutMs);
    });
    return await Promise.race([readyPromise, timeoutPromise]);
  } catch {
    return null;
  }
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/push/public-key');
    if (!res.ok) return null;
    const json = (await res.json()) as { publicKey?: string };
    return typeof json.publicKey === 'string' && json.publicKey.trim()
      ? json.publicKey.trim()
      : null;
  } catch {
    return null;
  }
}

export async function subscribeToStopPush(params: {
  sessionId: string;
  driverId: string;
  busNo: string;
  stopLabel: string;
  stopLat: number;
  stopLng: number;
  thresholdKm: number;
}): Promise<{
  ok: boolean;
  pushEnabled: boolean;
  permission: NotificationPermission | 'unsupported';
  error?: string;
}> {
  const permission = await requestNotificationPermission();
  let subscriptionJson: PushSubscriptionJSON | null = null;
  let pushEnabled = false;

  if (permission === 'granted' && isPushManagerSupported()) {
    try {
      const registration = await ensureServiceWorkerReady();
      if (registration && registration.pushManager) {
        let sub = await registration.pushManager.getSubscription();
        if (!sub) {
          const publicKey = await fetchVapidPublicKey();
          if (publicKey) {
            sub = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(publicKey),
            });
          }
        }
        if (sub) {
          subscriptionJson = sub.toJSON();
          pushEnabled = true;
        }
      }
    } catch {
      // Browser push service may be restricted in embedded/iframe environments;
      // server-side alert rule still activates via WebSocket + SW registration.showNotification.
      subscriptionJson = null;
      pushEnabled = false;
    }
  }

  try {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: params.sessionId,
        driverId: params.driverId,
        busNo: params.busNo,
        stopLabel: params.stopLabel,
        stopLat: params.stopLat,
        stopLng: params.stopLng,
        thresholdKm: params.thresholdKm,
        subscription: subscriptionJson,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        pushEnabled,
        permission,
        error: data.error || 'Could not register stop proximity alert.',
      };
    }
    return { ok: true, pushEnabled, permission };
  } catch {
    return {
      ok: false,
      pushEnabled,
      permission,
      error: 'Network error while saving stop proximity alert.',
    };
  }
}

export async function unsubscribeFromStopPush(
  sessionId: string,
  driverId: string
): Promise<boolean> {
  try {
    const res = await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, driverId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function showLocalSWNotification(params: {
  title: string;
  body: string;
  tag: string;
  data?: Record<string, unknown>;
}): Promise<boolean> {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  try {
    const registration = await ensureServiceWorkerReady(2000);
    if (registration) {
      await registration.showNotification(params.title, {
        body: params.body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: params.tag,
        data: params.data || {},
      });
      return true;
    }
  } catch {
    // Fallback to Window Notification below
  }

  try {
    new Notification(params.title, {
      body: params.body,
      icon: '/pwa-192x192.png',
      tag: params.tag,
    });
    return true;
  } catch {
    return false;
  }
}

export function listenForSWNotificationClicks(
  onClickData: (data: {
    driverId?: string;
    busNo?: string;
    stopLabel?: string;
  }) => void
): () => void {
  if (!isServiceWorkerSupported()) return () => {};

  const handler = (event: MessageEvent) => {
    const payload = event.data as {
      type?: string;
      data?: { driverId?: string; busNo?: string; stopLabel?: string };
    } | null;
    if (payload?.type === 'MYBUS_NOTIFICATION_CLICK' && payload.data) {
      onClickData(payload.data);
    }
  };

  navigator.serviceWorker.addEventListener('message', handler);
  return () => {
    navigator.serviceWorker.removeEventListener('message', handler);
  };
}
