// SPDX-License-Identifier: Apache-2.0
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import {
  BadRequestException,
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AddressService } from '../address/address.service';
import { ApprovalService } from '../approvals/approval.service';
import { InMemoryApprovalStore } from '../approvals/approval.store';
import { AuditService } from '../audit/audit.service';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthService } from '../auth/auth.service';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { DeliveryEventsService } from '../delivery-events/delivery-event.service';
import { InMemoryDeliveryEventStore } from '../delivery-events/delivery-event.store';
import type { DeliveryEvent } from '../delivery-events/delivery-event.types';
import { DriversService } from '../drivers/driver.service';
import { InMemoryDriverStore } from '../drivers/driver.store';
import type { Driver } from '../drivers/driver.types';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';
import { InMemoryOrderStore } from '../orders/orders.store';
import type { Order } from '../orders/orders.types';
import { ShipmentsService } from '../shipments/shipment.service';
import { ShipmentGateAdapter } from '../shipments/shipment-gate.adapter';
import { InMemoryShipmentStore } from '../shipments/shipment.store';
import type { Shipment } from '../shipments/shipment.types';
import { VehiclesService } from '../vehicles/vehicle.service';
import { InMemoryVehicleStore } from '../vehicles/vehicle.store';
import type { Vehicle } from '../vehicles/vehicle.types';
import { WorkflowInstanceService } from '../workflow/instance.service';
import { InMemoryWorkflowInstanceStore } from '../workflow/instance.store';
import { WorkflowService } from '../workflow/workflow.service';
import { PublicTrackingController } from './public-tracking.controller';
import { PublicTrackingModule } from './public-tracking.module';
import { PublicTrackingService } from './public-tracking.service';

const ORDER_PHONE = '0901234567';
const DRIVER_PHONE = '0901111111';
const NOT_FOUND_MESSAGE = 'Không tìm thấy đơn hàng.';

function makeOrder(overrides: Partial<Order> & { id: string }): Order {
  return {
    idempotencyKey: `seed-${overrides.id}`,
    customer: 'Nguyễn Văn A',
    phone: ORDER_PHONE,
    items: [{ sku: 'NM-25', quantity: 2 }],
    total: 186000,
    deadline: '2026-11-20T10:00:00.000Z',
    channelId: 'K-1001',
    customerId: null,
    addressTrust: null,
    addressLevel: null,
    workflowInstanceId: 'WF-1001',
    state: 'Đã giao',
    history: [
      {
        from: null,
        to: 'Mới tạo',
        by: 'seed',
        role: 'Quản trị viên',
        at: '2026-11-18T01:00:00.000Z',
      },
      {
        from: 'Mới tạo',
        to: 'Đã kiểm tra',
        by: 'seed',
        role: 'Điều phối viên',
        at: '2026-11-18T02:00:00.000Z',
      },
      {
        from: 'Đã kiểm tra',
        to: 'Chờ kho',
        by: 'seed',
        role: 'Điều phối viên',
        at: '2026-11-18T02:30:00.000Z',
      },
      {
        from: 'Chờ kho',
        to: 'Đang đóng gói',
        by: 'seed',
        role: 'Nhân viên kho',
        at: '2026-11-18T03:00:00.000Z',
      },
      {
        from: 'Đang đóng gói',
        to: 'Chờ điều xe',
        by: 'seed',
        role: 'Nhân viên kho',
        at: '2026-11-18T03:30:00.000Z',
      },
      {
        from: 'Chờ điều xe',
        to: 'Đang giao',
        by: 'seed',
        role: 'Điều phối viên',
        at: '2026-11-18T04:00:00.000Z',
      },
      {
        from: 'Đang giao',
        to: 'Đã giao',
        by: 'nam',
        role: 'Tài xế',
        at: '2026-11-18T05:00:00.000Z',
      },
    ],
    createdAt: '2026-11-18T01:00:00.000Z',
    updatedAt: '2026-11-18T05:00:00.000Z',
    ...overrides,
  };
}

function makeShipment(overrides: Partial<Shipment> & { id: string }): Shipment {
  return {
    orderId: 'DH-1001',
    status: 'Đã giao',
    driverId: 'TX-1001',
    vehicleId: 'XE-1001',
    proofPhotoKey: 'proof/dh-1001.jpg',
    history: [],
    createdAt: '2026-11-18T04:00:00.000Z',
    updatedAt: '2026-11-18T05:00:00.000Z',
    ...overrides,
  };
}

