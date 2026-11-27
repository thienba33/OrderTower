// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { DriversService } from '../drivers/driver.service';
import type { Driver } from '../drivers/driver.types';
import { ShipmentsService } from '../shipments/shipment.service';
import type { Shipment } from '../shipments/shipment.types';
import { VehiclesService } from '../vehicles/vehicle.service';
import { TELEMETRY_STORE } from './telemetry.store';
import type {
  IngestTelemetryInput,
  NgsiLdVehicle,
  SimulateResult,
  TelemetryReading,
  TelemetryStore,
  TwinDriver,
  TwinStatus,
  VehicleTwin,
} from './telemetry.types';

const NGSI_LD_CONTEXT =
  'https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
// Chuyen dang giao that su gan driver + vehicle. "Cho dieu xe" chua co
// driver/vehicle nen khong dung de suy ra tai xe hien tai.
const ACTIVE_SHIPMENT_STATUSES: ReadonlySet<string> = new Set([
  'Đang giao',
  'Giao thất bại',
]);

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(message);
  }
  return value.trim();
}

function requireNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new BadRequestException(
      `${field} phải là số trong khoảng ${min}..${max}.`,
    );
  }
  return number;
}

function optionalNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return requireNumber(value, field, min, max);
}

function parseRecordedAt(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return new Date().toISOString();
  }
  if (typeof value !== 'string') {
    throw new BadRequestException('recordedAt phải là chuỗi ISO-8601.');
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    throw new BadRequestException('recordedAt không phải thời gian hợp lệ.');
  }
  // Cho phép lệch tối đa 5 phút do đồng hồ thiết bị; quá xa tương lai là lỗi.
  if (time > Date.now() + 5 * 60 * 1000) {
    throw new BadRequestException('recordedAt không được ở tương lai.');
  }
  return new Date(time).toISOString();
}

function parsePayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function clampLimit(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_LIMIT;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new BadRequestException('limit phải là số nguyên dương.');
  }
  return Math.min(number, MAX_LIMIT);
}

