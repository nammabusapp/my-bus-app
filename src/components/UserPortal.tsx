import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bus,
  ChevronDown,
  Clock,
  Compass,
  Crosshair,
  Keyboard,
  MapPin,
  Navigation,
  Search,
  X,
} from 'lucide-react';
import { TRANSLATIONS } from '../i18n/translations';
import {
  AppLang,
  BusTiming,
  LiveBus,
  ThemeMode,
  UserLocation,
  UserSubView,
} from '../types';
import {
  bearingToCardinal,
  calculateEtaMinutes,
  formatEtaText,
  haversineDistanceKm,
  reverseGeocode,
} from '../utils/geo';
import {
  KANNADA_STOP_SUGGESTIONS,
  transliterateToKannada,
} from '../utils/kannada';
import { LanguageToggle } from './LanguageToggle';
import { LiveTransitMap } from './LiveTransitMap';
import { ThemeToggle } from './ThemeToggle';

const HERO_BUS_IMAGE = '/src/assets/images/hero_modern_bus_1795111364827.jpg';

interface UserPortalProps {
  timings: BusTiming[];
  liveBuses: LiveBus[];
  loading: boolean;
  theme: ThemeMode;
  onToggleTheme: () => void;
  lang: AppLang;
  onToggleLang: () => void;
  onOpenOperations: () => void;
}

