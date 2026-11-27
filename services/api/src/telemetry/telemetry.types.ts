// SPDX-License-Identifier: Apache-2.0

// Mot mau telemetry tu thiet bi/cam bien gan voi xe. Day la du lieu OT
// (van hanh) duoc dua vao cung he thong voi du lieu IT (don hang, giao van).
export type TelemetrySource = 'device' | 'simulated';

export interface TelemetryReading {
  id: string;
  deviceId: string;
  vehicleId: string;
  lat: number;
  lng: number;
  temperatureC: number | null;
  batteryPct: number | null;
  source: TelemetrySource;
  payload: Record<string, unknown>;
  recordedAt: string;
  createdAt: string;
}

// Input tu thiet bi. Tat ca deu unknown de service tu validate, tranh tin
// body do client gui len.
export interface IngestTelemetryInput {
  deviceId?: unknown;
  vehicleId?: unknown;
  lat?: unknown;
  lng?: unknown;
  temperatureC?: unknown;
  batteryPct?: unknown;
  recordedAt?: unknown;
  payload?: unknown;
}

export type TwinStatus = 'online' | 'stale' | 'offline';

// Nguon gan tai xe: chuyen dang giao (chinh xac nhat) hoac gan thuong lai
// tren ho so tai xe (Driver.vehicleId).
export type TwinDriverSource = 'shipment' | 'assignment';

// Tai xe that dang gan voi xe. shipmentId/orderId chi co khi nguon la
// chuyen dang giao.
export interface TwinDriver {
  id: string;
  name: string;
  phone: string;
  username: string;
  status: string;
  source: TwinDriverSource;
  shipmentId: string | null;
  orderId: string | null;
}

// Trang thai twin cua 1 xe: thong tin xe + tai xe + reading moi nhat.
export interface VehicleTwin {
  vehicle: {
    id: string;
    plate: string;
    type: string;
    status: string;
  };
  driver: TwinDriver | null;
  status: TwinStatus;
  lastSeen: string | null;
  ageSeconds: number | null;
  lastReading: TelemetryReading | null;
  history: TelemetryReading[];
}

// Entity NGSI-LD toi gian de chung minh kha nang chia se du lieu ngu canh.
// Khong phai implementation day du cua Orion; chi dung cac truong cot loi.
export interface NgsiLdProperty {
  type: 'Property';
  value: string | number | boolean | null;
  observedAt?: string;
}

export interface NgsiLdGeoProperty {
  type: 'GeoProperty';
  value: {
    type: 'Point';
    coordinates: [number, number];
  };
  observedAt?: string;
}

export interface NgsiLdVehicle {
  '@context': string;
  id: string;
  type: 'Vehicle';
  name: NgsiLdProperty;
  vehicleType: NgsiLdProperty;
  twinStatus: NgsiLdProperty;
  location?: NgsiLdGeoProperty;
  temperature?: NgsiLdProperty;
  batteryLevel?: NgsiLdProperty;
  observationDateTime?: NgsiLdProperty;
  driverId?: NgsiLdProperty;
  driverName?: NgsiLdProperty;
  driverPhone?: NgsiLdProperty;
  driverSource?: NgsiLdProperty;
}

export interface SimulateResult {
  inserted: number;
  readings: TelemetryReading[];
}

// Kho reading. Ban bo nho chi dung test; runtime dung Postgres.
export interface TelemetryStore {
  save(reading: TelemetryReading): Promise<void>;
  listByVehicle(vehicleId: string, limit: number): Promise<TelemetryReading[]>;
  latestByVehicle(vehicleId: string): Promise<TelemetryReading | null>;
  listRecent(limit: number): Promise<TelemetryReading[]>;
}