function makeEvent(overrides: Partial<DeliveryEvent> & { id: string }): DeliveryEvent {
  return {
    shipmentId: 'GH-1001',
    orderId: 'DH-1001',
    type: 'Nhận đơn',
    note: null,
    proofPhotoKey: null,
    by: 'nam',
    role: 'Tài xế',
    at: '2026-11-18T04:00:00.000Z',
    createdAt: '2026-11-18T04:00:00.000Z',
    ...overrides,
  };
}

function makeDriver(overrides: Partial<Driver> & { id: string }): Driver {
  return {
    name: 'Nam',
    phone: DRIVER_PHONE,
    username: 'nam',
    vehicleId: 'XE-1001',
    status: 'Sẵn sàng',
    createdAt: '2026-11-18T01:00:00.000Z',
    updatedAt: '2026-11-18T01:00:00.000Z',
    ...overrides,
  };
}

function makeVehicle(overrides: Partial<Vehicle> & { id: string }): Vehicle {
  return {
    plate: '29A-12345',
    type: 'Xe máy',
    status: 'Sẵn sàng',
    createdAt: '2026-11-18T01:00:00.000Z',
    updatedAt: '2026-11-18T01:00:00.000Z',
    ...overrides,
  };
}

async function captureError(fn: () => Promise<unknown>): Promise<Error> {
  try {
    await fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error('mong đợi lỗi nhưng không có lỗi nào.');
}

async function buildServices(): Promise<{
  tracking: PublicTrackingService;
}> {
  const workflow = new WorkflowService();
  workflow.onModuleInit();
  const audit = new AuditService();
  const inventory = new InventoryService();
  await inventory.onModuleInit();
  const address = new AddressService();
  address.onModuleInit();
  const instances = new WorkflowInstanceService(
    workflow,
    audit,
    new InMemoryWorkflowInstanceStore(),
  );
  const approvals = new ApprovalService(audit, new InMemoryApprovalStore());
  const shipmentStore = new InMemoryShipmentStore();
  const gate = new ShipmentGateAdapter(shipmentStore);
  const orderStore = new InMemoryOrderStore();
  const orders = new OrdersService(
    workflow,
    audit,
    inventory,
    address,
    instances,
    approvals,
    orderStore,
    gate,
  );
  const vehicleStore = new InMemoryVehicleStore();
  const vehicles = new VehiclesService(audit, vehicleStore);
  const driverStore = new InMemoryDriverStore();
  const drivers = new DriversService(audit, driverStore, vehicles);
  const shipments = new ShipmentsService(
    orders,
    audit,
    workflow,
    shipmentStore,
    vehicles,
    drivers,
    undefined,
  );
  const eventStore = new InMemoryDeliveryEventStore();
  const events = new DeliveryEventsService(audit, eventStore);

  // Đơn đã giao đủ shipment, sự kiện, tài xế và xe.
  await orderStore.save(
    makeOrder({
      id: 'DH-1001',
      address: {
        street: '12 Ngõ 34 Đường Lê Lợi',
        ward: 'Phường Hàng Bài',
        district: 'Quận Hoàn Kiếm',
        province: 'Hà Nội',
      },
    }),
  );
  await shipmentStore.save(
    makeShipment({
      id: 'GH-1000',
      status: 'Giao thất bại',
      proofPhotoKey: null,
      updatedAt: '2026-11-18T04:30:00.000Z',
    }),
  );
  await shipmentStore.save(makeShipment({ id: 'GH-1001' }));
  // Ghi sự kiện giao trước sự kiện nhận để chứng minh tra cứu xếp lại
  // theo thời điểm, không trả theo thứ tự ghi.
  await eventStore.save(
    makeEvent({
      id: 'SK-1002',
      type: 'Đã giao',
      note: 'Giao tận tay.',
      at: '2026-11-18T05:00:00.000Z',
      createdAt: '2026-11-18T05:00:00.000Z',
    }),
  );
  await eventStore.save(makeEvent({ id: 'SK-1001' }));
  await driverStore.save(makeDriver({ id: 'TX-1001' }));
  await vehicleStore.save(makeVehicle({ id: 'XE-1001' }));

  // Đơn mới tạo, chưa có shipment hay sự kiện nào.
  await orderStore.save(
    makeOrder({
      id: 'DH-1002',
      phone: '0909999999',
      state: 'Mới tạo',
      history: [
        {
          from: null,
          to: 'Mới tạo',
          by: 'seed',
          role: 'Quản trị viên',
          at: '2026-11-18T01:00:00.000Z',
        },
      ],
      createdAt: '2026-11-18T01:00:00.000Z',
      updatedAt: '2026-11-18T01:00:00.000Z',
    }),
  );

  // Đơn không có SĐT thì không tra được dù biết mã đơn.
  await orderStore.save(
    makeOrder({
      id: 'DH-1003',
      phone: null,
      state: 'Mới tạo',
      history: [
        {
          from: null,
          to: 'Mới tạo',
          by: 'seed',
          role: 'Quản trị viên',
          at: '2026-11-18T01:00:00.000Z',
        },
      ],
      createdAt: '2026-11-18T01:00:00.000Z',
      updatedAt: '2026-11-18T01:00:00.000Z',
    }),
  );

  // Đơn đang giao nhưng shipment ghi tài xế/xe không còn trong kho: tên
  // và biển số về null, tra cứu không lỗi.
  await orderStore.save(
    makeOrder({
      id: 'DH-1005',
      phone: '0905555555',
      state: 'Đang giao',
      history: [
        {
          from: null,
          to: 'Mới tạo',
          by: 'seed',
          role: 'Quản trị viên',
          at: '2026-11-18T01:00:00.000Z',
        },
        {
          from: 'Mới tạo',
          to: 'Đang giao',
          by: 'seed',
          role: 'Điều phối viên',
          at: '2026-11-18T04:00:00.000Z',
        },
      ],
      createdAt: '2026-11-18T01:00:00.000Z',
      updatedAt: '2026-11-18T04:00:00.000Z',
    }),
  );
  await shipmentStore.save(
    makeShipment({
      id: 'GH-1005',
      orderId: 'DH-1005',
      status: 'Đang giao',
      driverId: 'TX-9999',
      vehicleId: 'XE-9999',
      proofPhotoKey: null,
      createdAt: '2026-11-18T04:00:00.000Z',
      updatedAt: '2026-11-18T04:00:00.000Z',
    }),
  );

  // Đơn có lịch sử lưu lộn thứ tự thời điểm: timeline trả về vẫn xếp
  // theo thời điểm.
  await orderStore.save(
    makeOrder({
      id: 'DH-1006',
      phone: '0906666666',
      state: 'Đã kiểm tra',
      history: [
        {
          from: 'Mới tạo',
          to: 'Đã kiểm tra',
          by: 'seed',
          role: 'Điều phối viên',
          at: '2026-11-18T02:00:00.000Z',
        },
        {
          from: null,
          to: 'Mới tạo',
          by: 'seed',
          role: 'Quản trị viên',
          at: '2026-11-18T01:00:00.000Z',
        },
      ],
      createdAt: '2026-11-18T01:00:00.000Z',
      updatedAt: '2026-11-18T02:00:00.000Z',
    }),
  );

  // Đơn có món hàng với SKU không có trong kho: tên món về null.
  await orderStore.save(
    makeOrder({
      id: 'DH-1007',
      phone: '0907777777',
      items: [{ sku: 'XX-999', quantity: 1 }],
      total: 0,
      state: 'Mới tạo',
      history: [
        {
          from: null,
          to: 'Mới tạo',
          by: 'seed',
          role: 'Quản trị viên',
          at: '2026-11-18T01:00:00.000Z',
        },
      ],
      createdAt: '2026-11-18T01:00:00.000Z',
      updatedAt: '2026-11-18T01:00:00.000Z',
    }),
  );

  // Đơn có món hàng với SKU có trong kho nhưng chưa có giá: đơn giá về
  // null, màn khách hiện "-" cho thành tiền dòng đó.
  await orderStore.save(
    makeOrder({
      id: 'DH-1008',
      phone: '0908888888',
      items: [{ sku: 'MT-08', quantity: 1 }],
      total: 0,
      state: 'Mới tạo',
      history: [
        {
          from: null,
          to: 'Mới tạo',
          by: 'seed',
          role: 'Quản trị viên',
          at: '2026-11-18T01:00:00.000Z',
        },
      ],
      createdAt: '2026-11-18T01:00:00.000Z',
      updatedAt: '2026-11-18T01:00:00.000Z',
    }),
  );

  const tracking = new PublicTrackingService(
    orders,
    shipments,
    events,
    drivers,
    vehicles,
    inventory,
  );
  return { tracking };
}

// Handler không đánh dấu @Public để đối chứng: guard phải chặn khi
// không có token.
class PrivateProbe {
  probe(): string {
    return 'private';
  }
}

function mockContext(
  handler: (...args: unknown[]) => unknown,
  target: object,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => target,
    switchToHttp: () => ({
      getRequest: () => ({ headers: {} }),
    }),
  } as unknown as ExecutionContext;
}

