// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AddressService,
  MIN_ADDRESS_TRUST,
} from '../address/address.service';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { InventoryService } from '../inventory/inventory.service';
import { ApprovalService } from '../approvals/approval.service';
import type { Approval } from '../approvals/approval.types';
import { WorkflowInstanceService } from '../workflow/instance.service';
import { WorkflowService } from '../workflow/workflow.service';
import type {
  CreateOrderInput,
  Order,
  TransitionOrderInput,
  UpdateOrderInput,
} from './orders.types';

// Trạng thái đóng: không còn chuyển nào đi ra, mọi thao tác đều bị chặn.
const CLOSED_STATES = ['Hoàn', 'Hủy'];

// Trạng thái chưa giữ hàng: còn sửa được mặt hàng. Từ "Đang đóng gói" trở đi
// kho đã giữ hàng cho đơn nên mặt hàng bị khóa, chỉ sửa được khách và địa chỉ.
const EDITABLE_ITEMS_STATES = ['Mới tạo', 'Đã kiểm tra', 'Chờ kho'];

// Lưu trong bộ nhớ, sẽ chuyển sang Postgres khi nhánh platform-database vào dev.
@Injectable()
export class OrdersService {
  private readonly orders = new Map<string, Order>();
  private nextNumber = 1001;

  constructor(
    private readonly workflow: WorkflowService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly address: AddressService,
    private readonly instances: WorkflowInstanceService,
    private readonly approvals: ApprovalService,
  ) {}

