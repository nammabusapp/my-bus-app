import { useCallback, useEffect, useState } from 'react';
import { OfflineIndicator } from './components/OfflineIndicator';
import { OperationsPortal } from './components/OperationsPortal';
import { UserPortal } from './components/UserPortal';
import { BusApproachingEventPayload, useMyBusRealtime } from './hooks/useMyBusRealtime';
import { AppLang, AppPortal, OpsMode, ThemeMode } from './types';
import { showLocalSWNotification } from './utils/pushNotifications';

function resolveRouteFromLocation(): { portal: AppPortal; opsMode: OpsMode } {
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();

  if (path.startsWith('/driver') || hash.startsWith('#/driver')) {
    return { portal: 'operations', opsMode: 'driver' };
  }
  if (
    path.startsWith('/admin') ||
    hash.startsWith('#/admin') ||
    path.startsWith('/ops') ||
    hash.startsWith('#/ops')
  ) {
    return { portal: 'operations', opsMode: 'admin' };
  }
  return { portal: 'user', opsMode: 'driver' };
}

function getInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem('mybus_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // Fallback to light
  }
  return 'light';
}

function getInitialLang(): AppLang {
  try {
    const saved = localStorage.getItem('mybus_lang');
    if (saved === 'kn' || saved === 'en') return saved;
  } catch {
    // Fallback to English
  }
  return 'en';
}

function UserPortalContainer({
  theme,
  onToggleTheme,
  lang,
  onToggleLang,
  onOpenOperations,
}: {
  theme: ThemeMode;
  onToggleTheme: () => void;
  lang: AppLang;
  onToggleLang: () => void;
  onOpenOperations: () => void;
}) {
  const [approachingEvent, setApproachingEvent] =
    useState<BusApproachingEventPayload | null>(null);

  const handleBusApproaching = useCallback(
    (payload: BusApproachingEventPayload) => {
      setApproachingEvent(payload);
      void showLocalSWNotification({
        title:
          payload.title ||
          `Bus ${payload.alert.busNo} approaching ${payload.alert.stopLabel}`,
        body: payload.body,
        tag: payload.tag,
        data: {
          driverId: payload.alert.driverId,
          busNo: payload.alert.busNo,
          stopLabel: payload.alert.stopLabel,
          url: `/?track=${encodeURIComponent(payload.alert.driverId)}`,
        },
      });
    },
    []
  );

  const { timings, liveBuses, loading } = useMyBusRealtime({
    role: 'user',
    onBusApproaching: handleBusApproaching,
  });

  return (
    <UserPortal
      timings={timings}
      liveBuses={liveBuses}
      loading={loading}
      theme={theme}
      onToggleTheme={onToggleTheme}
      lang={lang}
      onToggleLang={onToggleLang}
      onOpenOperations={onOpenOperations}
      approachingAlert={approachingEvent?.alert ?? null}
      onDismissApproachingAlert={() => setApproachingEvent(null)}
    />
  );
}

export default function App() {
  const [route, setRoute] = useState(resolveRouteFromLocation);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [lang, setLang] = useState<AppLang>(getInitialLang);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('mybus_theme', theme);
    } catch {
      // Ignore storage failures
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem('mybus_lang', lang);
    } catch {
      // Ignore storage failures
    }
  }, [lang]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const toggleLang = useCallback(() => {
    setLang((prev) => (prev === 'en' ? 'kn' : 'en'));
  }, []);

  useEffect(() => {
    const syncRoute = () => setRoute(resolveRouteFromLocation());
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  const navigateTo = useCallback((targetPath: string) => {
    window.history.pushState({}, '', targetPath);
    setRoute(resolveRouteFromLocation());
  }, []);

  return (
    <>
      {route.portal === 'operations' ? (
        <OperationsPortal
          initialMode={route.opsMode}
          theme={theme}
          onToggleTheme={toggleTheme}
          lang={lang}
          onToggleLang={toggleLang}
          onBackToUser={() => navigateTo('/')}
        />
      ) : (
        <UserPortalContainer
          theme={theme}
          onToggleTheme={toggleTheme}
          lang={lang}
          onToggleLang={toggleLang}
          onOpenOperations={() => navigateTo('/ops')}
        />
      )}
      <OfflineIndicator lang={lang} />
    </>
  );
}
