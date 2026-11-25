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
  frequency: string;
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

interface StoreData {
  timings: BusTiming[];
  drivers: DriverAccount[];
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

const SEED_TIMINGS: BusTiming[] = [
  {
    id: 'bt-101',
    busNo: '101-A',
    route: 'Central Station — Airport Terminal 2',
    startPoint: 'Central Station',
    endPoint: 'Airport Terminal 2',
    stops: ['City Market', 'Civic Hospital', 'Tech Park Phase 1', 'North Expressway'],
    departureTime: '06:30',
    arrivalTime: '07:25',
    frequency: 'Every 20 min',
    status: 'On Time',
  },
  {
    id: 'bt-204',
    busNo: '204-X',
    route: 'University Campus — Harbor Pier',
    startPoint: 'University Campus',
    endPoint: 'Harbor Pier',
    stops: ['Library Square', 'Metro Hub', 'Lakeview Junction', 'Old Town'],
    departureTime: '07:00',
    arrivalTime: '07:50',
    frequency: 'Every 15 min',
    status: 'On Time',
  },
  {
    id: 'bt-309',
    busNo: '309-E',
    route: 'North Bus Terminus — Eastgate Mall',
    startPoint: 'North Bus Terminus',
    endPoint: 'Eastgate Mall',
    stops: ['Botanical Park', 'Central Station', 'Sports Arena', 'Ring Road East'],
    departureTime: '07:30',
    arrivalTime: '08:15',
    frequency: 'Every 30 min',
    status: 'On Time',
  },
  {
    id: 'bt-412',
    busNo: '412-M',
    route: 'South Tech Corridor — City Market',
    startPoint: 'South Tech Corridor',
    endPoint: 'City Market',
    stops: ['Innovation Hub', 'Civic Hospital', 'Museum District'],
    departureTime: '08:10',
    arrivalTime: '08:55',
    frequency: 'Every 25 min',
    status: 'Delayed',
  },
  {
    id: 'bt-518',
    busNo: '518-C',
    route: 'Westgate Depot — University Campus',
    startPoint: 'Westgate Depot',
    endPoint: 'University Campus',
    stops: ['Industrial Park', 'Metro Hub', 'Science Plaza'],
    departureTime: '09:00',
    arrivalTime: '09:45',
    frequency: 'Every 20 min',
    status: 'Scheduled',
  },
  {
    id: 'bt-622',
    busNo: '622-N',
    route: 'Airport Terminal 2 — Harbor Pier',
    startPoint: 'Airport Terminal 2',
    endPoint: 'Harbor Pier',
    stops: ['North Expressway', 'Central Station', 'Old Town'],
    departureTime: '10:15',
    arrivalTime: '11:20',
    frequency: 'Every 40 min',
    status: 'On Time',
  },
];

const SEED_DRIVERS: DriverAccount[] = [
  {
    driverId: 'DRV-101',
    name: 'Rajendra Rao',
    busNo: '101-A',
    pin: '1234',
    licenseNumber: 'KA01-2019-00101',
    licenseImage: '',
    status: 'approved',
    createdAt: 1700000000000,
    reviewedAt: 1700000000000,
  },
  {
    driverId: 'DRV-102',
    name: 'Priya Sharma',
    busNo: '204-X',
    pin: '1234',
    licenseNumber: 'KA01-2020-00204',
    licenseImage: '',
    status: 'approved',
    createdAt: 1700000000000,
    reviewedAt: 1700000000000,
  },
  {
    driverId: 'DRV-103',
    name: 'Arjun Menon',
    busNo: '309-E',
    pin: '1234',
    licenseNumber: 'KA05-2021-00309',
    licenseImage: '',
    status: 'approved',
    createdAt: 1700000000000,
    reviewedAt: 1700000000000,
  },
];

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

function loadStore(): StoreData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_PATH)) {
      const initial: StoreData = {
        timings: SEED_TIMINGS,
        drivers: SEED_DRIVERS,
      };
      fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    return {
      timings: Array.isArray(parsed.timings) ? parsed.timings : SEED_TIMINGS,
      drivers: Array.isArray(parsed.drivers)
        ? parsed.drivers.map((d) => normalizeDriverAccount(d))
        : SEED_DRIVERS,
    };
  } catch {
    return { timings: SEED_TIMINGS, drivers: SEED_DRIVERS };
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
            speedKmh: b.speed_kmh || 0,
            directionText: b.direction_text || 'Active GPS signal',
            busStatus: (b.bus_status as BusIncidentStatus) || 'Normal',
            statusNote: b.status_note || '',
            routeCoordinates: Array.isArray(b.route_coordinates)
              ? b.route_coordinates
              : [],
            updatedAt: new Date(b.updated_at).getTime(),
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

  function upsertLiveBusLocation(input: {
    driverId: string;
    driverName: string;
    busNo: string;
    startPoint: string;
    endPoint: string;
    routeStops: string[];
    lat: number;
    lng: number;
    heading: number | null;
    speedMs?: number | null;
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
    let resolvedSpeedKmh =
      typeof input.speedMs === 'number' && !Number.isNaN(input.speedMs) && input.speedMs >= 0
        ? Math.round(input.speedMs * 3.6)
        : 0;

    if (prev) {
      const movedMeters = haversineMeters(prev.lat, prev.lng, input.lat, input.lng);
      const dtSec = Math.max(1, (now - prev.updatedAt) / 1000);
      if (movedMeters > 4) {
        if (resolvedHeading === null) {
          resolvedHeading = computeBearing(prev.lat, prev.lng, input.lat, input.lng);
        }
        if (resolvedSpeedKmh === 0) {
          resolvedSpeedKmh = Math.min(95, Math.round((movedMeters / dtSec) * 3.6));
        }
      } else if (resolvedHeading === null) {
        resolvedHeading = prev.heading;
      }
    }

    const cardinal = bearingToCardinal(resolvedHeading);
    const directionText =
      resolvedHeading !== null
        ? `Moving ${cardinal} (${Math.round(resolvedHeading)}°) toward ${input.endPoint}`
        : `En route toward ${input.endPoint}`;

    const resolvedStatus = input.busStatus
      ? normalizeIncidentStatus(input.busStatus)
      : prev?.busStatus || 'Normal';
    const resolvedNote =
      input.statusNote !== undefined ? input.statusNote : prev?.statusNote || '';
    const resolvedCoords =
      Array.isArray(input.routeCoordinates) && input.routeCoordinates.length > 0
        ? input.routeCoordinates
        : prev?.routeCoordinates || [];

    const updated: LiveBus = {
      driverId: input.driverId,
      driverName: input.driverName,
      busNo: input.busNo,
      startPoint: input.startPoint,
      endPoint: input.endPoint,
      routeStops: input.routeStops,
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
    void syncLiveBusToSupabase(updated);
    broadcast({ type: 'bus:update', bus: updated });
    broadcastStats();
    void evaluateStopAlertsForBus(updated);
    return updated;
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

  function removeLiveBus(driverId: string, forcedByAdmin = false) {
    const existed = liveBuses.delete(driverId);
    for (const alert of stopAlerts.values()) {
      if (alert.driverId === driverId) {
        alert.notified = false;
      }
    }
    if (existed) {
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
          if (
            typeof p.lat === 'number' &&
            typeof p.lng === 'number' &&
            reqId &&
            p.busNo &&
            meta.authenticatedDriverId === reqId &&
            isApprovedDriver(reqId)
          ) {
            meta.driverId = reqId;
            upsertLiveBusLocation({
              driverId: reqId,
              driverName: String(p.driverName || 'Driver'),
              busNo: String(p.busNo),
              startPoint: String(p.startPoint || 'Origin'),
              endPoint: String(p.endPoint || 'Destination'),
              routeStops: Array.isArray(p.routeStops)
                ? p.routeStops.map(String).filter(Boolean)
                : [],
              lat: p.lat,
              lng: p.lng,
              heading: typeof p.heading === 'number' ? p.heading : null,
              speedMs: typeof p.speedMs === 'number' ? p.speedMs : null,
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
              busStatus: normalizeIncidentStatus(p.busStatus),
              statusNote: typeof p.statusNote === 'string' ? p.statusNote : '',
              updatedAt: Date.now(),
            };
            liveBuses.set(existing.driverId, updated);
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
    res.json({
      token,
      driver: {
        driverId: found.driverId,
        name: found.name,
        busNo: found.busNo,
        licenseNumber: found.licenseNumber,
        status: found.status,
      },
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
      lat,
      lng,
      heading,
      speedMs,
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
    const bus = upsertLiveBusLocation({
      driverId: authedDriverId,
      driverName: String(driverName || latestDriver.name || 'Driver'),
      busNo: String(busNo || latestDriver.busNo || 'BUS'),
      startPoint: String(startPoint || 'Origin'),
      endPoint: String(endPoint || 'Destination'),
      routeStops: Array.isArray(routeStops) ? routeStops.map(String) : [],
      lat,
      lng,
      heading: typeof heading === 'number' ? heading : null,
      speedMs: typeof speedMs === 'number' ? speedMs : null,
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

    const { busStatus, statusNote } = req.body || {};
    const existing = liveBuses.get(authedDriverId);
    if (!existing) {
      res.json({ ok: true, updated: false });
      return;
    }
    const updated: LiveBus = {
      ...existing,
      busStatus: normalizeIncidentStatus(busStatus),
      statusNote: typeof statusNote === 'string' ? statusNote : '',
      updatedAt: Date.now(),
    };
    liveBuses.set(existing.driverId, updated);
    void syncLiveBusToSupabase(updated);
    broadcast({ type: 'bus:update', bus: updated });
    res.json({ ok: true, bus: updated });
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
      frequency: String(frequency || 'Every 20 min').trim(),
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
      frequency: String(body.frequency ?? existing.frequency).trim(),
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
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr:
          process.env.DISABLE_HMR !== 'true'
            ? { server, path: '/vite-hmr' }
            : false,
        ws: { server, path: '/vite-hmr' },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`My Bus server running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
