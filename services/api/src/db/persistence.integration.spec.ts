// SPDX-License-Identifier: Apache-2.0
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';
import { ShipmentsService } from '../shipments/shipment.service';
import { VehiclesService } from '../vehicles/vehicle.service';
import { WorkflowInstanceService } from '../workflow/instance.service';
import { DbService } from './db.service';
import { createTestDbService } from './test-helpers';

const COORDINATOR: Caller = {
  userId: 'user-son',
  username: 'son',
  roles: ['Điều phối viên'],
};
const WAREHOUSE: Caller = {
  userId: 'user-minh',
  username: 'minh',
  roles: ['Nhân viên kho'],
};
const DRIVER: Caller = {
  userId: 'user-nam',
  username: 'nam',
  roles: ['Tài xế'],
};

// Kiểm thử lưu bền toàn app: khởi động AppModule thật trên Postgres ảo
// (pg-mem), đi 1 đơn tròn 9 trạng thái, rồi "khởi động lại" API bằng app
// mới trên cùng DB và kiểm tra mọi dữ liệu còn nguyên, số đơn tiếp tục tăng.
// AuthService chỉ lấy cấu hình lúc xác thực token nên app.init() không cần
// Keycloak; test gọi trực tiếp service với caller giả, không qua HTTP.
describe('Postgres persistence (toàn app trên pg-mem)', () => {
  it('đơn đi tròn 9 trạng thái tới Hoàn, khởi động lại vẫn còn đủ dữ liệu', async () => {
    const db = await createTestDbService();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DbService)
      .useValue(db)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const orders = app.get(OrdersService);
    const audit = app.get(AuditService);
    const inventory = app.get(InventoryService);
    const instances = app.get(WorkflowInstanceService);
    const shipments = app.get(ShipmentsService);
    const vehicles = app.get(VehiclesService);

    const order = await orders.create(
      {
        idempotencyKey: 'key-1',
        customer: 'Hộ nước mắm A',
        items: [{ sku: 'NM-40', quantity: 2 }],
        address: {
          province: 'Hà Nội',
          district: 'Hai Bà Trưng',
          ward: 'Phường Phạm Đình Hổ',
          street: 'Số 8 phố Hàng Bè',
        },
      },
      COORDINATOR,
    );
    expect(order.id).toBe('DH-1001');
    const steps: Array<{
      to: string;
      caller: Caller;
    }> = [
      { to: 'Đã kiểm tra', caller: COORDINATOR },
      { to: 'Chờ kho', caller: COORDINATOR },
      { to: 'Đang đóng gói', caller: WAREHOUSE },
      { to: 'Chờ điều xe', caller: WAREHOUSE },
    ];
    let current = order;
    for (const step of steps) {
      current = await orders.transition(
        current.id,
        { to: step.to },
        step.caller,
      );
    }
    // Hai chuyển qua vùng giao hàng đi qua shipment, đơn đi theo từng bước.
    // Dispatch cần xe thật: tạo xe trước, xe theo shipment mà đổi trạng thái.
    const vehicle = await vehicles.create(
      { plate: '29A-12345', type: 'Xe máy' },
      COORDINATOR,
    );
    expect(vehicle.id).toBe('XE-1001');
    const shipment = await shipments.create(
      { orderId: order.id },
      COORDINATOR,
    );
    expect(shipment.id).toBe('GH-1001');
    await shipments.dispatch(
      shipment.id,
      { driverId: 'TX-01', vehicleId: vehicle.id },
      COORDINATOR,
    );
    current = await orders.findOne(order.id);
    expect(current.state).toBe('Đang giao');
    expect((await vehicles.get(vehicle.id)).status).toBe('Đang giao');
    await shipments.deliver(
      shipment.id,
      { proofPhotoKey: 'chung-tu/DH-1001/anh-giao.jpg' },
      DRIVER,
    );
    current = await orders.findOne(order.id);
    expect(current.state).toBe('Đã giao');
    expect((await vehicles.get(vehicle.id)).status).toBe('Sẵn sàng');
    current = await orders.transition(
      current.id,
      { to: 'Hoàn', handling: 'Đối soát xong, khách giữ hàng' },
      COORDINATOR,
    );
    expect(current.state).toBe('Hoàn');
    expect(current.history).toHaveLength(8);
    expect((await audit.verify()).valid).toBe(true);
    expect(await inventory.get('NM-40')).toMatchObject({
      stock: 450,
      reserved: 2,
    });
    expect(
      (await instances.findByBusinessKey('order-flow', 'DH-1001'))?.status,
    ).toBe('completed');

    // Mô phỏng khởi động lại API: app mới, cùng DB Postgres ảo.
    const secondRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DbService)
      .useValue(db)
      .compile();
    const secondApp = secondRef.createNestApplication();
    await secondApp.init();
    const secondOrders = secondApp.get(OrdersService);
    const secondAudit = secondApp.get(AuditService);
    const secondInventory = secondApp.get(InventoryService);
    const secondVehicles = secondApp.get(VehiclesService);

    const reopened = await secondOrders.findOne('DH-1001');
    expect(reopened.state).toBe('Hoàn');
    expect(reopened.history).toHaveLength(8);
    expect((await secondAudit.verify()).valid).toBe(true);
    expect(await secondInventory.get('NM-40')).toMatchObject({
      stock: 450,
      reserved: 2,
    });
    // Xe vẫn còn sau khi khởi động lại, ở trạng thái cuối luồng.
    expect((await secondVehicles.get('XE-1001')).status).toBe('Sẵn sàng');
    const nextVehicle = await secondVehicles.create(
      { plate: '29B-67890', type: 'Xe tải nhỏ' },
      COORDINATOR,
    );
    expect(nextVehicle.id).toBe('XE-1002');
    const next = await secondOrders.create(
      {
        idempotencyKey: 'key-2',
        customer: 'Hộ nước mắm B',
        items: [{ sku: 'NM-40', quantity: 1 }],
      },
      COORDINATOR,
    );
    expect(next.id).toBe('DH-1002');
    // Không gọi app.close(): 2 app dùng chung 1 pool pg-mem, đóng pool rồi
    // thì app còn lại không dùng được nữa; pg-mem không giữ socket thật nên
    // không cần đóng để Jest thoát.
  }, 60000);

  it('shipment đi tạo -> điều xe -> giao thất bại -> điều xe lại -> giao hàng, khởi động lại vẫn còn dữ liệu', async () => {
    const db = await createTestDbService();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DbService)
      .useValue(db)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const orders = app.get(OrdersService);
    const shipments = app.get(ShipmentsService);
    const audit = app.get(AuditService);
    const vehicles = app.get(VehiclesService);

    const order = await orders.create(
      {
        idempotencyKey: 'key-1',
        customer: 'Hộ nước mắm A',
        items: [{ sku: 'NM-40', quantity: 2 }],
        address: {
          province: 'Hà Nội',
          district: 'Hai Bà Trưng',
          ward: 'Phường Phạm Đình Hổ',
          street: 'Số 8 phố Hàng Bè',
        },
      },
      COORDINATOR,
    );
    const steps: Array<{ to: string; caller: Caller }> = [
      { to: 'Đã kiểm tra', caller: COORDINATOR },
      { to: 'Chờ kho', caller: COORDINATOR },
      { to: 'Đang đóng gói', caller: WAREHOUSE },
      { to: 'Chờ điều xe', caller: WAREHOUSE },
    ];
    for (const step of steps) {
      await orders.transition(order.id, { to: step.to }, step.caller);
    }
    const shipment = await shipments.create(
      { orderId: order.id },
      COORDINATOR,
    );
    expect(shipment.id).toBe('GH-1001');
    expect(shipment.status).toBe('Chờ điều xe');
    const firstVehicle = await vehicles.create(
      { plate: '29A-12345', type: 'Xe máy' },
      COORDINATOR,
    );
    expect(firstVehicle.id).toBe('XE-1001');
    const dispatched = await shipments.dispatch(
      shipment.id,
      { driverId: 'TX-01', vehicleId: firstVehicle.id },
      COORDINATOR,
    );
    expect(dispatched.status).toBe('Đang giao');
    expect(dispatched.driverId).toBe('TX-01');
    expect(dispatched.vehicleId).toBe(firstVehicle.id);
    expect((await orders.findOne(order.id)).state).toBe('Đang giao');
    expect((await vehicles.get(firstVehicle.id)).status).toBe('Đang giao');
    // Giao thất bại thì đơn quay lại Chờ điều xe, điều xe lại chính
    // shipment này (không tạo shipment mới).
    const failed = await shipments.fail(
      shipment.id,
      { reason: 'Khách không nghe máy' },
      DRIVER,
    );
    expect(failed.status).toBe('Giao thất bại');
    expect((await orders.findOne(order.id)).state).toBe('Chờ điều xe');
    expect((await vehicles.get(firstVehicle.id)).status).toBe('Sẵn sàng');
    // Điều xe lại được phép đổi xe khác.
    const secondVehicle = await vehicles.create(
      { plate: '29B-67890', type: 'Xe tải nhỏ' },
      COORDINATOR,
    );
    expect(secondVehicle.id).toBe('XE-1002');
    const redispatched = await shipments.dispatch(
      shipment.id,
      { driverId: 'TX-02', vehicleId: secondVehicle.id },
      COORDINATOR,
    );
    expect(redispatched.status).toBe('Đang giao');
    expect(redispatched.driverId).toBe('TX-02');
    expect(redispatched.history).toHaveLength(4);
    expect((await orders.findOne(order.id)).state).toBe('Đang giao');
    expect((await vehicles.get(firstVehicle.id)).status).toBe('Sẵn sàng');
    expect((await vehicles.get(secondVehicle.id)).status).toBe('Đang giao');
    const delivered = await shipments.deliver(
      shipment.id,
      { proofPhotoKey: 'chung-tu/DH-1001/anh-giao.jpg' },
      DRIVER,
    );
    expect(delivered.status).toBe('Đã giao');
    expect(delivered.proofPhotoKey).toBe('chung-tu/DH-1001/anh-giao.jpg');
    expect(delivered.history).toHaveLength(5);
    expect((await orders.findOne(order.id)).state).toBe('Đã giao');
    expect((await vehicles.get(secondVehicle.id)).status).toBe('Sẵn sàng');
    // Đơn đã giao xong thì không tạo được shipment mới nữa.
    await expect(
      shipments.create({ orderId: order.id }, COORDINATOR),
    ).rejects.toThrow('chỉ tạo shipment khi đơn ở "Chờ điều xe"');
    expect((await audit.verify()).valid).toBe(true);

    // Mô phỏng khởi động lại API: app mới, cùng DB Postgres ảo.
    const secondRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DbService)
      .useValue(db)
      .compile();
    const secondApp = secondRef.createNestApplication();
    await secondApp.init();
    const secondOrders = secondApp.get(OrdersService);
    const secondShipments = secondApp.get(ShipmentsService);
    const secondAudit = secondApp.get(AuditService);
    const secondVehicles = secondApp.get(VehiclesService);

    const reopened = await secondShipments.get('GH-1001');
    expect(reopened.status).toBe('Đã giao');
    expect(reopened.history).toHaveLength(5);
    expect(reopened.proofPhotoKey).toBe('chung-tu/DH-1001/anh-giao.jpg');
    expect((await secondOrders.findOne('DH-1001')).state).toBe('Đã giao');
    expect((await secondAudit.verify()).valid).toBe(true);
    // Cả 2 xe vẫn còn sau khi khởi động lại, đều về Sẵn sàng; xe tiếp
    // theo tiếp tục số thứ tự XE-1003.
    expect((await secondVehicles.get('XE-1001')).status).toBe('Sẵn sàng');
    expect((await secondVehicles.get('XE-1002')).status).toBe('Sẵn sàng');
    const nextVehicle = await secondVehicles.create(
      { plate: '29C-11111', type: 'Xe máy' },
      COORDINATOR,
    );
    expect(nextVehicle.id).toBe('XE-1003');
    const order2 = await secondOrders.create(
      {
        idempotencyKey: 'key-2',
        customer: 'Hộ nước mắm B',
        items: [{ sku: 'NM-40', quantity: 1 }],
        address: {
          province: 'Hà Nội',
          district: 'Hai Bà Trưng',
          ward: 'Phường Phạm Đình Hổ',
          street: 'Số 8 phố Hàng Bè',
        },
      },
      COORDINATOR,
    );
    for (const step of steps) {
      await secondOrders.transition(order2.id, { to: step.to }, step.caller);
    }
    const next = await secondShipments.create(
      { orderId: order2.id },
      COORDINATOR,
    );
    expect(next.id).toBe('GH-1002');
  }, 60000);
});