// Nguong trang thai twin. Cau hinh qua env de demo stale/offline de hon.
function threshold(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

@Injectable()
export class TelemetryService {
  constructor(
    private readonly vehicles: VehiclesService,
    private readonly shipments: ShipmentsService,
    private readonly drivers: DriversService,
    @Inject(TELEMETRY_STORE)
    private readonly store: TelemetryStore,
    private readonly audit: AuditService,
  ) {}

  // Thiet bi gui reading. Device key duoc kiem tra o controller; service
  // chi validate nghiep vu va kiem tra xe co that.
  async ingest(input: IngestTelemetryInput): Promise<TelemetryReading> {
    const deviceId = requireNonEmptyString(
      input.deviceId,
      'Telemetry cần deviceId.',
    );
    const vehicleId = requireNonEmptyString(
      input.vehicleId,
      'Telemetry cần vehicleId.',
    );
    // Nem 404 neu xe khong ton tai; khong luu reading mo coi.
    await this.vehicles.get(vehicleId);

    const lat = requireNumber(input.lat, 'lat', -90, 90);
    const lng = requireNumber(input.lng, 'lng', -180, 180);
    const temperatureC = optionalNumber(
      input.temperatureC,
      'temperatureC',
      -50,
      100,
    );
    const batteryPct = optionalNumber(input.batteryPct, 'batteryPct', 0, 100);
    const recordedAt = parseRecordedAt(input.recordedAt);
    const now = new Date().toISOString();

    const reading: TelemetryReading = {
      id: `TL-${randomUUID()}`,
      deviceId,
      vehicleId,
      lat,
      lng,
      temperatureC,
      batteryPct,
      source: 'device',
      payload: parsePayload(input.payload),
      recordedAt,
      createdAt: now,
    };
    await this.store.save(reading);
    return reading;
  }

  async list(
    vehicleIdInput?: string,
    limitInput?: string,
  ): Promise<TelemetryReading[]> {
    const limit = clampLimit(limitInput);
    const vehicleId =
      typeof vehicleIdInput === 'string' && vehicleIdInput.trim() !== ''
        ? vehicleIdInput.trim()
        : null;
    if (vehicleId) {
      await this.vehicles.get(vehicleId);
      return this.store.listByVehicle(vehicleId, limit);
    }
    return this.store.listRecent(limit);
  }

  async listTwins(): Promise<VehicleTwin[]> {
    const [vehicles, shipments, drivers] = await Promise.all([
      this.vehicles.list(),
      this.shipments.list(),
      this.drivers.list(),
    ]);
    const activeByVehicle = this.activeShipmentsByVehicle(shipments);
    const assignedByVehicle = this.assignedDriversByVehicle(drivers);
    const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
    return Promise.all(
      vehicles.map((vehicle) =>
        this.buildTwin(vehicle, activeByVehicle, assignedByVehicle, driverById),
      ),
    );
  }

  async getTwin(vehicleId: string): Promise<VehicleTwin> {
    const [vehicle, shipments, drivers] = await Promise.all([
      this.vehicles.get(vehicleId),
      this.shipments.list(),
      this.drivers.list(),
    ]);
    return this.buildTwin(
      vehicle,
      this.activeShipmentsByVehicle(shipments),
      this.assignedDriversByVehicle(drivers),
      new Map(drivers.map((driver) => [driver.id, driver])),
    );
  }

  // Tao du lieu mo phong cho demo: 3 xe online, 1 stale, 1 offline.
  async simulate(caller: Caller): Promise<SimulateResult> {
    const vehicles = await this.vehicles.list();
    const now = Date.now();
    const readings: TelemetryReading[] = [];

    for (let index = 0; index < vehicles.length; index++) {
      const vehicle = vehicles[index];
      const last = index === vehicles.length - 1;
      const stale = index === vehicles.length - 2;
      const ageSeconds = last ? 45 * 60 : stale ? 10 * 60 : 0;
      const recordedAt = new Date(now - ageSeconds * 1000).toISOString();
      const lat = 21.0278 + index * 0.012;
      const lng = 105.8342 + index * 0.018;
      const reading: TelemetryReading = {
        id: `TL-${randomUUID()}`,
        deviceId: `IOT-${vehicle.id}`,
        vehicleId: vehicle.id,
        lat,
        lng,
        temperatureC: 2.5 + index * 0.7,
        batteryPct: 92 - index * 6,
        source: 'simulated',
        payload: { simulated: true, index },
        recordedAt,
        createdAt: new Date(now).toISOString(),
      };
      await this.store.save(reading);
      readings.push(reading);
    }

    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'telemetry.simulated',
      orderId: 'telemetry',
      from: null,
      to: null,
      detail: `Tạo ${readings.length} reading mô phỏng cho twin đội xe.`,
    });

    return { inserted: readings.length, readings };
  }

  async listNgsiLd(type?: string): Promise<NgsiLdVehicle[]> {
    if (type && type !== 'Vehicle') {
      return [];
    }
    const twins = await this.listTwins();
    return twins.map((twin) => this.toNgsiLd(twin));
  }

  private activeShipmentsByVehicle(
    shipments: Shipment[],
  ): Map<string, Shipment> {
    const latest = new Map<string, Shipment>();
    for (const shipment of shipments) {
      if (
        !shipment.vehicleId ||
        !shipment.driverId ||
        !ACTIVE_SHIPMENT_STATUSES.has(shipment.status)
      ) {
        continue;
      }
      const current = latest.get(shipment.vehicleId);
      if (!current || shipment.updatedAt > current.updatedAt) {
        latest.set(shipment.vehicleId, shipment);
      }
    }
    return latest;
  }

  private assignedDriversByVehicle(drivers: Driver[]): Map<string, Driver> {
    const assigned = new Map<string, Driver>();
    for (const driver of drivers) {
      if (driver.vehicleId) {
        assigned.set(driver.vehicleId, driver);
      }
    }
    return assigned;
  }

  private resolveDriver(
    vehicleId: string,
    activeByVehicle: Map<string, Shipment>,
    assignedByVehicle: Map<string, Driver>,
    driverById: Map<string, Driver>,
  ): TwinDriver | null {
    const shipment = activeByVehicle.get(vehicleId);
    if (shipment?.driverId) {
      const driver = driverById.get(shipment.driverId);
      if (driver) {
        return {
          id: driver.id,
          name: driver.name,
          phone: driver.phone,
          username: driver.username,
          status: driver.status,
          source: 'shipment',
          shipmentId: shipment.id,
          orderId: shipment.orderId,
        };
      }
    }
    const assigned = assignedByVehicle.get(vehicleId);
    if (assigned) {
      return {
        id: assigned.id,
        name: assigned.name,
        phone: assigned.phone,
        username: assigned.username,
        status: assigned.status,
        source: 'assignment',
        shipmentId: null,
        orderId: null,
      };
    }
    return null;
  }

  private async buildTwin(
    vehicle: {
      id: string;
      plate: string;
      type: string;
      status: string;
    },
    activeByVehicle: Map<string, Shipment>,
    assignedByVehicle: Map<string, Driver>,
    driverById: Map<string, Driver>,
  ): Promise<VehicleTwin> {
    const [latest, history] = await Promise.all([
      this.store.latestByVehicle(vehicle.id),
      this.store.listByVehicle(vehicle.id, 5),
    ]);
    const { status, ageSeconds } = this.computeStatus(latest);
    return {
      vehicle: {
        id: vehicle.id,
        plate: vehicle.plate,
        type: vehicle.type,
        status: vehicle.status,
      },
      driver: this.resolveDriver(
        vehicle.id,
        activeByVehicle,
        assignedByVehicle,
        driverById,
      ),
      status,
      lastSeen: latest?.recordedAt ?? null,
      ageSeconds,
      lastReading: latest,
      history,
    };
  }

  private computeStatus(latest: TelemetryReading | null): {
    status: TwinStatus;
    ageSeconds: number | null;
  } {
    if (!latest) {
      return { status: 'offline', ageSeconds: null };
    }
    const recordedAt = Date.parse(latest.recordedAt);
    if (!Number.isFinite(recordedAt)) {
      return { status: 'offline', ageSeconds: null };
    }
    const ageSeconds = Math.max(
      0,
      Math.floor((Date.now() - recordedAt) / 1000),
    );
    const onlineSeconds = threshold('TELEMETRY_ONLINE_SECONDS', 5 * 60);
    const staleSeconds = threshold('TELEMETRY_STALE_SECONDS', 30 * 60);
    if (ageSeconds <= onlineSeconds) {
      return { status: 'online', ageSeconds };
    }
    if (ageSeconds <= staleSeconds) {
      return { status: 'stale', ageSeconds };
    }
    return { status: 'offline', ageSeconds };
  }

  private toNgsiLd(twin: VehicleTwin): NgsiLdVehicle {
    const last = twin.lastReading;
    const entity: NgsiLdVehicle = {
      '@context': NGSI_LD_CONTEXT,
      id: `urn:ngsi-ld:Vehicle:${twin.vehicle.id}`,
      type: 'Vehicle',
      name: { type: 'Property', value: twin.vehicle.plate },
      vehicleType: { type: 'Property', value: twin.vehicle.type },
      twinStatus: { type: 'Property', value: twin.status },
    };
    if (twin.driver) {
      entity.driverId = {
        type: 'Property',
        value: twin.driver.id,
      };
      entity.driverName = {
        type: 'Property',
        value: twin.driver.name,
      };
      entity.driverPhone = {
        type: 'Property',
        value: twin.driver.phone,
      };
      entity.driverSource = {
        type: 'Property',
        value: twin.driver.source,
      };
    }
    if (last) {
      entity.location = {
        type: 'GeoProperty',
        value: {
          type: 'Point',
          coordinates: [last.lng, last.lat],
        },
        observedAt: last.recordedAt,
      };
      if (last.temperatureC !== null) {
        entity.temperature = {
          type: 'Property',
          value: last.temperatureC,
          observedAt: last.recordedAt,
        };
      }
      if (last.batteryPct !== null) {
        entity.batteryLevel = {
          type: 'Property',
          value: last.batteryPct,
          observedAt: last.recordedAt,
        };
      }
      entity.observationDateTime = {
        type: 'Property',
        value: last.recordedAt,
        observedAt: last.recordedAt,
      };
    }
    return entity;
  }
}
