import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bus,
  CheckCircle2,
  Clock,
  Compass,
  Edit3,
  Keyboard,
  LogOut,
  MapPin,
  Navigation,
  Plus,
  Radio,
  ShieldCheck,
  Square,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useMyBusRealtime } from '../hooks/useMyBusRealtime';
import { TRANSLATIONS } from '../i18n/translations';
import {
  AdminSubView,
  AppLang,
  BusIncidentStatus,
  BusTiming,
  DriverProfile,
  LiveBus,
  OpsMode,
  ThemeMode,
} from '../types';
import {
  KANNADA_STOP_SUGGESTIONS,
  transliterateToKannada,
} from '../utils/kannada';
import { LanguageToggle } from './LanguageToggle';
import { LiveTransitMap } from './LiveTransitMap';
import { PWAInstallButton } from './PWAInstallButton';
import { ThemeToggle } from './ThemeToggle';

type DriverStep = 'login' | 'permission' | 'route';

const INCIDENT_STATUSES: BusIncidentStatus[] = [
  'Normal',
  'Delayed',
  'Punctured',
  'Breakdown',
  'Accident',
  'Road Block',
];

interface TimingFormState {
  id?: string;
  busNo: string;
  startPoint: string;
  endPoint: string;
  stopsText: string;
  departureTime: string;
  arrivalTime: string;
  frequency: string;
  status: 'On Time' | 'Delayed' | 'Scheduled';
}

const EMPTY_FORM: TimingFormState = {
  busNo: '',
  startPoint: '',
  endPoint: '',
  stopsText: '',
  departureTime: '08:00',
  arrivalTime: '08:45',
  frequency: 'Every 20 min',
  status: 'On Time',
};

interface OperationsPortalProps {
  initialMode: OpsMode;
  theme: ThemeMode;
  onToggleTheme: () => void;
  lang: AppLang;
  onToggleLang: () => void;
  onBackToUser: () => void;
}

