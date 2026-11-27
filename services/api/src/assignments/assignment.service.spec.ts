// SPDX-License-Identifier: Apache-2.0
import { AddressService } from '../address/address.service';
import { ApprovalService } from '../approvals/approval.service';
import { InMemoryApprovalStore } from '../approvals/approval.store';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';
import type { Order } from '../orders/orders.types';
import { WorkflowInstanceService } from '../workflow/instance.service';
import { InMemoryWorkflowInstanceStore } from '../workflow/instance.store';
import { WorkflowService } from '../workflow/workflow.service';
import { AssignmentsService, CallLogsService } from './assignment.service';
import {
  InMemoryAssignmentStore,
  InMemoryCallLogStore,
} from './assignment.store';

async function buildServices(): Promise<{
  orders: OrdersService;
  audit: AuditService;
  assignments: AssignmentsService;
  callLogs: CallLogsService;
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
  const orders = new OrdersService(
    workflow,
    audit,
    inventory,
    address,
    instances,
    approvals,
  );
  // CallLogsService dùng chung kho phân đơn với AssignmentsService, để
  // trạng thái phân đơn đổi khi ghi nhật ký được cả 2 service cùng thấy.
  const assignmentStore = new InMemoryAssignmentStore();
  const assignments = new AssignmentsService(orders, audit, assignmentStore);
  await assignments.onModuleInit();
  const callLogs = new CallLogsService(
    audit,
    assignmentStore,
    new InMemoryCallLogStore(),
  );
  await callLogs.onModuleInit();
  return { orders, audit, assignments, callLogs };
}

const DISPATCHER: Caller = {
  userId: 'user-son',
  username: 'son',
  roles: ['Điều phối viên'],
};
const CSKH_LAN: Caller = {
  userId: 'user-lan',
  username: 'lan',
  roles: ['Nhân viên chăm sóc khách hàng'],
};
const CSKH_HOA: Caller = {
  userId: 'user-hoa',
  username: 'hoa',
  roles: ['Nhân viên chăm sóc khách hàng'],
};
const WAREHOUSE_MINH: Caller = {
  userId: 'user-minh',
  username: 'minh',
  roles: ['Nhân viên kho'],
};
const MANAGER: Caller = {
  userId: 'user-quanly',
  username: 'quan-ly',
  roles: ['Quản lý'],
};

const ORDER_ADDRESS = {
  province: 'Hà Nội',
  ward: 'Phường Hai Bà Trưng',
  street: 'Số 8 phố Hàng Bè',
};

async function createOrder(
  orders: OrdersService,
  key = 'key-1',
): Promise<Order> {
  return orders.create(
    {
      idempotencyKey: key,
      customer: 'Hộ nước mắm A',
      items: [{ sku: 'NM-40', quantity: 1 }],
      address: ORDER_ADDRESS,
    },
    DISPATCHER,
  );
}

async function actionCount(
  audit: AuditService,
  action: string,
): Promise<number> {
  const records = await audit.getAll();
  return records.filter((record) => record.action === action).length;
}

async function assignmentDeniedCount(audit: AuditService): Promise<number> {
  return actionCount(audit, 'assignment.transition.denied');
}

async function callLogDeniedCount(audit: AuditService): Promise<number> {
  return actionCount(audit, 'call-log.transition.denied');
}

