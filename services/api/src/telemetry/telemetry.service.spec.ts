// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { Driver } from '../drivers/driver.types';
import { DriversService } from '../drivers/driver.service';
import type { Shipment } from '../shipments/shipment.types';
import { ShipmentsService } from '../shipments/shipment.service';
import type { Vehicle } from '../vehicles/vehicle.types';
import { VehiclesService } from '../vehicles/vehicle.service';
import { TelemetryService } from './telemetry.service';
import { InMemoryTelemetryStore } from './telemetry.store';
import type { TelemetryReading } from './telemetry.types';

function vehicle(id: string, plate: string): Vehicle {
  return {
    id,
    plate,
    type: 'Xe tải nhỏ',
    status: 'Sẵn sàng',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function driver(id: string, name: string, vehicleId: string | null): Driver {
  return {
    id,
    name,
    phone: '0901234567',
    username: id.toLowerCase(),
    vehicleId,
    status: 'Sẵn sàng',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function shipment(
  id: string,
  orderId: string,
  status: Shipment['status'],
  driverId: string,
  vehicleId: string,
): Shipment {
  return {
    id,
    orderId,
    status,
    driverId,
    vehicleId,
    proofPhotoKey: null,
    proofPhotoFileId: null,
    history: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function reading(
  vehicleId: string,
  recordedAt: string,
  overrides: Partial<TelemetryReading> = {},
): TelemetryReading {
  return {
    id: `TL-${vehicleId}-${recordedAt}`,
    deviceId: `IOT-${vehicleId}`,
    vehicleId,
    lat: 21.0278,
    lng: 105.8342,
    temperatureC: 3.5,
    batteryPct: 88,
    source: 'simulated',
    payload: {},
    recordedAt,
    createdAt: recordedAt,
    ...overrides,
  };
}

describe('TelemetryService', () => {
  const vehicles: Vehicle[] = [vehicle('XE-1001', '29H-11111')];
  const shipments: Shipment[] = [];
  const drivers: Driver[] = [];
  let vehiclesService: VehiclesService;
  let shipmentsService: ShipmentsService;
  let driversService: DriversService;
  let store: InMemoryTelemetryStore;
  let audit: AuditService;
  let service: TelemetryService;

  beforeEach(() => {
    vehicles.length = 0;
    vehicles.push(vehicle('XE-1001', '29H-11111'));
    shipments.length = 0;
    drivers.length = 0;

    vehiclesService = {
      list: jest.fn(async () => vehicles),
      get: jest.fn(async (id: string) => {
        const found = vehicles.find((item) => item.id === id);
        if (!found) {
          throw new NotFoundException(`Không tìm thấy xe ${id}.`);
        }
        return found;
      }),
    } as unknown as VehiclesService;
    shipmentsService = {
      list: jest.fn(async () => shipments),
    } as unknown as ShipmentsService;
    driversService = {
      list: jest.fn(async () => drivers),
    } as unknown as DriversService;
    store = new InMemoryTelemetryStore();
    audit = new AuditService();
    service = new TelemetryService(
      vehiclesService,
      shipmentsService,
      driversService,
      store,
      audit,
    );
  });

  it('ingest lưu reading hợp lệ và trả đúng trường', async () => {
    const saved = await service.ingest({
      deviceId: 'IOT-XE-1001',
      vehicleId: 'XE-1001',
      lat: 21.0278,
      lng: 105.8342,
      temperatureC: 3.5,
      batteryPct: 88,
    });

    expect(saved.id).toMatch(/^TL-/);
    expect(saved.vehicleId).toBe('XE-1001');
    expect(saved.source).toBe('device');
    expect(saved.temperatureC).toBe(3.5);
    expect(saved.batteryPct).toBe(88);
    expect(saved.recordedAt).toBeTruthy();
  });

  it('ingest từ chối toạ độ ngoài miền', async () => {
    await expect(
      service.ingest({
        deviceId: 'IOT-XE-1001',
        vehicleId: 'XE-1001',
        lat: 120,
        lng: 105.8342,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ingest từ chối xe không tồn tại', async () => {
    await expect(
      service.ingest({
        deviceId: 'IOT-XE-9999',
        vehicleId: 'XE-9999',
        lat: 21,
        lng: 105,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tính twin online/stale/offline theo tuổi reading', async () => {
    vehicles.push(vehicle('XE-1002', '29H-22222'));
    vehicles.push(vehicle('XE-1003', '29H-33333'));
    const now = Date.now();
    await store.save(reading('XE-1001', new Date(now).toISOString()));
    await store.save(
      reading('XE-1002', new Date(now - 10 * 60 * 1000).toISOString()),
    );
    await store.save(
      reading('XE-1003', new Date(now - 45 * 60 * 1000).toISOString()),
    );

    const twins = await service.listTwins();

    expect(twins.map((twin) => twin.status)).toEqual([
      'online',
      'stale',
      'offline',
    ]);
    expect(twins[0].lastSeen).toBeTruthy();
    expect(twins[0].ageSeconds).not.toBeNull();
  });

  it('gắn tài xế đang giao và tài xế thường lái', async () => {
    vehicles.push(vehicle('XE-1002', '29H-22222'));
    vehicles.push(vehicle('XE-1003', '29H-33333'));
    shipments.push(
      shipment('GH-1001', 'DH-1001', 'Đang giao', 'TX-1001', 'XE-1001'),
    );
    drivers.push(driver('TX-1001', 'Nguyễn Văn An', null));
    drivers.push(driver('TX-1002', 'Trần Thị Hoa', 'XE-1002'));

    const twins = await service.listTwins();

    expect(twins[0].driver).toMatchObject({
      id: 'TX-1001',
      name: 'Nguyễn Văn An',
      source: 'shipment',
      shipmentId: 'GH-1001',
      orderId: 'DH-1001',
    });
    expect(twins[1].driver).toMatchObject({
      id: 'TX-1002',
      name: 'Trần Thị Hoa',
      source: 'assignment',
      shipmentId: null,
    });
    expect(twins[2].driver).toBeNull();
  });

  it('trả NGSI-LD Vehicle với toạ độ [lng, lat] và tài xế', async () => {
    const now = new Date().toISOString();
    await store.save(reading('XE-1001', now));
    drivers.push(driver('TX-1001', 'Nguyễn Văn An', 'XE-1001'));

    const entities = await service.listNgsiLd('Vehicle');

    expect(entities).toHaveLength(1);
    expect(entities[0].id).toBe('urn:ngsi-ld:Vehicle:XE-1001');
    expect(entities[0].type).toBe('Vehicle');
    expect(entities[0].name.value).toBe('29H-11111');
    expect(entities[0].location?.value.coordinates).toEqual([105.8342, 21.0278]);
    expect(entities[0].twinStatus.value).toBe('online');
    expect(entities[0].driverName?.value).toBe('Nguyễn Văn An');
    expect(entities[0].driverSource?.value).toBe('assignment');
  });

  it('simulate tạo reading cho toàn bộ xe và ghi audit', async () => {
    vehicles.push(vehicle('XE-1002', '29H-22222'));
    vehicles.push(vehicle('XE-1003', '29H-33333'));

    const result = await service.simulate({
      userId: 'u-1',
      username: 'demo.admin',
      roles: ['Quản trị viên'],
    });

    expect(result.inserted).toBe(3);
    const twins = await service.listTwins();
    expect(twins.map((twin) => twin.status)).toEqual([
      'online',
      'stale',
      'offline',
    ]);
    const records = await audit.getAll();
    expect(records[records.length - 1].action).toBe('telemetry.simulated');
  });
});
