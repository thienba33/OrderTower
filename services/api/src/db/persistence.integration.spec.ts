// SPDX-License-Identifier: Apache-2.0
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';
import { ShipmentsService } from '../shipments/shipment.service';
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
      handling?: string;
    }> = [
      { to: 'Đã kiểm tra', caller: COORDINATOR },
      { to: 'Chờ kho', caller: COORDINATOR },
      { to: 'Đang đóng gói', caller: WAREHOUSE },
      { to: 'Chờ điều xe', caller: WAREHOUSE },
      { to: 'Đang giao', caller: COORDINATOR },
      { to: 'Đã giao', caller: DRIVER },
      {
        to: 'Hoàn',
        caller: COORDINATOR,
        handling: 'Đối soát xong, khách giữ hàng',
      },
    ];
    let current = order;
    for (const step of steps) {
      current = await orders.transition(
        current.id,
        {
          to: step.to,
          ...(step.handling ? { handling: step.handling } : {}),
        },
        step.caller,
      );
    }
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

    const reopened = await secondOrders.findOne('DH-1001');
    expect(reopened.state).toBe('Hoàn');
    expect(reopened.history).toHaveLength(8);
    expect((await secondAudit.verify()).valid).toBe(true);
    expect(await secondInventory.get('NM-40')).toMatchObject({
      stock: 450,
      reserved: 2,
    });
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

  it('shipment đi tạo -> điều xe -> giao hàng, khởi động lại vẫn còn dữ liệu', async () => {
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
    const dispatched = await shipments.dispatch(
      shipment.id,
      { driverId: 'TX-01', vehicleId: 'XE-01' },
      COORDINATOR,
    );
    expect(dispatched.status).toBe('Đang giao');
    expect(dispatched.driverId).toBe('TX-01');
    expect(dispatched.vehicleId).toBe('XE-01');
    const delivered = await shipments.deliver(
      shipment.id,
      { proofPhotoKey: 'chung-tu/DH-1001/anh-giao.jpg' },
      DRIVER,
    );
    expect(delivered.status).toBe('Đã giao');
    expect(delivered.proofPhotoKey).toBe('chung-tu/DH-1001/anh-giao.jpg');
    expect(delivered.history).toHaveLength(3);
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

    const reopened = await secondShipments.get('GH-1001');
    expect(reopened.status).toBe('Đã giao');
    expect(reopened.history).toHaveLength(3);
    expect(reopened.proofPhotoKey).toBe('chung-tu/DH-1001/anh-giao.jpg');
    expect((await secondAudit.verify()).valid).toBe(true);
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
