import { RoadRouteInfo } from '../types';

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

export function bearingToCardinal(deg: number | null | undefined): {
  full: string;
  short: string;
} {
  if (deg === null || deg === undefined || Number.isNaN(deg)) {
    return { full: 'Awaiting movement', short: '--' };
  }
  const normalized = ((deg % 360) + 360) % 360;
  const directions = [
    { full: 'North', short: 'N' },
    { full: 'North-East', short: 'NE' },
    { full: 'East', short: 'E' },
    { full: 'South-East', short: 'SE' },
    { full: 'South', short: 'S' },
    { full: 'South-West', short: 'SW' },
    { full: 'West', short: 'W' },
    { full: 'North-West', short: 'NW' },
  ];
  const index = Math.round(normalized / 45) % 8;
  return directions[index];
}

export function formatDirectionSummary(
  heading: number | null,
  endPoint?: string
): string {
  if (heading === null || Number.isNaN(heading)) {
    return endPoint ? `En route toward ${endPoint}` : 'Active GPS signal';
  }
  const { full } = bearingToCardinal(heading);
  const rounded = Math.round(((heading % 360) + 360) % 360);
  return endPoint
    ? `Moving ${full} (${rounded}°) toward ${endPoint}`
    : `Moving ${full} (${rounded}°)`;
}

export function calculateEtaMinutes(
  distanceKm: number,
  speedKmh: number
): number {
  if (distanceKm <= 0.05) return 0;
  const effectiveSpeed = speedKmh > 6 ? Math.min(speedKmh, 95) : 28;
  const rawMinutes = (distanceKm / effectiveSpeed) * 60;
  return Math.max(1, Math.round(rawMinutes));
}

export function formatEtaText(minutes: number): string {
  if (minutes <= 0) return 'Arriving now';
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`;
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(lng)}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const data = await res.json();
    const addr = data.address || {};
    const parts = [
      addr.neighbourhood || addr.suburb || addr.road || addr.village,
      addr.city || addr.town || addr.county || addr.state,
    ].filter(Boolean);
    return parts.length > 0
      ? parts.join(', ')
      : data.display_name?.split(',').slice(0, 2).join(',') ||
          `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

export async function geocodePlace(
  query: string,
  near?: { lat: number; lng: number } | null
): Promise<{ lat: number; lng: number; label: string } | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      q: trimmed,
      limit: '1',
    });
    if (near) {
      const d = 0.6;
      params.set(
        'viewbox',
        `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`
      );
    }
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const list = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name?: string;
    }>;
    if (!Array.isArray(list) || list.length === 0) return null;
    const item = list[0];
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return {
      lat,
      lng,
      label: trimmed,
    };
  } catch {
    return null;
  }
}

export async function fetchRoadRoutePolyline(
  waypoints: Array<{ lat: number; lng: number }>
): Promise<[number, number][]> {
  if (waypoints.length < 2) {
    return waypoints.map((w) => [w.lat, w.lng]);
  }
  const coordsParam = waypoints.map((w) => `${w.lng},${w.lat}`).join(';');
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`
    );
    if (!res.ok) {
      return waypoints.map((w) => [w.lat, w.lng]);
    }
    const data = await res.json();
    const geom = data?.routes?.[0]?.geometry?.coordinates as
      | Array<[number, number]>
      | undefined;
    if (Array.isArray(geom) && geom.length >= 2) {
      return geom.map(([lng, lat]) => [lat, lng] as [number, number]);
    }
  } catch {
    // Fallback to direct waypoint segments
  }
  return waypoints.map((w) => [w.lat, w.lng]);
}

export async function fetchRoadRouteInfo(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  signal?: AbortSignal
): Promise<RoadRouteInfo | null> {
  const coordsParam = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`,
      { signal }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    const geom = route?.geometry?.coordinates as
      | Array<[number, number]>
      | undefined;
    if (!Array.isArray(geom) || geom.length < 2) return null;

    const coordinates = geom.map(
      ([lng, lat]) => [lat, lng] as [number, number]
    );
    const distanceKm =
      typeof route.distance === 'number'
        ? Math.round((route.distance / 1000) * 10) / 10
        : Math.round(haversineDistanceKm(from.lat, from.lng, to.lat, to.lng) * 10) / 10;
    const durationMinutes =
      typeof route.duration === 'number'
        ? distanceKm <= 0.08
          ? 0
          : Math.max(1, Math.round(route.duration / 60))
        : calculateEtaMinutes(distanceKm, 28);

    return {
      coordinates,
      distanceKm,
      durationMinutes,
      isRoadRoute: true,
    };
  } catch {
    return null;
  }
}
