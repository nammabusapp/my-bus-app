import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Keep reference to any early beforeinstallprompt event across route/view switches
let cachedDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    cachedDeferredPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((notify) => notify());
  });
  window.addEventListener('appinstalled', () => {
    cachedDeferredPrompt = null;
    promptListeners.forEach((notify) => notify());
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(cachedDeferredPrompt);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const checkStandalone = () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;

    setIsInstalled(checkStandalone());

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(isIOSDevice);

    const syncPrompt = () => {
      setDeferredPrompt(cachedDeferredPrompt);
      if (checkStandalone()) {
        setIsInstalled(true);
      }
    };
    promptListeners.add(syncPrompt);

    const handleAppInstalled = () => {
      cachedDeferredPrompt = null;
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      promptListeners.delete(syncPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    const promptEvent = deferredPrompt ?? cachedDeferredPrompt;
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      cachedDeferredPrompt = null;
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}
