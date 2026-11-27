// SPDX-License-Identifier: Apache-2.0

export type TwinStatus = 'online' | 'stale' | 'offline';

export interface ApiTelemetryReading {
  id: string;
  deviceId: string;
  vehicleId: string;
  lat: number;
  lng: number;
  temperatureC: number | null;
  batteryPct: number | null;
  source: 'device' | 'simulated';
  recordedAt: string;
  createdAt: string;
}

export interface ApiTwinDriver {
  id: string;
  name: string;
  phone: string;
  username: string;
  status: string;
  source: 'shipment' | 'assignment';
  shipmentId: string | null;
  orderId: string | null;
}

export interface ApiVehicleTwin {
  vehicle: {
    id: string;
    plate: string;
    type: string;
    status: string;
  };
  driver: ApiTwinDriver | null;
  status: TwinStatus;
  lastSeen: string | null;
  ageSeconds: number | null;
  lastReading: ApiTelemetryReading | null;
  history: ApiTelemetryReading[];
}
