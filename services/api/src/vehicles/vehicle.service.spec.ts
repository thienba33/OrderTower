// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { VehiclesService } from './vehicle.service';
import { InMemoryVehicleStore } from './vehicle.store';

const COORDINATOR: Caller = {
  userId: 'user-son',
  username: 'son',
  roles: ['Điều phối viên'],
};
const DRIVER: Caller = {
  userId: 'user-nam',
  username: 'nam',
  roles: ['Tài xế'],
};

async function buildServices(): Promise<{
  audit: AuditService;
  vehicles: VehiclesService;
}> {
  const audit = new AuditService();
  const vehicles = new VehiclesService(audit, new InMemoryVehicleStore());
  await vehicles.onModuleInit();
  return { audit, vehicles };
}

async function actionCount(
  audit: AuditService,
  action: string,
): Promise<number> {
  const records = await audit.getAll();
  return records.filter((record) => record.action === action).length;
}

describe('VehiclesService', () => {
  it('tạo xe ở trạng thái Sẵn sàng, ghi audit vehicle.created', async () => {
    const { audit, vehicles } = await buildServices();
    const vehicle = await vehicles.create(
      { plate: '29A-12345', type: 'Xe máy' },
      COORDINATOR,
    );
    expect(vehicle.id).toBe('XE-1006');
    expect(vehicle.plate).toBe('29A-12345');
    expect(vehicle.type).toBe('Xe máy');
    expect(vehicle.status).toBe('Sẵn sàng');
    expect(await actionCount(audit, 'vehicle.created')).toBe(1);
    const created = (await audit.getAll()).find(
      (record) => record.action === 'vehicle.created',
    );
    expect(created).toMatchObject({
      actor: 'son',
      orderId: 'XE-1006',
      from: null,
      to: 'Sẵn sàng',
    });
  });

  it('xe thứ hai tiếp tục số thứ tự XE-1007', async () => {
    const { vehicles } = await buildServices();
    await vehicles.create({ plate: '29A-12345', type: 'Xe máy' }, COORDINATOR);
    const second = await vehicles.create(
      { plate: '29B-67890', type: 'Xe tải nhỏ' },
      COORDINATOR,
    );
    expect(second.id).toBe('XE-1007');
  });

  it('tạo xe thiếu biển số hoặc loại xe thì báo 400', async () => {
    const { vehicles } = await buildServices();
    await expect(
      vehicles.create({ plate: '  ', type: 'Xe máy' }, COORDINATOR),
    ).rejects.toThrow('Tạo xe cần có biển số');
    await expect(
      vehicles.create({ plate: '29A-12345', type: '' }, COORDINATOR),
    ).rejects.toThrow('Tạo xe cần có loại xe');
    expect(await vehicles.list()).toHaveLength(5);
  });

  it('tạo xe trùng biển số thì báo 409', async () => {
    const { vehicles } = await buildServices();
    await vehicles.create({ plate: '29A-12345', type: 'Xe máy' }, COORDINATOR);
    await expect(
      vehicles.create({ plate: '29A-12345', type: 'Xe tải nhỏ' }, COORDINATOR),
    ).rejects.toThrow('Biển số 29A-12345 đã có xe XE-1006');
    expect(await vehicles.list()).toHaveLength(6);
  });

  it('tạo xe bởi Tài xế thì báo 409', async () => {
    const { vehicles } = await buildServices();
    await expect(
      vehicles.create({ plate: '29A-12345', type: 'Xe máy' }, DRIVER),
    ).rejects.toThrow('cần vai Điều phối viên');
    expect(await vehicles.list()).toHaveLength(5);
  });

  it('get không tìm thấy thì 404, list lọc theo trạng thái', async () => {
    const { vehicles } = await buildServices();
    await expect(vehicles.get('XE-9999')).rejects.toThrow(
      'Không tìm thấy xe XE-9999',
    );
    const first = await vehicles.create(
      { plate: '29A-12345', type: 'Xe máy' },
      COORDINATOR,
    );
    await vehicles.create(
      { plate: '29B-67890', type: 'Xe tải nhỏ' },
      COORDINATOR,
    );
    expect(await vehicles.get(first.id)).toMatchObject({
      id: first.id,
      plate: '29A-12345',
    });
    expect(await vehicles.list()).toHaveLength(7);
    expect(
      await vehicles.list({ status: 'Sẵn sàng' }),
    ).toHaveLength(7);
    await vehicles.maintenance(first.id, COORDINATOR);
    expect(
      await vehicles.list({ status: 'Bảo trì' }),
    ).toHaveLength(1);
    expect(
      await vehicles.list({ status: 'Sẵn sàng' }),
    ).toHaveLength(6);
    expect(
      await vehicles.list({ status: 'Đang giao' }),
    ).toHaveLength(0);
  });

  it('cho xe vào bảo trì rồi kích hoạt lại được, ghi audit', async () => {
    const { audit, vehicles } = await buildServices();
    const vehicle = await vehicles.create(
      { plate: '29A-12345', type: 'Xe máy' },
      COORDINATOR,
    );
    const inMaintenance = await vehicles.maintenance(vehicle.id, COORDINATOR);
    expect(inMaintenance.status).toBe('Bảo trì');
    expect(await actionCount(audit, 'vehicle.maintenance')).toBe(1);
    const activated = await vehicles.activate(vehicle.id, COORDINATOR);
    expect(activated.status).toBe('Sẵn sàng');
    expect(await actionCount(audit, 'vehicle.activated')).toBe(1);
    expect((await audit.verify()).valid).toBe(true);
  });

  it('bảo trì xe đang bảo trì hoặc đang giao thì báo 409', async () => {
    const { vehicles } = await buildServices();
    const vehicle = await vehicles.create(
      { plate: '29A-12345', type: 'Xe máy' },
      COORDINATOR,
    );
    await vehicles.maintenance(vehicle.id, COORDINATOR);
    await expect(
      vehicles.maintenance(vehicle.id, COORDINATOR),
    ).rejects.toThrow('đang ở trạng thái "Bảo trì"');
    await vehicles.activate(vehicle.id, COORDINATOR);
    await vehicles.markBusy(vehicle.id);
    expect((await vehicles.get(vehicle.id)).status).toBe('Đang giao');
    await expect(
      vehicles.maintenance(vehicle.id, COORDINATOR),
    ).rejects.toThrow('đang ở trạng thái "Đang giao"');
  });

  it('kích hoạt xe đang sẵn sàng thì báo 409', async () => {
    const { vehicles } = await buildServices();
    const vehicle = await vehicles.create(
      { plate: '29A-12345', type: 'Xe máy' },
      COORDINATOR,
    );
    await expect(vehicles.activate(vehicle.id, COORDINATOR)).rejects.toThrow(
      'đang ở trạng thái "Sẵn sàng"',
    );
  });

  it('bảo trì và kích hoạt bởi Tài xế thì báo 409', async () => {
    const { vehicles } = await buildServices();
    const vehicle = await vehicles.create(
      { plate: '29A-12345', type: 'Xe máy' },
      COORDINATOR,
    );
    await expect(vehicles.maintenance(vehicle.id, DRIVER)).rejects.toThrow(
      'cần vai Điều phối viên',
    );
    await vehicles.maintenance(vehicle.id, COORDINATOR);
    await expect(vehicles.activate(vehicle.id, DRIVER)).rejects.toThrow(
      'cần vai Điều phối viên',
    );
    expect((await vehicles.get(vehicle.id)).status).toBe('Bảo trì');
  });

  it('đổi trạng thái do shipment kéo theo không ghi audit vehicle', async () => {
    const { audit, vehicles } = await buildServices();
    const vehicle = await vehicles.create(
      { plate: '29A-12345', type: 'Xe máy' },
      COORDINATOR,
    );
    await vehicles.markBusy(vehicle.id);
    expect((await vehicles.get(vehicle.id)).status).toBe('Đang giao');
    await vehicles.markAvailable(vehicle.id);
    expect((await vehicles.get(vehicle.id)).status).toBe('Sẵn sàng');
    const vehicleActions = (await audit.getAll()).filter((record) =>
      record.action.startsWith('vehicle.'),
    );
    expect(vehicleActions).toHaveLength(1);
    expect(vehicleActions[0]?.action).toBe('vehicle.created');
  });
});