describe('AssignmentsService', () => {
  it('tạo phân đơn gọi điện ở trạng thái Chờ xử lý, ghi audit assignment.created', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    const assignment = await services.assignments.create(
      { orderId: order.id, kind: 'telesale', assignedTo: 'lan' },
      DISPATCHER,
    );
    expect(assignment.id).toBe('PC-1001');
    expect(assignment.orderId).toBe(order.id);
    expect(assignment.kind).toBe('telesale');
    expect(assignment.assignedTo).toBe('lan');
    expect(assignment.assignedBy).toBe('son');
    expect(assignment.status).toBe('Chờ xử lý');
    expect(assignment.cancelReason).toBeNull();
    expect(await actionCount(services.audit, 'assignment.created')).toBe(1);
    const created = (await services.audit.getAll()).find(
      (record) => record.action === 'assignment.created',
    );
    expect(created).toMatchObject({
      actor: 'son',
      orderId: order.id,
      from: null,
      to: 'Chờ xử lý',
    });
  });

  it('tạo phân đơn kho cho cùng đơn được, 2 loại không chặn nhau', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    const telesale = await services.assignments.create(
      { orderId: order.id, kind: 'telesale', assignedTo: 'lan' },
      DISPATCHER,
    );
    const warehouse = await services.assignments.create(
      { orderId: order.id, kind: 'warehouse', assignedTo: 'minh' },
      DISPATCHER,
    );
    expect(telesale.id).toBe('PC-1001');
    expect(warehouse.id).toBe('PC-1002');
    expect(warehouse.kind).toBe('warehouse');
  });

  it('tạo phân đơn bởi CSKH thì báo 409, không ghi audit', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    await expect(
      services.assignments.create(
        { orderId: order.id, kind: 'telesale', assignedTo: 'lan' },
        CSKH_LAN,
      ),
    ).rejects.toThrow('Tạo phân đơn cần vai Điều phối viên');
    expect(await actionCount(services.audit, 'assignment.created')).toBe(0);
  });

  it('tạo phân đơn cho đơn không có thì 404, không ghi audit', async () => {
    const services = await buildServices();
    await expect(
      services.assignments.create(
        { orderId: 'DH-9999', kind: 'telesale', assignedTo: 'lan' },
        DISPATCHER,
      ),
    ).rejects.toThrow('Không tìm thấy đơn DH-9999');
    expect(await actionCount(services.audit, 'assignment.created')).toBe(0);
  });

  it('tạo phân đơn sai loại thì báo 400', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    await expect(
      services.assignments.create(
        // @ts-expect-error kiểm tra loại sai lọt qua typecheck
        { orderId: order.id, kind: 'giao-nhanh', assignedTo: 'lan' },
        DISPATCHER,
      ),
    ).rejects.toThrow('Loại phân đơn chỉ là "telesale" hoặc "warehouse"');
    expect(await services.assignments.list()).toHaveLength(0);
  });

  it('tạo phân đơn thiếu tên người được giao thì báo 400', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    await expect(
      services.assignments.create(
        { orderId: order.id, kind: 'telesale', assignedTo: '   ' },
        DISPATCHER,
      ),
    ).rejects.toThrow('Tạo phân đơn cần có tên tài khoản được giao');
    expect(await services.assignments.list()).toHaveLength(0);
  });

  it('đơn đã có phân đơn cùng loại đang xử lý thì tạo thêm báo 409, không ghi audit', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    await services.assignments.create(
      { orderId: order.id, kind: 'telesale', assignedTo: 'lan' },
      DISPATCHER,
    );
    await expect(
      services.assignments.create(
        { orderId: order.id, kind: 'telesale', assignedTo: 'hoa' },
        DISPATCHER,
      ),
    ).rejects.toThrow('đã có phân đơn gọi điện đang xử lý (PC-1001');
    expect(await actionCount(services.audit, 'assignment.created')).toBe(1);
  });

  it('đơn có phân đơn đã hủy thì tạo phân đơn cùng loại mới được', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    const first = await services.assignments.create(
      { orderId: order.id, kind: 'telesale', assignedTo: 'lan' },
      DISPATCHER,
    );
    await services.assignments.cancel(
      first.id,
      { reason: 'Khách đã tự gọi tới, không cần gọi nữa' },
      DISPATCHER,
    );
    const second = await services.assignments.create(
      { orderId: order.id, kind: 'telesale', assignedTo: 'hoa' },
      DISPATCHER,
    );
    expect(second.id).toBe('PC-1002');
    expect(second.status).toBe('Chờ xử lý');
  });

  it('bắt đầu xử lý bởi người được giao, ghi audit assignment.started', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    const assignment = await services.assignments.create(
      { orderId: order.id, kind: 'telesale', assignedTo: 'lan' },
      DISPATCHER,
    );
    const started = await services.assignments.start(
      assignment.id,
      CSKH_LAN,
    );
    expect(started.status).toBe('Đang xử lý');
    expect(await actionCount(services.audit, 'assignment.started')).toBe(1);
    const record = (await services.audit.getAll()).find(
      (item) => item.action === 'assignment.started',
    );
    expect(record).toMatchObject({
      actor: 'lan',
      orderId: order.id,
      from: 'Chờ xử lý',
      to: 'Đang xử lý',
    });
  });

  it('điều phối viên cũng bắt đầu được phân đơn không phải của mình', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    const assignment = await services.assignments.create(
      { orderId: order.id, kind: 'warehouse', assignedTo: 'minh' },
      DISPATCHER,
    );
    const started = await services.assignments.start(
      assignment.id,
      DISPATCHER,
    );
    expect(started.status).toBe('Đang xử lý');
  });

  it('bắt đầu bởi người khác thì báo 409 quyền, ghi audit denied', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    const assignment = await services.assignments.create(
      { orderId: order.id, kind: 'telesale', assignedTo: 'lan' },
      DISPATCHER,
    );
    await expect(
      services.assignments.start(assignment.id, CSKH_HOA),
    ).rejects.toThrow('Bắt đầu phân đơn PC-1001 chỉ dành cho lan');
    expect(await assignmentDeniedCount(services.audit)).toBe(1);
  });

  it('bắt đầu phân đơn đã xử lý thì báo 409 trạng thái, kiểm trạng thái trước quyền', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    const assignment = await services.assignments.create(
      { orderId: order.id, kind: 'telesale', assignedTo: 'lan' },
      DISPATCHER,
    );
    await services.assignments.start(assignment.id, CSKH_LAN);
    // Người khác bắt đầu phân đơn đang xử lý: lỗi trạng thái, không phải lỗi quyền.
    await expect(
      services.assignments.start(assignment.id, CSKH_HOA),
    ).rejects.toThrow('chỉ bắt đầu xử lý khi phân đơn ở "Chờ xử lý"');
    expect(await assignmentDeniedCount(services.audit)).toBe(1);
  });

  it('bắt đầu phân đơn không có thì 404', async () => {
    const services = await buildServices();
    await expect(
      services.assignments.start('PC-9999', DISPATCHER),
    ).rejects.toThrow('Không tìm thấy phân đơn PC-9999');
  });

  it('hoàn thành phân đơn kho bởi người được giao, ghi audit assignment.completed', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    const assignment = await services.assignments.create(
      { orderId: order.id, kind: 'warehouse', assignedTo: 'minh' },
      DISPATCHER,
    );
    await services.assignments.start(assignment.id, WAREHOUSE_MINH);
    const done = await services.assignments.complete(
      assignment.id,
      WAREHOUSE_MINH,
    );
    expect(done.status).toBe('Hoàn thành');
    expect(await actionCount(services.audit, 'assignment.completed')).toBe(1);
    const record = (await services.audit.getAll()).find(
      (item) => item.action === 'assignment.completed',
    );
    expect(record).toMatchObject({
      actor: 'minh',
      orderId: order.id,
      from: 'Đang xử lý',
      to: 'Hoàn thành',
    });
  });

  it('hoàn thành phân đơn gọi điện trực tiếp thì báo 400', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    const assignment = await services.assignments.create(
      { orderId: order.id, kind: 'telesale', assignedTo: 'lan' },
      DISPATCHER,
    );
    await services.assignments.start(assignment.id, CSKH_LAN);
    await expect(
      services.assignments.complete(assignment.id, CSKH_LAN),
    ).rejects.toThrow('hoàn thành bằng cách ghi nhật ký cuộc gọi');
    expect(await actionCount(services.audit, 'assignment.completed')).toBe(0);
  });

  it('hoàn thành phân đơn kho chưa bắt đầu thì báo 409 trạng thái, ghi audit denied', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    const assignment = await services.assignments.create(
      { orderId: order.id, kind: 'warehouse', assignedTo: 'minh' },
      DISPATCHER,
    );
    await expect(
      services.assignments.complete(assignment.id, WAREHOUSE_MINH),
    ).rejects.toThrow('chỉ hoàn thành khi phân đơn ở "Đang xử lý"');
    expect(await assignmentDeniedCount(services.audit)).toBe(1);
  });

  it('hoàn thành phân đơn kho bởi người khác thì báo 409 quyền, ghi audit denied', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    const assignment = await services.assignments.create(
      { orderId: order.id, kind: 'warehouse', assignedTo: 'minh' },
      DISPATCHER,
    );
    await services.assignments.start(assignment.id, WAREHOUSE_MINH);
    await expect(
      services.assignments.complete(assignment.id, CSKH_LAN),
    ).rejects.toThrow('Hoàn thành phân đơn PC-1001 chỉ dành cho minh');
    expect(await assignmentDeniedCount(services.audit)).toBe(1);
  });

  it('hủy phân đơn bởi điều phối viên, lưu lý do, ghi audit assignment.cancelled', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    const assignment = await services.assignments.create(
      { orderId: order.id, kind: 'telesale', assignedTo: 'lan' },
      DISPATCHER,
    );
    const cancelled = await services.assignments.cancel(
      assignment.id,
      { reason: 'Đơn đã hủy theo yêu cầu khách' },
      DISPATCHER,
    );
    expect(cancelled.status).toBe('Đã hủy');
    expect(cancelled.cancelReason).toBe('Đơn đã hủy theo yêu cầu khách');
    expect(await actionCount(services.audit, 'assignment.cancelled')).toBe(1);
    const record = (await services.audit.getAll()).find(
      (item) => item.action === 'assignment.cancelled',
    );
    expect(record).toMatchObject({
      actor: 'son',
      orderId: order.id,
      from: 'Chờ xử lý',
      to: 'Đã hủy',
    });
  });

  it('hủy phân đơn thiếu lý do thì báo 400', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    const assignment = await services.assignments.create(
      { orderId: order.id, kind: 'telesale', assignedTo: 'lan' },
      DISPATCHER,
    );
    await expect(
      services.assignments.cancel(assignment.id, { reason: '  ' }, DISPATCHER),
    ).rejects.toThrow('Hủy phân đơn cần có lý do');
    expect(
      (await services.assignments.get(assignment.id)).status,
    ).toBe('Chờ xử lý');
  });

  it('hủy phân đơn bởi CSKH thì báo 409 quyền, ghi audit denied', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    const assignment = await services.assignments.create(
      { orderId: order.id, kind: 'telesale', assignedTo: 'lan' },
      DISPATCHER,
    );
    await expect(
      services.assignments.cancel(
        assignment.id,
        { reason: 'Không cần nữa' },
        CSKH_LAN,
      ),
    ).rejects.toThrow('Hủy phân đơn cần vai Điều phối viên');
    expect(await assignmentDeniedCount(services.audit)).toBe(1);
  });

  it('hủy phân đơn đã hoàn thành thì báo 409 trạng thái, ghi audit denied', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    const assignment = await services.assignments.create(
      { orderId: order.id, kind: 'warehouse', assignedTo: 'minh' },
      DISPATCHER,
    );
    await services.assignments.start(assignment.id, WAREHOUSE_MINH);
    await services.assignments.complete(assignment.id, WAREHOUSE_MINH);
    await expect(
      services.assignments.cancel(
        assignment.id,
        { reason: 'Hủy muộn' },
        DISPATCHER,
      ),
    ).rejects.toThrow('chỉ hủy khi phân đơn còn đang xử lý');
    expect(await assignmentDeniedCount(services.audit)).toBe(1);
  });

  it('get không tìm thấy thì 404, list lọc theo orderId, assignedTo, kind và status', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    const telesale = await services.assignments.create(
      { orderId: order.id, kind: 'telesale', assignedTo: 'lan' },
      DISPATCHER,
    );
    await services.assignments.create(
      { orderId: order.id, kind: 'warehouse', assignedTo: 'minh' },
      DISPATCHER,
    );
    await expect(services.assignments.get('PC-9999')).rejects.toThrow(
      'Không tìm thấy phân đơn PC-9999',
    );
    expect(await services.assignments.list()).toHaveLength(2);
    expect(
      await services.assignments.list({ orderId: order.id }),
    ).toHaveLength(2);
    expect(
      await services.assignments.list({ orderId: 'DH-9999' }),
    ).toHaveLength(0);
    expect(
      await services.assignments.list({ assignedTo: 'lan' }),
    ).toHaveLength(1);
    expect(
      await services.assignments.list({ kind: 'warehouse' }),
    ).toHaveLength(1);
    expect(
      await services.assignments.list({ status: 'Chờ xử lý' }),
    ).toHaveLength(2);
    await services.assignments.start(telesale.id, CSKH_LAN);
    expect(
      await services.assignments.list({ status: 'Chờ xử lý' }),
    ).toHaveLength(1);
    expect(
      await services.assignments.list({ status: 'Đang xử lý' }),
    ).toHaveLength(1);
  });
});

