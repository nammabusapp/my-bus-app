import { AppLang, BusIncidentStatus } from '../types';

export interface Translations {
  appName: string;
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  busTiming: string;
  busTimingDesc: string;
  trackBus: string;
  trackBusDesc: string;
  liveMap: string;
  routesCount: string;
  liveNow: string;
  nextDepartures: string;
  featuredCorridors: string;
  viewFullTimetable: string;
  operationsLink: string;
  back: string;
  riderApp: string;
  yourLocationLabel: string;
  yourLocationPlaceholder: string;
  destinationLabel: string;
  destinationPlaceholder: string;
  useGps: string;
  locating: string;
  busNo: string;
  departureTime: string;
  arrivalTime: string;
  route: string;
  stopsVia: string;
  frequency: string;
  status: string;
  all: string;
  onTime: string;
  delayed: string;
  scheduled: string;
  clickRowHint: string;
  trackRouteLabel: string;
  trackRoutePlaceholder: string;
  myGps: string;
  liveBuses: string;
  active: string;
  noLiveBuses: string;
  noLiveBusesSub: string;
  operationsTitle: string;
  driverTab: string;
  adminTab: string;
  driverDispatch: string;
  driverSignIn: string;
  registerDriver: string;
  signIn: string;
  newDriver: string;
  driverId: string;
  driverName: string;
  assignedBusNo: string;
  pin: string;
  continueToLocation: string;
  createDriverAccount: string;
  locationPermissionTitle: string;
  locationPermissionDesc: string;
  allowLocationAccess: string;
  signOut: string;
  tripAndRoute: string;
  startingPoint: string;
  endingPoint: string;
  routePlaces: string;
  addPlace: string;
  enterHint: string;
  startSharing: string;
  stopSharing: string;
  sharingLive: string;
  standby: string;
  updateBusStatus: string;
  broadcastStatus: string;
  statusNotePlaceholder: string;
  kannadaTyping: string;
  adminSignInTitle: string;
  adminHubTitle: string;
  numberOfUsers: string;
  manageBusTimings: string;
  addBusTiming: string;
  liveBusesMonitor: string;
  needLocationForDest: string;
  detectMyLocation: string;
  installApp: string;
  installOnIos: string;
  iosInstallTitle: string;
  iosInstallStep1: string;
  iosInstallStep2: string;
  browserInstallTitle: string;
  browserInstallStep1: string;
  browserInstallStep2: string;
  inAppBrowserHint: string;
  copyAppLink: string;
  linkCopied: string;
  installNowBtn: string;
  close: string;
  offlineMessage: string;
  drivingLicenseNumber: string;
  drivingLicensePhoto: string;
  uploadLicenseHint: string;
  newDriverRegistrations: string;
  registeredDrivers: string;
  approveDriver: string;
  rejectDriver: string;
  viewLicense: string;
  approved: string;
  pending: string;
  rejected: string;
  trackBusBtn: string;
  trackingActiveBtn: string;
  selectBusToTrackHint: string;
  stopAlertTitle: string;
  stopAlertDesc: string;
  selectStopLabel: string;
  currentPinStop: string;
  alertRadiusLabel: string;
  enableStopAlert: string;
  disableStopAlert: string;
  alertArmedStatus: string;
  resolvingStop: string;
  stopGeocodeFailed: string;
  permissionDeniedHint: string;
  approachingAlertPrefix: string;
  incidentLabels: Record<BusIncidentStatus, string>;
}

