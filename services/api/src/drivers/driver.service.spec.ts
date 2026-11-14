// SPDX-License-Identifier: Apache-2.0
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { VehiclesService } from '../vehicles/vehicle.service';
import { InMemoryVehicleStore } from '../vehicles/vehicle.store';
import { DriversService } from './driver.service';
import { InMemoryDriverStore } from './driver.store';

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
  drivers: DriversService;
  vehicles: VehiclesService;
}> {
  const audit = new AuditService();
  const vehicles = new VehiclesService(audit, new InMemoryVehicleStore());
  await vehicles.onModuleInit();
  const drivers = new DriversService(
    audit,
    new InMemoryDriverStore(),
    vehicles,
  );
  await drivers.onModuleInit();
  return { audit, drivers, vehicles };
}

async function createVehicleReady(vehicles: VehiclesService, plate: string) {
  return vehicles.create({ plate, type: 'Xe máy' }, COORDINATOR);
}

async function actionCount(
  audit: AuditService,
  action: string,
): Promise<number> {
  const records = await audit.getAll();
  return records.filter((record) => record.action === action).length;
}

describe('DriversService', () => {
  it('tạo tài xế ở trạng thái Sẵn sàng, chưa gán xe, ghi audit driver.created', async () => {
    const { audit, drivers } = await buildServices();
    const driver = await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    expect(driver.id).toBe('TX-1001');
    expect(driver.name).toBe('Nam');
    expect(driver.phone).toBe('0901234567');
    expect(driver.username).toBe('nam');
    expect(driver.vehicleId).toBeNull();
    expect(driver.status).toBe('Sẵn sàng');
    expect(await actionCount(audit, 'driver.created')).toBe(1);
    const created = (await audit.getAll()).find(
      (record) => record.action === 'driver.created',
    );
    expect(created).toMatchObject({
      actor: 'son',
      orderId: 'TX-1001',
      from: null,
      to: 'Sẵn sàng',
    });
  });

  it('tài xế thứ hai tiếp tục số thứ tự TX-1002', async () => {
    const { drivers } = await buildServices();
    await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    const second = await drivers.create(
      { name: 'Tuấn', phone: '0901234568', username: 'tuan' },
      COORDINATOR,
    );
    expect(second.id).toBe('TX-1002');
  });

  it('tạo tài xế thiếu tên, phone hoặc username thì báo 400', async () => {
    const { drivers } = await buildServices();
    await expect(
      drivers.create(
        { name: '  ', phone: '0901234567', username: 'nam' },
        COORDINATOR,
      ),
    ).rejects.toThrow('Tạo tài xế cần có tên');
    await expect(
      drivers.create(
        { name: 'Nam', phone: '', username: 'nam' },
        COORDINATOR,
      ),
    ).rejects.toThrow('Tạo tài xế cần có số điện thoại');
    await expect(
      drivers.create(
        { name: 'Nam', phone: '0901234567', username: ' ' },
        COORDINATOR,
      ),
    ).rejects.toThrow('Tạo tài xế cần có tên đăng nhập');
    expect(await drivers.list()).toHaveLength(0);
  });

  it('tạo tài xế trùng username thì báo 409', async () => {
    const { drivers } = await buildServices();
    await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    await expect(
      drivers.create(
        { name: 'Nam khác', phone: '0901234568', username: 'nam' },
        COORDINATOR,
      ),
    ).rejects.toThrow('Tên đăng nhập nam đã có tài xế TX-1001');
    expect(await drivers.list()).toHaveLength(1);
  });

  it('tạo tài xế trùng phone thì báo 409', async () => {
    const { drivers } = await buildServices();
    await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    await expect(
      drivers.create(
        { name: 'Tuấn', phone: '0901234567', username: 'tuan' },
        COORDINATOR,
      ),
    ).rejects.toThrow('Số điện thoại 0901234567 đã có tài xế TX-1001');
    expect(await drivers.list()).toHaveLength(1);
  });

  it('tạo tài xế bởi Tài xế thì báo 409', async () => {
    const { drivers } = await buildServices();
    await expect(
      drivers.create(
        { name: 'Nam', phone: '0901234567', username: 'nam' },
        DRIVER,
      ),
    ).rejects.toThrow('cần vai Điều phối viên');
    expect(await drivers.list()).toHaveLength(0);
  });

  it('get không tìm thấy thì 404, list lọc theo trạng thái', async () => {
    const { drivers } = await buildServices();
    await expect(drivers.get('TX-9999')).rejects.toThrow(
      'Không tìm thấy tài xế TX-9999',
    );
    const first = await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    await drivers.create(
      { name: 'Tuấn', phone: '0901234568', username: 'tuan' },
      COORDINATOR,
    );
    expect(await drivers.get(first.id)).toMatchObject({
      id: first.id,
      name: 'Nam',
    });
    expect(await drivers.list()).toHaveLength(2);
    expect(await drivers.list({ status: 'Sẵn sàng' })).toHaveLength(2);
    await drivers.rest(first.id, COORDINATOR);
    expect(await drivers.list({ status: 'Tạm nghỉ' })).toHaveLength(1);
    expect(await drivers.list({ status: 'Sẵn sàng' })).toHaveLength(1);
    expect(await drivers.list({ status: 'Đang giao' })).toHaveLength(0);
  });

  it('gán xe rồi gỡ xe được, ghi audit', async () => {
    const { audit, drivers, vehicles } = await buildServices();
    const vehicle = await createVehicleReady(vehicles, '29A-12345');
    const driver = await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    const assigned = await drivers.assignVehicle(
      driver.id,
      { vehicleId: vehicle.id },
      COORDINATOR,
    );
    expect(assigned.vehicleId).toBe(vehicle.id);
    expect(await actionCount(audit, 'driver.vehicle.assigned')).toBe(1);
    const unassigned = await drivers.unassignVehicle(driver.id, COORDINATOR);
    expect(unassigned.vehicleId).toBeNull();
    expect(await actionCount(audit, 'driver.vehicle.unassigned')).toBe(1);
    expect((await audit.verify()).valid).toBe(true);
  });

  it('gán xe không tồn tại thì báo 404', async () => {
    const { drivers } = await buildServices();
    const driver = await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    await expect(
      drivers.assignVehicle(driver.id, { vehicleId: 'XE-9999' }, COORDINATOR),
    ).rejects.toThrow('Không tìm thấy xe XE-9999');
    expect((await drivers.get(driver.id)).vehicleId).toBeNull();
  });

  it('gán xe đã gán cho tài xế khác thì báo 409, gán lại cho xe khác được', async () => {
    const { drivers, vehicles } = await buildServices();
    const firstVehicle = await createVehicleReady(vehicles, '29A-12345');
    const secondVehicle = await createVehicleReady(vehicles, '29B-67890');
    const first = await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    const second = await drivers.create(
      { name: 'Tuấn', phone: '0901234568', username: 'tuan' },
      COORDINATOR,
    );
    await drivers.assignVehicle(
      first.id,
      { vehicleId: firstVehicle.id },
      COORDINATOR,
    );
    await expect(
      drivers.assignVehicle(
        second.id,
        { vehicleId: firstVehicle.id },
        COORDINATOR,
      ),
    ).rejects.toThrow(`Xe ${firstVehicle.id} đã gán cho tài xế ${first.id}`);
    // Gán lại cho xe khác được phép.
    const reassigned = await drivers.assignVehicle(
      first.id,
      { vehicleId: secondVehicle.id },
      COORDINATOR,
    );
    expect(reassigned.vehicleId).toBe(secondVehicle.id);
    expect((await drivers.get(second.id)).vehicleId).toBeNull();
  });

  it('gỡ xe khi chưa gán thì báo 409', async () => {
    const { drivers } = await buildServices();
    const driver = await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    await expect(
      drivers.unassignVehicle(driver.id, COORDINATOR),
    ).rejects.toThrow(`Tài xế ${driver.id} chưa gán xe nào`);
  });

  it('gán và gỡ xe bởi Tài xế thì báo 409', async () => {
    const { drivers, vehicles } = await buildServices();
    const vehicle = await createVehicleReady(vehicles, '29A-12345');
    const driver = await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    await expect(
      drivers.assignVehicle(driver.id, { vehicleId: vehicle.id }, DRIVER),
    ).rejects.toThrow('cần vai Điều phối viên');
    await drivers.assignVehicle(
      driver.id,
      { vehicleId: vehicle.id },
      COORDINATOR,
    );
    await expect(drivers.unassignVehicle(driver.id, DRIVER)).rejects.toThrow(
      'cần vai Điều phối viên',
    );
    expect((await drivers.get(driver.id)).vehicleId).toBe(vehicle.id);
  });

  it('tạm nghỉ rồi kích hoạt lại được, ghi audit', async () => {
    const { audit, drivers } = await buildServices();
    const driver = await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    const rested = await drivers.rest(driver.id, COORDINATOR);
    expect(rested.status).toBe('Tạm nghỉ');
    expect(await actionCount(audit, 'driver.rest')).toBe(1);
    const activated = await drivers.activate(driver.id, COORDINATOR);
    expect(activated.status).toBe('Sẵn sàng');
    expect(await actionCount(audit, 'driver.activated')).toBe(1);
    expect((await audit.verify()).valid).toBe(true);
  });

  it('tạm nghỉ tài xế đang tạm nghỉ hoặc đang giao thì báo 409', async () => {
    const { drivers } = await buildServices();
    const driver = await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    await drivers.rest(driver.id, COORDINATOR);
    await expect(drivers.rest(driver.id, COORDINATOR)).rejects.toThrow(
      'đang ở trạng thái "Tạm nghỉ"',
    );
    await drivers.activate(driver.id, COORDINATOR);
    await drivers.markBusy(driver.id);
    expect((await drivers.get(driver.id)).status).toBe('Đang giao');
    await expect(drivers.rest(driver.id, COORDINATOR)).rejects.toThrow(
      'đang ở trạng thái "Đang giao"',
    );
  });

  it('kích hoạt tài xế đang sẵn sàng thì báo 409', async () => {
    const { drivers } = await buildServices();
    const driver = await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    await expect(drivers.activate(driver.id, COORDINATOR)).rejects.toThrow(
      'đang ở trạng thái "Sẵn sàng"',
    );
  });

  it('tạm nghỉ và kích hoạt bởi Tài xế thì báo 409', async () => {
    const { drivers } = await buildServices();
    const driver = await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    await expect(drivers.rest(driver.id, DRIVER)).rejects.toThrow(
      'cần vai Điều phối viên',
    );
    await drivers.rest(driver.id, COORDINATOR);
    await expect(drivers.activate(driver.id, DRIVER)).rejects.toThrow(
      'cần vai Điều phối viên',
    );
    expect((await drivers.get(driver.id)).status).toBe('Tạm nghỉ');
  });

  it('đổi trạng thái do shipment kéo theo không ghi audit driver', async () => {
    const { audit, drivers } = await buildServices();
    const driver = await drivers.create(
      { name: 'Nam', phone: '0901234567', username: 'nam' },
      COORDINATOR,
    );
    await drivers.markBusy(driver.id);
    expect((await drivers.get(driver.id)).status).toBe('Đang giao');
    await drivers.markAvailable(driver.id);
    expect((await drivers.get(driver.id)).status).toBe('Sẵn sàng');
    const driverActions = (await audit.getAll()).filter((record) =>
      record.action.startsWith('driver.'),
    );
    expect(driverActions).toHaveLength(1);
    expect(driverActions[0]?.action).toBe('driver.created');
  });
});
