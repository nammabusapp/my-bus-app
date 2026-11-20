import dotenv from 'dotenv';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
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

interface DriverAccount {
  driverId: string;
  name: string;
  busNo: string;
  pin: string;
}

interface StoreData {
  timings: BusTiming[];
  drivers: DriverAccount[];
}

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const TOKEN_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(process.cwd() + '_mybus_secret').digest('hex');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@mybus.app').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

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
  { driverId: 'DRV-101', name: 'Rajendra Rao', busNo: '101-A', pin: '1234' },
  { driverId: 'DRV-102', name: 'Priya Sharma', busNo: '204-X', pin: '1234' },
  { driverId: 'DRV-103', name: 'Arjun Menon', busNo: '309-E', pin: '1234' },
];

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
      drivers: Array.isArray(parsed.drivers) ? parsed.drivers : SEED_DRIVERS,
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
  });
  if (error) {
    console.warn('Supabase drivers upsert error:', error.message);
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
          store.drivers = driverRows.map((d) => ({
            driverId: d.driver_id,
            name: d.name,
            busNo: d.bus_no,
            pin: d.pin,
          }));
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
  app.use(express.json());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  interface ClientMeta {
    ws: WebSocket;
    role: 'user' | 'driver' | 'admin';
    sessionId: string;
    driverId?: string;
  }

  const clients = new Set<ClientMeta>();

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
    return updated;
  }

  function removeLiveBus(driverId: string, forcedByAdmin = false) {
    const existed = liveBuses.delete(driverId);
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

    const meta: ClientMeta = { ws, role, sessionId, driverId };
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
          meta.driverId = String(msg.driverId);
          return;
        }
        if (msg.type === 'driver:location' && msg.payload) {
          const p = msg.payload;
          if (
            typeof p.lat === 'number' &&
            typeof p.lng === 'number' &&
            p.driverId &&
            p.busNo
          ) {
            meta.driverId = String(p.driverId);
            upsertLiveBusLocation({
              driverId: String(p.driverId),
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
          const existing = p.driverId ? liveBuses.get(String(p.driverId)) : undefined;
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
          removeLiveBus(String(msg.driverId), false);
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

  // Driver Auth
  app.post('/api/driver/login', (req, res) => {
    const { driverId, pin } = req.body || {};
    const idNorm = String(driverId || '').trim().toUpperCase();
    const pinNorm = String(pin || '').trim();
    const found = store.drivers.find(
      (d) => d.driverId.toUpperCase() === idNorm && d.pin === pinNorm
    );
    if (!found) {
      res.status(401).json({ error: 'Invalid Driver ID or PIN.' });
      return;
    }
    const token = signToken({ role: 'driver', driverId: found.driverId });
    res.json({
      token,
      driver: {
        driverId: found.driverId,
        name: found.name,
        busNo: found.busNo,
      },
    });
  });

  app.post('/api/driver/register', (req, res) => {
    const { driverId, name, busNo, pin } = req.body || {};
    const idNorm = String(driverId || '').trim().toUpperCase();
    const nameNorm = String(name || '').trim();
    const busNorm = String(busNo || '').trim().toUpperCase();
    const pinNorm = String(pin || '').trim();

    if (!idNorm || !nameNorm || !busNorm || pinNorm.length < 4) {
      res.status(400).json({
        error: 'Driver ID, full name, Bus No., and a 4+ digit PIN are required.',
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
      pin: pinNorm,
    };
    store.drivers.push(created);
    saveStore(store);
    void syncDriverToSupabase(created);

    const token = signToken({ role: 'driver', driverId: created.driverId });
    res.status(201).json({
      token,
      driver: {
        driverId: created.driverId,
        name: created.name,
        busNo: created.busNo,
      },
    });
  });

  app.post('/api/driver/location', (req, res) => {
    const {
      driverId,
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

    if (!driverId) {
      res.status(400).json({ error: 'driverId is required.' });
      return;
    }
    if (action === 'stop') {
      removeLiveBus(String(driverId), false);
      res.json({ ok: true, stopped: true });
      return;
    }
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      res.status(400).json({ error: 'Valid numeric lat and lng are required.' });
      return;
    }
    const bus = upsertLiveBusLocation({
      driverId: String(driverId),
      driverName: String(driverName || 'Driver'),
      busNo: String(busNo || 'BUS'),
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

  app.post('/api/driver/status', (req, res) => {
    const { driverId, busStatus, statusNote } = req.body || {};
    if (!driverId) {
      res.status(400).json({ error: 'driverId is required.' });
      return;
    }
    const existing = liveBuses.get(String(driverId));
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
        hmr: process.env.DISABLE_HMR !== 'true',
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
