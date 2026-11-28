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
import { InMemoryProposalStore } from './assignment.store';
import { WarehouseAssignmentService } from './warehouse.service';

const DISPATCHER: Caller = {
  userId: 'user-son',
  username: 'son',
  roles: ['Điều phối viên'],
};
const MANAGER: Caller = {
  userId: 'user-manager',
  username: 'manager',
  roles: ['Quản lý'],
};
const CSKH: Caller = {
  userId: 'user-lan',
  username: 'lan',
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
  approvals: ApprovalService;
  warehouse: WarehouseAssignmentService;
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
  const warehouse = new WarehouseAssignmentService(
    orders,
    assignments,
    audit,
    approvals,
    new InMemoryProposalStore(),
  );
  await warehouse.onModuleInit();
  return { orders, audit, assignments, approvals, warehouse };
}

async function createOrder(
  orders: OrdersService,
  key: string,
): Promise<Order> {
  const order = await orders.create(
    {
      idempotencyKey: key,
      customer: 'Hộ nước mắm A',
      items: [{ sku: 'NM-40', quantity: 1 }],
      address: ORDER_ADDRESS,
    },
    DISPATCHER,
  );
  // Đơn mới tạo ở Mới tạo; chuyển xuôi tới Chờ kho để AI xét chia.
  await orders.transition(order.id, { to: 'Đã kiểm tra' }, DISPATCHER);
  return orders.transition(order.id, { to: 'Chờ kho' }, DISPATCHER);
}

// Tạo phân đơn kho đang hoạt động cho 1 nhân viên (để tạo tải ban đầu).
async function assignActive(
  services: Awaited<ReturnType<typeof buildServices>>,
  orderId: string,
  assignedTo: string,
): Promise<void> {
  const assignment = await services.assignments.create(
    { orderId, kind: 'warehouse', assignedTo },
    DISPATCHER,
  );
  await services.assignments.start(assignment.id, {
    userId: 'user-staff',
    username: assignedTo,
    roles: ['Nhân viên kho'],
  });
}

describe('WarehouseAssignmentService.propose', () => {
  it('chia đều 3 đơn cho 3 nhân viên khi điểm bằng nhau', async () => {
    const services = await buildServices();
    await createOrder(services.orders, 'key-1');
    await createOrder(services.orders, 'key-2');
    await createOrder(services.orders, 'key-3');
    const proposal = await services.warehouse.propose({}, DISPATCHER);
    expect(proposal.status).toBe('Chờ duyệt');
    expect(proposal.items).toHaveLength(3);
    const assignees = new Set(proposal.items.map((item) => item.assignedTo));
    expect(assignees.size).toBe(3);
    expect(proposal.overloaded).toBe(false);
    for (const item of proposal.items) {
      expect(item.inputs).toMatchObject({ active: 0, completed: 0, score: 60 });
      expect(item.originalAssignmentId).toBeNull();
    }
  });

  it('người ít việc nhất nhận đơn trước', async () => {
    const services = await buildServices();
    const busy1 = await createOrder(services.orders, 'key-busy-1');
    const busy2 = await createOrder(services.orders, 'key-busy-2');
    await assignActive(services, busy1.id, 'demo.warehouse-staff');
    await assignActive(services, busy2.id, 'demo.warehouse-staff');
    await createOrder(services.orders, 'key-new');
    const proposal = await services.warehouse.propose({}, DISPATCHER);
    expect(proposal.items).toHaveLength(1);
    expect(proposal.items[0].assignedTo).not.toBe('demo.warehouse-staff');
  });

  it('đơn đã có phân đơn kho đang hoạt động thì vào skipped', async () => {
    const services = await buildServices();
    const taken = await createOrder(services.orders, 'key-taken');
    await assignActive(services, taken.id, 'demo.warehouse-staff');
    await createOrder(services.orders, 'key-free');
    const proposal = await services.warehouse.propose({}, DISPATCHER);
    expect(proposal.items).toHaveLength(1);
    expect(proposal.items[0].orderId).not.toBe(taken.id);
    expect(proposal.skipped).toHaveLength(1);
    expect(proposal.skipped[0].orderId).toBe(taken.id);
  });

  it('tài khoản trong exclude không nhận đơn nào', async () => {
    const services = await buildServices();
    await createOrder(services.orders, 'key-1');
    await createOrder(services.orders, 'key-2');
    const proposal = await services.warehouse.propose(
      { exclude: ['demo.warehouse-staff', 'demo.warehouse-staff-2'] },
      DISPATCHER,
    );
    expect(proposal.items).toHaveLength(2);
    for (const item of proposal.items) {
      expect(item.assignedTo).toBe('demo.warehouse-staff-3');
    }
  });

  it('vai không phải Điều phối viên gọi propose thì báo 409', async () => {
    const services = await buildServices();
    await expect(
      services.warehouse.propose({}, CSKH),
    ).rejects.toThrow('Điều phối viên');
  });
});