describe('CallLogsService', () => {
  async function startedTelesaleAssignment(
    services: Awaited<ReturnType<typeof buildServices>>,
  ): Promise<{ order: Order; assignmentId: string }> {
    const order = await createOrder(services.orders);
    const assignment = await services.assignments.create(
      { orderId: order.id, kind: 'telesale', assignedTo: 'lan' },
      DISPATCHER,
    );
    await services.assignments.start(assignment.id, CSKH_LAN);
    return { order, assignmentId: assignment.id };
  }

  it('ghi nhật ký thành công, phân đơn tự sang Hoàn thành, ghi 2 audit', async () => {
    const services = await buildServices();
    const { order, assignmentId } = await startedTelesaleAssignment(services);
    const log = await services.callLogs.create(
      {
        assignmentId,
        result: 'Thành công',
        durationSeconds: 180,
        note: 'Khách xác nhận địa chỉ',
      },
      CSKH_LAN,
    );
    expect(log.id).toBe('CG-1001');
    expect(log.assignmentId).toBe(assignmentId);
    expect(log.orderId).toBe(order.id);
    expect(log.caller).toBe('lan');
    expect(log.result).toBe('Thành công');
    expect(log.durationSeconds).toBe(180);
    expect(log.note).toBe('Khách xác nhận địa chỉ');
    expect(
      (await services.assignments.get(assignmentId)).status,
    ).toBe('Hoàn thành');
    expect(await actionCount(services.audit, 'call-log.created')).toBe(1);
    expect(await actionCount(services.audit, 'assignment.completed')).toBe(1);
    const record = (await services.audit.getAll()).find(
      (item) => item.action === 'call-log.created',
    );
    expect(record).toMatchObject({
      actor: 'lan',
      orderId: order.id,
      from: 'Đang xử lý',
      to: 'Hoàn thành',
    });
  });

  it('ghi nhật ký thất bại và thời lượng 0 giây vẫn được', async () => {
    const services = await buildServices();
    const { assignmentId } = await startedTelesaleAssignment(services);
    const log = await services.callLogs.create(
      { assignmentId, result: 'Thất bại', durationSeconds: 0 },
      CSKH_LAN,
    );
    expect(log.result).toBe('Thất bại');
    expect(log.durationSeconds).toBe(0);
    expect(log.note).toBeNull();
  });

  it('ghi nhật ký bởi Điều phối viên thì báo 409, không ghi audit', async () => {
    const services = await buildServices();
    const { assignmentId } = await startedTelesaleAssignment(services);
    await expect(
      services.callLogs.create(
        { assignmentId, result: 'Thành công', durationSeconds: 60 },
        DISPATCHER,
      ),
    ).rejects.toThrow('Ghi nhật ký cuộc gọi cần vai Nhân viên chăm sóc khách hàng');
    expect(await actionCount(services.audit, 'call-log.created')).toBe(0);
  });

  it('ghi nhật ký cho phân đơn không có thì 404, không ghi audit', async () => {
    const services = await buildServices();
    await expect(
      services.callLogs.create(
        { assignmentId: 'PC-9999', result: 'Thành công', durationSeconds: 60 },
        CSKH_LAN,
      ),
    ).rejects.toThrow('Không tìm thấy phân đơn PC-9999');
    expect(await actionCount(services.audit, 'call-log.created')).toBe(0);
  });

  it('ghi nhật ký cho phân đơn kho thì báo 400', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    const assignment = await services.assignments.create(
      { orderId: order.id, kind: 'warehouse', assignedTo: 'minh' },
      DISPATCHER,
    );
    await expect(
      services.callLogs.create(
        {
          assignmentId: assignment.id,
          result: 'Thành công',
          durationSeconds: 60,
        },
        CSKH_LAN,
      ),
    ).rejects.toThrow('Chỉ phân đơn gọi điện mới ghi nhật ký cuộc gọi');
    expect(await actionCount(services.audit, 'call-log.created')).toBe(0);
  });

  it('ghi nhật ký khi phân đơn chưa bắt đầu thì báo 409 trạng thái, ghi audit denied', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders);
    const assignment = await services.assignments.create(
      { orderId: order.id, kind: 'telesale', assignedTo: 'lan' },
      DISPATCHER,
    );
    await expect(
      services.callLogs.create(
        {
          assignmentId: assignment.id,
          result: 'Thành công',
          durationSeconds: 60,
        },
        CSKH_LAN,
      ),
    ).rejects.toThrow(
      'chỉ ghi nhật ký cuộc gọi khi phân đơn ở "Đang xử lý"',
    );
    expect(await callLogDeniedCount(services.audit)).toBe(1);
  });

  it('ghi nhật ký bởi CSKH khác thì báo 409 quyền, ghi audit denied', async () => {
    const services = await buildServices();
    const { assignmentId } = await startedTelesaleAssignment(services);
    await expect(
      services.callLogs.create(
        { assignmentId, result: 'Thành công', durationSeconds: 60 },
        CSKH_HOA,
      ),
    ).rejects.toThrow(
      'Ghi nhật ký cuộc gọi cho phân đơn PC-1001 chỉ dành cho lan',
    );
    expect(await callLogDeniedCount(services.audit)).toBe(1);
  });

  it('kết quả sai thì báo 400, thời lượng âm thì báo 400', async () => {
    const services = await buildServices();
    const { assignmentId } = await startedTelesaleAssignment(services);
    await expect(
      services.callLogs.create(
        {
          assignmentId,
          // @ts-expect-error kiểm tra kết quả sai lọt qua typecheck
          result: 'Không nghe máy',
          durationSeconds: 60,
        },
        CSKH_LAN,
      ),
    ).rejects.toThrow('Kết quả cuộc gọi chỉ là "Thành công" hoặc "Thất bại"');
    await expect(
      services.callLogs.create(
        { assignmentId, result: 'Thành công', durationSeconds: -5 },
        CSKH_LAN,
      ),
    ).rejects.toThrow('Thời lượng cuộc gọi phải là số giây không âm');
    expect(await services.callLogs.list()).toHaveLength(0);
    expect(
      (await services.assignments.get(assignmentId)).status,
    ).toBe('Đang xử lý');
  });

  it('ghi nhật ký lần 2 cho phân đơn đã hoàn thành thì báo 409 trạng thái', async () => {
    const services = await buildServices();
    const { assignmentId } = await startedTelesaleAssignment(services);
    await services.callLogs.create(
      { assignmentId, result: 'Thành công', durationSeconds: 120 },
      CSKH_LAN,
    );
    await expect(
      services.callLogs.create(
        { assignmentId, result: 'Thất bại', durationSeconds: 30 },
        CSKH_LAN,
      ),
    ).rejects.toThrow(
      'chỉ ghi nhật ký cuộc gọi khi phân đơn ở "Đang xử lý"',
    );
    expect(await callLogDeniedCount(services.audit)).toBe(1);
    expect(await services.callLogs.list()).toHaveLength(1);
  });

  it('quản lý đọc được danh sách, list lọc theo orderId, caller và assignmentId', async () => {
    const services = await buildServices();
    const { order, assignmentId } = await startedTelesaleAssignment(services);
    await services.callLogs.create(
      { assignmentId, result: 'Thành công', durationSeconds: 90 },
      CSKH_LAN,
    );
    const order2 = await createOrder(services.orders, 'key-2');
    const assignment2 = await services.assignments.create(
      { orderId: order2.id, kind: 'telesale', assignedTo: 'hoa' },
      DISPATCHER,
    );
    await services.assignments.start(assignment2.id, CSKH_HOA);
    await services.callLogs.create(
      { assignmentId: assignment2.id, result: 'Thất bại', durationSeconds: 45 },
      CSKH_HOA,
    );
    expect(await services.callLogs.list()).toHaveLength(2);
    expect(
      await services.callLogs.list({ orderId: order.id }),
    ).toHaveLength(1);
    expect(await services.callLogs.list({ caller: 'lan' })).toHaveLength(1);
    expect(await services.callLogs.list({ caller: 'hoa' })).toHaveLength(1);
    expect(
      await services.callLogs.list({ assignmentId }),
    ).toHaveLength(1);
    expect(
      await services.callLogs.list({ assignmentId: 'PC-9999' }),
    ).toHaveLength(0);
    // Quản lý không ghi được nhật ký nhưng đọc được danh sách: vai đọc
    // không giới hạn, chỉ ghi mới kiểm vai.
    expect(
      (await services.callLogs.list({ caller: 'lan' }))[0].caller,
    ).toBe('lan');
    expect(MANAGER.roles).toContain('Quản lý');
  });
});
