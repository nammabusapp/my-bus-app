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
  frequency?: string;
  status: 'On Time' | 'Delayed' | 'Scheduled';
}

export interface LiveBus {
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

export interface DriverPunctualityRecord {
  id: string;
  driverId: string;
  driverName: string;
  busNo: string;
  date: string; // YYYY-MM-DD
  scheduledDeparture: string;
  actualDeparture: string;
  scheduledReaching: string;
  actualReaching?: string;
  delayMinutes: number;
  onTime: boolean;
  busStatus: BusIncidentStatus;
  updatedAt: number;
}

export interface DailyPunctualityPoint {
  date: string;
  totalTrips: number;
  onTimeTrips: number;
  delayedTrips: number;
  onTimePct: number;
  avgDelayMin: number;
}

export interface DriverPerformanceSummary {
  driverId: string;
  driverName: string;
  busNo: string;
  totalTrips: number;
  onTimeTrips: number;
  delayedTrips: number;
  punctualityPct: number;
  avgDelayMin: number;
  maxDelayMin: number;
  lastTripDate: string;
}

export interface PerformanceOverviewData {
  days: number;
  generatedAt: number;
  kpis: {
    overallOnTimePct: number;
    totalTrips: number;
    onTimeTrips: number;
    delayedTrips: number;
    avgDelayMin: number;
    activeTrackedDrivers: number;
    topDriverName: string;
    topDriverPct: number;
  };
  dailySeries: DailyPunctualityPoint[];
  driverSummaries: DriverPerformanceSummary[];
}

export type DriverRegistrationStatus = 'pending' | 'approved' | 'rejected';

export interface DriverProfile {
  driverId: string;
  name: string;
  busNo: string;
  licenseNumber?: string;
  status?: DriverRegistrationStatus;
}

export interface DriverRecord {
  driverId: string;
  name: string;
  busNo: string;
  licenseNumber: string;
  licenseImage: string;
  status: DriverRegistrationStatus;
  createdAt: number;
  reviewedAt?: number | null;
}

export interface CompletedTour {
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

export interface FleetStats {
  activeUsers: number;
  activeDrivers: number;
  activeAdmins: number;
  totalConnections: number;
  liveBusCount: number;
  timingCount: number;
  pendingDriverCount?: number;
  registeredDriverCount?: number;
}

export interface UserLocation {
  lat: number;
  lng: number;
  label: string;
  source: 'gps' | 'manual';
}

export interface RoadRouteInfo {
  coordinates: [number, number][];
  distanceKm: number;
  durationMinutes: number;
  isRoadRoute: boolean;
}

export type ThemeMode = 'light' | 'dark';
export type AppLang = 'en' | 'kn';
export type AppPortal = 'user' | 'operations';
export type OpsMode = 'driver' | 'admin';
export type UserSubView = 'home' | 'timings' | 'track';
export type AdminSubView =
  | 'dashboard'
  | 'performance'
  | 'timings'
  | 'live'
  | 'users'
  | 'registrations'
  | 'drivers';

export interface BusApproachingAlert {
  driverId: string;
  busNo: string;
  stopLabel: string;
  distanceKm: number;
  etaMinutes: number;
  triggeredAt: number;
}

export interface StopAlertRule {
  driverId: string;
  busNo: string;
  stopLabel: string;
  stopLat: number;
  stopLng: number;
  thresholdKm: number;
  pushEnabled: boolean;
  createdAt: number;
}