export const TRANSLATIONS: Record<AppLang, Translations> = {
  en: {
    appName: 'My Bus',
    tagline: 'Smart City Transit Network',
    heroTitle: 'Every city bus schedule and live arrival, synchronized',
    heroSubtitle:
      'Look up buses passing through your location toward your destination, or track live buses on OpenStreetMap with ETA, direction, and real-time service alerts.',
    busTiming: 'Bus Timing',
    busTimingDesc:
      'Find buses passing through your stop toward your destination.',
    trackBus: 'Track Bus',
    trackBusDesc:
      'Live GPS map with ETA, compass heading, and status alerts.',
    liveMap: 'Live Map',
    routesCount: 'routes',
    liveNow: 'live now',
    nextDepartures: 'Next Scheduled Departures',
    featuredCorridors: 'Featured Transit Corridors',
    viewFullTimetable: 'View full timetable',
    operationsLink: 'Driver & Admin Portal',
    back: 'Back',
    riderApp: 'Rider App',
    yourLocationLabel: 'Your Location / Boarding Stop',
    yourLocationPlaceholder: 'e.g. City Market, Central Station, ಮೆಜೆಸ್ಟಿಕ್...',
    destinationLabel:
      'Destination (Shows only buses passing through your location)',
    destinationPlaceholder: 'Search destination (e.g. Airport Terminal 2)...',
    useGps: 'Use GPS',
    locating: 'Locating...',
    busNo: 'Bus No.',
    departureTime: 'Departure Time',
    arrivalTime: 'Arrival Time',
    route: 'Route',
    stopsVia: 'Stops / Via',
    frequency: 'Frequency',
    status: 'Status',
    all: 'All',
    onTime: 'On Time',
    delayed: 'Delayed',
    scheduled: 'Scheduled',
    clickRowHint: 'Click any row to inspect stop timeline',
    trackRouteLabel: 'Search bus by route, stop, or Bus No.',
    trackRoutePlaceholder: 'e.g. Airport, Central Station, 101-A...',
    myGps: 'My GPS',
    liveBuses: 'Live Buses',
    active: 'active',
    noLiveBuses: 'No buses are currently sharing live location',
    noLiveBusesSub:
      'As soon as a driver starts sharing their trip from the Operations Portal, the bus marker, compass direction, and ETA will appear here.',
    operationsTitle: 'My Bus Operations',
    driverTab: 'Driver',
    adminTab: 'Admin',
    driverDispatch: 'Driver Dispatch',
    driverSignIn: 'Driver Sign In',
    registerDriver: 'Register Driver',
    signIn: 'Sign In',
    newDriver: 'New Driver',
    driverId: 'Driver ID',
    driverName: 'Driver Name',
    assignedBusNo: 'Assigned Bus No.',
    pin: 'PIN',
    continueToLocation: 'Continue to Location Permission',
    createDriverAccount: 'Create Driver Account',
    locationPermissionTitle: 'Location Permission Required',
    locationPermissionDesc:
      'Allow continuous GPS access so passengers and fleet admins can track your bus in real time.',
    allowLocationAccess: 'Allow Location Access',
    signOut: 'Sign Out',
    tripAndRoute: 'Trip & Route Setup',
    startingPoint: 'Starting Point',
    endingPoint: 'Ending Point',
    routePlaces: 'Route Places (Type a place & press Enter to save and add next)',
    addPlace: 'Add Place',
    enterHint: 'Press Enter to save & add next block',
    startSharing: 'Start Sharing',
    stopSharing: 'Stop Sharing',
    sharingLive: 'Sharing Live...',
    standby: 'Standby',
    updateBusStatus: 'Update Bus Status / Incident',
    broadcastStatus: 'Broadcast Status Update',
    statusNotePlaceholder:
      'Optional status note (e.g. Flat tire near City Market)',
    kannadaTyping: 'ಕನ್ನಡ Typing',
    adminSignInTitle: 'Admin Console Sign In',
    adminHubTitle: 'Admin Operations Hub',
    numberOfUsers: 'Number of Users',
    manageBusTimings: 'Manage Bus Timings',
    addBusTiming: 'Add Bus Timing',
    liveBusesMonitor: 'Live Buses Monitor',
    needLocationForDest:
      'Enter or detect Your Location to filter buses passing through your stop',
    detectMyLocation: 'Detect My Location',
    installApp: 'Install App',
    installOnIos: 'Install App',
    iosInstallTitle: 'Install My Bus on iPhone / iPad',
    iosInstallStep1: 'Tap the Share button in the Safari toolbar.',
    iosInstallStep2: 'Scroll down and tap Add to Home Screen.',
    browserInstallTitle: 'Install My Bus on Your Device',
    browserInstallStep1: 'Open the browser menu (⋮) in the top corner.',
    browserInstallStep2: 'Tap "Install app" or "Add to Home screen" to install.',
    inAppBrowserHint:
      'If you opened this link inside WhatsApp, Gmail, or another in-app browser, copy the link and open it in Chrome (Android) or Safari (iPhone).',
    copyAppLink: 'Copy App Link',
    linkCopied: 'Link Copied!',
    installNowBtn: 'Install App Now',
    close: 'Close',
    offlineMessage: 'Offline Mode — Showing cached bus schedules.',
    drivingLicenseNumber: 'Driving Licence Number',
    drivingLicensePhoto: 'Driving Licence Photo',
    uploadLicenseHint: 'Upload a clear photo of your driving licence (JPG, PNG, or WebP)',
    newDriverRegistrations: 'New Driver Registration',
    registeredDrivers: 'Registered Drivers',
    approveDriver: 'Approve',
    rejectDriver: 'Reject',
    viewLicense: 'View Licence',
    approved: 'Approved',
    pending: 'Pending',
    rejected: 'Rejected',
    trackBusBtn: 'Track Bus',
    trackingActiveBtn: 'Tracking',
    selectBusToTrackHint:
      'Click "Track Bus" next to any bus in the list to show its live location on the map.',
    stopAlertTitle: 'Stop Arrival Alert',
    stopAlertDesc:
      'Receive a push notification when this bus gets close to your boarding stop.',
    selectStopLabel: 'Target Stop',
    currentPinStop: 'My Map / GPS Pin',
    alertRadiusLabel: 'Alert Distance',
    enableStopAlert: 'Notify When Approaching',
    disableStopAlert: 'Disable Alert',
    alertArmedStatus: 'Alert active',
    resolvingStop: 'Locating stop...',
    stopGeocodeFailed:
      'Could not find exact map coordinates for that stop name. Tap the map to set your pin and select "My Map / GPS Pin".',
    permissionDeniedHint:
      'Browser notifications are blocked — you will still see an instant in-app alert banner here.',
    approachingAlertPrefix: 'Approaching',
    incidentLabels: {
      Normal: 'Normal',
      Delayed: 'Delayed',
      Punctured: 'Punctured',
      Breakdown: 'Breakdown',
      Accident: 'Accident',
      'Road Block': 'Road Block',
    },
  },
  kn: {
    appName: 'ಮೈ ಬಸ್ (My Bus)',
    tagline: 'ಸ್ಮಾರ್ಟ್ ಸಿಟಿ ಸಾರಿಗೆ ಜಾಲ',
    heroTitle: 'ನಗರದ ಪ್ರತಿ ಬಸ್ ವೇಳಾಪಟ್ಟಿ ಮತ್ತು ನೇರ ಆಗಮನ, ಒಂದೇ ಕಡೆ',
    heroSubtitle:
      'ನಿಮ್ಮ ಸ್ಥಳದಿಂದ ಗಮ್ಯಸ್ಥಾನಕ್ಕೆ ಹೋಗುವ ಬಸ್‌ಗಳ ಸಮಯವನ್ನು ಹುಡುಕಿ ಅಥವಾ ಓಪನ್‌ಸ್ಟ್ರೀಟ್‌ಮ್ಯಾಪ್‌ನಲ್ಲಿ ಬಸ್ ಸ್ಥಳ, ದಿಕ್ಕು ಮತ್ತು ಆಗಮನದ ಸಮಯವನ್ನು (ETA) ನೇರವಾಗಿ ನೋಡಿ.',
    busTiming: 'ಬಸ್ ಸಮಯ',
    busTimingDesc:
      'ನಿಮ್ಮ ನಿಲ್ದಾಣದ ಮೂಲಕ ಗಮ್ಯಸ್ಥಾನಕ್ಕೆ ಹೋಗುವ ಬಸ್‌ಗಳನ್ನು ಹುಡುಕಿ.',
    trackBus: 'ಬಸ್ ಟ್ರ್ಯಾಕ್ ಮಾಡಿ',
    trackBusDesc: 'ನೇರ GPS ನಕ್ಷೆ, ETA, ದಿಕ್ಕು ಮತ್ತು ಬಸ್ ಸ್ಥಿತಿ ಮಾಹಿತಿ.',
    liveMap: 'ನೇರ ನಕ್ಷೆ',
    routesCount: 'ಮಾರ್ಗಗಳು',
    liveNow: 'ಸಕ್ರಿಯ ಬಸ್‌ಗಳು',
    nextDepartures: 'ಮುಂದಿನ ನಿಗದಿತ ಬಸ್‌ಗಳು',
    featuredCorridors: 'ಪ್ರಮುಖ ಬಸ್ ಮಾರ್ಗಗಳು',
    viewFullTimetable: 'ಸಂಪೂರ್ಣ ವೇಳಾಪಟ್ಟಿ ನೋಡಿ',
    operationsLink: 'ಚಾಲಕ ಮತ್ತು ಅಡ್ಮಿನ್ ಪೋರ್ಟಲ್',
    back: 'ಹಿಂದೆ',
    riderApp: 'ಪ್ರಯಾಣಿಕರ ಆ್ಯಪ್',
    yourLocationLabel: 'ನಿಮ್ಮ ಸ್ಥಳ / ಹತ್ತುವ ನಿಲ್ದಾಣ',
    yourLocationPlaceholder: 'ಉದಾ: ಮೆಜೆಸ್ಟಿಕ್, ಸಿಟಿ ಮಾರ್ಕೆಟ್, Central Station...',
    destinationLabel:
      'ಗಮ್ಯಸ್ಥಾನ (ನಿಮ್ಮ ಸ್ಥಳದ ಮೂಲಕ ಹಾದುಹೋಗುವ ಬಸ್‌ಗಳು ಮಾತ್ರ ಕಾಣಿಸುತ್ತವೆ)',
    destinationPlaceholder: 'ಗಮ್ಯಸ್ಥಾನವನ್ನು ಹುಡುಕಿ (ಉದಾ: Airport)...',
    useGps: 'GPS ಬಳಸಿ',
    locating: 'ಸ್ಥಳ ಹುಡುಕುತ್ತಿದೆ...',
    busNo: 'ಬಸ್ ಸಂಖ್ಯೆ',
    departureTime: 'ಹೊರಡುವ ಸಮಯ',
    arrivalTime: 'ತಲುಪುವ ಸಮಯ',
    route: 'ಮಾರ್ಗ',
    stopsVia: 'ನಿಲ್ದಾಣಗಳು / ಮಾರ್ಗವಾಗಿ',
    frequency: 'ಆವರ್ತನ',
    status: 'ಸ್ಥಿತಿ',
    all: 'ಎಲ್ಲಾ',
    onTime: 'ಸಮಯಕ್ಕೆ ಸರಿಯಾಗಿ',
    delayed: 'ವಿಳಂಬ',
    scheduled: 'ನಿಗದಿತ',
    clickRowHint: 'ನಿಲ್ದಾಣಗಳ ಮಾರ್ಗ ನೋಡಲು ಸಾಲನ್ನು ಒತ್ತಿ',
    trackRouteLabel: 'ಮಾರ್ಗ, ನಿಲ್ದಾಣ ಅಥವಾ ಬಸ್ ಸಂಖ್ಯೆಯಿಂದ ಹುಡುಕಿ',
    trackRoutePlaceholder: 'ಉದಾ: Airport, ಮೆಜೆಸ್ಟಿಕ್, 101-A...',
    myGps: 'ನನ್ನ GPS',
    liveBuses: 'ನೇರ ಬಸ್‌ಗಳು',
    active: 'ಸಕ್ರಿಯ',
    noLiveBuses: 'ಪ್ರಸ್ತುತ ಯಾವುದೇ ಬಸ್ ನೇರ ಸ್ಥಳವನ್ನು ಹಂಚಿಕೊಳ್ಳುತ್ತಿಲ್ಲ',
    noLiveBusesSub:
      'ಚಾಲಕರು ಲೈವ್ ಹಂಚಿಕೆಯನ್ನು ಪ್ರಾರಂಭಿಸಿದ ತಕ್ಷಣ ಬಸ್ ಸ್ಥಳ, ದಿಕ್ಕು ಮತ್ತು ETA ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.',
    operationsTitle: 'ಮೈ ಬಸ್ ಕಾರ್ಯಾಚರಣೆ',
    driverTab: 'ಚಾಲಕ',
    adminTab: 'ಅಡ್ಮಿನ್',
    driverDispatch: 'ಚಾಲಕ ವಿಭಾಗ',
    driverSignIn: 'ಚಾಲಕ ಲಾಗಿನ್',
    registerDriver: 'ಹೊಸ ಚಾಲಕ ನೋಂದಣಿ',
    signIn: 'ಲಾಗಿನ್',
    newDriver: 'ಹೊಸ ಚಾಲಕ',
    driverId: 'ಚಾಲಕ ID',
    driverName: 'ಚಾಲಕರ ಹೆಸರು',
    assignedBusNo: 'ಬಸ್ ಸಂಖ್ಯೆ',
    pin: 'ಪಿನ್ (PIN)',
    continueToLocation: 'ಸ್ಥಳ ಅನುಮತಿಗೆ ಮುಂದುವರಿಯಿರಿ',
    createDriverAccount: 'ಚಾಲಕ ಖಾತೆ ತೆರೆಯಿರಿ',
    locationPermissionTitle: 'ಸ್ಥಳದ ಅನುಮತಿ ಅಗತ್ಯವಿದೆ',
    locationPermissionDesc:
      'ಪ್ರಯಾಣಿಕರು ಮತ್ತು ಅಡ್ಮಿನ್ ನಿಮ್ಮ ಬಸ್‌ನ ನೇರ ಸ್ಥಳವನ್ನು ನೋಡಲು GPS ಅನುಮತಿ ನೀಡಿ.',
    allowLocationAccess: 'ಸ್ಥಳ ಅನುಮತಿ ನೀಡಿ',
    signOut: 'ಲಾಗ್ ಔಟ್',
    tripAndRoute: 'ಪ್ರಯಾಣ ಮತ್ತು ಮಾರ್ಗದ ವಿವರ',
    startingPoint: 'ಪ್ರಾರಂಭದ ಸ್ಥಳ',
    endingPoint: 'ತಲುಪುವ ಸ್ಥಳ',
    routePlaces:
      'ಮಾರ್ಗದ ನಿಲ್ದಾಣಗಳು (ಸ್ಥಳ ಟೈಪ್ ಮಾಡಿ Enter ಒತ್ತಿದರೆ ಉಳಿಸಿ ಹೊಸ ಬಾಕ್ಸ್ ಬರುತ್ತದೆ)',
    addPlace: 'ಸ್ಥಳ ಸೇರಿಸಿ',
    enterHint: 'ಉಳಿಸಲು ಮತ್ತು ಹೊಸ ಬ್ಲಾಕ್ ತೆರೆಯಲು Enter ಒತ್ತಿ',
    startSharing: 'ಸ್ಥಳ ಹಂಚಿಕೆ ಪ್ರಾರಂಭಿಸಿ',
    stopSharing: 'ಹಂಚಿಕೆ ನಿಲ್ಲಿಸಿ',
    sharingLive: 'ನೇರ ಹಂಚಿಕೆ ಸಕ್ರಿಯವಾಗಿದೆ...',
    standby: 'ಸಿದ್ಧವಾಗಿದೆ',
    updateBusStatus: 'ಬಸ್ ಸ್ಥಿತಿ / ತುರ್ತು ಮಾಹಿತಿ ನವೀಕರಿಸಿ',
    broadcastStatus: 'ಸ್ಥಿತಿ ನವೀಕರಣ ಕಳುಹಿಸಿ',
    statusNotePlaceholder:
      'ಹೆಚ್ಚುವರಿ ಟಿಪ್ಪಣಿ (ಉದಾ: ಸಿಟಿ ಮಾರ್ಕೆಟ್ ಬಳಿ ಟೈರ್ ಪಂಕ್ಚರ್)',
    kannadaTyping: 'ಕನ್ನಡ ಟೈಪಿಂಗ್',
    adminSignInTitle: 'ಅಡ್ಮಿನ್ ಲಾಗಿನ್',
    adminHubTitle: 'ಅಡ್ಮಿನ್ ನಿಯಂತ್ರಣ ಕೇಂದ್ರ',
    numberOfUsers: 'ಬಳಕೆದಾರರ ಸಂಖ್ಯೆ',
    manageBusTimings: 'ಬಸ್ ಸಮಯ ನಿರ್ವಹಣೆ',
    addBusTiming: 'ಹೊಸ ಬಸ್ ಸಮಯ ಸೇರಿಸಿ',
    liveBusesMonitor: 'ನೇರ ಬಸ್ ಮೇಲ್ವಿಚಾರಣೆ',
    needLocationForDest:
      'ನಿಮ್ಮ ಸ್ಥಳದ ಮೂಲಕ ಹಾದುಹೋಗುವ ಬಸ್‌ಗಳನ್ನು ನೋಡಲು ನಿಮ್ಮ ಸ್ಥಳವನ್ನು ನಮೂದಿಸಿ ಅಥವಾ GPS ಬಳಸಿ',
    detectMyLocation: 'ನನ್ನ ಸ್ಥಳ ಪತ್ತೆಹಚ್ಚಿ',
    installApp: 'ಆ್ಯಪ್ ಇನ್‌ಸ್ಟಾಲ್',
    installOnIos: 'ಆ್ಯಪ್ ಇನ್‌ಸ್ಟಾಲ್',
    iosInstallTitle: 'iPhone / iPad ನಲ್ಲಿ ಮೈ ಬಸ್ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿ',
    iosInstallStep1: 'Safari ಟೂಲ್‌ಬಾರ್‌ನಲ್ಲಿರುವ Share ಬಟನ್ ಒತ್ತಿರಿ.',
    iosInstallStep2: 'ಕೆಳಗೆ ಸ್ಕ್ರಾಲ್ ಮಾಡಿ Add to Home Screen ಆಯ್ಕೆಮಾಡಿ.',
    browserInstallTitle: 'ನಿಮ್ಮ ಫೋನ್‌ನಲ್ಲಿ ಮೈ ಬಸ್ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿ',
    browserInstallStep1: 'ಬ್ರೌಸರ್ ಮೇಲಿನ ಮೂಲೆಯಲ್ಲಿರುವ ಮೆನು (⋮) ಒತ್ತಿರಿ.',
    browserInstallStep2: '"Install app" ಅಥವಾ "Add to Home screen" ಆಯ್ಕೆಮಾಡಿ.',
    inAppBrowserHint:
      'ನೀವು ಈ ಲಿಂಕ್ ಅನ್ನು WhatsApp ಅಥವಾ ಇತರ ಆ್ಯಪ್ ಒಳಗೆ ತೆರೆದಿದ್ದರೆ, ಲಿಂಕ್ ಕಾಪಿ ಮಾಡಿ Chrome (Android) ಅಥವಾ Safari (iPhone) ನಲ್ಲಿ ತೆರೆಯಿರಿ.',
    copyAppLink: 'ಆ್ಯಪ್ ಲಿಂಕ್ ಕಾಪಿ ಮಾಡಿ',
    linkCopied: 'ಲಿಂಕ್ ಕಾಪಿಯಾಗಿದೆ!',
    installNowBtn: 'ಈಗಲೇ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿ',
    close: 'ಮುಚ್ಚಿ',
    offlineMessage: 'ಆಫ್‌ಲೈನ್ ಮೋಡ್ — ಉಳಿಸಿದ ವೇಳಾಪಟ್ಟಿ ತೋರಿಸಲಾಗುತ್ತಿದೆ.',
    drivingLicenseNumber: 'ಡ್ರೈವಿಂಗ್ ಲೈಸೆನ್ಸ್ ಸಂಖ್ಯೆ',
    drivingLicensePhoto: 'ಡ್ರೈವಿಂಗ್ ಲೈಸೆನ್ಸ್ ಫೋಟೋ',
    uploadLicenseHint: 'ನಿಮ್ಮ ಡ್ರೈವಿಂಗ್ ಲೈಸೆನ್ಸ್‌ನ ಸ್ಪಷ್ಟ ಫೋಟೋ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ (JPG, PNG, WebP)',
    newDriverRegistrations: 'ಹೊಸ ಚಾಲಕರ ನೋಂದಣಿ',
    registeredDrivers: 'ನೋಂದಾಯಿತ ಚಾಲಕರು',
    approveDriver: 'ಅನುಮೋದಿಸಿ',
    rejectDriver: 'ತಿರಸ್ಕರಿಸಿ',
    viewLicense: 'ಲೈಸೆನ್ಸ್ ನೋಡಿ',
    approved: 'ಅನುಮೋದಿಸಲಾಗಿದೆ',
    pending: 'ಬಾಕಿ ಇದೆ',
    rejected: 'ತಿರಸ್ಕರಿಸಲಾಗಿದೆ',
    trackBusBtn: 'ಬಸ್ ಟ್ರ್ಯಾಕ್ ಮಾಡಿ',
    trackingActiveBtn: 'ಟ್ರ್ಯಾಕ್ ಆಗುತ್ತಿದೆ',
    selectBusToTrackHint:
      'ನಕ್ಷೆಯಲ್ಲಿ ಬಸ್‌ನ ನೇರ ಸ್ಥಳವನ್ನು ನೋಡಲು ಪಟ್ಟಿಯಲ್ಲಿರುವ "ಬಸ್ ಟ್ರ್ಯಾಕ್ ಮಾಡಿ" ಬಟನ್ ಒತ್ತಿರಿ.',
    stopAlertTitle: 'ನಿಲ್ದಾಣದ ಆಗಮನ ಸೂಚನೆ',
    stopAlertDesc:
      'ಈ ಬಸ್ ನಿಮ್ಮ ನಿಲ್ದಾಣದ ಸಮೀಪಕ್ಕೆ ಬಂದಾಗ ಪುಶ್ ನೋಟಿಫಿಕೇಶನ್ ಪಡೆಯಿರಿ.',
    selectStopLabel: 'ನಿಲ್ದಾಣ ಆಯ್ಕೆಮಾಡಿ',
    currentPinStop: 'ನನ್ನ ನಕ್ಷೆ / GPS ಪಿನ್',
    alertRadiusLabel: 'ಸೂಚನೆ ದೂರ',
    enableStopAlert: 'ಹತ್ತಿರ ಬಂದಾಗ ತಿಳಿಸಿ',
    disableStopAlert: 'ಸೂಚನೆ ನಿಲ್ಲಿಸಿ',
    alertArmedStatus: 'ಸೂಚನೆ ಸಕ್ರಿಯವಾಗಿದೆ',
    resolvingStop: 'ನಿಲ್ದಾಣ ಹುಡುಕುತ್ತಿದೆ...',
    stopGeocodeFailed:
      'ಆ ನಿಲ್ದಾಣದ ಸ್ಥಳ ಪತ್ತೆಯಾಗಲಿಲ್ಲ. ನಕ್ಷೆಯಲ್ಲಿ ನಿಮ್ಮ ಪಿನ್ ಒತ್ತಿ "ನನ್ನ ನಕ್ಷೆ / GPS ಪಿನ್" ಆಯ್ಕೆಮಾಡಿ.',
    permissionDeniedHint:
      'ಬ್ರೌಸರ್ ನೋಟಿಫಿಕೇಶನ್ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ — ಬದಲಿಗೆ ಇಲ್ಲಿಯೇ ತಕ್ಷಣದ ಸೂಚನೆ ಕಾಣಿಸುತ್ತದೆ.',
    approachingAlertPrefix: 'ಹತ್ತಿರ ಬರುತ್ತಿದೆ',
    incidentLabels: {
      Normal: 'ಸಾಮಾನ್ಯ',
      Delayed: 'ವಿಳಂಬ',
      Punctured: 'ಪಂಕ್ಚರ್',
      Breakdown: 'ಕೆಟ್ಟುನಿಂತಿದೆ',
      Accident: 'ಅಪಘಾತ',
      'Road Block': 'ರಸ್ತೆ ತಡೆ',
    },
  },
};