describe('PublicTrackingService', () => {
  it('thiếu mã đơn thì 400', async () => {
    const { tracking } = await buildServices();
    for (const orderId of [undefined, '', '   ']) {
      const error = await captureError(() =>
        tracking.track(orderId, ORDER_PHONE),
      );
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe('Tra cứu đơn cần có mã đơn.');
    }
  });

  it('thiếu SĐT thì 400', async () => {
    const { tracking } = await buildServices();
    for (const phone of [undefined, '', '   ']) {
      const error = await captureError(() => tracking.track('DH-1001', phone));
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe('Tra cứu đơn cần có số điện thoại.');
    }
  });

  it('đơn không tồn tại thì 404 với thông báo chung', async () => {
    const { tracking } = await buildServices();
    const error = await captureError(() =>
      tracking.track('DH-9999', ORDER_PHONE),
    );
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.message).toBe(NOT_FOUND_MESSAGE);
  });

  it('sai SĐT thì 404 với CÙNG thông báo như đơn không tồn tại', async () => {
    const { tracking } = await buildServices();
    const wrongPhone = await captureError(() =>
      tracking.track('DH-1001', '0900000000'),
    );
    const unknownOrder = await captureError(() =>
      tracking.track('DH-9999', ORDER_PHONE),
    );
    expect(wrongPhone).toBeInstanceOf(NotFoundException);
    expect(unknownOrder).toBeInstanceOf(NotFoundException);
    expect(wrongPhone.message).toBe(unknownOrder.message);
    expect(wrongPhone.message).toBe(NOT_FOUND_MESSAGE);
  });

  it('đơn không có SĐT thì 404 với thông báo chung', async () => {
    const { tracking } = await buildServices();
    const error = await captureError(() =>
      tracking.track('DH-1003', ORDER_PHONE),
    );
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.message).toBe(NOT_FOUND_MESSAGE);
  });

  it('đúng mã đơn và SĐT thì trả đủ hình dạng, không lộ SĐT', async () => {
    const { tracking } = await buildServices();
    const result = await tracking.track('DH-1001', ORDER_PHONE);
    expect(result.order).toEqual({
      id: 'DH-1001',
      state: 'Đã giao',
      items: [
        { sku: 'NM-25', quantity: 2, name: 'Nước mắm 25 độ 500ml', unitPrice: 93000 },
      ],
      total: 186000,
      deadline: '2026-11-20T10:00:00.000Z',
      createdAt: '2026-11-18T01:00:00.000Z',
      channelId: 'K-1001',
      address: {
        street: '12 Ngõ 34 Đường Lê Lợi',
        ward: 'Phường Hàng Bài',
        district: 'Quận Hoàn Kiếm',
        province: 'Hà Nội',
      },
    });
    expect(result.timeline).toEqual([
      { state: 'Mới tạo', at: '2026-11-18T01:00:00.000Z' },
      { state: 'Đã kiểm tra', at: '2026-11-18T02:00:00.000Z' },
      { state: 'Chờ kho', at: '2026-11-18T02:30:00.000Z' },
      { state: 'Đang đóng gói', at: '2026-11-18T03:00:00.000Z' },
      { state: 'Chờ điều xe', at: '2026-11-18T03:30:00.000Z' },
      { state: 'Đang giao', at: '2026-11-18T04:00:00.000Z' },
      { state: 'Đã giao', at: '2026-11-18T05:00:00.000Z' },
    ]);
    // Shipment mới nhất là GH-1001 (sửa sau GH-1000), không phải shipment
    // giao thất bại cũ hơn.
    expect(result.shipment).toEqual({
      id: 'GH-1001',
      state: 'Đã giao',
      driverName: 'Nam',
      vehiclePlate: '29A-12345',
    });
    expect(result.deliveryEvents).toEqual([
      {
        type: 'Nhận đơn',
        note: null,
        createdAt: '2026-11-18T04:00:00.000Z',
      },
      {
        type: 'Đã giao',
        note: 'Giao tận tay.',
        createdAt: '2026-11-18T05:00:00.000Z',
      },
    ]);
    expect(result.proofPhotoKey).toBe('proof/dh-1001.jpg');
    const body = JSON.stringify(result);
    expect(body).not.toContain(ORDER_PHONE);
    expect(body).not.toContain(DRIVER_PHONE);
    expect(body).not.toContain('Nguyễn Văn A');
  });

  it('đơn chưa có shipment thì shipment null, sự kiện rỗng, không có ảnh', async () => {
    const { tracking } = await buildServices();
    const result = await tracking.track('DH-1002', '0909999999');
    expect(result.shipment).toBeNull();
    expect(result.deliveryEvents).toEqual([]);
    expect(result.proofPhotoKey).toBeNull();
    // Đơn không ghi địa chỉ thì trả null, không bịa địa chỉ.
    expect(result.order.address).toBeNull();
    expect(result.timeline).toEqual([
      { state: 'Mới tạo', at: '2026-11-18T01:00:00.000Z' },
    ]);
  });

  it('SKU không có trong kho thì tên món và đơn giá về null, không tự đặt tên hay giá', async () => {
    const { tracking } = await buildServices();
    const result = await tracking.track('DH-1007', '0907777777');
    expect(result.order.items).toEqual([
      { sku: 'XX-999', quantity: 1, name: null, unitPrice: null },
    ]);
  });

  it('SKU có trong kho nhưng chưa có giá thì đơn giá về null', async () => {
    const { tracking } = await buildServices();
    const result = await tracking.track('DH-1008', '0908888888');
    expect(result.order.items).toEqual([
      { sku: 'MT-08', quantity: 1, name: 'Mắm tôm 250g', unitPrice: null },
    ]);
  });

  it('SĐT và mã đơn có khoảng trắng 2 đầu vẫn tra được', async () => {
    const { tracking } = await buildServices();
    const result = await tracking.track('  DH-1001  ', `  ${ORDER_PHONE}  `);
    expect(result.order.id).toBe('DH-1001');
  });

  it('timeline xếp theo thời điểm dù lịch sử lưu lộn thứ tự', async () => {
    const { tracking } = await buildServices();
    const result = await tracking.track('DH-1006', '0906666666');
    expect(result.timeline).toEqual([
      { state: 'Mới tạo', at: '2026-11-18T01:00:00.000Z' },
      { state: 'Đã kiểm tra', at: '2026-11-18T02:00:00.000Z' },
    ]);
  });

  it('tài xế/xe không còn trong kho thì tên và biển số về null, không lỗi', async () => {
    const { tracking } = await buildServices();
    const result = await tracking.track('DH-1005', '0905555555');
    expect(result.shipment).toEqual({
      id: 'GH-1005',
      state: 'Đang giao',
      driverName: null,
      vehiclePlate: null,
    });
    expect(result.proofPhotoKey).toBeNull();
  });
});

describe('PublicTrackingController', () => {
  it('handler tra cứu đánh dấu @Public()', () => {
    const reflector = new Reflector();
    expect(
      reflector.get(IS_PUBLIC_KEY, PublicTrackingController.prototype.track),
    ).toBe(true);
  });

  it('guard cho qua handler công khai khi không có token, chặn handler thường', async () => {
    const auth = {
      verifyToken: async (): Promise<never> => {
        throw new Error('không được gọi');
      },
    } as unknown as AuthService;
    const guard = new AuthGuard(auth, new Reflector());
    await expect(
      guard.canActivate(
        mockContext(
          PublicTrackingController.prototype.track,
          PublicTrackingController,
        ),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(mockContext(PrivateProbe.prototype.probe, PrivateProbe)),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('PublicTrackingModule', () => {
  it('nối đủ dependency trong Nest', async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://dummy:dummy@localhost:1/dummy';
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [PublicTrackingModule],
      }).compile();
      expect(moduleRef.get(PublicTrackingService)).toBeDefined();
      await moduleRef.close();
    } finally {
      if (previous === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previous;
      }
    }
  });
});
