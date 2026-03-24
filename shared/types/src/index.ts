export * from './ocpp';

// ─── Platform-wide Domain Types ────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: 'starter' | 'professional' | 'enterprise';
  createdAt: Date;
}

export interface ChargingSession {
  id: string;
  stationId: string;
  evseId: number;
  connectorId: number;
  transactionId: string;
  idToken?: string;
  startTime: Date;
  endTime?: Date;
  energyDeliveredWh: number;
  costTotal?: number;
  currency?: string;
  tenantId: string;
  status: 'active' | 'completed' | 'error';
}

export interface ChargeDetailRecord {
  id: string;
  sessionId: string;
  stationId: string;
  tenantId: string;
  startDateTime: Date;
  endDateTime: Date;
  authMethod: string;
  idToken?: string;
  energyDeliveredWh: number;
  duration: number;               // seconds
  totalCost: number;
  currency: string;
  tariffId?: string;
  meterStart: number;
  meterStop: number;
  stopReason?: string;
  createdAt: Date;
}

export interface Tariff {
  id: string;
  tenantId: string;
  name: string;
  currency: string;
  elements: TariffElement[];
  startDate?: Date;
  endDate?: Date;
}

export interface TariffElement {
  priceComponents: PriceComponent[];
  restrictions?: TariffRestriction;
}

export interface PriceComponent {
  type: 'ENERGY' | 'TIME' | 'FLAT' | 'PARKING_TIME';
  price: number;
  stepSize?: number;
}

export interface TariffRestriction {
  startTime?: string;             // HH:mm
  endTime?: string;
  minKwh?: number;
  maxKwh?: number;
  dayOfWeek?: string[];
}

export interface Location {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  city: string;
  country: string;
  coordinates: { lat: number; lng: number };
  siteHostId?: string;
  maxSiteKw?: number;             // Site power limit for load management
}

export interface Station {
  id: string;
  locationId: string;
  tenantId: string;
  model: string;
  vendor: string;
  serialNumber?: string;
  firmwareVersion?: string;
  status: 'online' | 'offline' | 'faulted' | 'unknown';
  lastHeartbeat?: Date;
  ocppVersion: '2.0.1' | '2.1';
  maxPowerKw: number;
  evses: EVSE[];
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  role: 'admin' | 'operator' | 'site_manager' | 'technician' | 'viewer';
  createdAt: Date;
}

export interface Driver {
  id: string;
  email: string;
  idTokens: DriverToken[];
  paymentMethodId?: string;
  loyaltyPoints: number;
  createdAt: Date;
}

export interface DriverToken {
  id: string;
  driverId: string;
  type: 'RFID' | 'APP' | 'ISO15118';
  token: string;
  valid: boolean;
  expiresAt?: Date;
}

export interface Reservation {
  id: number;
  stationId: string;
  evseId: number;
  idToken: string;
  expiryDateTime: Date;
  status: 'active' | 'used' | 'expired' | 'cancelled';
}

export interface SmartChargingSchedule {
  stationId: string;
  evseId: number;
  profileId: number;
  periods: { startPeriod: number; limitKw: number }[];
  validFrom: Date;
  validTo?: Date;
  purpose: string;
}

export interface Alert {
  id: string;
  stationId: string;
  tenantId: string;
  type: 'fault' | 'offline' | 'firmware' | 'billing' | 'security';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  resolved: boolean;
  createdAt: Date;
  resolvedAt?: Date;
}
