import dotenv from 'dotenv';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as webpush from 'web-push';
import { WebSocket, WebSocketServer } from 'ws';

// Load .env if present (so local/user-configured .env works cleanly)
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: true });
}

interface BusTiming {
  id: string;
  busNo: string;
  route: string;
  startPoint: string;
  endPoint: string;
  stops: string[];
  departureTime: string;
  arrivalTime: string;
  frequency?: string;
  status: 'On Time' | 'Delayed' | 'Scheduled';
}

type BusIncidentStatus =
  | 'Normal'
  | 'Delayed'
  | 'Punctured'
  | 'Breakdown'
  | 'Accident'
  | 'Road Block';

interface LiveBus {
  driverId: string;
  driverName: string;
  busNo: string;
  startPoint: string;
  endPoint: string;
  routeStops: string[];
  departureTime?: string;
  reachingTime?: string;
  lat: number;
  lng: number;
  heading: number | null;
  speedKmh: number;
  directionText: string;
  busStatus: BusIncidentStatus;
  statusNote?: string;
  routeCoordinates?: [number, number][];
  updatedAt: number;
}

interface DriverPunctualityRecord {
  id: string;
  driverId: string;
  driverName: string;
  busNo: string;
  date: string;
  scheduledDeparture: string;
  actualDeparture: string;
  scheduledReaching: string;
  actualReaching?: string;
  delayMinutes: number;
  onTime: boolean;
  busStatus: BusIncidentStatus;
  updatedAt: number;
}

type DriverRegistrationStatus = 'pending' | 'approved' | 'rejected';

interface DriverAccount {
  driverId: string;
  name: string;
  busNo: string;
  pin: string;
  licenseNumber: string;
  licenseImage: string;
  status: DriverRegistrationStatus;
  createdAt: number;
  reviewedAt?: number | null;
}

interface CompletedTour {
  id: string;
  driverId: string;
  busNo: string;
  startPoint: string;
  endPoint: string;
  routeStops: string[];
  departureTime?: string;
  reachingTime?: string;
  completedCount: number;
  lastCompletedAt: number;
}

interface StoreData {
  timings: BusTiming[];
  drivers: DriverAccount[];
  punctualityLogs: DriverPunctualityRecord[];
  completedTours: CompletedTour[];
}

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const VAPID_PATH = path.join(DATA_DIR, 'vapid.json');
const TOKEN_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(process.cwd() + '_mybus_secret').digest('hex');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@mybus.app').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@mybus.app';

interface VapidKeysConfig {
  publicKey: string;
  privateKey: string;
}

function loadOrCreateVapidKeys(): VapidKeysConfig {
  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPub && envPriv) {
    return { publicKey: envPub, privateKey: envPriv };
  }
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(VAPID_PATH)) {
      const raw = JSON.parse(fs.readFileSync(VAPID_PATH, 'utf8')) as Partial<VapidKeysConfig>;
      if (
        typeof raw.publicKey === 'string' &&
        raw.publicKey &&
        typeof raw.privateKey === 'string' &&
        raw.privateKey
      ) {
        return { publicKey: raw.publicKey, privateKey: raw.privateKey };
      }
    }
    const generated = webpush.generateVAPIDKeys();
    fs.writeFileSync(VAPID_PATH, JSON.stringify(generated, null, 2), 'utf8');
    return generated;
  } catch {
    return webpush.generateVAPIDKeys();
  }
}

function sanitizePushSubscription(raw: unknown): webpush.PushSubscription | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const endpoint = typeof obj.endpoint === 'string' ? obj.endpoint.trim() : '';
  if (!endpoint || endpoint.length > 2048) return null;
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  const keys = obj.keys as Record<string, unknown> | undefined;
  if (!keys || typeof keys !== 'object') return null;
  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh.trim() : '';
  const auth = typeof keys.auth === 'string' ? keys.auth.trim() : '';
  if (!p256dh || !auth || p256dh.length > 512 || auth.length > 256) return null;
  return {
    endpoint,
    keys: { p256dh, auth },
  };
}

// Optional Supabase Server Client
function createSafeSupabaseClient(
  rawUrl?: string,
  rawKey?: string
): SupabaseClient | null {
  const url = rawUrl?.trim();
  const key = rawKey?.trim();
  if (
    !url ||
    !key ||
    url.includes('your-project-ref') ||
    url.includes('MY_') ||
    key.includes('your-supabase') ||
    key.includes('MY_')
  ) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return createClient(url, key);
  } catch {
    return null;
  }
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createSafeSupabaseClient(supabaseUrl, supabaseKey);
const isSupabaseConfigured = supabase !== null;

function normalizeDriverStatus(raw: unknown): DriverRegistrationStatus {
  const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (
    normalized === 'approved' ||
    normalized === 'pending' ||
    normalized === 'rejected'
  ) {
    return normalized;
  }
  return 'pending';
}

function normalizeDriverAccount(d: Partial<DriverAccount>): DriverAccount {
  return {
    driverId: String(d.driverId || '').trim().toUpperCase(),
    name: String(d.name || '').trim(),
    busNo: String(d.busNo || '').trim().toUpperCase(),
    pin: String(d.pin || ''),
    licenseNumber: String(d.licenseNumber || '').trim(),
    licenseImage: typeof d.licenseImage === 'string' ? d.licenseImage : '',
    status: normalizeDriverStatus(d.status),
    createdAt: typeof d.createdAt === 'number' ? d.createdAt : Date.now(),
    reviewedAt: typeof d.reviewedAt === 'number' ? d.reviewedAt : null,
  };
}

function toPublicDriver(d: DriverAccount) {
  return {
    driverId: d.driverId,
    name: d.name,
    busNo: d.busNo,
    licenseNumber: d.licenseNumber,
    licenseImage: d.licenseImage,
    status: d.status,
    createdAt: d.createdAt,
    reviewedAt: d.reviewedAt ?? null,
  };
}

function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin, salt, 32).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPin(pin: string, stored: string): boolean {
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    const actual = crypto.scryptSync(pin, salt, 32);
    const expected = Buffer.from(expectedHex, 'hex');
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  }
  return pin === stored;
}

function sanitizeLicenseImage(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.length > 1_500_000) return null;
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function sanitizeTimeHHMM(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  const match = /^(\d{2}):(\d{2})$/.exec(trimmed);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return undefined;
  return `${match[1]}:${match[2]}`;
}

function parseTimeToMinutes(hhmm: string): number | null {
  const clean = sanitizeTimeHHMM(hhmm);
  if (!clean) return null;
  const [h, m] = clean.split(':').map(Number);
  return h * 60 + m;
}

function formatMinutesToHHMM(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function loadStore(): StoreData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_PATH)) {
      const initial: StoreData = {
        timings: [],
        drivers: [],
        punctualityLogs: [],
        completedTours: [],
      };
      fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    const timings = Array.isArray(parsed.timings) ? parsed.timings : [];
    const drivers = Array.isArray(parsed.drivers)
      ? parsed.drivers.map((d) => normalizeDriverAccount(d))
      : [];
    const punctualityLogs = Array.isArray(parsed.punctualityLogs)
      ? parsed.punctualityLogs
      : [];
    const completedTours = Array.isArray(parsed.completedTours)
      ? parsed.completedTours
      : [];
    return { timings, drivers, punctualityLogs, completedTours };
  } catch {
    return {
      timings: [],
      drivers: [],
      punctualityLogs: [],
      completedTours: [],
    };
  }
}

function saveStore(store: StoreData) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist store:', err);
  }
}

function signToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken<T extends Record<string, unknown>>(token: string): T | null {
  try {
    const [encoded, sig] = token.split('.');
    if (!encoded || !sig) return null;
    const expectedSig = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(encoded)
      .digest('base64url');
    if (sig !== expectedSig) return null;
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function computeBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function bearingToCardinal(deg: number | null): string {
  if (deg === null || Number.isNaN(deg)) return 'Stationary';
  const dirs = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function syncTimingToSupabase(timing: BusTiming) {
  if (!supabase) return;
  const { error } = await supabase.from('bus_timings').upsert({
    id: timing.id,
    bus_no: timing.busNo,
    route: timing.route,
    start_point: timing.startPoint,
    end_point: timing.endPoint,
    stops: timing.stops,
    departure_time: timing.departureTime,
    arrival_time: timing.arrivalTime,
    frequency: timing.frequency,
    status: timing.status,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.warn('Supabase bus_timings upsert error:', error.message);
  }
}

async function syncDriverToSupabase(driver: DriverAccount) {
  if (!supabase) return;
  const { error } = await supabase.from('drivers').upsert({
    driver_id: driver.driverId,
    name: driver.name,
    bus_no: driver.busNo,
    pin: driver.pin,
    license_number: driver.licenseNumber,
    license_image: driver.licenseImage,
    status: driver.status,
    reviewed_at: driver.reviewedAt
      ? new Date(driver.reviewedAt).toISOString()
      : null,
    created_at: new Date(driver.createdAt).toISOString(),
  });
  if (error) {
    console.warn('Supabase drivers upsert error:', error.message);
    if (error.message.includes('column')) {
      const { error: fallbackError } = await supabase.from('drivers').upsert({
        driver_id: driver.driverId,
        name: driver.name,
        bus_no: driver.busNo,
        pin: driver.pin,
      });
      if (fallbackError) {
        console.warn('Supabase legacy drivers upsert error:', fallbackError.message);
      }
    }
  }
}

async function deleteTimingInSupabase(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from('bus_timings').delete().eq('id', id);
  if (error) {
    console.warn('Supabase bus_timings delete error:', error.message);
  }
}

async function deleteDriverInSupabase(driverId: string) {
  if (!supabase) return;
  const { error: driverErr } = await supabase
    .from('drivers')
    .delete()
    .eq('driver_id', driverId);
  if (driverErr) {
    console.warn('Supabase drivers delete error:', driverErr.message);
  }
  const { error: liveErr } = await supabase
    .from('live_buses')
    .delete()
    .eq('driver_id', driverId);
  if (liveErr) {
    console.warn('Supabase live_buses delete error:', liveErr.message);
  }
}

async function syncLiveBusToSupabase(bus: LiveBus) {
  if (!supabase) return;
  const { error } = await supabase.from('live_buses').upsert({
    driver_id: bus.driverId,
    driver_name: bus.driverName,
    bus_no: bus.busNo,
    start_point: bus.startPoint,
    end_point: bus.endPoint,
    route_stops: bus.routeStops,
    lat: bus.lat,
    lng: bus.lng,
    heading: bus.heading,
    speed_kmh: bus.speedKmh,
    direction_text: bus.directionText,
    bus_status: bus.busStatus,
    status_note: bus.statusNote || '',
    route_coordinates: bus.routeCoordinates || [],
    is_active: true,
    updated_at: new Date(bus.updatedAt).toISOString(),
  });
  if (error) {
    console.warn('Supabase live_buses upsert error:', error.message);
  }
}

async function stopLiveBusInSupabase(driverId: string) {
  if (!supabase) return;
  const { error } = await supabase
    .from('live_buses')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('driver_id', driverId);
  if (error) {
    console.warn('Supabase live_buses stop error:', error.message);
  }
}

async function bootstrap() {
  const store = loadStore();
  const liveBuses = new Map<string, LiveBus>();
  let vapidKeys = loadOrCreateVapidKeys();
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);
  } catch (err) {
    console.warn('Invalid VAPID env configuration, generating fresh keys:', err);
    vapidKeys = webpush.generateVAPIDKeys();
    webpush.setVapidDetails('mailto:admin@mybus.app', vapidKeys.publicKey, vapidKeys.privateKey);
  }

  interface StopPushAlertRecord {
    key: string;
    sessionId: string;
    driverId: string;
    busNo: string;
    stopLabel: string;
    stopLat: number;
    stopLng: number;
    thresholdKm: number;
    subscription: webpush.PushSubscription | null;
    notified: boolean;
    createdAt: number;
    lastNotifiedAt?: number;
  }
  const stopAlerts = new Map<string, StopPushAlertRecord>();

  let supabaseTablesReady = false;
  let supabaseStatusMessage: string | null = null;

  // Load initial timings & live buses from Supabase if configured
  if (supabase) {
    try {
      const { data, error: timingsError } = await supabase
        .from('bus_timings')
        .select('*');
      if (timingsError) {
        supabaseStatusMessage = timingsError.message;
        console.warn('Supabase bus_timings check:', timingsError.message);
      } else {
        supabaseTablesReady = true;
        if (data && data.length > 0) {
          store.timings = data.map((row) => ({
            id: row.id,
            busNo: row.bus_no,
            route: row.route,
            startPoint: row.start_point,
            endPoint: row.end_point,
            stops: row.stops || [],
            departureTime: row.departure_time,
            arrivalTime: row.arrival_time,
            frequency: row.frequency,
            status: row.status,
          }));
          saveStore(store);
        } else if (store.timings.length > 0) {
          for (const timing of store.timings) {
            await syncTimingToSupabase(timing);
          }
        }
      }

      const { data: driverRows, error: driversError } = await supabase
        .from('drivers')
        .select('*');
      if (!driversError && driverRows) {
        if (driverRows.length > 0) {
          const previousLocalMap = new Map(
            store.drivers.map((drv) => [drv.driverId.toUpperCase(), drv])
          );
          store.drivers = driverRows.map((d) => {
            const idNorm = String(d.driver_id || '').trim().toUpperCase();
            const existingLocal = previousLocalMap.get(idNorm);
            const resolvedStatus =
              d.status !== undefined && d.status !== null
                ? normalizeDriverStatus(d.status)
                : existingLocal
                ? existingLocal.status
                : 'pending';
            return normalizeDriverAccount({
              driverId: idNorm,
              name: d.name,
              busNo: d.bus_no,
              pin: d.pin,
              licenseNumber: d.license_number ?? existingLocal?.licenseNumber ?? '',
              licenseImage: d.license_image ?? existingLocal?.licenseImage ?? '',
              status: resolvedStatus,
              createdAt: d.created_at
                ? new Date(String(d.created_at)).getTime()
                : existingLocal?.createdAt ?? Date.now(),
              reviewedAt: d.reviewed_at
                ? new Date(String(d.reviewed_at)).getTime()
                : existingLocal?.reviewedAt ?? null,
            });
          });
          saveStore(store);
        } else {
          for (const drv of store.drivers) {
            await syncDriverToSupabase(drv);
          }
        }
      }

      const { data: activeBuses, error: liveError } = await supabase
        .from('live_buses')
        .select('*')
        .eq('is_active', true);
      if (liveError) {
        supabaseTablesReady = false;
        supabaseStatusMessage = liveError.message;
      } else if (activeBuses) {
        for (const b of activeBuses) {
          const updatedAtMs = b.updated_at
            ? new Date(b.updated_at).getTime()
            : Date.now();
          const isFresh = Date.now() - updatedAtMs < 12000;
          liveBuses.set(b.driver_id, {
            driverId: b.driver_id,
            driverName: b.driver_name,
            busNo: b.bus_no,
            startPoint: b.start_point,
            endPoint: b.end_point,
            routeStops: b.route_stops || [],
            lat: b.lat,
            lng: b.lng,
            heading: b.heading,
            speedKmh: isFresh ? Number(b.speed_kmh || 0) : 0,
            directionText: b.direction_text || 'Active GPS signal',
            busStatus: (b.bus_status as BusIncidentStatus) || 'Normal',
            statusNote: b.status_note || '',
            routeCoordinates: Array.isArray(b.route_coordinates)
              ? b.route_coordinates
              : [],
            updatedAt: updatedAtMs,
          });
        }
      }
    } catch (err) {
      supabaseStatusMessage =
        err instanceof Error ? err.message : 'Supabase connection error';
      console.warn('Supabase bootstrap fallback to local store:', err);
    }
  }

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    try {
      const pathname = new URL(
        req.url || '/',
        `http://${req.headers.host || 'localhost'}`
      ).pathname;
      if (pathname === '/ws') {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req);
        });
      }
    } catch {
      socket.destroy();
    }
  });

  interface ClientMeta {
    ws: WebSocket;
    role: 'user' | 'driver' | 'admin';
    sessionId: string;
    driverId?: string;
    authenticatedDriverId?: string;
  }

  const clients = new Set<ClientMeta>();

  async function refreshDriverFromDatabase(
    driverId: string
  ): Promise<DriverAccount | undefined> {
    const idNorm = driverId.trim().toUpperCase();
    const localMatch = store.drivers.find(
      (d) => d.driverId.toUpperCase() === idNorm
    );
    if (!supabase) return localMatch;
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('driver_id', idNorm)
        .maybeSingle();
      if (error || !data) {
        return localMatch;
      }
      const hydrated = normalizeDriverAccount({
        driverId: data.driver_id,
        name: data.name,
        busNo: data.bus_no,
        pin: data.pin,
        licenseNumber: data.license_number ?? localMatch?.licenseNumber ?? '',
        licenseImage: data.license_image ?? localMatch?.licenseImage ?? '',
        status:
          data.status !== undefined && data.status !== null
            ? normalizeDriverStatus(data.status)
            : localMatch?.status ?? 'pending',
        createdAt: data.created_at
          ? new Date(String(data.created_at)).getTime()
          : localMatch?.createdAt ?? Date.now(),
        reviewedAt: data.reviewed_at
          ? new Date(String(data.reviewed_at)).getTime()
          : localMatch?.reviewedAt ?? null,
      });
      const idx = store.drivers.findIndex(
        (d) => d.driverId.toUpperCase() === idNorm
      );
      if (idx === -1) {
        store.drivers.push(hydrated);
      } else {
        store.drivers[idx] = hydrated;
      }
      saveStore(store);
      return hydrated;
    } catch {
      return localMatch;
    }
  }

  function isApprovedDriver(driverId: string): boolean {
    const idNorm = driverId.trim().toUpperCase();
    const found = store.drivers.find(
      (d) => d.driverId.toUpperCase() === idNorm
    );
    return found !== undefined && found.status === 'approved';
  }

  function getStats() {
    const userSessions = new Set<string>();
    const driverSessions = new Set<string>();
    const adminSessions = new Set<string>();

    for (const c of clients) {
      if (c.ws.readyState !== WebSocket.OPEN) continue;
      if (c.role === 'user') userSessions.add(c.sessionId);
      else if (c.role === 'driver') driverSessions.add(c.sessionId);
      else if (c.role === 'admin') adminSessions.add(c.sessionId);
    }

    return {
      activeUsers: userSessions.size,
      activeDrivers: driverSessions.size,
      activeAdmins: adminSessions.size,
      totalConnections: userSessions.size + driverSessions.size + adminSessions.size,
      liveBusCount: liveBuses.size,
      timingCount: store.timings.length,
      pendingDriverCount: store.drivers.filter((d) => d.status === 'pending').length,
      registeredDriverCount: store.drivers.length,
    };
  }

  function broadcast(payload: unknown) {
    const raw = JSON.stringify(payload);
    for (const c of clients) {
      if (c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(raw);
      }
    }
  }

  function broadcastStats() {
    broadcast({ type: 'stats:update', stats: getStats() });
  }

  function normalizeIncidentStatus(raw: unknown): BusIncidentStatus {
    const valid: BusIncidentStatus[] = [
      'Normal',
      'Delayed',
      'Punctured',
      'Breakdown',
      'Accident',
      'Road Block',
    ];
    return valid.includes(raw as BusIncidentStatus)
      ? (raw as BusIncidentStatus)
      : 'Normal';
  }

  function recordLivePunctualityLog(bus: LiveBus) {
    const today = formatDateKey(new Date());
    const matchedTiming = store.timings.find(
      (t) => t.busNo.trim().toUpperCase() === bus.busNo.trim().toUpperCase()
    );
    const scheduledDeparture =
      sanitizeTimeHHMM(bus.departureTime) ||
      sanitizeTimeHHMM(matchedTiming?.departureTime) ||
      '';
    const scheduledReaching =
      sanitizeTimeHHMM(bus.reachingTime) ||
      sanitizeTimeHHMM(matchedTiming?.arrivalTime) ||
      '';

    if (!scheduledDeparture) {
      return;
    }

    const nowDate = new Date();
    const actualHHMM = `${String(nowDate.getHours()).padStart(2, '0')}:${String(
      nowDate.getMinutes()
    ).padStart(2, '0')}`;

    const schedMins = parseTimeToMinutes(scheduledDeparture);
    const actualMins = parseTimeToMinutes(actualHHMM);
    let delayMinutes = 0;
    if (schedMins !== null && actualMins !== null) {
      const diff = actualMins - schedMins;
      if (diff > 0 && diff <= 120) {
        delayMinutes = diff;
      }
    }
    if (bus.busStatus === 'Delayed' && delayMinutes < 8) {
      delayMinutes = 8;
    } else if (
      bus.busStatus !== 'Normal' &&
      bus.busStatus !== 'Delayed' &&
      delayMinutes < 15
    ) {
      delayMinutes = 15;
    }

    const onTime = bus.busStatus === 'Normal' && delayMinutes <= 5;
    const recordId = `pl-${bus.driverId}-${today}-live`;
    const existingIdx = store.punctualityLogs.findIndex(
      (r) => r.id === recordId
    );
    const schedArrMins = scheduledReaching
      ? parseTimeToMinutes(scheduledReaching)
      : null;
    const actualReaching =
      schedArrMins !== null
        ? formatMinutesToHHMM(schedArrMins + delayMinutes)
        : scheduledReaching;

    const record: DriverPunctualityRecord = {
      id: recordId,
      driverId: bus.driverId,
      driverName: bus.driverName,
      busNo: bus.busNo,
      date: today,
      scheduledDeparture,
      actualDeparture:
        existingIdx >= 0
          ? store.punctualityLogs[existingIdx].actualDeparture
          : actualHHMM,
      scheduledReaching,
      actualReaching,
      delayMinutes,
      onTime,
      busStatus: bus.busStatus,
      updatedAt: Date.now(),
    };

    if (existingIdx >= 0) {
      store.punctualityLogs[existingIdx] = record;
    } else {
      store.punctualityLogs.push(record);
    }
    if (store.punctualityLogs.length > 2500) {
      store.punctualityLogs = store.punctualityLogs.slice(-2500);
    }
    saveStore(store);
  }

  function upsertLiveBusLocation(input: {
    driverId: string;
    driverName: string;
    busNo: string;
    startPoint: string;
    endPoint: string;
    routeStops: string[];
    departureTime?: string;
    reachingTime?: string;
    lat: number;
    lng: number;
    heading: number | null;
    speedMs?: number | null;
    accuracy?: number | null;
    busStatus?: BusIncidentStatus;
    statusNote?: string;
    routeCoordinates?: [number, number][];
  }): LiveBus {
    const prev = liveBuses.get(input.driverId);
    const now = Date.now();

    let resolvedHeading =
      typeof input.heading === 'number' && !Number.isNaN(input.heading)
        ? input.heading
        : null;

    const hasExplicitSpeed =
      typeof input.speedMs === 'number' &&
      Number.isFinite(input.speedMs) &&
      input.speedMs >= 0;

    let resolvedSpeedKmh = 0;
    if (hasExplicitSpeed) {
      const kmh = input.speedMs! * 3.6;
      resolvedSpeedKmh = kmh < 1.5 ? 0 : Math.min(110, Math.round(kmh));
    }

    const accuracyMeters =
      typeof input.accuracy === 'number' &&
      Number.isFinite(input.accuracy) &&
      input.accuracy > 0
        ? input.accuracy
        : null;

    if (prev) {
      const movedMeters = haversineMeters(prev.lat, prev.lng, input.lat, input.lng);
      const dtSec = (now - prev.updatedAt) / 1000;
      const minMoveThreshold = Math.max(12, (accuracyMeters ?? 15) * 0.5);
      const accuracyAcceptable = accuracyMeters === null || accuracyMeters <= 45;

      if (movedMeters > minMoveThreshold && accuracyAcceptable) {
        if (resolvedHeading === null) {
          resolvedHeading = computeBearing(prev.lat, prev.lng, input.lat, input.lng);
        }
        if (!hasExplicitSpeed && dtSec >= 2) {
          const estimatedKmh = Math.round((movedMeters / dtSec) * 3.6);
          if (estimatedKmh >= 2 && estimatedKmh <= 105) {
            resolvedSpeedKmh = estimatedKmh;
          }
        }
      } else if (resolvedHeading === null) {
        resolvedHeading = prev.heading;
      }
    }

    const cardinal = bearingToCardinal(resolvedHeading);
    const destSuffix = input.endPoint ? ` toward ${input.endPoint}` : '';
    const directionText =
      resolvedSpeedKmh === 0
        ? input.endPoint
          ? `Stationary · Toward ${input.endPoint}`
          : 'Stationary'
        : resolvedHeading !== null
        ? `Moving ${cardinal} (${Math.round(resolvedHeading)}°)${destSuffix}`
        : input.endPoint
        ? `En route toward ${input.endPoint}`
        : 'Active GPS signal';

    const resolvedStatus = input.busStatus
      ? normalizeIncidentStatus(input.busStatus)
      : prev?.busStatus || 'Normal';
    const resolvedNote =
      input.statusNote !== undefined ? input.statusNote : prev?.statusNote || '';
    const resolvedCoords =
      Array.isArray(input.routeCoordinates) && input.routeCoordinates.length > 0
        ? input.routeCoordinates
        : prev?.routeCoordinates || [];
    const resolvedDepTime =
      sanitizeTimeHHMM(input.departureTime) ?? prev?.departureTime;
    const resolvedReachTime =
      sanitizeTimeHHMM(input.reachingTime) ?? prev?.reachingTime;

    const updated: LiveBus = {
      driverId: input.driverId,
      driverName: input.driverName,
      busNo: input.busNo,
      startPoint: input.startPoint,
      endPoint: input.endPoint,
      routeStops: input.routeStops,
      departureTime: resolvedDepTime,
      reachingTime: resolvedReachTime,
      lat: input.lat,
      lng: input.lng,
      heading: resolvedHeading,
      speedKmh: resolvedSpeedKmh,
      directionText,
      busStatus: resolvedStatus,
      statusNote: resolvedNote,
      routeCoordinates: resolvedCoords,
      updatedAt: now,
    };

    liveBuses.set(input.driverId, updated);
    ensureBusTimingForDriverTour({
      busNo: updated.busNo,
      startPoint: updated.startPoint,
      endPoint: updated.endPoint,
      routeStops: updated.routeStops,
      departureTime: updated.departureTime,
      arrivalTime: updated.reachingTime,
      busStatus: updated.busStatus,
    });
    if (
      !prev ||
      prev.busStatus !== updated.busStatus ||
      prev.departureTime !== updated.departureTime ||
      prev.reachingTime !== updated.reachingTime
    ) {
      recordLivePunctualityLog(updated);
    }
    void syncLiveBusToSupabase(updated);
    broadcast({ type: 'bus:update', bus: updated });
    broadcastStats();
    void evaluateStopAlertsForBus(updated);
    return updated;
  }

  function normalizePlaceKey(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function normalizeBusKey(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toUpperCase();
  }

  function ensureBusTimingForDriverTour(params: {
    busNo: string;
    startPoint: string;
    endPoint: string;
    routeStops: string[];
    departureTime?: string;
    arrivalTime?: string;
    busStatus?: BusIncidentStatus;
  }): { created: boolean; timing?: BusTiming } {
    const busNo = params.busNo.trim();
    const startPoint = params.startPoint.trim();
    const endPoint = params.endPoint.trim();
    if (!busNo || !startPoint || !endPoint) {
      return { created: false };
    }

    const busKey = normalizeBusKey(busNo);
    const startKey = normalizePlaceKey(startPoint);
    const endKey = normalizePlaceKey(endPoint);
    const cleanStops = (params.routeStops || [])
      .map((s) => s.trim())
      .filter(Boolean);
    const depTime = sanitizeTimeHHMM(params.departureTime) || '--:--';
    const arrTime = sanitizeTimeHHMM(params.arrivalTime) || '--:--';
    const mappedStatus: BusTiming['status'] =
      params.busStatus === 'Delayed' || params.busStatus === 'Breakdown'
        ? 'Delayed'
        : 'On Time';

    const existingIdx = store.timings.findIndex(
      (t) =>
        normalizeBusKey(t.busNo) === busKey &&
        normalizePlaceKey(t.startPoint) === startKey &&
        normalizePlaceKey(t.endPoint) === endKey
    );

    if (existingIdx >= 0) {
      const existing = store.timings[existingIdx];
      // Never duplicate or overwrite Admin-provided timings.
      // Only refine auto-created driver timings in place when stops/times are updated.
      if (existing.id.startsWith('bt-drv-')) {
        const nextStops = cleanStops.length > 0 ? cleanStops : existing.stops;
        const nextDep = depTime !== '--:--' ? depTime : existing.departureTime;
        const nextArr = arrTime !== '--:--' ? arrTime : existing.arrivalTime;
        const stopsChanged = nextStops.join('|') !== existing.stops.join('|');
        const changed =
          stopsChanged ||
          nextDep !== existing.departureTime ||
          nextArr !== existing.arrivalTime ||
          mappedStatus !== existing.status;

        if (changed) {
          const updatedTiming: BusTiming = {
            ...existing,
            stops: nextStops,
            departureTime: nextDep,
            arrivalTime: nextArr,
            status: mappedStatus,
          };
          store.timings[existingIdx] = updatedTiming;
          saveStore(store);
          void syncTimingToSupabase(updatedTiming);
          broadcast({ type: 'timings:updated', timings: store.timings });
          return { created: false, timing: updatedTiming };
        }
      }
      return { created: false, timing: existing };
    }

    const createdTiming: BusTiming = {
      id: `bt-drv-${crypto.randomBytes(4).toString('hex')}`,
      busNo,
      route: `${startPoint} — ${endPoint}`,
      startPoint,
      endPoint,
      stops: cleanStops,
      departureTime: depTime,
      arrivalTime: arrTime,
      frequency: '',
      status: mappedStatus,
    };
    store.timings.push(createdTiming);
    saveStore(store);
    void syncTimingToSupabase(createdTiming);
    broadcast({ type: 'timings:updated', timings: store.timings });
    broadcastStats();
    return { created: true, timing: createdTiming };
  }

  async function evaluateStopAlertsForBus(bus: LiveBus) {
    for (const alert of stopAlerts.values()) {
      if (alert.driverId !== bus.driverId) continue;

      const distanceKm =
        Math.round(
          (haversineMeters(bus.lat, bus.lng, alert.stopLat, alert.stopLng) / 1000) *
            100
        ) / 100;

      if (alert.notified) {
        if (distanceKm > alert.thresholdKm * 1.5) {
          alert.notified = false;
        }
        continue;
      }

      if (distanceKm <= alert.thresholdKm) {
        alert.notified = true;
        alert.lastNotifiedAt = Date.now();

        const effectiveSpeed =
          bus.speedKmh > 6 ? Math.min(bus.speedKmh, 95) : 28;
        const etaMinutes =
          distanceKm <= 0.08
            ? 0
            : Math.max(1, Math.round(((distanceKm / effectiveSpeed) * 60)));
        const distLabel =
          distanceKm < 1
            ? `${Math.round(distanceKm * 1000)} m`
            : `${distanceKm.toFixed(1)} km`;
        const title = `Bus ${bus.busNo} approaching ${alert.stopLabel}`;
        const body =
          etaMinutes === 0
            ? `Arriving now (${distLabel} away)`
            : `${distLabel} away (~${etaMinutes} min ETA)`;
        const tag = `mybus-approach-${bus.driverId}-${alert.stopLabel}`;

        const approachingPayload = {
          driverId: bus.driverId,
          busNo: bus.busNo,
          stopLabel: alert.stopLabel,
          distanceKm,
          etaMinutes,
          triggeredAt: Date.now(),
        };

        for (const c of clients) {
          if (
            c.ws.readyState === WebSocket.OPEN &&
            c.sessionId === alert.sessionId
          ) {
            c.ws.send(
              JSON.stringify({
                type: 'bus:approaching',
                alert: approachingPayload,
                title,
                body,
                tag,
              })
            );
          }
        }

        if (alert.subscription) {
          try {
            await webpush.sendNotification(
              alert.subscription,
              JSON.stringify({
                title,
                body,
                tag,
                driverId: bus.driverId,
                busNo: bus.busNo,
                stopLabel: alert.stopLabel,
                distanceKm,
                etaMinutes,
                url: `/?track=${encodeURIComponent(bus.driverId)}`,
              })
            );
          } catch (err) {
            const statusCode = (err as { statusCode?: number })?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
              alert.subscription = null;
            }
          }
        }
      }
    }
  }

  function recordCompletedTourFromLiveBus(bus: LiveBus) {
    const startPoint = bus.startPoint.trim();
    const endPoint = bus.endPoint.trim();
    if (!startPoint || !endPoint) return;

    const cleanStops = (bus.routeStops || [])
      .map((s) => s.trim())
      .filter(Boolean);
    const busNo = bus.busNo.trim().toUpperCase();
    const driverId = bus.driverId.trim().toUpperCase();
    const depTime = sanitizeTimeHHMM(bus.departureTime);
    const reachTime = sanitizeTimeHHMM(bus.reachingTime);

    const buildSig = (
      bNo: string,
      sPt: string,
      ePt: string,
      stops: string[]
    ) =>
      [
        bNo.trim().toUpperCase(),
        sPt.trim().toLowerCase(),
        ePt.trim().toLowerCase(),
        ...stops.map((s) => s.trim().toLowerCase()),
      ].join('|');

    const incomingSig = buildSig(busNo, startPoint, endPoint, cleanStops);
    const now = Date.now();
    const existingIdx = store.completedTours.findIndex(
      (t) =>
        t.driverId.toUpperCase() === driverId &&
        buildSig(t.busNo, t.startPoint, t.endPoint, t.routeStops) ===
          incomingSig
    );

    if (existingIdx >= 0) {
      const prev = store.completedTours[existingIdx];
      store.completedTours[existingIdx] = {
        ...prev,
        startPoint,
        endPoint,
        routeStops: cleanStops,
        departureTime: depTime ?? prev.departureTime,
        reachingTime: reachTime ?? prev.reachingTime,
        completedCount: (prev.completedCount || 1) + 1,
        lastCompletedAt: now,
      };
    } else {
      store.completedTours.push({
        id: `tour-${crypto.randomBytes(4).toString('hex')}`,
        driverId,
        busNo,
        startPoint,
        endPoint,
        routeStops: cleanStops,
        departureTime: depTime,
        reachingTime: reachTime,
        completedCount: 1,
        lastCompletedAt: now,
      });
    }

    if (store.completedTours.length > 500) {
      store.completedTours = store.completedTours
        .sort((a, b) => b.lastCompletedAt - a.lastCompletedAt)
        .slice(0, 500);
    }
    saveStore(store);

    for (const c of clients) {
      if (
        c.ws.readyState === WebSocket.OPEN &&
        c.role === 'driver' &&
        (c.driverId?.toUpperCase() === driverId ||
          c.authenticatedDriverId?.toUpperCase() === driverId)
      ) {
        c.ws.send(JSON.stringify({ type: 'tours:updated', driverId }));
      }
    }
  }

  function removeLiveBus(
    driverId: string,
    forcedByAdmin = false,
    recordTour = true
  ) {
    const activeBus = liveBuses.get(driverId);
    const existed = liveBuses.delete(driverId);
    for (const alert of stopAlerts.values()) {
      if (alert.driverId === driverId) {
        alert.notified = false;
      }
    }
    if (existed) {
      if (recordTour && activeBus) {
        recordCompletedTourFromLiveBus(activeBus);
      }
      void stopLiveBusInSupabase(driverId);
      broadcast({ type: 'bus:removed', driverId });
      broadcastStats();
    }
    if (forcedByAdmin) {
      for (const c of clients) {
        if (
          c.ws.readyState === WebSocket.OPEN &&
          c.role === 'driver' &&
          c.driverId === driverId
        ) {
          c.ws.send(
            JSON.stringify({
              type: 'driver:force_stopped',
              reason: 'Your live location sharing was stopped by an administrator.',
            })
          );
        }
      }
    }
    return existed;
  }

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/ws', `http://${req.headers.host || 'localhost'}`);
    const roleParam = url.searchParams.get('role');
    const role: ClientMeta['role'] =
      roleParam === 'driver' || roleParam === 'admin' ? roleParam : 'user';
    const sessionId =
      url.searchParams.get('sessionId') || crypto.randomUUID();
    const driverId = url.searchParams.get('driverId') || undefined;
    const wsTokenParam = url.searchParams.get('token') || '';
    const decodedDriverToken =
      role === 'driver' && wsTokenParam
        ? verifyToken<{ role?: string; driverId?: string }>(wsTokenParam)
        : null;
    const authenticatedDriverId =
      decodedDriverToken &&
      decodedDriverToken.role === 'driver' &&
      decodedDriverToken.driverId &&
      isApprovedDriver(decodedDriverToken.driverId)
        ? decodedDriverToken.driverId.trim().toUpperCase()
        : undefined;

    const meta: ClientMeta = {
      ws,
      role,
      sessionId,
      driverId,
      authenticatedDriverId,
    };
    clients.add(meta);

    ws.send(
      JSON.stringify({
        type: 'init',
        timings: store.timings,
        liveBuses: Array.from(liveBuses.values()),
        stats: getStats(),
      })
    );
    broadcastStats();

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'driver:register_socket' && msg.driverId) {
          const reqId = String(msg.driverId).trim().toUpperCase();
          if (meta.authenticatedDriverId === reqId && isApprovedDriver(reqId)) {
            meta.driverId = reqId;
          }
          return;
        }
        if (msg.type === 'driver:location' && msg.payload) {
          const p = msg.payload;
          const reqId = String(p.driverId || '').trim().toUpperCase();
          const cleanStart = String(p.startPoint || '').trim();
          const cleanEnd = String(p.endPoint || '').trim();
          if (
            typeof p.lat === 'number' &&
            typeof p.lng === 'number' &&
            reqId &&
            p.busNo &&
            cleanStart &&
            cleanEnd &&
            meta.authenticatedDriverId === reqId &&
            isApprovedDriver(reqId)
          ) {
            meta.driverId = reqId;
            upsertLiveBusLocation({
              driverId: reqId,
              driverName: String(p.driverName || 'Driver'),
              busNo: String(p.busNo),
              startPoint: cleanStart,
              endPoint: cleanEnd,
              routeStops: Array.isArray(p.routeStops)
                ? p.routeStops.map(String).filter(Boolean)
                : [],
              departureTime: sanitizeTimeHHMM(p.departureTime),
              reachingTime: sanitizeTimeHHMM(p.reachingTime),
              lat: p.lat,
              lng: p.lng,
              heading: typeof p.heading === 'number' ? p.heading : null,
              speedMs: typeof p.speedMs === 'number' ? p.speedMs : null,
              accuracy: typeof p.accuracy === 'number' ? p.accuracy : null,
              busStatus: p.busStatus ? normalizeIncidentStatus(p.busStatus) : undefined,
              statusNote: typeof p.statusNote === 'string' ? p.statusNote : undefined,
              routeCoordinates: Array.isArray(p.routeCoordinates)
                ? p.routeCoordinates
                : undefined,
            });
          }
          return;
        }
        if (msg.type === 'driver:status' && msg.payload) {
          const p = msg.payload;
          const reqId = String(p.driverId || '').trim().toUpperCase();
          const existing =
            reqId &&
            meta.authenticatedDriverId === reqId &&
            isApprovedDriver(reqId)
              ? liveBuses.get(reqId)
              : undefined;
          if (existing) {
            const updated: LiveBus = {
              ...existing,
              busStatus: p.busStatus
                ? normalizeIncidentStatus(p.busStatus)
                : existing.busStatus,
              statusNote:
                typeof p.statusNote === 'string'
                  ? p.statusNote
                  : existing.statusNote,
              departureTime:
                sanitizeTimeHHMM(p.departureTime) ?? existing.departureTime,
              reachingTime:
                sanitizeTimeHHMM(p.reachingTime) ?? existing.reachingTime,
              updatedAt: Date.now(),
            };
            liveBuses.set(existing.driverId, updated);
            ensureBusTimingForDriverTour({
              busNo: updated.busNo,
              startPoint: updated.startPoint,
              endPoint: updated.endPoint,
              routeStops: updated.routeStops,
              departureTime: updated.departureTime,
              arrivalTime: updated.reachingTime,
              busStatus: updated.busStatus,
            });
            recordLivePunctualityLog(updated);
            void syncLiveBusToSupabase(updated);
            broadcast({ type: 'bus:update', bus: updated });
          }
          return;
        }
        if (msg.type === 'driver:stop' && msg.driverId) {
          const reqId = String(msg.driverId).trim().toUpperCase();
          if (meta.authenticatedDriverId === reqId) {
            removeLiveBus(reqId, false);
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      clients.delete(meta);
      broadcastStats();
    });
  });

  // --- API Endpoints ---
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      supabaseConfigured: isSupabaseConfigured,
      supabaseTablesReady,
      supabaseStatusMessage,
    });
  });

  app.get('/api/config', (_req, res) => {
    res.json({ supabaseConfigured: isSupabaseConfigured });
  });

  app.get('/api/timings', (_req, res) => {
    res.json({ timings: store.timings });
  });

  app.get('/api/live-buses', (_req, res) => {
    res.json({ liveBuses: Array.from(liveBuses.values()) });
  });

  // Web Push VAPID Public Key & Stop Proximity Alert Subscriptions
  app.get('/api/push/public-key', (_req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  app.post('/api/push/subscribe', async (req, res) => {
    const {
      sessionId,
      driverId,
      busNo,
      stopLabel,
      stopLat,
      stopLng,
      thresholdKm,
      subscription,
    } = req.body || {};

    const cleanSession = String(sessionId || '').trim();
    const cleanDriverId = String(driverId || '').trim().toUpperCase();
    const cleanBusNo = String(busNo || '').trim().slice(0, 40);
    const cleanStopLabel = String(stopLabel || '').trim().slice(0, 120);

    if (
      !cleanSession ||
      cleanSession.length > 128 ||
      !cleanDriverId ||
      cleanDriverId.length > 64 ||
      !cleanStopLabel ||
      typeof stopLat !== 'number' ||
      typeof stopLng !== 'number' ||
      !Number.isFinite(stopLat) ||
      !Number.isFinite(stopLng) ||
      stopLat < -90 ||
      stopLat > 90 ||
      stopLng < -180 ||
      stopLng > 180
    ) {
      res.status(400).json({
        error:
          'Valid sessionId, driverId, stopLabel, and stop coordinates are required.',
      });
      return;
    }

    const numericThreshold =
      typeof thresholdKm === 'number' && Number.isFinite(thresholdKm)
        ? Math.min(5, Math.max(0.2, thresholdKm))
        : 1;

    let cleanSub: webpush.PushSubscription | null = null;
    if (subscription !== null && subscription !== undefined) {
      cleanSub = sanitizePushSubscription(subscription);
      if (!cleanSub) {
        res.status(400).json({ error: 'Invalid push subscription payload.' });
        return;
      }
    }

    const key = `${cleanSession}:${cleanDriverId}`;
    const record: StopPushAlertRecord = {
      key,
      sessionId: cleanSession,
      driverId: cleanDriverId,
      busNo: cleanBusNo || cleanDriverId,
      stopLabel: cleanStopLabel,
      stopLat,
      stopLng,
      thresholdKm: numericThreshold,
      subscription: cleanSub,
      notified: false,
      createdAt: Date.now(),
    };
    stopAlerts.set(key, record);

    const activeBus = liveBuses.get(cleanDriverId);
    if (activeBus) {
      void evaluateStopAlertsForBus(activeBus);
    }

    res.status(201).json({
      ok: true,
      pushEnabled: cleanSub !== null,
      thresholdKm: numericThreshold,
    });
  });

  app.post('/api/push/unsubscribe', (req, res) => {
    const { sessionId, driverId } = req.body || {};
    const cleanSession = String(sessionId || '').trim();
    const cleanDriverId = String(driverId || '').trim().toUpperCase();
    if (!cleanSession) {
      res.status(400).json({ error: 'sessionId is required.' });
      return;
    }

    let removed = 0;
    if (cleanDriverId) {
      if (stopAlerts.delete(`${cleanSession}:${cleanDriverId}`)) {
        removed = 1;
      }
    } else {
      for (const [k, record] of stopAlerts.entries()) {
        if (record.sessionId === cleanSession) {
          stopAlerts.delete(k);
          removed += 1;
        }
      }
    }
    res.json({ ok: true, removed });
  });

  // Driver Auth
  app.post('/api/driver/login', async (req, res) => {
    const { driverId, pin } = req.body || {};
    const idNorm = String(driverId || '').trim().toUpperCase();
    const pinNorm = String(pin || '').trim();
    if (!idNorm || !pinNorm) {
      res.status(400).json({ error: 'Driver ID and PIN are required.' });
      return;
    }

    const found = await refreshDriverFromDatabase(idNorm);
    if (!found || !verifyPin(pinNorm, found.pin)) {
      res.status(401).json({ error: 'Invalid Driver ID or PIN.' });
      return;
    }
    if (found.status !== 'approved') {
      if (found.status === 'rejected') {
        res.status(403).json({
          error:
            'Your driver registration was rejected by an administrator. Please contact fleet support.',
        });
        return;
      }
      res.status(403).json({
        error:
          'Your registration is pending admin approval. You can log in only after an administrator approves your account.',
      });
      return;
    }

    const token = signToken({ role: 'driver', driverId: found.driverId });
    const activeLiveBus = liveBuses.get(found.driverId) ?? null;
    const completedTours = store.completedTours
      .filter((t) => t.driverId.toUpperCase() === found.driverId.toUpperCase())
      .sort((a, b) => b.lastCompletedAt - a.lastCompletedAt);

    res.json({
      token,
      driver: {
        driverId: found.driverId,
        name: found.name,
        busNo: found.busNo,
        licenseNumber: found.licenseNumber,
        status: found.status,
      },
      activeLiveBus,
      completedTours,
    });
  });

  app.post('/api/driver/register', (req, res) => {
    const { driverId, name, busNo, pin, licenseNumber, licenseImage } =
      req.body || {};
    const idNorm = String(driverId || '').trim().toUpperCase();
    const nameNorm = String(name || '').trim();
    const busNorm = String(busNo || '').trim().toUpperCase();
    const pinNorm = String(pin || '').trim();
    const licenseNorm = String(licenseNumber || '').trim().toUpperCase();
    const sanitizedImg = sanitizeLicenseImage(licenseImage);

    if (!idNorm || !nameNorm || !busNorm || pinNorm.length < 4 || licenseNorm.length < 4) {
      res.status(400).json({
        error:
          'Driver ID, full name, Bus No., Driving Licence No., and a 4+ digit PIN are required.',
      });
      return;
    }
    if (sanitizedImg === null) {
      res.status(400).json({
        error:
          'Driving licence photo must be a valid PNG, JPG, or WebP image under 1.5 MB.',
      });
      return;
    }
    if (store.drivers.some((d) => d.driverId.toUpperCase() === idNorm)) {
      res.status(409).json({ error: 'That Driver ID is already registered.' });
      return;
    }

    const created: DriverAccount = {
      driverId: idNorm,
      name: nameNorm,
      busNo: busNorm,
      pin: hashPin(pinNorm),
      licenseNumber: licenseNorm,
      licenseImage: sanitizedImg,
      status: 'pending',
      createdAt: Date.now(),
      reviewedAt: null,
    };
    store.drivers.push(created);
    saveStore(store);
    void syncDriverToSupabase(created);
    broadcast({ type: 'drivers:updated' });
    broadcastStats();

    res.status(201).json({
      ok: true,
      pending: true,
      message:
        'Registration submitted! Please wait for Admin approval before logging in.',
      driver: toPublicDriver(created),
    });
  });

  function requireApprovedDriver(
    req: express.Request,
    res: express.Response
  ): string | null {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const decoded = verifyToken<{ role?: string; driverId?: string }>(token);
    if (!decoded || decoded.role !== 'driver' || !decoded.driverId) {
      res.status(401).json({ error: 'Driver authorization required.' });
      return null;
    }
    const tokenDriverId = String(decoded.driverId).trim().toUpperCase();
    if (!isApprovedDriver(tokenDriverId)) {
      res.status(403).json({
        error: 'Your driver account is not approved by an administrator.',
      });
      return null;
    }
    return tokenDriverId;
  }

  app.post('/api/driver/location', async (req, res) => {
    const authedDriverId = requireApprovedDriver(req, res);
    if (!authedDriverId) return;

    const latestDriver = await refreshDriverFromDatabase(authedDriverId);
    if (!latestDriver || latestDriver.status !== 'approved') {
      res.status(403).json({
        error: 'Only approved drivers can share live bus locations.',
      });
      return;
    }

    const {
      driverName,
      busNo,
      startPoint,
      endPoint,
      routeStops,
      departureTime,
      reachingTime,
      lat,
      lng,
      heading,
      speedMs,
      accuracy,
      busStatus,
      statusNote,
      routeCoordinates,
      action,
    } = req.body || {};

    if (action === 'stop') {
      removeLiveBus(authedDriverId, false);
      res.json({ ok: true, stopped: true });
      return;
    }
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      res.status(400).json({ error: 'Valid numeric lat and lng are required.' });
      return;
    }
    const cleanStart = String(startPoint || '').trim();
    const cleanEnd = String(endPoint || '').trim();
    if (!cleanStart || !cleanEnd) {
      res.status(400).json({ error: 'Starting point and ending point are required.' });
      return;
    }

    const bus = upsertLiveBusLocation({
      driverId: authedDriverId,
      driverName: String(driverName || latestDriver.name || 'Driver'),
      busNo: String(busNo || latestDriver.busNo || ''),
      startPoint: cleanStart,
      endPoint: cleanEnd,
      routeStops: Array.isArray(routeStops) ? routeStops.map(String) : [],
      departureTime: sanitizeTimeHHMM(departureTime),
      reachingTime: sanitizeTimeHHMM(reachingTime),
      lat,
      lng,
      heading: typeof heading === 'number' ? heading : null,
      speedMs: typeof speedMs === 'number' ? speedMs : null,
      accuracy: typeof accuracy === 'number' ? accuracy : null,
      busStatus: busStatus ? normalizeIncidentStatus(busStatus) : undefined,
      statusNote: typeof statusNote === 'string' ? statusNote : undefined,
      routeCoordinates: Array.isArray(routeCoordinates)
        ? routeCoordinates
        : undefined,
    });
    res.json({ ok: true, bus });
  });

  app.post('/api/driver/status', async (req, res) => {
    const authedDriverId = requireApprovedDriver(req, res);
    if (!authedDriverId) return;

    const latestDriver = await refreshDriverFromDatabase(authedDriverId);
    if (!latestDriver || latestDriver.status !== 'approved') {
      res.status(403).json({ error: 'Only approved drivers can update status.' });
      return;
    }

    const { busStatus, statusNote, departureTime, reachingTime } = req.body || {};
    const existing = liveBuses.get(authedDriverId);
    if (!existing) {
      res.json({ ok: true, updated: false });
      return;
    }
    const updated: LiveBus = {
      ...existing,
      busStatus: busStatus
        ? normalizeIncidentStatus(busStatus)
        : existing.busStatus,
      statusNote:
        typeof statusNote === 'string' ? statusNote : existing.statusNote,
      departureTime:
        sanitizeTimeHHMM(departureTime) ?? existing.departureTime,
      reachingTime:
        sanitizeTimeHHMM(reachingTime) ?? existing.reachingTime,
      updatedAt: Date.now(),
    };
    liveBuses.set(existing.driverId, updated);
    ensureBusTimingForDriverTour({
      busNo: updated.busNo,
      startPoint: updated.startPoint,
      endPoint: updated.endPoint,
      routeStops: updated.routeStops,
      departureTime: updated.departureTime,
      arrivalTime: updated.reachingTime,
      busStatus: updated.busStatus,
    });
    recordLivePunctualityLog(updated);
    void syncLiveBusToSupabase(updated);
    broadcast({ type: 'bus:update', bus: updated });
    res.json({ ok: true, bus: updated });
  });

  app.post('/api/driver/tour-sync', async (req, res) => {
    const authedDriverId = requireApprovedDriver(req, res);
    if (!authedDriverId) return;

    const latestDriver = await refreshDriverFromDatabase(authedDriverId);
    if (!latestDriver || latestDriver.status !== 'approved') {
      res.status(403).json({ error: 'Only approved drivers can sync tours.' });
      return;
    }

    const {
      startPoint,
      endPoint,
      routeStops,
      departureTime,
      reachingTime,
      busStatus,
    } = req.body || {};

    const cleanStart = String(startPoint || '').trim();
    const cleanEnd = String(endPoint || '').trim();
    if (!cleanStart || !cleanEnd) {
      res.status(400).json({ error: 'Starting point and ending point are required.' });
      return;
    }

    const result = ensureBusTimingForDriverTour({
      busNo: latestDriver.busNo,
      startPoint: cleanStart,
      endPoint: cleanEnd,
      routeStops: Array.isArray(routeStops) ? routeStops.map(String) : [],
      departureTime: sanitizeTimeHHMM(departureTime),
      arrivalTime: sanitizeTimeHHMM(reachingTime),
      busStatus: busStatus ? normalizeIncidentStatus(busStatus) : undefined,
    });

    res.json({ ok: true, created: result.created, timing: result.timing || null });
  });

  app.get('/api/driver/tours', (req, res) => {
    const authedDriverId = requireApprovedDriver(req, res);
    if (!authedDriverId) return;
    const tours = store.completedTours
      .filter((t) => t.driverId.toUpperCase() === authedDriverId)
      .sort((a, b) => b.lastCompletedAt - a.lastCompletedAt);
    res.json({ tours });
  });

  app.delete('/api/driver/tours/:tourId', (req, res) => {
    const authedDriverId = requireApprovedDriver(req, res);
    if (!authedDriverId) return;
    const tourId = String(req.params.tourId || '').trim();
    const before = store.completedTours.length;
    store.completedTours = store.completedTours.filter(
      (t) =>
        !(t.id === tourId && t.driverId.toUpperCase() === authedDriverId)
    );
    if (store.completedTours.length === before) {
      res.status(404).json({ error: 'Tour not found.' });
      return;
    }
    saveStore(store);
    res.json({ ok: true });
  });

  // Admin Auth Middleware
  function requireAdmin(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const decoded = verifyToken<{ role?: string; email?: string }>(token);
    if (!decoded || decoded.role !== 'admin') {
      res.status(401).json({ error: 'Admin authorization required.' });
      return;
    }
    next();
  }

  app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body || {};
    const emailNorm = String(email || '').trim().toLowerCase();
    const passNorm = String(password || '');
    if (emailNorm !== ADMIN_EMAIL || passNorm !== ADMIN_PASSWORD) {
      res.status(401).json({ error: 'Invalid administrator credentials.' });
      return;
    }
    const token = signToken({ role: 'admin', email: emailNorm });
    res.json({ token, admin: { email: emailNorm } });
  });

  app.get('/api/admin/stats', requireAdmin, (_req, res) => {
    res.json({ stats: getStats() });
  });

  app.get('/api/admin/drivers', requireAdmin, (_req, res) => {
    const sorted = [...store.drivers]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(toPublicDriver);
    res.json({ drivers: sorted });
  });

  app.post('/api/admin/drivers/:driverId/approve', requireAdmin, (req, res) => {
    const idNorm = String(req.params.driverId || '').trim().toUpperCase();
    const idx = store.drivers.findIndex(
      (d) => d.driverId.toUpperCase() === idNorm
    );
    if (idx === -1) {
      res.status(404).json({ error: 'Driver not found.' });
      return;
    }
    const updated: DriverAccount = {
      ...store.drivers[idx],
      status: 'approved',
      reviewedAt: Date.now(),
    };
    store.drivers[idx] = updated;
    saveStore(store);
    void syncDriverToSupabase(updated);
    broadcast({ type: 'drivers:updated' });
    broadcastStats();
    res.json({ ok: true, driver: toPublicDriver(updated) });
  });

  app.post('/api/admin/drivers/:driverId/reject', requireAdmin, (req, res) => {
    const idNorm = String(req.params.driverId || '').trim().toUpperCase();
    const idx = store.drivers.findIndex(
      (d) => d.driverId.toUpperCase() === idNorm
    );
    if (idx === -1) {
      res.status(404).json({ error: 'Driver not found.' });
      return;
    }
    const updated: DriverAccount = {
      ...store.drivers[idx],
      status: 'rejected',
      reviewedAt: Date.now(),
    };
    store.drivers[idx] = updated;
    saveStore(store);
    void syncDriverToSupabase(updated);
    removeLiveBus(updated.driverId, true);
    for (const c of clients) {
      if (
        c.role === 'driver' &&
        (c.driverId?.toUpperCase() === idNorm ||
          c.authenticatedDriverId === idNorm)
      ) {
        c.authenticatedDriverId = undefined;
      }
    }
    broadcast({ type: 'drivers:updated' });
    broadcastStats();
    res.json({ ok: true, driver: toPublicDriver(updated) });
  });

  app.get('/api/admin/performance', requireAdmin, (req, res) => {
    const rawDays = Number(req.query.days);
    const days =
      Number.isFinite(rawDays) && rawDays >= 7 && rawDays <= 30
        ? Math.round(rawDays)
        : 30;
    const filterDriverId =
      typeof req.query.driverId === 'string' && req.query.driverId.trim()
        ? req.query.driverId.trim().toUpperCase()
        : undefined;

    const nowMs = Date.now();
    const msPerDay = 86_400_000;
    const dateKeys: string[] = [];
    for (let offset = days - 1; offset >= 0; offset--) {
      dateKeys.push(formatDateKey(new Date(nowMs - offset * msPerDay)));
    }
    const dateSet = new Set(dateKeys);
    const windowLogs = store.punctualityLogs.filter((log) =>
      dateSet.has(log.date)
    );

    // Build per-driver summaries across all drivers in the window
    const driverMap = new Map<
      string,
      {
        driverId: string;
        driverName: string;
        busNo: string;
        totalTrips: number;
        onTimeTrips: number;
        delayedTrips: number;
        delaySum: number;
        maxDelayMin: number;
        lastTripDate: string;
      }
    >();

    for (const log of windowLogs) {
      const id = log.driverId.toUpperCase();
      const existing = driverMap.get(id);
      if (!existing) {
        driverMap.set(id, {
          driverId: id,
          driverName: log.driverName,
          busNo: log.busNo,
          totalTrips: 1,
          onTimeTrips: log.onTime ? 1 : 0,
          delayedTrips: log.onTime ? 0 : 1,
          delaySum: log.delayMinutes,
          maxDelayMin: log.delayMinutes,
          lastTripDate: log.date,
        });
      } else {
        existing.totalTrips += 1;
        if (log.onTime) existing.onTimeTrips += 1;
        else existing.delayedTrips += 1;
        existing.delaySum += log.delayMinutes;
        if (log.delayMinutes > existing.maxDelayMin) {
          existing.maxDelayMin = log.delayMinutes;
        }
        if (log.date > existing.lastTripDate) {
          existing.lastTripDate = log.date;
        }
      }
    }

    const driverSummaries = Array.from(driverMap.values())
      .map((d) => ({
        driverId: d.driverId,
        driverName: d.driverName,
        busNo: d.busNo,
        totalTrips: d.totalTrips,
        onTimeTrips: d.onTimeTrips,
        delayedTrips: d.delayedTrips,
        punctualityPct:
          d.totalTrips > 0
            ? Math.round((d.onTimeTrips / d.totalTrips) * 1000) / 10
            : 0,
        avgDelayMin:
          d.totalTrips > 0
            ? Math.round((d.delaySum / d.totalTrips) * 10) / 10
            : 0,
        maxDelayMin: d.maxDelayMin,
        lastTripDate: d.lastTripDate,
      }))
      .sort((a, b) => b.punctualityPct - a.punctualityPct);

    const scopedLogs = filterDriverId
      ? windowLogs.filter(
          (log) => log.driverId.toUpperCase() === filterDriverId
        )
      : windowLogs;

    const dailyMap = new Map<
      string,
      { total: number; onTime: number; delayed: number; delaySum: number }
    >();
    for (const dateKey of dateKeys) {
      dailyMap.set(dateKey, { total: 0, onTime: 0, delayed: 0, delaySum: 0 });
    }
    for (const log of scopedLogs) {
      const bucket = dailyMap.get(log.date);
      if (!bucket) continue;
      bucket.total += 1;
      if (log.onTime) bucket.onTime += 1;
      else bucket.delayed += 1;
      bucket.delaySum += log.delayMinutes;
    }

    const dailySeries = dateKeys.map((date) => {
      const b = dailyMap.get(date)!;
      return {
        date,
        totalTrips: b.total,
        onTimeTrips: b.onTime,
        delayedTrips: b.delayed,
        onTimePct:
          b.total > 0 ? Math.round((b.onTime / b.total) * 1000) / 10 : 0,
        avgDelayMin:
          b.total > 0 ? Math.round((b.delaySum / b.total) * 10) / 10 : 0,
      };
    });

    const totalTrips = scopedLogs.length;
    const onTimeTrips = scopedLogs.filter((l) => l.onTime).length;
    const delayedTrips = totalTrips - onTimeTrips;
    const totalDelay = scopedLogs.reduce((acc, l) => acc + l.delayMinutes, 0);
    const overallOnTimePct =
      totalTrips > 0 ? Math.round((onTimeTrips / totalTrips) * 1000) / 10 : 0;
    const avgDelayMin =
      totalTrips > 0 ? Math.round((totalDelay / totalTrips) * 10) / 10 : 0;
    const topDriver = driverSummaries[0];

    res.json({
      days,
      generatedAt: nowMs,
      kpis: {
        overallOnTimePct,
        totalTrips,
        onTimeTrips,
        delayedTrips,
        avgDelayMin,
        activeTrackedDrivers: driverSummaries.length,
        topDriverName: topDriver ? topDriver.driverName : '—',
        topDriverPct: topDriver ? topDriver.punctualityPct : 0,
      },
      dailySeries,
      driverSummaries,
    });
  });

  app.delete('/api/admin/drivers/:driverId', requireAdmin, (req, res) => {
    const idNorm = String(req.params.driverId || '').trim().toUpperCase();
    if (!idNorm || idNorm.length > 64) {
      res.status(400).json({ error: 'Valid Driver ID is required.' });
      return;
    }

    const idx = store.drivers.findIndex(
      (d) => d.driverId.toUpperCase() === idNorm
    );
    if (idx === -1) {
      res.status(404).json({ error: 'Driver not found.' });
      return;
    }

    const [removedDriver] = store.drivers.splice(idx, 1);
    store.punctualityLogs = store.punctualityLogs.filter(
      (log) => log.driverId.toUpperCase() !== idNorm
    );
    store.completedTours = store.completedTours.filter(
      (tour) => tour.driverId.toUpperCase() !== idNorm
    );
    saveStore(store);
    void deleteDriverInSupabase(removedDriver.driverId);

    removeLiveBus(removedDriver.driverId, true, false);

    for (const [alertKey, alert] of stopAlerts.entries()) {
      if (alert.driverId.toUpperCase() === idNorm) {
        stopAlerts.delete(alertKey);
      }
    }

    for (const c of clients) {
      if (
        c.role === 'driver' &&
        (c.driverId?.toUpperCase() === idNorm ||
          c.authenticatedDriverId === idNorm)
      ) {
        c.authenticatedDriverId = undefined;
        c.driverId = undefined;
      }
    }

    broadcast({ type: 'drivers:updated' });
    broadcastStats();
    res.json({ ok: true, deletedDriverId: removedDriver.driverId });
  });

  app.post('/api/admin/stop-bus/:driverId', requireAdmin, (req, res) => {
    const driverId = String(req.params.driverId);
    const removed = removeLiveBus(driverId, true);
    res.json({ ok: true, stopped: removed });
  });

  app.post('/api/timings', requireAdmin, (req, res) => {
    const {
      busNo,
      startPoint,
      endPoint,
      stops,
      departureTime,
      arrivalTime,
      frequency,
      status,
    } = req.body || {};
    if (!busNo || !startPoint || !endPoint || !departureTime || !arrivalTime) {
      res.status(400).json({
        error: 'Bus No., start point, end point, departure time, and arrival time are required.',
      });
      return;
    }
    const cleanStops = Array.isArray(stops)
      ? stops.map((s) => String(s).trim()).filter(Boolean)
      : [];
    const created: BusTiming = {
      id: `bt-${crypto.randomBytes(4).toString('hex')}`,
      busNo: String(busNo).trim(),
      startPoint: String(startPoint).trim(),
      endPoint: String(endPoint).trim(),
      route: `${String(startPoint).trim()} — ${String(endPoint).trim()}`,
      stops: cleanStops,
      departureTime: String(departureTime).trim(),
      arrivalTime: String(arrivalTime).trim(),
      frequency: typeof frequency === 'string' ? frequency.trim() : '',
      status:
        status === 'Delayed' || status === 'Scheduled' ? status : 'On Time',
    };
    store.timings.push(created);
    saveStore(store);
    void syncTimingToSupabase(created);
    broadcast({ type: 'timings:updated', timings: store.timings });
    broadcastStats();
    res.status(201).json({ timing: created });
  });

  app.put('/api/timings/:id', requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const idx = store.timings.findIndex((t) => t.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Bus timing not found.' });
      return;
    }
    const existing = store.timings[idx];
    const body = req.body || {};
    const startPoint = String(body.startPoint ?? existing.startPoint).trim();
    const endPoint = String(body.endPoint ?? existing.endPoint).trim();
    const updated: BusTiming = {
      ...existing,
      busNo: String(body.busNo ?? existing.busNo).trim(),
      startPoint,
      endPoint,
      route: `${startPoint} — ${endPoint}`,
      stops: Array.isArray(body.stops)
        ? body.stops.map((s: unknown) => String(s).trim()).filter(Boolean)
        : existing.stops,
      departureTime: String(body.departureTime ?? existing.departureTime).trim(),
      arrivalTime: String(body.arrivalTime ?? existing.arrivalTime).trim(),
      frequency:
        typeof body.frequency === 'string'
          ? body.frequency.trim()
          : existing.frequency ?? '',
      status:
        body.status === 'Delayed' ||
        body.status === 'Scheduled' ||
        body.status === 'On Time'
          ? body.status
          : existing.status,
    };
    store.timings[idx] = updated;
    saveStore(store);
    void syncTimingToSupabase(updated);
    broadcast({ type: 'timings:updated', timings: store.timings });
    res.json({ timing: updated });
  });

  app.delete('/api/timings/:id', requireAdmin, (req, res) => {
    const id = String(req.params.id);
    const before = store.timings.length;
    store.timings = store.timings.filter((t) => t.id !== id);
    if (store.timings.length === before) {
      res.status(404).json({ error: 'Bus timing not found.' });
      return;
    }
    saveStore(store);
    void deleteTimingInSupabase(id);
    broadcast({ type: 'timings:updated', timings: store.timings });
    broadcastStats();
    res.json({ ok: true });
  });

  // Vite Dev Middleware or Static Production Build
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: hmrDisabled ? false : { server, path: '/vite-hmr' },
        ws: hmrDisabled ? false : { server, path: '/vite-hmr' },
      },
      appType: 'spa',
    });

    if (hmrDisabled) {
      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.send(`
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if ("document" in globalThis) {
  document.querySelectorAll("style[data-vite-dev-id]").forEach((el) => {
    sheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement("afterend", style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id="' + CSS.escape(id) + '"]').forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== "." && url[0] !== "/") return url;
  const pathname = url.replace(/[?#].*$/, "");
  const { search, hash } = new URL(url, "http://vite.dev");
  return pathname + "?" + queryToInject + (search ? "&" + search.slice(1) : "") + (hash || "");
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export class ErrorOverlay extends HTMLElement {
  close() { this.remove(); }
}
`);
      });
    }

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Decay stale speed to 0 km/h when a bus hasn't reported movement in >= 12s
  setInterval(() => {
    const now = Date.now();
    for (const [driverId, bus] of liveBuses.entries()) {
      if (bus.speedKmh > 0 && now - bus.updatedAt >= 12000) {
        const updatedBus: LiveBus = {
          ...bus,
          speedKmh: 0,
          directionText: bus.endPoint
            ? `Stationary · Toward ${bus.endPoint}`
            : 'Stationary',
        };
        liveBuses.set(driverId, updatedBus);
        void syncLiveBusToSupabase(updatedBus);
        broadcast({ type: 'bus:update', bus: updatedBus });
      }
    }
  }, 8000);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`My Bus server running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
