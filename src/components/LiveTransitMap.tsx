import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LiveBus, RouteStopPoint, ThemeMode, UserLocation } from '../types';

interface LiveTransitMapProps {
  userLocation?: UserLocation | null;
  liveBuses: LiveBus[];
  selectedBusId?: string | null;
  onSelectBus?: (driverId: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
  focusLatLng?: { lat: number; lng: number } | null;
  previewPolyline?: [number, number][];
  previewStops?: RouteStopPoint[];
  theme?: ThemeMode;
  className?: string;
}

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function createUserIcon(): L.DivIcon {
  return L.divIcon({
    className: 'mybus-div-icon',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `
      <div style="position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;">
        <span style="position:absolute;width:30px;height:30px;border-radius:9999px;background:rgba(37,99,235,0.26);border:1.5px solid rgba(59,130,246,0.55);"></span>
        <span style="position:relative;width:14px;height:14px;border-radius:9999px;background:#2563eb;border:2.5px solid #ffffff;box-shadow:0 2px 8px rgba(15,23,42,0.4);"></span>
      </div>
    `,
  });
}

function createStopIcon(index: number, total: number): L.DivIcon {
  const isEnd = index === 0 || index === total - 1;
  const bg = index === 0 ? '#059669' : index === total - 1 ? '#dc2626' : '#0f172a';
  const label = index === 0 ? 'S' : index === total - 1 ? 'E' : String(index);
  return L.divIcon({
    className: 'mybus-div-icon',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `
      <div style="width:26px;height:26px;border-radius:9999px;background:${bg};color:#ffffff;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(15,23,42,0.35);">
        ${isEnd ? label : index}
      </div>
    `,
  });
}

function createBusIcon(bus: LiveBus, isSelected: boolean): L.DivIcon {
  const rotation = typeof bus.heading === 'number' ? Math.round(bus.heading) : 0;
  const hasHeading = typeof bus.heading === 'number' && !Number.isNaN(bus.heading);

  const isCritical =
    bus.busStatus === 'Accident' ||
    bus.busStatus === 'Breakdown' ||
    bus.busStatus === 'Punctured' ||
    bus.busStatus === 'Road Block';
  const isDelayed = bus.busStatus === 'Delayed';

  const bg = isCritical
    ? '#dc2626'
    : isDelayed
    ? '#d97706'
    : isSelected
    ? '#0f172a'
    : '#2563eb';
  const ring = isSelected ? '#f59e0b' : '#ffffff';

  return L.divIcon({
    className: 'mybus-div-icon',
    iconSize: [110, 50],
    iconAnchor: [55, 29],
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:auto;">
        <div style="background:${bg};color:#ffffff;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;padding:2px 8px;border-radius:6px;border:1.5px solid ${ring};box-shadow:0 2px 10px rgba(15,23,42,0.35);white-space:nowrap;">
          ${bus.busNo}${bus.busStatus && bus.busStatus !== 'Normal' ? ` · ${bus.busStatus}` : ''}
        </div>
        <div style="width:28px;height:28px;border-radius:9999px;background:${bg};border:2px solid ${ring};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(15,23,42,0.35);transform:rotate(${hasHeading ? rotation : 0}deg);">
          ${
            hasHeading
              ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 19 21 12 17 5 21 12 2"/></svg>`
              : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="14" rx="3"/><path d="M4 11h16"/><circle cx="8" cy="19" r="1.5"/><circle cx="16" cy="19" r="1.5"/></svg>`
          }
        </div>
      </div>
    `,
  });
}

export function LiveTransitMap({
  userLocation,
  liveBuses,
  selectedBusId,
  onSelectBus,
  onMapClick,
  focusLatLng,
  previewPolyline,
  previewStops,
  theme = 'light',
  className = '',
}: LiveTransitMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const busMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const stopMarkersRef = useRef<L.Marker[]>([]);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const userVectorRef = useRef<L.Polyline | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const hasAutoFittedRef = useRef(false);

  const onSelectBusRef = useRef(onSelectBus);
  onSelectBusRef.current = onSelectBus;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter: [number, number] = userLocation
      ? [userLocation.lat, userLocation.lng]
      : focusLatLng
      ? [focusLatLng.lat, focusLatLng.lng]
      : [12.9716, 77.5946];

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer(OSM_TILE_URL, {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickRef.current?.(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;

    const t1 = window.setTimeout(() => map.invalidateSize(), 100);
    const t2 = window.setTimeout(() => map.invalidateSize(), 400);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      busMarkersRef.current.clear();
      stopMarkersRef.current = [];
      userMarkerRef.current = null;
      userVectorRef.current = null;
      routePolylineRef.current = null;
      hasAutoFittedRef.current = false;
    };
  }, []);

  // Sync user marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!userLocation) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      return;
    }

    const pos: [number, number] = [userLocation.lat, userLocation.lng];
    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker(pos, { icon: createUserIcon() })
        .addTo(map)
        .bindPopup(
          `<div style="font-size:12px;font-weight:600;color:#0f172a;">Your Location</div><div style="font-size:11px;color:#475569;">${userLocation.label}</div>`
        );
      if (!hasAutoFittedRef.current && liveBuses.length === 0) {
        map.setView(pos, 14);
        hasAutoFittedRef.current = true;
      }
    } else {
      userMarkerRef.current.setLatLng(pos);
    }
  }, [userLocation, liveBuses.length]);

  // Sync route polyline & stop markers (Driver preview or Selected Bus route)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
      routePolylineRef.current = null;
    }
    for (const m of stopMarkersRef.current) {
      m.remove();
    }
    stopMarkersRef.current = [];

    const selectedBus = liveBuses.find((b) => b.driverId === selectedBusId);
    const activeCoords =
      previewPolyline && previewPolyline.length >= 2
        ? previewPolyline
        : selectedBus?.routeCoordinates &&
          selectedBus.routeCoordinates.length >= 2
        ? selectedBus.routeCoordinates
        : null;

    if (activeCoords) {
      routePolylineRef.current = L.polyline(activeCoords, {
        color: '#059669',
        weight: 4,
        opacity: 0.88,
      }).addTo(map);
    }

    if (previewStops && previewStops.length > 0) {
      previewStops.forEach((stop, idx) => {
        const marker = L.marker([stop.lat, stop.lng], {
          icon: createStopIcon(idx, previewStops.length),
        })
          .addTo(map)
          .bindPopup(
            `<div style="font-size:12px;font-weight:600;color:#0f172a;">${
              idx === 0
                ? 'Start'
                : idx === previewStops.length - 1
                ? 'Destination'
                : `Stop ${idx}`
            }: ${stop.label}</div>`
          );
        stopMarkersRef.current.push(marker);
      });

      if (activeCoords && activeCoords.length >= 2) {
        map.fitBounds(L.latLngBounds(activeCoords), {
          padding: [42, 42],
          maxZoom: 15,
        });
      }
    }
  }, [previewPolyline, previewStops, liveBuses, selectedBusId]);

  // Sync bus markers & connecting line to user
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const activeIds = new Set(liveBuses.map((b) => b.driverId));

    for (const [id, marker] of busMarkersRef.current.entries()) {
      if (!activeIds.has(id)) {
        marker.remove();
        busMarkersRef.current.delete(id);
      }
    }

    for (const bus of liveBuses) {
      const isSelected = bus.driverId === selectedBusId;
      const existing = busMarkersRef.current.get(bus.driverId);
      const statusHtml =
        bus.busStatus && bus.busStatus !== 'Normal'
          ? `<div style="font-size:11px;color:#dc2626;font-weight:700;margin-top:3px;">Alert: ${bus.busStatus}${
              bus.statusNote ? ` — ${bus.statusNote}` : ''
            }</div>`
          : '';
      const popupHtml = `
        <div style="font-family:'DM Sans',sans-serif;min-width:180px;">
          <div style="font-weight:700;font-size:13px;color:#0f172a;">Bus ${bus.busNo}</div>
          <div style="font-size:12px;color:#334155;margin-top:2px;">${bus.startPoint} &rarr; ${bus.endPoint}</div>
          ${statusHtml}
          <div style="font-size:11px;color:#2563eb;margin-top:4px;font-weight:600;">${bus.directionText}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">Speed: ${bus.speedKmh} km/h</div>
        </div>
      `;

      if (existing) {
        existing.setLatLng([bus.lat, bus.lng]);
        existing.setIcon(createBusIcon(bus, isSelected));
        existing.setPopupContent(popupHtml);
      } else {
        const marker = L.marker([bus.lat, bus.lng], {
          icon: createBusIcon(bus, isSelected),
        })
          .addTo(map)
          .bindPopup(popupHtml);

        marker.on('click', () => {
          onSelectBusRef.current?.(bus.driverId);
        });
        busMarkersRef.current.set(bus.driverId, marker);
      }
    }

    if (userVectorRef.current) {
      userVectorRef.current.remove();
      userVectorRef.current = null;
    }

    const selectedBus = liveBuses.find((b) => b.driverId === selectedBusId);
    if (selectedBus && userLocation) {
      userVectorRef.current = L.polyline(
        [
          [selectedBus.lat, selectedBus.lng],
          [userLocation.lat, userLocation.lng],
        ],
        {
          color: theme === 'dark' ? '#60a5fa' : '#2563eb',
          weight: 3,
          dashArray: '6, 8',
          opacity: 0.85,
        }
      ).addTo(map);
    }

    if (!hasAutoFittedRef.current && (liveBuses.length > 0 || userLocation)) {
      const points: [number, number][] = liveBuses.map((b) => [b.lat, b.lng]);
      if (userLocation) points.push([userLocation.lat, userLocation.lng]);
      if (points.length === 1) {
        map.setView(points[0], 14);
      } else if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 15 });
      }
      hasAutoFittedRef.current = true;
    }
  }, [liveBuses, selectedBusId, userLocation, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusLatLng) return;
    map.flyTo([focusLatLng.lat, focusLatLng.lng], Math.max(map.getZoom(), 14), {
      duration: 0.6,
    });
  }, [focusLatLng]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: '380px' }}
      className={`relative bg-slate-100 dark:bg-slate-900 ${className}`}
      aria-label="Interactive OpenStreetMap live bus map"
    />
  );
}
