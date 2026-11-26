import { useCallback, useEffect, useRef, useState } from 'react';
import { isSupabaseClientConfigured, supabase } from '../lib/supabase';
import {
  BusApproachingAlert,
  BusIncidentStatus,
  BusTiming,
  FleetStats,
  LiveBus,
} from '../types';

export interface BusApproachingEventPayload {
  alert: BusApproachingAlert;
  title: string;
  body: string;
  tag: string;
}

interface UseMyBusRealtimeOptions {
  role: 'user' | 'driver' | 'admin';
  driverId?: string;
  driverToken?: string | null;
  onForceStopped?: (reason: string) => void;
  onDriversUpdated?: () => void;
  onToursUpdated?: () => void;
  onBusApproaching?: (payload: BusApproachingEventPayload) => void;
}

export function getSessionId(): string {
  const key = 'mybus_session_id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `sess-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

export function useMyBusRealtime({
  role,
  driverId,
  driverToken,
  onForceStopped,
  onDriversUpdated,
  onToursUpdated,
  onBusApproaching,
}: UseMyBusRealtimeOptions) {
  const [timings, setTimings] = useState<BusTiming[]>([]);
  const [liveBuses, setLiveBuses] = useState<LiveBus[]>([]);
  const [stats, setStats] = useState<FleetStats>({
    activeUsers: 0,
    activeDrivers: 0,
    activeAdmins: 0,
    totalConnections: 0,
    liveBusCount: 0,
    timingCount: 0,
    pendingDriverCount: 0,
    registeredDriverCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const onForceStoppedRef = useRef(onForceStopped);
  onForceStoppedRef.current = onForceStopped;
  const onDriversUpdatedRef = useRef(onDriversUpdated);
  onDriversUpdatedRef.current = onDriversUpdated;
  const onToursUpdatedRef = useRef(onToursUpdated);
  onToursUpdatedRef.current = onToursUpdated;
  const onBusApproachingRef = useRef(onBusApproaching);
  onBusApproachingRef.current = onBusApproaching;

  const fetchInitialHttp = useCallback(async () => {
    try {
      const [tRes, bRes] = await Promise.all([
        fetch('/api/timings'),
        fetch('/api/live-buses'),
      ]);
      if (tRes.ok) {
        const tJson = await tRes.json();
        if (Array.isArray(tJson.timings)) setTimings(tJson.timings);
      }
      if (bRes.ok) {
        const bJson = await bRes.json();
        if (Array.isArray(bJson.liveBuses)) setLiveBuses(bJson.liveBuses);
      }
    } catch {
      // Handled gracefully by WebSocket reconnect
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchInitialHttp();
  }, [fetchInitialHttp]);

  useEffect(() => {
    let closedByCleanup = false;
    let reconnectTimer: number | null = null;
    let attempt = 0;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const sessionId = getSessionId();
      const params = new URLSearchParams({ role, sessionId });
      if (driverId) params.set('driverId', driverId);
      if (role === 'driver' && driverToken) params.set('token', driverToken);

      const ws = new WebSocket(
        `${protocol}//${window.location.host}/ws?${params.toString()}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        setLoading(false);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'init') {
            if (Array.isArray(msg.timings)) setTimings(msg.timings);
            if (Array.isArray(msg.liveBuses)) setLiveBuses(msg.liveBuses);
            if (msg.stats) setStats(msg.stats);
            setLoading(false);
          } else if (
            msg.type === 'timings:updated' &&
            Array.isArray(msg.timings)
          ) {
            setTimings(msg.timings);
          } else if (msg.type === 'bus:update' && msg.bus) {
            setLiveBuses((prev) => {
              const exists = prev.some((b) => b.driverId === msg.bus.driverId);
              if (exists) {
                return prev.map((b) =>
                  b.driverId === msg.bus.driverId ? msg.bus : b
                );
              }
              return [...prev, msg.bus];
            });
          } else if (msg.type === 'bus:removed' && msg.driverId) {
            setLiveBuses((prev) =>
              prev.filter((b) => b.driverId !== msg.driverId)
            );
          } else if (msg.type === 'stats:update' && msg.stats) {
            setStats(msg.stats);
          } else if (msg.type === 'drivers:updated') {
            onDriversUpdatedRef.current?.();
          } else if (msg.type === 'tours:updated') {
            onToursUpdatedRef.current?.();
          } else if (msg.type === 'bus:approaching' && msg.alert) {
            onBusApproachingRef.current?.({
              alert: msg.alert as BusApproachingAlert,
              title: String(msg.title || ''),
              body: String(msg.body || ''),
              tag: String(msg.tag || `mybus-approach-${msg.alert.driverId}`),
            });
          } else if (msg.type === 'driver:force_stopped') {
            onForceStoppedRef.current?.(
              msg.reason || 'Live sharing was stopped by administrator.'
            );
          }
        } catch {
          // Ignore invalid payloads
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!closedByCleanup) {
          const delay = Math.min(5000, 800 * Math.pow(1.5, attempt));
          attempt += 1;
          reconnectTimer = window.setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [role, driverId, driverToken]);

  useEffect(() => {
    if (!isSupabaseClientConfigured || !supabase) return;

    const channel = supabase
      .channel('mybus-realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_buses' },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row) return;
          if (payload.eventType === 'DELETE' || row.is_active === false) {
            const removedId = String(
              row.driver_id ||
                (payload.old as Record<string, unknown> | null)?.driver_id ||
                ''
            );
            if (removedId) {
              setLiveBuses((prev) =>
                prev.filter((b) => b.driverId !== removedId)
              );
              if (
                role === 'driver' &&
                driverId &&
                removedId === driverId &&
                row.is_active === false
              ) {
                onForceStoppedRef.current?.(
                  'Live location sharing ended via Supabase.'
                );
              }
            }
            return;
          }
          const bus: LiveBus = {
            driverId: String(row.driver_id),
            driverName: String(row.driver_name || 'Driver'),
            busNo: String(row.bus_no || ''),
            startPoint: String(row.start_point || ''),
            endPoint: String(row.end_point || ''),
            routeStops: Array.isArray(row.route_stops)
              ? row.route_stops.map(String)
              : [],
            departureTime:
              typeof row.departure_time === 'string' ? row.departure_time : undefined,
            reachingTime:
              typeof row.reaching_time === 'string' ? row.reaching_time : undefined,
            lat: Number(row.lat),
            lng: Number(row.lng),
            heading: typeof row.heading === 'number' ? row.heading : null,
            speedKmh: Number(row.speed_kmh || 0),
            directionText: String(row.direction_text || 'Active GPS signal'),
            busStatus:
              (row.bus_status as BusIncidentStatus) || 'Normal',
            statusNote: String(row.status_note || ''),
            routeCoordinates: Array.isArray(row.route_coordinates)
              ? (row.route_coordinates as [number, number][])
              : [],
            updatedAt: row.updated_at
              ? new Date(String(row.updated_at)).getTime()
              : Date.now(),
          };
          setLiveBuses((prev) => {
            const idx = prev.findIndex((b) => b.driverId === bus.driverId);
            if (idx === -1) return [...prev, bus];
            const copy = [...prev];
            copy[idx] = bus;
            return copy;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bus_timings' },
        () => {
          void fetchInitialHttp();
        }
      )
      .subscribe();

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [role, driverId, fetchInitialHttp]);

  const sendDriverLocation = useCallback(
    async (payload: {
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
      speedMs: number | null;
      accuracy?: number | null;
      busStatus?: BusIncidentStatus;
      statusNote?: string;
      routeCoordinates?: [number, number][];
    }) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: 'driver:location', payload })
        );
      } else if (driverToken) {
        await fetch('/api/driver/location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${driverToken}`,
          },
          body: JSON.stringify(payload),
        });
      }

      if (isSupabaseClientConfigured && supabase) {
        const speedKmh =
          typeof payload.speedMs === 'number' &&
          Number.isFinite(payload.speedMs) &&
          payload.speedMs >= 0
            ? payload.speedMs * 3.6 < 1.5
              ? 0
              : Math.min(110, Math.round(payload.speedMs * 3.6))
            : 0;
        void supabase.from('live_buses').upsert({
          driver_id: payload.driverId,
          driver_name: payload.driverName,
          bus_no: payload.busNo,
          start_point: payload.startPoint,
          end_point: payload.endPoint,
          route_stops: payload.routeStops,
          lat: payload.lat,
          lng: payload.lng,
          heading: payload.heading,
          speed_kmh: speedKmh,
          bus_status: payload.busStatus || 'Normal',
          status_note: payload.statusNote || '',
          route_coordinates: payload.routeCoordinates || [],
          is_active: true,
          updated_at: new Date().toISOString(),
        });
      }
    },
    [driverToken]
  );

  const sendDriverStatus = useCallback(
    async (payload: {
      driverId: string;
      busStatus: BusIncidentStatus;
      statusNote?: string;
      departureTime?: string;
      reachingTime?: string;
    }) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'driver:status', payload }));
      }
      if (driverToken) {
        await fetch('/api/driver/status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${driverToken}`,
          },
          body: JSON.stringify(payload),
        });
      }
      if (isSupabaseClientConfigured && supabase) {
        void supabase
          .from('live_buses')
          .update({
            bus_status: payload.busStatus,
            status_note: payload.statusNote || '',
            updated_at: new Date().toISOString(),
          })
          .eq('driver_id', payload.driverId);
      }
    },
    [driverToken]
  );

  const sendDriverStop = useCallback(
    async (id: string) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'driver:stop', driverId: id }));
      }
      if (driverToken) {
        await fetch('/api/driver/location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${driverToken}`,
          },
          body: JSON.stringify({ driverId: id, action: 'stop' }),
        });
      }
      if (isSupabaseClientConfigured && supabase) {
        void supabase
          .from('live_buses')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('driver_id', id);
      }
    },
    [driverToken]
  );

  return {
    timings,
    liveBuses,
    stats,
    loading,
    connected,
    sendDriverLocation,
    sendDriverStatus,
    sendDriverStop,
    refresh: fetchInitialHttp,
  };
}