describe('WarehouseAssignmentService.decide', () => {
  it('duyệt thì tạo phân đơn thật đúng người nhận, ghi audit', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders, 'key-1');
    const proposal = await services.warehouse.propose({}, DISPATCHER);
    const result = await services.warehouse.decide(
      proposal.id,
      { decision: 'approved' },
      DISPATCHER,
    );
    expect(result.proposal.status).toBe('Đã áp dụng');
    expect(result.applied).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    const created = await services.assignments.list({
      kind: 'warehouse',
      orderId: order.id,
    });
    expect(created).toHaveLength(1);
    expect(created[0].assignedTo).toBe(proposal.items[0].assignedTo);
    const audit = await services.audit.getAll();
    expect(
      audit.some((record) => record.action === 'ai-proposal.created'),
    ).toBe(true);
    expect(
      audit.some((record) => record.action === 'ai-proposal.applied'),
    ).toBe(true);
  });

  it('từ chối không có lý do báo 400; đề xuất đã quyết định rồi quyết định lại báo 409', async () => {
    const services = await buildServices();
    await createOrder(services.orders, 'key-1');
    const proposal = await services.warehouse.propose({}, DISPATCHER);
    await expect(
      services.warehouse.decide(
        proposal.id,
        { decision: 'rejected' },
        DISPATCHER,
      ),
    ).rejects.toThrow('lý do');
    const rejected = await services.warehouse.decide(
      proposal.id,
      { decision: 'rejected', reason: 'Chia chưa đều, làm lại.' },
      DISPATCHER,
    );
    expect(rejected.proposal.status).toBe('Đã từ chối');
    await expect(
      services.warehouse.decide(
        proposal.id,
        { decision: 'approved' },
        DISPATCHER,
      ),
    ).rejects.toThrow('không quyết định lại được');
  });

  it('sửa trong modal (đổi người nhận) thì áp dụng theo danh sách đã sửa', async () => {
    const services = await buildServices();
    const order = await createOrder(services.orders, 'key-1');
    const proposal = await services.warehouse.propose({}, DISPATCHER);
    const original = proposal.items[0].assignedTo;
    const other =
      original === 'demo.warehouse-staff'
        ? 'demo.warehouse-staff-2'
        : 'demo.warehouse-staff';
    const result = await services.warehouse.decide(
      proposal.id,
      {
        decision: 'approved',
        items: [{ orderId: order.id, assignedTo: other }],
      },
      DISPATCHER,
    );
    expect(result.applied).toHaveLength(1);
    const created = await services.assignments.list({
      kind: 'warehouse',
      orderId: order.id,
    });
    expect(created[0].assignedTo).toBe(other);
  });

  it('đề xuất vượt tải thì chuyển sang Chờ duyệt vượt tải, không tạo phân đơn', async () => {
    const services = await buildServices();
    // 1 nhân viên đã có 29 phân đơn đang hoạt động.
    for (let i = 0; i < 29; i++) {
      const order = await createOrder(services.orders, `key-load-${i}`);
      await assignActive(services, order.id, 'demo.warehouse-staff');
    }
    // Chỉ còn 1 nhân viên khác làm việc (loại 2 người kia).
    await createOrder(services.orders, 'key-new-1');
    await createOrder(services.orders, 'key-new-2');
    const proposal = await services.warehouse.propose(
      { exclude: ['demo.warehouse-staff-2', 'demo.warehouse-staff-3'] },
      DISPATCHER,
    );
    expect(proposal.overloaded).toBe(true);
    const result = await services.warehouse.decide(
      proposal.id,
      { decision: 'approved' },
      DISPATCHER,
    );
    expect(result.proposal.status).toBe('Chờ duyệt vượt tải');
    expect(result.approvalId).not.toBeNull();
    expect(result.applied).toHaveLength(0);
    const created = await services.assignments.list({
      kind: 'warehouse',
      orderId: proposal.items[0].orderId,
    });
    expect(created).toHaveLength(0);
    // Áp dụng lại khi phê duyệt còn chờ thì báo 409.
    await expect(
      services.warehouse.decide(
        proposal.id,
        { decision: 'approved' },
        DISPATCHER,
      ),
    ).rejects.toThrow('đang chờ duyệt');
    // Quản lý duyệt phê duyệt rồi áp dụng lại thì thành công.
    const approval = await services.approvals.get(result.approvalId as string);
    await services.approvals.approve(approval.id, MANAGER);
    const applied = await services.warehouse.decide(
      proposal.id,
      { decision: 'approved' },
      DISPATCHER,
    );
    expect(applied.proposal.status).toBe('Đã áp dụng');
    expect(applied.applied.length).toBeGreaterThan(0);
  });
});

describe('WarehouseAssignmentService.reassign', () => {
  it('chia lại cho người nghỉ: đề xuất có originalAssignmentId, áp dụng thì hủy cũ tạo mới', async () => {
    const services = await buildServices();
    const order1 = await createOrder(services.orders, 'key-r1');
    const order2 = await createOrder(services.orders, 'key-r2');
    await assignActive(services, order1.id, 'demo.warehouse-staff');
    await assignActive(services, order2.id, 'demo.warehouse-staff');
    const proposal = await services.warehouse.reassign(
      { assignedTo: 'demo.warehouse-staff' },
      DISPATCHER,
    );
    expect(proposal.items).toHaveLength(2);
    for (const item of proposal.items) {
      expect(item.originalAssignmentId).not.toBeNull();
      expect(item.assignedTo).not.toBe('demo.warehouse-staff');
    }
    const result = await services.warehouse.decide(
      proposal.id,
      { decision: 'approved' },
      DISPATCHER,
    );
    expect(result.proposal.status).toBe('Đã áp dụng');
    expect(result.applied).toHaveLength(2);
    // Phân đơn cũ đã hủy với lý do nghỉ đột xuất.
    const old1 = await services.assignments.list({
      kind: 'warehouse',
      orderId: order1.id,
    });
    const cancelled = old1.find((item) => item.status === 'Đã hủy');
    expect(cancelled).toBeDefined();
    expect(cancelled?.cancelReason).toBe('Nhân viên nghỉ đột xuất: chia lại');
    const active = old1.find((item) => item.status === 'Chờ xử lý');
    expect(active).toBeDefined();
    expect(active?.assignedTo).not.toBe('demo.warehouse-staff');
  });
});
