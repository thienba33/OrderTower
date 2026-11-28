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
import {
  AssignmentsService,
  CallLogsService,
} from '../assignments/assignment.service';
import {
  InMemoryAssignmentStore,
  InMemoryCallLogStore,
} from '../assignments/assignment.store';
import { TelesaleService } from './telesale.service';

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

const ORDER_ADDRESS = {
  province: 'Hà Nội',
  ward: 'Phường Hai Bà Trưng',
  street: 'Số 8 phố Hàng Bè',
};

async function buildServices(): Promise<{
  orders: OrdersService;
  audit: AuditService;
  assignments: AssignmentsService;
  telesale: TelesaleService;
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
  const assignmentStore = new InMemoryAssignmentStore();
  const assignments = new AssignmentsService(orders, audit, assignmentStore);
  await assignments.onModuleInit();
  const callLogs = new CallLogsService(
    audit,
    assignmentStore,
    new InMemoryCallLogStore(),
  );
  await callLogs.onModuleInit();
  const telesale = new TelesaleService(orders, assignments, audit);
  return { orders, audit, assignments, telesale };
}

async function createOrder(
  orders: OrdersService,
  key: string,
  deadline: string | null,
): Promise<Order> {
  return orders.create(
    {
      idempotencyKey: key,
      customer: 'Hộ nước mắm A',
      items: [{ sku: 'NM-40', quantity: 1 }],
      address: ORDER_ADDRESS,
      ...(deadline === null ? {} : { deadline }),
    },
    DISPATCHER,
  );
}

// Mốc giao tính theo giờ thật lúc chạy test, để test xác định dù chạy lúc nào.
function isoFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

describe('TelesaleService.next', () => {
  it('đơn quá hạn lên trước: tạo phân đơn telesale cho người gọi, ghi audit ai-next-call.created', async () => {
    const services = await buildServices();
    const overdue = await createOrder(
      services.orders,
      'key-overdue',
      isoFromNow(-60 * 60 * 1000),
    );
    const soon = await createOrder(
      services.orders,
      'key-soon',
      isoFromNow(2 * 60 * 60 * 1000),
    );
    const result = await services.telesale.next(CSKH_LAN);
    expect(result.existing).toBe(false);
    expect(result.assignment).toMatchObject({
      orderId: overdue.id,
      kind: 'telesale',
      assignedTo: 'lan',
      status: 'Chờ xử lý',
    });
    expect(result.order).toMatchObject({
      orderId: overdue.id,
      reason: 'Quá SLA giao hẹn',
      eta: 'Quá hạn',
    });
    // Đơn sắp quá hạn vẫn chưa được chia (chỉ lấy đơn đầu tiên).
    const remaining = await services.assignments.list({
      kind: 'telesale',
      orderId: soon.id,
    });
    expect(remaining).toHaveLength(0);
    const audit = await services.audit.getAll();
    const created = audit.filter(
      (record) => record.action === 'ai-next-call.created',
    );
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      actor: 'lan',
      orderId: overdue.id,
    });
  });

  it('người gọi đang có phân đơn Chờ xử lý thì trả luôn phân đơn đó, không tạo mới', async () => {
    const services = await buildServices();
    const order = await createOrder(
      services.orders,
      'key-pending',
      isoFromNow(-60 * 60 * 1000),
    );
    const first = await services.telesale.next(CSKH_LAN);
    expect(first.existing).toBe(false);
    const second = await services.telesale.next(CSKH_LAN);
    expect(second.existing).toBe(true);
    expect(second.assignment?.id).toBe(first.assignment?.id);
    expect(second.assignment?.orderId).toBe(order.id);
    const all = await services.assignments.list({ kind: 'telesale' });
    expect(all).toHaveLength(1);
  });

  it('đơn đã có phân đơn telesale đang hoạt động thì bị bỏ qua', async () => {
    const services = await buildServices();
    const taken = await createOrder(
      services.orders,
      'key-taken',
      isoFromNow(-2 * 60 * 60 * 1000),
    );
    const free = await createOrder(
      services.orders,
      'key-free',
      isoFromNow(-60 * 60 * 1000),
    );
    // Điều phối viên chia đơn quá hạn nhất cho Lan trước.
    await services.assignments.create(
      { orderId: taken.id, kind: 'telesale', assignedTo: 'lan' },
      DISPATCHER,
    );
    const result = await services.telesale.next(CSKH_HOA);
    expect(result.assignment?.orderId).toBe(free.id);
    expect(result.assignment?.assignedTo).toBe('hoa');
  });

  it('hết đơn ưu tiên thì trả assignment null, không báo lỗi', async () => {
    const services = await buildServices();
    await createOrder(
      services.orders,
      'key-far',
      isoFromNow(7 * 24 * 60 * 60 * 1000),
    );
    const result = await services.telesale.next(CSKH_LAN);
    expect(result).toEqual({
      assignment: null,
      order: null,
      reason: 'Đã hết đơn cần ưu tiên gọi.',
      existing: false,
    });
  });

  it('vai không phải CSKH gọi next thì báo 409', async () => {
    const services = await buildServices();
    await expect(services.telesale.next(DISPATCHER)).rejects.toThrow(
      'Nhân viên chăm sóc khách hàng',
    );
  });

  it('CSKH tự nhận cuộc gọi không tạo được phân đơn cho người khác', async () => {
    const services = await buildServices();
    const order = await createOrder(
      services.orders,
      'key-self',
      isoFromNow(-60 * 60 * 1000),
    );
    // createTelesaleSelf chỉ gán cho chính người gọi, không nhận assignedTo.
    const assignment = await services.assignments.createTelesaleSelf(
      order.id,
      CSKH_LAN,
    );
    expect(assignment).toMatchObject({
      kind: 'telesale',
      assignedTo: 'lan',
      assignedBy: 'lan',
    });
    // Điều phối viên vẫn tạo phân đơn cho người khác được như cũ.
    const other = await createOrder(
      services.orders,
      'key-other',
      isoFromNow(-60 * 60 * 1000),
    );
    const assigned = await services.assignments.create(
      { orderId: other.id, kind: 'telesale', assignedTo: 'hoa' },
      DISPATCHER,
    );
    expect(assigned.assignedTo).toBe('hoa');
  });
});