export function UserPortal({
  timings,
  liveBuses,
  loading,
  theme,
  onToggleTheme,
  lang,
  onToggleLang,
  onOpenOperations,
}: UserPortalProps) {
  const t = TRANSLATIONS[lang];
  const [view, setView] = useState<UserSubView>('home');
  const [userLocationQuery, setUserLocationQuery] = useState('');
  const [destinationQuery, setDestinationQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'All' | 'On Time' | 'Delayed' | 'Scheduled'
  >('All');
  const [expandedTimingId, setExpandedTimingId] = useState<string | null>(null);
  const [routeQuery, setRouteQuery] = useState('');
  const [kannadaInputEnabled, setKannadaInputEnabled] = useState(false);

  const applyKannadaInput = useCallback(
    (value: string) =>
      kannadaInputEnabled ? transliterateToKannada(value) : value,
    [kannadaInputEnabled]
  );
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [focusLatLng, setFocusLatLng] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [heroImageFailed, setHeroImageFailed] = useState(false);

  const detectUserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError(
        'Geolocation is unavailable in this browser. Tap the map or enter a location manually.'
      );
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const label = await reverseGeocode(lat, lng);
        setUserLocation({ lat, lng, label, source: 'gps' });
        setFocusLatLng({ lat, lng });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Enter your stop manually or tap the map to place your pin.'
            : 'Unable to acquire GPS fix. Enter a location manually or tap the map.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    if (view === 'track' && !userLocation && !locating && !locationError) {
      detectUserLocation();
    }
  }, [view, userLocation, locating, locationError, detectUserLocation]);

  const handleUseLocationForTimings = useCallback(async () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser.');
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const label = await reverseGeocode(lat, lng);
        setUserLocation({ lat, lng, label, source: 'gps' });
        const primaryLocality = label.split(',')[0]?.trim() || '';
        if (primaryLocality) {
          setUserLocationQuery(primaryLocality);
        }
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocationError(
          'Could not read your GPS location. Please type your boarding stop manually.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Collect unique known stop names + Kannada stop suggestions for autocomplete
  const allKnownStops = useMemo(() => {
    const set = new Set<string>(KANNADA_STOP_SUGGESTIONS);
    for (const item of timings) {
      if (item.startPoint) set.add(item.startPoint);
      for (const s of item.stops) {
        if (s) set.add(s);
      }
      if (item.endPoint) set.add(item.endPoint);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [timings]);

  // Strict Passing-Through Filtering when Destination is searched:
  // If user searches a destination AND user location is provided, ONLY show buses passing through userLocationQuery on the way to destinationQuery!
  const filteredTimings = useMemo(() => {
    const fromQ = userLocationQuery.trim().toLowerCase();
    const destQ = destinationQuery.trim().toLowerCase();

    return timings.filter((t) => {
      if (statusFilter !== 'All' && t.status !== statusFilter) return false;

      const orderedStops = [t.startPoint, ...t.stops, t.endPoint].map((s) =>
        s.toLowerCase()
      );

      // When searching a destination:
      if (destQ) {
        // Require user location to filter buses passing through user location
        if (!fromQ) {
          return false;
        }
        const fromIndex = orderedStops.findIndex((s) => s.includes(fromQ));
        const destIndex = orderedStops.findIndex(
          (s, idx) => idx > fromIndex && s.includes(destQ)
        );
        return fromIndex !== -1 && destIndex !== -1 && fromIndex < destIndex;
      }

      // If only User Location is entered (no destination yet), show buses passing through User Location or matching Bus No.
      if (fromQ) {
        return (
          t.busNo.toLowerCase().includes(fromQ) ||
          orderedStops.some((s) => s.includes(fromQ))
        );
      }

      return true;
    });
  }, [timings, userLocationQuery, destinationQuery, statusFilter]);

  const needsLocationForDestSearch =
    destinationQuery.trim().length > 0 && userLocationQuery.trim().length === 0;

  const enrichedLiveBuses = useMemo(() => {
    const q = routeQuery.trim().toLowerCase();
    const matching = liveBuses.filter((b) => {
      if (!q) return true;
      const haystack = [
        b.busNo,
        b.startPoint,
        b.endPoint,
        ...b.routeStops,
        b.driverName,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    return matching
      .map((bus) => {
        const distanceKm = userLocation
          ? haversineDistanceKm(
              userLocation.lat,
              userLocation.lng,
              bus.lat,
              bus.lng
            )
          : null;
        const etaMinutes =
          distanceKm !== null
            ? calculateEtaMinutes(distanceKm, bus.speedKmh)
            : null;
        return {
          ...bus,
          distanceKm,
          etaMinutes,
        };
      })
      .sort((a, b) => {
        if (a.etaMinutes !== null && b.etaMinutes !== null) {
          return a.etaMinutes - b.etaMinutes;
        }
        return b.updatedAt - a.updatedAt;
      });
  }, [liveBuses, routeQuery, userLocation]);

  const handleMapClickToSetUserPin = useCallback(
    async (lat: number, lng: number) => {
      const label = await reverseGeocode(lat, lng);
      setUserLocation({ lat, lng, label, source: 'manual' });
      setLocationError(null);
    },
    []
  );

  // --- HOME VIEW ---
  if (view === 'home') {
    const previewRoutes = timings.slice(0, 4);

    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setView('home')}
              className="text-xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t.appName}
            </button>

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
              <button
                type="button"
                onClick={() => setView('timings')}
                className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer py-2"
              >
                {t.busTiming}
              </button>
              <button
                type="button"
                onClick={() => setView('track')}
                className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer py-2"
              >
                {t.trackBus}
              </button>
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              <LanguageToggle lang={lang} onToggle={onToggleLang} />
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
              <button
                type="button"
                onClick={() => setView('track')}
                className="px-4 py-2 min-h-[44px] text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.liveMap}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              <div className="lg:col-span-7 flex flex-col justify-between gap-8">
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-blue-700 dark:text-blue-400 mb-3">
                    {t.tagline}
                  </p>
                  <h1
                    className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.15] mb-4"
                    style={{ textWrap: 'balance' }}
                  >
                    {t.heroTitle}
                  </h1>
                  <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                    {t.heroSubtitle}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <motion.button
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.99 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => setView('timings')}
                    className="group text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-600 dark:hover:border-blue-500 rounded-2xl p-6 transition-colors shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 min-h-[176px] flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:bg-blue-700 group-hover:text-white transition-colors">
                        <Clock className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {timings.length} {t.routesCount}
                      </span>
                    </div>
                    <div className="mt-5 flex items-end justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                          {t.busTiming}
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {t.busTimingDesc}
                        </p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 shrink-0 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.99 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => setView('track')}
                    className="group text-left bg-slate-900 dark:bg-blue-700 border border-slate-900 dark:border-blue-600 hover:bg-slate-800 dark:hover:bg-blue-600 rounded-2xl p-6 transition-colors shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-[176px] flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-12 h-12 rounded-xl bg-blue-600 dark:bg-white/15 text-white flex items-center justify-center shrink-0">
                        <Navigation className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-mono text-slate-300 dark:text-blue-100 tabular-nums">
                        {liveBuses.length} {t.liveNow}
                      </span>
                    </div>
                    <div className="mt-5 flex items-end justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-bold text-white mb-1">
                          {t.trackBus}
                        </h2>
                        <p className="text-sm text-slate-300 dark:text-blue-100">
                          {t.trackBusDesc}
                        </p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-white shrink-0 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </motion.button>
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="relative h-full min-h-[300px] sm:min-h-[360px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900">
                  {!heroImageFailed ? (
                    <img
                      src={HERO_BUS_IMAGE}
                      alt="Modern electric city transit bus on an urban avenue"
                      referrerPolicy="no-referrer"
                      onError={() => setHeroImageFailed(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950 flex flex-col items-center justify-center p-8 text-center">
                      <Bus className="w-12 h-12 text-blue-400 mb-3" />
                      <p className="text-sm font-medium text-slate-200">
                        {t.appName}
                      </p>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent" />

                  <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6 text-white">
                    <div className="flex items-center justify-between gap-4 text-xs text-slate-300 mb-2">
                      <span>{t.nextDepartures}</span>
                      <span className="font-mono tabular-nums">
                        {liveBuses.length} {t.liveNow}
                      </span>
                    </div>
                    <div className="divide-y divide-white/15">
                      {previewRoutes.slice(0, 2).map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            setUserLocationQuery(r.startPoint);
                            setDestinationQuery(r.endPoint);
                            setView('timings');
                          }}
                          className="w-full py-2.5 flex items-center justify-between gap-3 text-left hover:text-blue-300 transition-colors cursor-pointer"
                        >
                          <div className="min-w-0">
                            <span className="font-mono text-xs font-bold text-blue-300 mr-2">
                              {r.busNo}
                            </span>
                            <span className="text-sm font-medium truncate">
                              {r.route}
                            </span>
                          </div>
                          <span className="font-mono text-xs text-slate-200 shrink-0 tabular-nums">
                            {r.departureTime}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {previewRoutes.length > 0 && (
              <section className="mt-10 pt-8 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    {t.featuredCorridors}
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setUserLocationQuery('');
                      setDestinationQuery('');
                      setView('timings');
                    }}
                    className="text-xs sm:text-sm font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
                  >
                    {t.viewFullTimetable}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {previewRoutes.map((route) => (
                    <button
                      key={route.id}
                      type="button"
                      onClick={() => {
                        setUserLocationQuery(route.startPoint);
                        setDestinationQuery(route.endPoint);
                        setView('timings');
                      }}
                      className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-600 dark:hover:border-blue-500 rounded-xl p-4 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                          {route.busNo}
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            route.status === 'On Time'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : route.status === 'Delayed'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {route.status === 'On Time'
                            ? t.onTime
                            : route.status === 'Delayed'
                            ? t.delayed
                            : t.scheduled}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-1 mb-1">
                        {route.route}
                      </p>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {route.departureTime} – {route.arrivalTime} ·{' '}
                        {route.frequency}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </main>

        <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>{t.appName}</span>
            <div className="flex items-center gap-4">
              <span>{t.tagline}</span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onOpenOperations}
                className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                {t.operationsLink}
              </button>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // --- BUS TIMING TABLE VIEW ---
  if (view === 'timings') {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setView('home')}
                aria-label={t.back}
                className="min-w-[44px] min-h-[44px] px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">{t.back}</span>
              </button>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate">
                {t.busTiming}
              </h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <LanguageToggle lang={lang} onToggle={onToggleLang} />
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
              <button
                type="button"
                onClick={() => setView('track')}
                className="px-4 py-2 min-h-[44px] text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.trackBus}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 mb-6 space-y-4">
            {/* Passing-Through Filter Bar: Your Location + Destination */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.yourLocationLabel}
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-blue-700 dark:text-blue-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    list="mybus-stop-options"
                    value={userLocationQuery}
                    onChange={(e) =>
                      setUserLocationQuery(applyKannadaInput(e.target.value))
                    }
                    placeholder={t.yourLocationPlaceholder}
                    className="w-full min-h-[44px] pl-10 pr-9 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors"
                  />
                  {userLocationQuery && (
                    <button
                      type="button"
                      onClick={() => setUserLocationQuery('')}
                      aria-label="Clear user location"
                      className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="lg:col-span-5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.destinationLabel}
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    list="mybus-stop-options"
                    value={destinationQuery}
                    onChange={(e) =>
                      setDestinationQuery(applyKannadaInput(e.target.value))
                    }
                    placeholder={t.destinationPlaceholder}
                    className="w-full min-h-[44px] pl-10 pr-9 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors"
                  />
                  {destinationQuery && (
                    <button
                      type="button"
                      onClick={() => setDestinationQuery('')}
                      aria-label="Clear destination"
                      className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="lg:col-span-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleUseLocationForTimings}
                  disabled={locating}
                  className="flex-1 min-h-[44px] px-3 py-2.5 bg-slate-900 dark:bg-blue-700 hover:bg-slate-800 dark:hover:bg-blue-600 disabled:opacity-60 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Crosshair className="w-4 h-4 shrink-0" />
                  <span>{locating ? t.locating : t.useGps}</span>
                </button>
              </div>
            </div>

            <datalist id="mybus-stop-options">
              {allKnownStops.map((stop) => (
                <option key={stop} value={stop} />
              ))}
            </datalist>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg overflow-x-auto">
                  {(['All', 'On Time', 'Delayed', 'Scheduled'] as const).map(
                    (status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setStatusFilter(status)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                          statusFilter === status
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {status === 'All'
                          ? t.all
                          : status === 'On Time'
                          ? t.onTime
                          : status === 'Delayed'
                          ? t.delayed
                          : t.scheduled}
                      </button>
                    )
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setKannadaInputEnabled((v) => !v)}
                  aria-pressed={kannadaInputEnabled}
                  className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    kannadaInputEnabled
                      ? 'bg-blue-700 border-blue-700 text-white dark:bg-blue-600 dark:border-blue-600'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Keyboard className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.kannadaTyping}</span>
                </button>
              </div>

              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t.clickRowHint}
              </span>
            </div>

            {userLocation && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                GPS:{' '}
                <span className="font-medium text-slate-900 dark:text-white">
                  {userLocation.label}
                </span>
              </p>
            )}
            {locationError && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {locationError}
              </p>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                ...
              </div>
            ) : needsLocationForDestSearch ? (
              <div className="p-10 text-center">
                <p className="text-base font-semibold text-slate-900 dark:text-white mb-2">
                  {t.needLocationForDest} ("{destinationQuery}")
                </p>
                <button
                  type="button"
                  onClick={handleUseLocationForTimings}
                  className="mt-2 px-4 py-2 min-h-[44px] text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-2 cursor-pointer"
                >
                  <Crosshair className="w-4 h-4" />
                  <span>{t.detectMyLocation}</span>
                </button>
              </div>
            ) : filteredTimings.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                  {lang === 'kn'
                    ? `"${userLocationQuery}" ಮೂಲಕ ಹಾದುಹೋಗುವ ಬಸ್‌ಗಳು ಕಂಡುಬಂದಿಲ್ಲ`
                    : `No matching buses passing through "${userLocationQuery}"${
                        destinationQuery ? ` toward "${destinationQuery}"` : ''
                      }`}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setUserLocationQuery('');
                    setDestinationQuery('');
                    setStatusFilter('All');
                  }}
                  className="mt-3 px-4 py-2 min-h-[44px] text-sm font-medium text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg cursor-pointer"
                >
                  {t.all}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 text-xs font-semibold text-slate-600 dark:text-slate-400">
                      <th className="py-3.5 px-4 whitespace-nowrap">
                        {t.busNo}
                      </th>
                      <th className="py-3.5 px-4 whitespace-nowrap">
                        {t.departureTime}
                      </th>
                      <th className="py-3.5 px-4 whitespace-nowrap">
                        {t.arrivalTime}
                      </th>
                      <th className="py-3.5 px-4 min-w-[220px]">
                        {t.route}
                      </th>
                      <th className="py-3.5 px-4 min-w-[200px]">
                        {t.stopsVia}
                      </th>
                      <th className="py-3.5 px-4 whitespace-nowrap">
                        {t.frequency}
                      </th>
                      <th className="py-3.5 px-4 whitespace-nowrap">
                        {t.status}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                    {filteredTimings.map((item) => {
                      const isExpanded = expandedTimingId === item.id;
                      const orderedStops = [
                        item.startPoint,
                        ...item.stops,
                        item.endPoint,
                      ];
                      const fromQ = userLocationQuery.trim().toLowerCase();
                      const destQ = destinationQuery.trim().toLowerCase();

                      return (
                        <tr
                          key={item.id}
                          onClick={() =>
                            setExpandedTimingId(isExpanded ? null : item.id)
                          }
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                        >
                          <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap tabular-nums align-top">
                            <span className="inline-flex items-center gap-1.5">
                              <ChevronDown
                                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                              {item.busNo}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-800 dark:text-slate-200 whitespace-nowrap tabular-nums align-top">
                            {item.departureTime}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-800 dark:text-slate-200 whitespace-nowrap tabular-nums align-top">
                            {item.arrivalTime}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white align-top">
                            <div>{item.route}</div>
                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                {orderedStops.map((stop, idx) => {
                                  const lower = stop.toLowerCase();
                                  const isUserStop =
                                    fromQ && lower.includes(fromQ);
                                  const isDestStop =
                                    destQ && lower.includes(destQ);
                                  return (
                                    <span
                                      key={`${stop}-${idx}`}
                                      className="inline-flex items-center gap-2"
                                    >
                                      <span
                                        className={
                                          isUserStop
                                            ? 'font-bold text-emerald-700 dark:text-emerald-400 underline'
                                            : isDestStop
                                            ? 'font-bold text-blue-700 dark:text-blue-400 underline'
                                            : idx === 0 ||
                                              idx === orderedStops.length - 1
                                            ? 'font-semibold text-slate-900 dark:text-white'
                                            : ''
                                        }
                                      >
                                        {stop}
                                      </span>
                                      {idx < orderedStops.length - 1 && (
                                        <ArrowRight className="w-3 h-3 text-slate-400" />
                                      )}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 align-top">
                            {item.stops.length > 0
                              ? item.stops.join(' · ')
                              : 'Direct express'}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap align-top">
                            {item.frequency}
                          </td>
                          <td
                            className={`py-3.5 px-4 font-medium whitespace-nowrap align-top ${
                              item.status === 'On Time'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : item.status === 'Delayed'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {item.status}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // --- TRACK BUS VIEW ---
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setView('home')}
                aria-label={t.back}
                className="min-w-[44px] min-h-[44px] px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">{t.back}</span>
              </button>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate">
                {t.trackBus}
              </h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <LanguageToggle lang={lang} onToggle={onToggleLang} />
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
              <button
                type="button"
                onClick={detectUserLocation}
                disabled={locating}
                className="min-h-[44px] px-3.5 py-2 text-xs sm:text-sm font-medium border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Crosshair className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <span>{locating ? t.locating : t.myGps}</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-4 sm:py-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <section className="lg:col-span-5 flex flex-col gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label
                    htmlFor="track-route-search"
                    className="block text-xs font-semibold text-slate-600 dark:text-slate-400"
                  >
                    {t.trackRouteLabel}
                  </label>
                  <button
                    type="button"
                    onClick={() => setKannadaInputEnabled((v) => !v)}
                    aria-pressed={kannadaInputEnabled}
                    className={`min-h-[32px] px-2.5 py-1 text-[11px] font-semibold rounded-md border flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      kannadaInputEnabled
                        ? 'bg-blue-700 border-blue-700 text-white dark:bg-blue-600 dark:border-blue-600'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Keyboard className="w-3.5 h-3.5 shrink-0" />
                    <span>{t.kannadaTyping}</span>
                  </button>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="track-route-search"
                    type="text"
                    value={routeQuery}
                    onChange={(e) =>
                      setRouteQuery(applyKannadaInput(e.target.value))
                    }
                    placeholder={t.trackRoutePlaceholder}
                    className="w-full min-h-[44px] pl-10 pr-9 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors"
                  />
                  {routeQuery && (
                    <button
                      type="button"
                      onClick={() => setRouteQuery('')}
                      aria-label="Clear route search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <MapPin className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    {userLocation ? (
                      <span>
                        <strong className="text-slate-900 dark:text-white">
                          {userLocation.label}
                        </strong>{' '}
                        ({userLocation.source === 'gps' ? 'GPS' : 'Manual'})
                      </span>
                    ) : (
                      <span>
                        {lang === 'kn'
                          ? 'ನೇರ ETA ಗಾಗಿ ಮೇಲಿನ "ನನ್ನ GPS" ಒತ್ತಿ ಅಥವಾ ನಕ್ಷೆಯಲ್ಲಿ ನಿಮ್ಮ ಸ್ಥಳವನ್ನು ಗುರುತಿಸಿ.'
                          : 'Tap My GPS above or click anywhere on the map to place your location for live ETA calculation.'}
                      </span>
                    )}
                  </div>
                </div>
                {locationError && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    {locationError}
                  </p>
                )}
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex-1 flex flex-col">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <span>{t.liveBuses}</span>
                  <span className="font-mono tabular-nums">
                    {enrichedLiveBuses.length} {t.active}
                  </span>
                </div>

                {enrichedLiveBuses.length === 0 ? (
                  <div className="p-6 text-center flex-1 flex flex-col items-center justify-center">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
                      {routeQuery
                        ? `"${routeQuery}"`
                        : t.noLiveBuses}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                      {t.noLiveBusesSub}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 overflow-y-auto max-h-[520px]">
                    {enrichedLiveBuses.map((bus) => {
                      const isSelected = bus.driverId === selectedBusId;
                      const cardinal = bearingToCardinal(bus.heading);
                      const hasIncident =
                        bus.busStatus && bus.busStatus !== 'Normal';
                      return (
                        <button
                          key={bus.driverId}
                          type="button"
                          onClick={() => {
                            setSelectedBusId(bus.driverId);
                            setFocusLatLng({ lat: bus.lat, lng: bus.lng });
                          }}
                          className={`w-full text-left p-4 transition-colors cursor-pointer min-h-[44px] ${
                            isSelected
                              ? 'bg-blue-50/70 dark:bg-blue-950/40'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="font-mono font-bold text-slate-900 dark:text-white">
                                  {bus.busNo}
                                </span>
                                <span
                                  className="text-slate-400"
                                  aria-hidden="true"
                                >
                                  ·
                                </span>
                                <span className="font-medium text-slate-800 dark:text-slate-200">
                                  {bus.startPoint} → {bus.endPoint}
                                </span>
                              </div>

                              {bus.routeStops.length > 0 && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                  Via: {bus.routeStops.join(' · ')}
                                </p>
                              )}

                              {hasIncident && (
                                <p
                                  className={`mt-1.5 text-xs font-semibold flex items-center gap-1.5 ${
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
                            </div>

                            <div className="text-right shrink-0">
                              <div className="font-mono text-sm font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                                {bus.etaMinutes !== null
                                  ? formatEtaText(bus.etaMinutes)
                                  : 'Set pin'}
                              </div>
                              {bus.distanceKm !== null && (
                                <div className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                  {bus.distanceKm.toFixed(1)} km
                                </div>
                              )}
                            </div>
                          </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <Compass
                              className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400 shrink-0 transition-transform"
                              style={
                                typeof bus.heading === 'number'
                                  ? {
                                      transform: `rotate(${Math.round(
                                        bus.heading
                                      )}deg)`,
                                    }
                                  : undefined
                              }
                            />
                            <span>
                              {bus.directionText || `Heading ${cardinal.full}`}
                            </span>
                          </div>
                          <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {bus.speedKmh} km/h
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden h-[440px] sm:h-[540px] lg:h-[calc(100vh-132px)] min-h-[400px]">
            <LiveTransitMap
              userLocation={userLocation}
              liveBuses={enrichedLiveBuses}
              selectedBusId={selectedBusId}
              onSelectBus={(id) => setSelectedBusId(id)}
              onMapClick={handleMapClickToSetUserPin}
              focusLatLng={focusLatLng}
              theme={theme}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
