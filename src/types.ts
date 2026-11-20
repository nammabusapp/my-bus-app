export type BusIncidentStatus =
  | 'Normal'
  | 'Delayed'
  | 'Punctured'
  | 'Breakdown'
  | 'Accident'
  | 'Road Block';

export interface RouteStopPoint {
  label: string;
  lat: number;
  lng: number;
}

export interface BusTiming {
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

export interface LiveBus {
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

export interface DriverProfile {
  driverId: string;
  name: string;
  busNo: string;
}

export interface FleetStats {
  activeUsers: number;
  activeDrivers: number;
  activeAdmins: number;
  totalConnections: number;
  liveBusCount: number;
  timingCount: number;
}

export interface UserLocation {
  lat: number;
  lng: number;
  label: string;
  source: 'gps' | 'manual';
}

export type ThemeMode = 'light' | 'dark';
export type AppLang = 'en' | 'kn';
export type AppPortal = 'user' | 'operations';
export type OpsMode = 'driver' | 'admin';
export type UserSubView = 'home' | 'timings' | 'track';
export type AdminSubView = 'dashboard' | 'timings' | 'live' | 'users';