export function OperationsPortal({
  initialMode,
  theme,
  onToggleTheme,
  lang,
  onToggleLang,
  onBackToUser,
}: OperationsPortalProps) {
  const t = TRANSLATIONS[lang];
  const [mode, setMode] = useState<OpsMode>(initialMode);
  const [kannadaInputEnabled, setKannadaInputEnabled] = useState(false);

  const applyKannadaInput = useCallback(
    (value: string) =>
      kannadaInputEnabled ? transliterateToKannada(value) : value,
    [kannadaInputEnabled]
  );

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // --- DRIVER STATE ---
  const [driver, setDriver] = useState<DriverProfile | null>(() => {
    try {
      const saved = sessionStorage.getItem('mybus_driver_profile');
      return saved ? (JSON.parse(saved) as DriverProfile) : null;
    } catch {
      return null;
    }
  });
  const [driverStep, setDriverStep] = useState<DriverStep>(() =>
    driver ? 'permission' : 'login'
  );
  const [driverAuthMode, setDriverAuthMode] = useState<'login' | 'register'>(
    'login'
  );
  const [driverIdInput, setDriverIdInput] = useState('DRV-101');
  const [pinInput, setPinInput] = useState('1234');
  const [nameInput, setNameInput] = useState('');
  const [busNoInput, setBusNoInput] = useState('');
  const [driverAuthError, setDriverAuthError] = useState<string | null>(null);
  const [driverAuthLoading, setDriverAuthLoading] = useState(false);

  const [permissionStatus, setPermissionStatus] = useState<
    'idle' | 'requesting' | 'granted' | 'denied'
  >('idle');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{
    lat: number;
    lng: number;
    heading: number | null;
    speedMs: number | null;
  } | null>(null);

  // Route Places State
  const [startPoint, setStartPoint] = useState('Central Station');
  const [endPoint, setEndPoint] = useState('Airport Terminal 2');
  const [routeStops, setRouteStops] = useState<string[]>(['City Market']);
  const [savedStopFlashIdx, setSavedStopFlashIdx] = useState<number | null>(
    null
  );
  const stopInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Bus Incident Status State
  const [busStatus, setBusStatus] = useState<BusIncidentStatus>('Normal');
  const [statusNote, setStatusNote] = useState('');
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  const [isSharing, setIsSharing] = useState(false);
  const [sharingBanner, setSharingBanner] = useState<string | null>(null);

  // --- ADMIN STATE ---
  const [adminToken, setAdminToken] = useState<string | null>(() =>
    sessionStorage.getItem('mybus_admin_token')
  );
  const [adminEmail, setAdminEmail] = useState<string>(
    () => sessionStorage.getItem('mybus_admin_email') || ''
  );
  const [emailInput, setEmailInput] = useState('admin@mybus.app');
  const [passwordInput, setPasswordInput] = useState('admin123');
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);
  const [adminSubView, setAdminSubView] = useState<AdminSubView>('dashboard');
  const [selectedLiveBusId, setSelectedLiveBusId] = useState<string | null>(
    null
  );
  const [adminActionMsg, setAdminActionMsg] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [formState, setFormState] = useState<TimingFormState>(EMPTY_FORM);
  const [savingTiming, setSavingTiming] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const livePayloadRef = useRef({
    startPoint,
    endPoint,
    routeStops,
    busStatus,
    statusNote,
  });
  livePayloadRef.current = {
    startPoint,
    endPoint,
    routeStops,
    busStatus,
    statusNote,
  };

  const stopGpsWatch = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const handleForceStopped = useCallback(
    (reason: string) => {
      stopGpsWatch();
      setIsSharing(false);
      setSharingBanner(reason);
    },
    [stopGpsWatch]
  );

  const {
    timings,
    liveBuses,
    stats,
    sendDriverLocation,
    sendDriverStatus,
    sendDriverStop,
    refresh,
  } = useMyBusRealtime({
    role: mode === 'driver' ? 'driver' : 'admin',
    driverId: driver?.driverId,
    onForceStopped: handleForceStopped,
  });

  useEffect(() => {
    return () => {
      stopGpsWatch();
    };
  }, [stopGpsWatch]);

  // --- DRIVER AUTH & GPS PERMISSION ---
  const handleDriverAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setDriverAuthError(null);
    setDriverAuthLoading(true);
    try {
      const endpoint =
        driverAuthMode === 'login'
          ? '/api/driver/login'
          : '/api/driver/register';
      const body =
        driverAuthMode === 'login'
          ? { driverId: driverIdInput, pin: pinInput }
          : {
              driverId: driverIdInput,
              name: nameInput,
              busNo: busNoInput,
              pin: pinInput,
            };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setDriverAuthError(data.error || 'Authentication failed.');
        setDriverAuthLoading(false);
        return;
      }
      sessionStorage.setItem(
        'mybus_driver_profile',
        JSON.stringify(data.driver)
      );
      setDriver(data.driver);
      setDriverStep('permission');
    } catch {
      setDriverAuthError('Network error while connecting to server.');
    } finally {
      setDriverAuthLoading(false);
    }
  };

  const requestLocationPermission = () => {
    if (!navigator.geolocation) {
      setPermissionStatus('denied');
      setPermissionError('Geolocation is not supported in this browser.');
      return;
    }
    setPermissionStatus('requesting');
    setPermissionError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading:
            typeof pos.coords.heading === 'number' &&
            !Number.isNaN(pos.coords.heading)
              ? pos.coords.heading
              : null,
          speedMs:
            typeof pos.coords.speed === 'number' &&
            !Number.isNaN(pos.coords.speed)
              ? pos.coords.speed
              : null,
        });
        setPermissionStatus('granted');
        setDriverStep('route');
      },
      (err) => {
        setPermissionStatus('denied');
        setPermissionError(
          err.code === err.PERMISSION_DENIED
            ? 'Location access was denied. Enable location permissions in your browser settings and try again.'
            : 'Unable to acquire GPS signal. Please check your device location settings and retry.'
        );
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  // --- ROUTE PLACES ENTER-TO-SAVE & ADD BLOCK ---
  const handleAddRoutePlace = (insertAfterIdx?: number) => {
    const targetIdx =
      typeof insertAfterIdx === 'number'
        ? insertAfterIdx + 1
        : routeStops.length;
    setRouteStops((prev) => {
      const next = [...prev];
      next.splice(targetIdx, 0, '');
      return next;
    });
    setTimeout(() => {
      stopInputRefs.current[targetIdx]?.focus();
    }, 20);
  };

  const handleRoutePlaceKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    idx: number
  ) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const trimmed = routeStops[idx]?.trim() ?? '';
    const updatedStops = routeStops.map((s, i) => (i === idx ? trimmed : s));
    const nextIdx = idx + 1;
    updatedStops.splice(nextIdx, 0, '');
    setRouteStops(updatedStops);

    if (trimmed) {
      setSavedStopFlashIdx(idx);
      setTimeout(() => {
        setSavedStopFlashIdx((cur) => (cur === idx ? null : cur));
      }, 1200);
    }

    if (isSharing && driver && currentCoords && startPoint.trim() && endPoint.trim()) {
      void sendDriverLocation({
        driverId: driver.driverId,
        driverName: driver.name,
        busNo: driver.busNo,
        startPoint: startPoint.trim(),
        endPoint: endPoint.trim(),
        routeStops: updatedStops.map((s) => s.trim()).filter(Boolean),
        ...currentCoords,
        busStatus,
        statusNote: statusNote.trim(),
      });
    }

    setTimeout(() => {
      stopInputRefs.current[nextIdx]?.focus();
    }, 20);
  };

  const handleUpdateBusStatus = async () => {
    setStatusFeedback(null);
    if (!driver) return;
    const statusLabel = t.incidentLabels[busStatus] || busStatus;
    if (isSharing) {
      await sendDriverStatus({
        driverId: driver.driverId,
        busStatus,
        statusNote: statusNote.trim(),
      });
      setStatusFeedback(
        lang === 'kn'
          ? `ನೇರ ಸ್ಥಿತಿ "${statusLabel}" ಗೆ ನವೀಕರಿಸಲಾಗಿದೆ.`
          : `Live status updated to "${statusLabel}".`
      );
    } else {
      setStatusFeedback(
        lang === 'kn'
          ? `ಸ್ಥಿತಿ "${statusLabel}" ಎಂದು ಸಿದ್ಧಪಡಿಸಲಾಗಿದೆ — ಹಂಚಿಕೆ ಪ್ರಾರಂಭಿಸಿದಾಗ ಕಳುಹಿಸಲಾಗುತ್ತದೆ.`
          : `Status set to "${statusLabel}" — it will be broadcast when you start sharing.`
      );
    }
  };

  const handleStartSharing = () => {
    if (!driver) return;
    if (!startPoint.trim() || !endPoint.trim()) {
      setSharingBanner(
        lang === 'kn'
          ? 'ದಯವಿಟ್ಟು ಪ್ರಾರಂಭದ ಸ್ಥಳ ಮತ್ತು ತಲುಪುವ ಸ್ಥಳ ಎರಡನ್ನೂ ನಮೂದಿಸಿ.'
          : 'Please enter both Starting Point and Ending Point before sharing.'
      );
      return;
    }
    if (!navigator.geolocation) {
      setSharingBanner(
        lang === 'kn'
          ? 'ಈ ಸಾಧನದಲ್ಲಿ GPS ಲಭ್ಯವಿಲ್ಲ.'
          : 'Geolocation is unavailable on this device.'
      );
      return;
    }

    setSharingBanner(null);
    setIsSharing(true);

    const publishFix = (pos: GeolocationPosition) => {
      const coords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading:
          typeof pos.coords.heading === 'number' &&
          !Number.isNaN(pos.coords.heading)
            ? pos.coords.heading
            : null,
        speedMs:
          typeof pos.coords.speed === 'number' && !Number.isNaN(pos.coords.speed)
            ? pos.coords.speed
            : null,
      };
      setCurrentCoords(coords);
      void sendDriverLocation({
        driverId: driver.driverId,
        driverName: driver.name,
        busNo: driver.busNo,
        startPoint: livePayloadRef.current.startPoint.trim(),
        endPoint: livePayloadRef.current.endPoint.trim(),
        routeStops: livePayloadRef.current.routeStops
          .map((s) => s.trim())
          .filter(Boolean),
        ...coords,
        busStatus: livePayloadRef.current.busStatus,
        statusNote: livePayloadRef.current.statusNote.trim(),
      });
    };

    if (currentCoords) {
      void sendDriverLocation({
        driverId: driver.driverId,
        driverName: driver.name,
        busNo: driver.busNo,
        startPoint: startPoint.trim(),
        endPoint: endPoint.trim(),
        routeStops: routeStops.map((s) => s.trim()).filter(Boolean),
        ...currentCoords,
        busStatus,
        statusNote: statusNote.trim(),
      });
    }

    stopGpsWatch();
    watchIdRef.current = navigator.geolocation.watchPosition(
      publishFix,
      (err) => {
        setSharingBanner(`GPS tracking warning: ${err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
  };

  const handleStopSharing = async () => {
    stopGpsWatch();
    setIsSharing(false);
    setSharingBanner('Live location sharing stopped.');
    if (driver) {
      await sendDriverStop(driver.driverId);
    }
  };

  const handleDriverLogout = async () => {
    if (isSharing && driver) {
      await handleStopSharing();
    }
    sessionStorage.removeItem('mybus_driver_profile');
    setDriver(null);
    setDriverStep('login');
  };

  // --- ADMIN HANDLERS ---
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminLoginError(null);
    setAdminLoginLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput, password: passwordInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAdminLoginError(data.error || 'Invalid credentials.');
        setAdminLoginLoading(false);
        return;
      }
      sessionStorage.setItem('mybus_admin_token', data.token);
      sessionStorage.setItem('mybus_admin_email', data.admin.email);
      setAdminToken(data.token);
      setAdminEmail(data.admin.email);
      setAdminSubView('dashboard');
    } catch {
      setAdminLoginError('Unable to reach server.');
    } finally {
      setAdminLoginLoading(false);
    }
  };

  const handleAdminLogout = () => {
    sessionStorage.removeItem('mybus_admin_token');
    sessionStorage.removeItem('mybus_admin_email');
    setAdminToken(null);
    setAdminEmail('');
    setAdminSubView('dashboard');
  };

  const handleStopDriverSharing = async (driverId: string, busNo: string) => {
    if (!adminToken) return;
    setAdminActionMsg(null);
    try {
      const res = await fetch(
        `/api/admin/stop-bus/${encodeURIComponent(driverId)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      if (res.status === 401) {
        handleAdminLogout();
        return;
      }
      if (res.ok) {
        setAdminActionMsg(
          `Stopped live location sharing for Bus ${busNo} (${driverId}).`
        );
      }
    } catch {
      setAdminActionMsg('Failed to stop driver sharing.');
    }
  };

  const handleSaveTiming = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    setSavingTiming(true);
    setFormError(null);

    const payload = {
      busNo: formState.busNo.trim(),
      startPoint: formState.startPoint.trim(),
      endPoint: formState.endPoint.trim(),
      stops: formState.stopsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      departureTime: formState.departureTime.trim(),
      arrivalTime: formState.arrivalTime.trim(),
      frequency: formState.frequency.trim(),
      status: formState.status,
    };

    try {
      const url = formState.id
        ? `/api/timings/${encodeURIComponent(formState.id)}`
        : '/api/timings';
      const method = formState.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        handleAdminLogout();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Could not save bus timing.');
        setSavingTiming(false);
        return;
      }
      setEditorOpen(false);
      await refresh();
    } catch {
      setFormError('Network error while saving timing.');
    } finally {
      setSavingTiming(false);
    }
  };

  const handleDeleteTiming = async (id: string) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/timings/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 401) {
        handleAdminLogout();
        return;
      }
      await refresh();
    } catch {
      // Handled gracefully
    }
  };

  const currentDriverBus: LiveBus | undefined = driver
    ? liveBuses.find((b) => b.driverId === driver.driverId)
    : undefined;

  const driverMapBuses: LiveBus[] = currentDriverBus
    ? [currentDriverBus]
    : driver && currentCoords
    ? [
        {
          driverId: driver.driverId,
          driverName: driver.name,
          busNo: driver.busNo,
          startPoint: startPoint || 'Origin',
          endPoint: endPoint || 'Destination',
          routeStops: routeStops.filter(Boolean),
          lat: currentCoords.lat,
          lng: currentCoords.lng,
          heading: currentCoords.heading,
          speedKmh:
            typeof currentCoords.speedMs === 'number'
              ? Math.round(currentCoords.speedMs * 3.6)
              : 0,
          directionText: 'Ready to share',
          busStatus,
          statusNote,
          updatedAt: Date.now(),
        },
      ]
    : [];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onBackToUser}
              aria-label={t.riderApp}
              className="min-w-[44px] min-h-[44px] px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{t.riderApp}</span>
            </button>
            <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
              {t.operationsTitle}
            </span>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setMode('driver')}
              className={`min-h-[36px] px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'driver'
                  ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.driverTab}
            </button>
            <button
              type="button"
              onClick={() => setMode('admin')}
              className={`min-h-[36px] px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'admin'
                  ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.adminTab}
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton lang={lang} />
            <LanguageToggle lang={lang} onToggle={onToggleLang} />
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </div>
      </header>

      <datalist id="mybus-ops-kannada-stops">
        {KANNADA_STOP_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {/* ==================== DRIVER CONSOLE ==================== */}
      {mode === 'driver' && (
        <main className="flex-1 flex flex-col">
          {driverStep === 'login' || !driver ? (
            <div className="flex-1 flex items-center justify-center px-4 py-10">
              <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs">
                <div className="mb-6">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">
                    {t.driverDispatch}
                  </p>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                    {driverAuthMode === 'login'
                      ? t.driverSignIn
                      : t.registerDriver}
                  </h1>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {lang === 'kn'
                      ? 'ಮಾರ್ಗದ ವಿವರಗಳನ್ನು ನಮೂದಿಸಿ ನೇರ GPS ಮತ್ತು ಬಸ್ ಸ್ಥಿತಿ ಹಂಚಲು ನಿಮ್ಮ ಚಾಲಕ ID ಮತ್ತು PIN ಬಳಸಿ ಲಾಗಿನ್ ಆಗಿ.'
                      : 'Sign in with your Driver ID and PIN to enter your route stops and share live bus GPS and status updates.'}
                  </p>
                </div>

                <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg mb-5">
                  <button
                    type="button"
                    onClick={() => {
                      setDriverAuthMode('login');
                      setDriverAuthError(null);
                    }}
                    className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      driverAuthMode === 'login'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {t.signIn}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDriverAuthMode('register');
                      setDriverAuthError(null);
                    }}
                    className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      driverAuthMode === 'register'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {t.newDriver}
                  </button>
                </div>

                <form onSubmit={handleDriverAuth} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      {t.driverId}
                    </label>
                    <input
                      type="text"
                      required
                      value={driverIdInput}
                      onChange={(e) => setDriverIdInput(e.target.value)}
                      placeholder="e.g. DRV-101"
                      className="w-full min-h-[44px] px-3.5 py-2.5 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  {driverAuthMode === 'register' && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          {t.driverName}
                        </label>
                        <input
                          type="text"
                          required
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          placeholder={lang === 'kn' ? 'ಪೂರ್ಣ ಹೆಸರು' : 'Full name'}
                          className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          {t.assignedBusNo}
                        </label>
                        <input
                          type="text"
                          required
                          value={busNoInput}
                          onChange={(e) => setBusNoInput(e.target.value)}
                          placeholder="e.g. 105-B"
                          className="w-full min-h-[44px] px-3.5 py-2.5 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      {t.pin}
                    </label>
                    <input
                      type="password"
                      required
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder="4-digit PIN"
                      className="w-full min-h-[44px] px-3.5 py-2.5 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  {driverAuthError && (
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">
                      {driverAuthError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={driverAuthLoading}
                    className="w-full min-h-[48px] bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    {driverAuthLoading
                      ? '...'
                      : driverAuthMode === 'login'
                      ? t.continueToLocation
                      : t.createDriverAccount}
                  </button>
                </form>

                <p className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  Demo IDs: <span className="font-mono">DRV-101</span>,{' '}
                  <span className="font-mono">DRV-102</span>,{' '}
                  <span className="font-mono">DRV-103</span> (PIN:{' '}
                  <span className="font-mono">1234</span>)
                </p>
              </div>
            </div>
          ) : driverStep === 'permission' ? (
            <div className="flex-1 flex items-center justify-center px-4 py-10">
              <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 text-center">
                <div className="flex items-center justify-between mb-6 text-xs text-slate-500 dark:text-slate-400">
                  <button
                    type="button"
                    onClick={handleDriverLogout}
                    className="min-h-[40px] px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{t.signOut}</span>
                  </button>
                  <span className="font-mono">
                    {driver.driverId} · Bus {driver.busNo}
                  </span>
                </div>

                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-400 flex items-center justify-center mx-auto mb-5">
                  <MapPin className="w-7 h-7" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                  {t.locationPermissionTitle}
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                  {t.locationPermissionDesc} (
                  <strong className="font-mono text-slate-900 dark:text-white">
                    {driver.busNo}
                  </strong>
                  )
                </p>

                {permissionError && (
                  <div className="mb-5 p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 text-left">
                    {permissionError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={requestLocationPermission}
                  disabled={permissionStatus === 'requesting'}
                  className="w-full min-h-[48px] bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Navigation className="w-4 h-4" />
                  <span>
                    {permissionStatus === 'requesting'
                      ? t.locating
                      : t.allowLocationAccess}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-4 sm:py-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isSharing) setDriverStep('permission');
                    }}
                    disabled={isSharing}
                    className="min-w-[44px] min-h-[44px] px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 flex items-center gap-1.5 text-sm font-medium cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{t.back}</span>
                  </button>
                  <div>
                    <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                      {driver.busNo} · {driver.name}
                    </h1>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {driver.driverId}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setKannadaInputEnabled((v) => !v)}
                    aria-pressed={kannadaInputEnabled}
                    className={`min-h-[44px] px-3 py-2 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      kannadaInputEnabled
                        ? 'bg-blue-700 border-blue-700 text-white dark:bg-blue-600 dark:border-blue-600'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Keyboard className="w-4 h-4 shrink-0" />
                    <span>{t.kannadaTyping}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDriverLogout}
                    className="min-h-[44px] px-3.5 py-2 text-xs sm:text-sm font-medium border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{t.signOut}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                <section className="lg:col-span-5 flex flex-col gap-4">
                  {/* 1. Trip & Route Places */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        {t.tripAndRoute}
                      </h2>
                      <span
                        className={`text-xs font-semibold ${
                          isSharing
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {isSharing ? t.sharingLive : t.standby}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          {t.startingPoint}
                        </label>
                        <input
                          type="text"
                          list="mybus-ops-kannada-stops"
                          value={startPoint}
                          onChange={(e) =>
                            setStartPoint(applyKannadaInput(e.target.value))
                          }
                          placeholder={t.startingPoint}
                          className="w-full min-h-[44px] px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          {t.endingPoint}
                        </label>
                        <input
                          type="text"
                          list="mybus-ops-kannada-stops"
                          value={endPoint}
                          onChange={(e) =>
                            setEndPoint(applyKannadaInput(e.target.value))
                          }
                          placeholder={t.endingPoint}
                          className="w-full min-h-[44px] px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {t.routePlaces}
                        </h3>
                        <button
                          type="button"
                          onClick={() => handleAddRoutePlace()}
                          className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-950 rounded-lg flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t.addPlace}</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2.5">
                        {t.enterHint}
                      </p>

                      {routeStops.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => handleAddRoutePlace()}
                          className="w-full min-h-[44px] px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-600 dark:hover:border-blue-500 rounded-lg cursor-pointer"
                        >
                          + {t.addPlace}
                        </button>
                      ) : (
                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                          {routeStops.map((stop, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="font-mono text-xs text-slate-400 w-5 text-right shrink-0 tabular-nums">
                                {idx + 1}.
                              </span>
                              <div className="relative flex-1">
                                <input
                                  ref={(el) => {
                                    stopInputRefs.current[idx] = el;
                                  }}
                                  type="text"
                                  list="mybus-ops-kannada-stops"
                                  value={stop}
                                  onChange={(e) => {
                                    const val = applyKannadaInput(
                                      e.target.value
                                    );
                                    setRouteStops((prev) =>
                                      prev.map((s, i) => (i === idx ? val : s))
                                    );
                                  }}
                                  onKeyDown={(e) =>
                                    handleRoutePlaceKeyDown(e, idx)
                                  }
                                  placeholder={
                                    lang === 'kn'
                                      ? `ಸ್ಥಳ ${idx + 1} (Enter ಒತ್ತಿ)`
                                      : `Place ${idx + 1} (press Enter)`
                                  }
                                  className="w-full min-h-[42px] px-3 pr-8 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                                />
                                {savedStopFlashIdx === idx && (
                                  <CheckCircle2
                                    aria-label="Saved"
                                    className="w-4 h-4 text-emerald-600 dark:text-emerald-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                                  />
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setRouteStops((prev) =>
                                    prev.filter((_, i) => i !== idx)
                                  );
                                }}
                                aria-label={`Delete place ${idx + 1}`}
                                className="min-w-[42px] min-h-[42px] rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {sharingBanner && (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
                        {sharingBanner}
                      </div>
                    )}

                    {/* Start / Stop Live Sharing */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={handleStartSharing}
                        disabled={isSharing}
                        className="min-h-[48px] px-4 py-2.5 bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-45 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <Radio className="w-4 h-4" />
                        <span>
                          {isSharing ? t.sharingLive : t.startSharing}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={handleStopSharing}
                        disabled={!isSharing}
                        className="min-h-[48px] px-4 py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <Square className="w-4 h-4" />
                        <span>{t.stopSharing}</span>
                      </button>
                    </div>
                  </div>

                  {/* 2. Driver Bus Incident / Operational Status Reporter */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span>{t.updateBusStatus}</span>
                      </h2>
                      <span
                        className={`text-xs font-semibold ${
                          busStatus === 'Normal'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : busStatus === 'Delayed'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {t.incidentLabels[busStatus]}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {INCIDENT_STATUSES.map((st) => {
                        const active = busStatus === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setBusStatus(st)}
                            className={`min-h-[40px] px-2.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                              active
                                ? st === 'Normal'
                                  ? 'bg-emerald-700 border-emerald-700 text-white'
                                  : st === 'Delayed'
                                  ? 'bg-amber-600 border-amber-600 text-white'
                                  : 'bg-red-600 border-red-600 text-white'
                                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            {t.incidentLabels[st]}
                          </button>
                        );
                      })}
                    </div>

                    <div>
                      <input
                        type="text"
                        value={statusNote}
                        onChange={(e) =>
                          setStatusNote(applyKannadaInput(e.target.value))
                        }
                        placeholder={t.statusNotePlaceholder}
                        className="w-full min-h-[42px] px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleUpdateBusStatus}
                      className="w-full min-h-[42px] px-4 py-2 bg-slate-900 dark:bg-blue-700 hover:bg-slate-800 dark:hover:bg-blue-600 text-white text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      {t.broadcastStatus}
                    </button>

                    {statusFeedback && (
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {statusFeedback}
                      </p>
                    )}
                  </div>

                  {currentCoords && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block mb-0.5">
                          GPS Coordinates
                        </span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                          {currentCoords.lat.toFixed(5)},{' '}
                          {currentCoords.lng.toFixed(5)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block mb-0.5">
                          Heading & Speed
                        </span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums inline-flex items-center gap-1.5">
                          <Compass className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
                          {currentDriverBus?.heading !== null &&
                          currentDriverBus?.heading !== undefined
                            ? `${Math.round(currentDriverBus.heading)}°`
                            : '--'}{' '}
                          · {currentDriverBus?.speedKmh ?? 0} km/h
                        </span>
                      </div>
                    </div>
                  )}
                </section>

                <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden h-[440px] sm:h-[540px] lg:h-[calc(100vh-190px)] min-h-[400px]">
                  <LiveTransitMap
                    liveBuses={driverMapBuses}
                    selectedBusId={driver.driverId}
                    focusLatLng={
                      currentCoords
                        ? { lat: currentCoords.lat, lng: currentCoords.lng }
                        : null
                    }
                    theme={theme}
                  />
                </section>
              </div>
            </div>
          )}
        </main>
      )}

      {/* ==================== ADMIN CONSOLE ==================== */}
      {mode === 'admin' && (
        <main className="flex-1 flex flex-col">
          {!adminToken ? (
            <div className="flex-1 flex items-center justify-center px-4 py-10">
              <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs">
                <div className="w-11 h-11 rounded-xl bg-slate-900 dark:bg-blue-700 text-white flex items-center justify-center mb-5">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                  {t.adminSignInTitle}
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                  {lang === 'kn'
                    ? 'ಬಸ್ ಸಮಯ, ನೇರ ಬಸ್ ನಿಯಂತ್ರಣ ಮತ್ತು ಬಳಕೆದಾರರ ಮಾಹಿತಿಗೆ ಸೀಮಿತ ಪ್ರವೇಶ.'
                    : 'Restricted access for My Bus schedules, live bus overrides, and user telemetry.'}
                </p>

                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Admin Email
                    </label>
                    <input
                      type="email"
                      required
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  {adminLoginError && (
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">
                      {adminLoginError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={adminLoginLoading}
                    className="w-full min-h-[48px] bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    {adminLoginLoading ? '...' : t.signIn}
                  </button>
                </form>

                <p className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  Demo admin: <span className="font-mono">admin@mybus.app</span>{' '}
                  / <span className="font-mono">admin123</span>
                </p>
              </div>
            </div>
          ) : adminSubView === 'dashboard' ? (
            <div className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 sm:py-12">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-1">
                    {t.adminHubTitle}
                  </h1>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {adminEmail}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAdminLogout}
                  className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{t.signOut}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <button
                  type="button"
                  onClick={() => setAdminSubView('timings')}
                  className="group text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-600 dark:hover:border-blue-500 rounded-2xl p-6 transition-all shadow-xs cursor-pointer min-h-[172px] flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-400 flex items-center justify-center group-hover:bg-blue-700 group-hover:text-white transition-colors">
                      <Clock className="w-5 h-5" />
                    </div>
                    <span className="font-mono text-sm font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                      {timings.length} {t.routesCount}
                    </span>
                  </div>
                  <div className="mt-6">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                      {t.busTiming}
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {lang === 'kn'
                        ? 'ಬಸ್ ವೇಳಾಪಟ್ಟಿಗಳನ್ನು ಸೇರಿಸಿ, ನವೀಕರಿಸಿ ಮತ್ತು ಅಳಿಸಿ.'
                        : 'Create, update, and delete scheduled routes and timetables.'}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setAdminSubView('live')}
                  className="group text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-600 dark:hover:border-blue-500 rounded-2xl p-6 transition-all shadow-xs cursor-pointer min-h-[172px] flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 flex items-center justify-center group-hover:bg-emerald-700 group-hover:text-white transition-colors">
                      <Radio className="w-5 h-5" />
                    </div>
                    <span className="font-mono text-sm font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                      {liveBuses.length} {t.active}
                    </span>
                  </div>
                  <div className="mt-6">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                      {t.liveBuses}
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {lang === 'kn'
                        ? 'ಸಕ್ರಿಯ ಬಸ್‌ಗಳು, ತುರ್ತು ಸ್ಥಿತಿ ನೋಡಿ ಮತ್ತು ನೇರ ಹಂಚಿಕೆ ನಿಲ್ಲಿಸಿ.'
                        : 'View all active drivers, incident alerts, and stop sharing remotely.'}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setAdminSubView('users')}
                  className="group text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-600 dark:hover:border-blue-500 rounded-2xl p-6 transition-all shadow-xs cursor-pointer min-h-[172px] flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white flex items-center justify-center group-hover:bg-slate-900 dark:group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <Users className="w-5 h-5" />
                    </div>
                    <span className="font-mono text-sm font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                      {stats.activeUsers}
                    </span>
                  </div>
                  <div className="mt-6">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                      {t.numberOfUsers}
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {lang === 'kn'
                        ? 'ಪ್ರಯಾಣಿಕರು, ಚಾಲಕರು ಮತ್ತು ಸಕ್ರಿಯ ಸೆಷನ್‌ಗಳನ್ನು ಪರಿಶೀಲಿಸಿ.'
                        : 'Inspect live connected passengers, drivers, and sessions.'}
                    </p>
                  </div>
                </button>
              </div>
            </div>
          ) : adminSubView === 'timings' ? (
            <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setAdminSubView('dashboard')}
                    className="min-w-[44px] min-h-[44px] px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 text-sm font-medium cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{t.back}</span>
                  </button>
                  <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                      {t.manageBusTimings}
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                      {lang === 'kn'
                        ? 'ವೇಳಾಪಟ್ಟಿಯನ್ನು ತಕ್ಷಣವೇ ಸೇರಿಸಿ, ಬದಲಾಯಿಸಿ ಅಥವಾ ಅಳಿಸಿ.'
                        : 'Create, edit, or remove timetables in real time.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setFormState(EMPTY_FORM);
                    setFormError(null);
                    setEditorOpen(true);
                  }}
                  className="min-h-[44px] px-4 py-2.5 bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-sm font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t.addBusTiming}</span>
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-semibold text-slate-600 dark:text-slate-400">
                        <th className="py-3.5 px-4 whitespace-nowrap">
                          Bus No.
                        </th>
                        <th className="py-3.5 px-4 whitespace-nowrap">
                          Departure
                        </th>
                        <th className="py-3.5 px-4 whitespace-nowrap">
                          Arrival
                        </th>
                        <th className="py-3.5 px-4 min-w-[200px]">Route</th>
                        <th className="py-3.5 px-4 min-w-[180px]">Stops</th>
                        <th className="py-3.5 px-4 whitespace-nowrap">
                          Status
                        </th>
                        <th className="py-3.5 px-4 text-right whitespace-nowrap">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                      {timings.map((item) => (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                        >
                          <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap tabular-nums">
                            {item.busNo}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-800 dark:text-slate-200 whitespace-nowrap tabular-nums">
                            {item.departureTime}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-800 dark:text-slate-200 whitespace-nowrap tabular-nums">
                            {item.arrivalTime}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white">
                            {item.route}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                            {item.stops.length > 0
                              ? item.stops.join(' · ')
                              : 'Direct'}
                          </td>
                          <td
                            className={`py-3.5 px-4 font-medium whitespace-nowrap ${
                              item.status === 'On Time'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : item.status === 'Delayed'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {item.status}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setFormState({
                                    id: item.id,
                                    busNo: item.busNo,
                                    startPoint: item.startPoint,
                                    endPoint: item.endPoint,
                                    stopsText: item.stops.join(', '),
                                    departureTime: item.departureTime,
                                    arrivalTime: item.arrivalTime,
                                    frequency: item.frequency,
                                    status: item.status,
                                  });
                                  setFormError(null);
                                  setEditorOpen(true);
                                }}
                                className="min-w-[38px] min-h-[38px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 text-xs font-medium cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTiming(item.id)}
                                className="min-w-[38px] min-h-[38px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-950/50 hover:border-red-200 dark:hover:border-red-900 hover:text-red-700 dark:hover:text-red-400 text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 text-xs font-medium cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : adminSubView === 'live' ? (
            <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8">
              <div className="flex items-center gap-3 mb-5">
                  <button
                    type="button"
                    onClick={() => {
                      setAdminActionMsg(null);
                      setAdminSubView('dashboard');
                    }}
                    className="min-w-[44px] min-h-[44px] px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 text-sm font-medium cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{t.back}</span>
                  </button>
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                    {t.liveBusesMonitor}
                  </h1>
                </div>

                {adminActionMsg && (
                  <div className="mb-4 p-3.5 rounded-lg bg-slate-900 dark:bg-blue-950 text-white text-xs sm:text-sm flex items-center justify-between">
                    <span>{adminActionMsg}</span>
                    <button
                      type="button"
                      onClick={() => setAdminActionMsg(null)}
                      className="text-slate-300 hover:text-white cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                  <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
                    <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                        {t.liveBuses}
                      </h2>
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {liveBuses.length} {t.active}
                      </span>
                    </div>

                    {liveBuses.length === 0 ? (
                      <div className="p-8 text-center flex-1 flex flex-col items-center justify-center">
                        <Bus className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2" />
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {t.noLiveBuses}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {t.noLiveBusesSub}
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200 dark:divide-slate-800 overflow-y-auto max-h-[540px]">
                        {liveBuses.map((bus) => {
                          const isIncident =
                            bus.busStatus && bus.busStatus !== 'Normal';
                          return (
                            <div
                              key={bus.driverId}
                              className={`p-4 transition-colors ${
                                selectedLiveBusId === bus.driverId
                                  ? 'bg-blue-50/70 dark:bg-blue-950/40'
                                  : ''
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <button
                                  type="button"
                                  onClick={() => setSelectedLiveBusId(bus.driverId)}
                                  className="text-left cursor-pointer flex-1"
                                >
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                                      {bus.busNo}
                                    </span>
                                    <span className="text-slate-400">·</span>
                                    <span className="font-medium text-slate-800 dark:text-slate-200">
                                      {bus.driverName} ({bus.driverId})
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                    {bus.startPoint} → {bus.endPoint}
                                  </p>

                                  {isIncident && (
                                    <p
                                      className={`text-xs font-semibold mt-1.5 flex items-center gap-1.5 ${
                                        bus.busStatus === 'Delayed'
                                          ? 'text-amber-700 dark:text-amber-400'
                                          : 'text-red-600 dark:text-red-400'
                                      }`}
                                    >
                                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                      <span>
                                        {t.incidentLabels[bus.busStatus] ||
                                          bus.busStatus}
                                        {bus.statusNote
                                          ? ` — ${bus.statusNote}`
                                          : ''}
                                      </span>
                                    </p>
                                  )}

                                  <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                                    {bus.directionText} ·{' '}
                                    <span className="font-mono tabular-nums">
                                      {bus.speedKmh} km/h
                                    </span>
                                  </p>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStopDriverSharing(
                                      bus.driverId,
                                      bus.busNo
                                    )
                                  }
                                  className="min-h-[40px] px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                                >
                                  <Square className="w-3.5 h-3.5" />
                                  <span>{t.stopSharing}</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden h-[440px] sm:h-[540px] lg:h-[calc(100vh-190px)] min-h-[400px]">
                    <LiveTransitMap
                      liveBuses={liveBuses}
                      selectedBusId={selectedLiveBusId}
                      onSelectBus={(id) => setSelectedLiveBusId(id)}
                      theme={theme}
                    />
                  </section>
                </div>
              </div>
            ) : (
              <div className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8">
                <div className="flex items-center gap-3 mb-6">
                  <button
                    type="button"
                    onClick={() => setAdminSubView('dashboard')}
                    className="min-w-[44px] min-h-[44px] px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 text-sm font-medium cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{t.back}</span>
                  </button>
                  <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                      {t.numberOfUsers}
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                      {lang === 'kn'
                        ? 'ಪ್ರಯಾಣಿಕರು ಮತ್ತು ಚಾಲಕರ ನೇರ ಸಂಪರ್ಕ ಸಂಖ್ಯೆಗಳು.'
                        : 'Real-time active connection counts across riders and fleet.'}
                    </p>
                  </div>
                </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2">
                    Active Rider Users
                  </span>
                  <span className="font-mono text-3xl font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                    {stats.activeUsers}
                  </span>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2">
                    Connected Drivers
                  </span>
                  <span className="font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {stats.activeDrivers}
                  </span>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2">
                    Live Sharing Buses
                  </span>
                  <span className="font-mono text-3xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {stats.liveBusCount}
                  </span>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2">
                    Total Active Connections
                  </span>
                  <span className="font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {stats.totalConnections}
                  </span>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
                <h2 className="text-base font-bold text-slate-900 dark:text-white mb-3">
                  Session Breakdown
                </h2>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  <div className="py-3 flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">
                      Passenger / User Sessions
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      {stats.activeUsers}
                    </span>
                  </div>
                  <div className="py-3 flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">
                      Driver Console Sessions
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      {stats.activeDrivers}
                    </span>
                  </div>
                  <div className="py-3 flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">
                      Admin Console Sessions
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      {stats.activeAdmins}
                    </span>
                  </div>
                  <div className="py-3 flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">
                      Scheduled Bus Routes
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      {stats.timingCount}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {editorOpen && (
            <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {formState.id
                      ? 'Update Bus Timing'
                      : 'Create New Bus Timing'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditorOpen(false)}
                    aria-label="Close modal"
                    className="min-w-[40px] min-h-[40px] rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveTiming} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Bus No.
                      </label>
                      <input
                        type="text"
                        required
                        value={formState.busNo}
                        onChange={(e) =>
                          setFormState({ ...formState, busNo: e.target.value })
                        }
                        placeholder="e.g. 705-K"
                        className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Status
                      </label>
                      <select
                        value={formState.status}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            status: e.target.value as BusTiming['status'],
                          })
                        }
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="On Time">On Time</option>
                        <option value="Delayed">Delayed</option>
                        <option value="Scheduled">Scheduled</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pb-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {t.startingPoint} / {t.endingPoint} / {t.stopsVia}
                    </span>
                    <button
                      type="button"
                      onClick={() => setKannadaInputEnabled((v) => !v)}
                      aria-pressed={kannadaInputEnabled}
                      className={`min-h-[34px] px-2.5 py-1 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                        kannadaInputEnabled
                          ? 'bg-blue-700 border-blue-700 text-white dark:bg-blue-600 dark:border-blue-600'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <Keyboard className="w-3.5 h-3.5 shrink-0" />
                      <span>{t.kannadaTyping}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {t.startingPoint}
                      </label>
                      <input
                        type="text"
                        required
                        list="mybus-ops-kannada-stops"
                        value={formState.startPoint}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            startPoint: applyKannadaInput(e.target.value),
                          })
                        }
                        placeholder="Origin stop"
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {t.endingPoint}
                      </label>
                      <input
                        type="text"
                        required
                        list="mybus-ops-kannada-stops"
                        value={formState.endPoint}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            endPoint: applyKannadaInput(e.target.value),
                          })
                        }
                        placeholder="Destination stop"
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {t.departureTime}
                      </label>
                      <input
                        type="time"
                        required
                        value={formState.departureTime}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            departureTime: e.target.value,
                          })
                        }
                        className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {t.arrivalTime}
                      </label>
                      <input
                        type="time"
                        required
                        value={formState.arrivalTime}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            arrivalTime: e.target.value,
                          })
                        }
                        className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {t.frequency}
                      </label>
                      <input
                        type="text"
                        value={formState.frequency}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            frequency: e.target.value,
                          })
                        }
                        placeholder="Every 20 min"
                        className="w-full min-h-[42px] px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t.stopsVia}
                    </label>
                    <input
                      type="text"
                      value={formState.stopsText}
                      onChange={(e) =>
                        setFormState({
                          ...formState,
                          stopsText: applyKannadaInput(e.target.value),
                        })
                      }
                      placeholder="City Market, Civic Hospital, Metro Hub"
                      className="w-full min-h-[42px] px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  {formError && (
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">
                      {formError}
                    </p>
                  )}

                  <div className="pt-2 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setEditorOpen(false)}
                      className="min-h-[44px] px-4 py-2 text-sm font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingTiming}
                      className="min-h-[44px] px-5 py-2 text-sm font-semibold bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg cursor-pointer"
                    >
                      {savingTiming
                        ? 'Saving...'
                        : formState.id
                        ? 'Update Timing'
                        : 'Create Timing'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}