  create(input: CreateOrderInput, caller: Caller): Order {
    if (
      typeof input.idempotencyKey !== 'string' ||
      input.idempotencyKey.trim() === ''
    ) {
      throw new BadRequestException('idempotencyKey là bắt buộc, dạng chuỗi.');
    }
    if (typeof input.customer !== 'string' || input.customer.trim() === '') {
      throw new BadRequestException('customer là bắt buộc, dạng chuỗi.');
    }
    validateItems(input.items);
    if (input.address !== undefined) {
      validateAddress(input.address);
    }
    const evaluation = input.address
      ? this.address.evaluate(input.address)
      : null;
    // Rào chắn: không xác nhận đơn trùng (cùng idempotencyKey).
    for (const existing of this.orders.values()) {
      if (existing.idempotencyKey === input.idempotencyKey) {
        throw new ConflictException(
          `Đơn với idempotencyKey "${input.idempotencyKey}" đã tồn tại (${existing.id}).`,
        );
      }
    }
    const id = `DH-${String(this.nextNumber++).padStart(4, '0')}`;
    // Mỗi đơn mở 1 workflow instance, trạng thái luồng sống ở instance,
    // đơn chỉ giữ mã instance và đồng bộ trạng thái sau mỗi lần chuyển.
    const instance = this.instances.start(
      {
        definitionId: 'order-flow',
        businessKey: id,
      },
      caller,
    );
    const now = new Date().toISOString();
    const order: Order = {
      id,
      idempotencyKey: input.idempotencyKey,
      customer: input.customer,
      items: input.items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
      })),
      address: input.address ? { ...input.address } : undefined,
      addressTrust: evaluation ? evaluation.trust : null,
      addressLevel: evaluation ? evaluation.level : null,
      workflowInstanceId: instance.id,
      state: 'Mới tạo',
      history: [
        {
          from: null,
          to: 'Mới tạo',
          by: caller.username,
          role: caller.roles[0] ?? '',
          at: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(order.id, order);
    this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'order.created',
      orderId: order.id,
      from: null,
      to: 'Mới tạo',
      detail: `Khách ${input.customer}, ${input.items.length} mặt hàng.`,
    });
    return copyOrder(order);
  }

  list(): Order[] {
    return [...this.orders.values()].map(copyOrder);
  }

  findOne(id: string): Order {
    const order = this.orders.get(id);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn ${id}.`);
    }
    return copyOrder(order);
  }

  transition(id: string, input: TransitionOrderInput, caller: Caller): Order {
    if (typeof input.to !== 'string' || input.to.trim() === '') {
      throw new BadRequestException('to là bắt buộc, dạng chuỗi.');
    }
    const order = this.orders.get(id);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn ${id}.`);
    }
    const deny = (reason: string): never => {
      this.audit.append({
        actor: caller.username,
        role: caller.roles[0] ?? '',
        action: 'order.transition.denied',
        orderId: id,
        from: order.state,
        to: input.to,
        detail: reason,
      });
      throw new ConflictException(reason);
    };
    // Rào chắn: không sửa đơn đã đóng.
    if (CLOSED_STATES.includes(order.state)) {
      deny(
        `Đơn ${id} đã ở trạng thái đóng "${order.state}", không chuyển được nữa.`,
      );
    }
    const check = this.workflow.canTransition(
      'order-flow',
      order.state,
      input.to,
      caller.roles,
    );
    if (!check.allowed) {
      deny(check.reason ?? 'Chuyển trạng thái không được phép.');
    }
    // Rào chắn theo guard trong tệp định nghĩa: lý do bắt buộc, địa chỉ và tồn kho.
    const transition = this.workflow
      .getTransitions('order-flow')
      .find((item) => item.from === order.state && item.to === input.to);
    let consumeStock = false;
    if (transition) {
      if (
        transition.guard.includes('lý do') &&
        (input.reason === undefined || input.reason.trim() === '')
      ) {
        throw new BadRequestException(
          `Chuyển sang "${input.to}" cần có lý do (guard "${transition.guard}").`,
        );
      }
      if (transition.guard.includes('hướng xử lý')) {
        if (input.handling === undefined || input.handling.trim() === '') {
          throw new BadRequestException(
            `Chuyển sang "${input.to}" cần có hướng xử lý (guard "${transition.guard}").`,
          );
        }
      }
      if (transition.guard.includes('địa chỉ')) {
        const addressTrust = order.addressTrust;
        let addressDenial: string | null = null;
        if (addressTrust === null) {
          addressDenial = `Đơn ${id} chưa có địa chỉ, không kiểm tra được mức tin cậy.`;
        } else if (addressTrust < MIN_ADDRESS_TRUST) {
          addressDenial = `Địa chỉ của đơn ${id} chỉ đạt mức tin cậy ${addressTrust} (${order.addressLevel}), chưa đạt tối thiểu ${MIN_ADDRESS_TRUST}.`;
        }
        if (addressDenial !== null) {
          deny(addressDenial);
        }
      }
      if (transition.guard.includes('tồn kho')) {
        const stock = this.inventory.checkSufficient(order.items);
        if (!stock.sufficient) {
          deny(
            `Tồn kho không đủ: ${stock.lacking.map((item) => item.reason).join(' ')}`,
          );
        }
        consumeStock = true;
      }
    }
    // Rào chắn qua rồi mới cho instance chuyển; trạng thái luồng đổi ở
    // instance, đơn đồng bộ lại trạng thái và lịch sử của mình.
    const instance = this.instances.findByBusinessKey('order-flow', id);
    if (!instance) {
      throw new NotFoundException(`Không tìm thấy workflow instance của đơn ${id}.`);
    }
    const updated = this.instances.transition(
      instance.id,
      {
        to: input.to,
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.handling ? { handling: input.handling } : {}),
      },
      caller,
    );
    const from = order.state;
    order.state = updated.currentState;
    order.updatedAt = updated.updatedAt;
    order.history.push({
      from,
      to: input.to,
      by: caller.username,
      role: check.requiredRole ?? caller.roles[0] ?? '',
      at: updated.updatedAt,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.handling ? { handling: input.handling } : {}),
    });
    if (consumeStock) {
      this.inventory.reserve(order.items);
    }
    return copyOrder(order);
  }

  // Sửa dữ liệu đơn. Đơn mở sửa trực tiếp; đơn đã đóng chỉ sửa khi có lý do
  // và người phê duyệt, mọi lần sửa đều ghi audit. Sửa mặt hàng làm đổi
  // lượng hàng đã giữ nên chỉ được khi đơn chưa giữ hàng, hoặc đơn đã đóng
  // (sửa hồ sơ, không chạm kho thật).
  update(id: string, input: UpdateOrderInput, caller: Caller): Order {
    const order = this.orders.get(id);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn ${id}.`);
    }
    if (
      input.customer === undefined &&
      input.items === undefined &&
      input.address === undefined
    ) {
      throw new BadRequestException(
        'Cần ít nhất 1 trường để sửa: customer, items hoặc address.',
      );
    }
    if (input.customer !== undefined) {
      if (typeof input.customer !== 'string' || input.customer.trim() === '') {
        throw new BadRequestException('customer phải là chuỗi không rỗng.');
      }
    }
    if (input.items !== undefined) {
      validateItems(input.items);
    }
    if (input.address !== undefined) {
      validateAddress(input.address);
    }
    const closed = CLOSED_STATES.includes(order.state);
    if (closed) {
      if (input.reason === undefined || input.reason.trim() === '') {
        throw new BadRequestException(
          `Sửa đơn đã đóng ${id} cần có lý do.`,
        );
      }
      if (input.approvalId === undefined || input.approvalId.trim() === '') {
        throw new BadRequestException(
          `Sửa đơn đã đóng ${id} cần có phê duyệt (approvalId).`,
        );
      }
    }
    if (
      input.items !== undefined &&
      !closed &&
      !EDITABLE_ITEMS_STATES.includes(order.state)
    ) {
      throw new ConflictException(
        `Đơn ${id} đã giữ hàng ở trạng thái "${order.state}", không sửa được mặt hàng.`,
      );
    }
    // Đơn đã đóng: kiểm tra phê duyệt khớp đơn, đã duyệt và chưa dùng, trước
    // khi sửa; chỉ trừ phê duyệt sau khi sửa xong.
    let approval: Approval | null = null;
    if (closed) {
      approval = this.approvals.get(input.approvalId as string);
      if (
        approval.type !== 'order.edit.closed' ||
        approval.subjectId !== id
      ) {
        throw new BadRequestException(
          `Phê duyệt ${approval.id} không khớp với việc sửa đơn ${id}.`,
        );
      }
      if (approval.status === 'pending') {
        throw new ConflictException(`Phê duyệt ${approval.id} chưa được duyệt.`);
      }
      if (approval.status === 'rejected') {
        throw new ConflictException(`Phê duyệt ${approval.id} đã bị từ chối.`);
      }
      if (approval.appliedAt !== null) {
        throw new ConflictException(`Phê duyệt ${approval.id} đã được dùng.`);
      }
    }
    if (input.customer !== undefined) {
      order.customer = input.customer;
    }
    if (input.items !== undefined) {
      order.items = input.items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
      }));
    }
    let evaluation = null;
    if (input.address !== undefined) {
      order.address = { ...input.address };
      evaluation = this.address.evaluate(input.address);
      order.addressTrust = evaluation.trust;
      order.addressLevel = evaluation.level;
    }
    const now = new Date().toISOString();
    order.updatedAt = now;
    order.history.push({
      from: order.state,
      to: order.state,
      by: caller.username,
      role: caller.roles[0] ?? '',
      at: now,
      ...(input.reason ? { reason: input.reason } : {}),
    });
    this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: closed ? 'order.edit.approved' : 'order.edit',
      orderId: id,
      from: order.state,
      to: order.state,
      detail: closed
        ? `Lý do: ${input.reason}; Phê duyệt: ${approval?.id} bởi ${approval?.decidedBy}`
        : (input.reason ?? ''),
    });
    if (closed && approval) {
      this.approvals.markApplied(approval.id, caller);
    }
    return copyOrder(order);
  }
}

function validateItems(items: unknown): void {
  if (!Array.isArray(items) || items.length === 0) {
    throw new BadRequestException('items phải là mảng không rỗng.');
  }
  for (const item of items) {
    if (typeof item !== 'object' || item === null) {
      throw new BadRequestException('mỗi item phải là 1 object.');
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.sku !== 'string' || entry.sku.trim() === '') {
      throw new BadRequestException('mỗi item cần sku dạng chuỗi.');
    }
    if (!Number.isInteger(entry.quantity) || (entry.quantity as number) <= 0) {
      throw new BadRequestException(
        'quantity của mỗi item phải là số nguyên dương.',
      );
    }
  }
}

function validateAddress(address: unknown): void {
  if (typeof address !== 'object' || address === null) {
    throw new BadRequestException('address phải là 1 object khi có.');
  }
  for (const field of ['province', 'district', 'ward', 'street'] as const) {
    const value = (address as Record<string, unknown>)[field];
    if (value !== undefined && typeof value !== 'string') {
      throw new BadRequestException(
        `address.${field} phải là dạng chuỗi khi có.`,
      );
    }
  }
}

function copyOrder(order: Order): Order {
  return JSON.parse(JSON.stringify(order)) as Order;
}
