import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface WindowWithDeferredPrompt extends Window {
  __mybusDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
}

// Keep reference to any early beforeinstallprompt event across route/view switches
let cachedDeferredPrompt: BeforeInstallPromptEvent | null =
  typeof window !== 'undefined'
    ? ((window as WindowWithDeferredPrompt).__mybusDeferredInstallPrompt ?? null)
    : null;
const promptListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    cachedDeferredPrompt = e as BeforeInstallPromptEvent;
    (window as WindowWithDeferredPrompt).__mybusDeferredInstallPrompt =
      cachedDeferredPrompt;
    promptListeners.forEach((notify) => notify());
  });
  window.addEventListener('appinstalled', () => {
    cachedDeferredPrompt = null;
    (window as WindowWithDeferredPrompt).__mybusDeferredInstallPrompt = null;
    promptListeners.forEach((notify) => notify());
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(cachedDeferredPrompt);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInAppOrIframe, setIsInAppOrIframe] = useState(false);

  useEffect(() => {
    const checkStandalone = () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;

    setIsInstalled(checkStandalone());

    // Pick up any prompt captured before hook mounted
    const globalPrompt =
      (window as WindowWithDeferredPrompt).__mybusDeferredInstallPrompt ?? null;
    if (globalPrompt && !cachedDeferredPrompt) {
      cachedDeferredPrompt = globalPrompt;
    }
    if (cachedDeferredPrompt) {
      setDeferredPrompt(cachedDeferredPrompt);
    }

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(isIOSDevice);

    const isEmbedded = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();
    const inAppBrowser =
      /wv|fbav|fban|instagram|line|whatsapp|gsa|micromessenger/.test(userAgent);
    setIsInAppOrIframe(isEmbedded || inAppBrowser);

    const syncPrompt = () => {
      setDeferredPrompt(cachedDeferredPrompt);
      if (checkStandalone()) {
        setIsInstalled(true);
      }
    };
    promptListeners.add(syncPrompt);

    const handleAppInstalled = () => {
      cachedDeferredPrompt = null;
      (window as WindowWithDeferredPrompt).__mybusDeferredInstallPrompt = null;
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      promptListeners.delete(syncPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async (): Promise<'installed' | 'dismissed' | 'unavailable'> => {
    const promptEvent =
      deferredPrompt ??
      cachedDeferredPrompt ??
      (window as WindowWithDeferredPrompt).__mybusDeferredInstallPrompt ??
      null;
    if (!promptEvent) return 'unavailable';
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      cachedDeferredPrompt = null;
      (window as WindowWithDeferredPrompt).__mybusDeferredInstallPrompt = null;
      setDeferredPrompt(null);
      if (outcome === 'accepted') {
        setIsInstalled(true);
        return 'installed';
      }
      return 'dismissed';
    } catch {
      cachedDeferredPrompt = null;
      (window as WindowWithDeferredPrompt).__mybusDeferredInstallPrompt = null;
      setDeferredPrompt(null);
      return 'unavailable';
    }
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isInAppOrIframe,
    install,
  };
}