describe('VehiclesService seed mẫu', () => {
  const originalSeedPath = process.env.VEHICLES_SEED_PATH;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vehicles-test-'));
  });

  afterEach(() => {
    if (originalSeedPath === undefined) {
      delete process.env.VEHICLES_SEED_PATH;
    } else {
      process.env.VEHICLES_SEED_PATH = originalSeedPath;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('nạp seed trong repo: 5 xe XE-1001..XE-1005, đều Sẵn sàng', async () => {
    const audit = new AuditService();
    const vehicles = new VehiclesService(audit, new InMemoryVehicleStore());
    await vehicles.onModuleInit();
    const list = await vehicles.list();
    expect(list.map((vehicle) => vehicle.id)).toEqual([
      'XE-1001',
      'XE-1002',
      'XE-1003',
      'XE-1004',
      'XE-1005',
    ]);
    expect(list.map((vehicle) => vehicle.plate)).toEqual([
      '29H-11111',
      '29H-22222',
      '30K-33333',
      '29H-44444',
      '30K-55555',
    ]);
    expect(
      list.every((vehicle) => vehicle.status === 'Sẵn sàng'),
    ).toBe(true);
    // Xe mẫu ghi thẳng vào kho, không sinh audit vehicle.created.
    expect(await actionCount(audit, 'vehicle.created')).toBe(0);
    // Xe tạo tay tiếp theo nối số XE-1006.
    const next = await vehicles.create(
      { plate: '29A-12345', type: 'Xe máy' },
      COORDINATOR,
    );
    expect(next.id).toBe('XE-1006');
  });

  it('lần 2 không nạp lại seed, không đặt lại kho', async () => {
    const audit = new AuditService();
    const store = new InMemoryVehicleStore();
    const first = new VehiclesService(audit, store);
    await first.onModuleInit();
    await first.create({ plate: '29A-12345', type: 'Xe máy' }, COORDINATOR);
    const second = new VehiclesService(audit, store);
    await second.onModuleInit();
    expect((await second.list()).map((vehicle) => vehicle.id)).toEqual([
      'XE-1001',
      'XE-1002',
      'XE-1003',
      'XE-1004',
      'XE-1005',
      'XE-1006',
    ]);
    const next = await second.create(
      { plate: '29B-67890', type: 'Xe tải nhỏ' },
      COORDINATOR,
    );
    expect(next.id).toBe('XE-1007');
  });

  it('tệp seed sai hình dạng thì chặn khởi động', async () => {
    const path = join(tempDir, 'vehicles.test.json');
    writeFileSync(
      path,
      JSON.stringify({
        items: [
          { plate: '29H-11111', type: 'Xe máy' },
          { plate: '29H-11111', type: 'Xe tải nhỏ' },
        ],
      }),
    );
    process.env.VEHICLES_SEED_PATH = path;
    const audit = new AuditService();
    const vehicles = new VehiclesService(audit, new InMemoryVehicleStore());
    await expect(vehicles.onModuleInit()).rejects.toThrow('bị trùng');
  });
});
