// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { WorkflowService } from '../workflow/workflow.service';
import type {
  CreateOrderInput,
  Order,
  TransitionOrderInput,
} from './orders.types';

// Trạng thái đóng: không còn chuyển nào đi ra, mọi thao tác đều bị chặn.
const CLOSED_STATES = ['Hoàn', 'Hủy'];

// Lưu trong bộ nhớ, sẽ chuyển sang Postgres khi nhánh platform-database vào dev.
@Injectable()
export class OrdersService {
  private readonly orders = new Map<string, Order>();
  private nextNumber = 1001;

  constructor(
    private readonly workflow: WorkflowService,
    private readonly audit: AuditService,
  ) {}

  create(input: CreateOrderInput): Order {
    if (
      typeof input.idempotencyKey !== 'string' ||
      input.idempotencyKey.trim() === ''
    ) {
      throw new BadRequestException('idempotencyKey là bắt buộc, dạng chuỗi.');
    }
    if (typeof input.customer !== 'string' || input.customer.trim() === '') {
      throw new BadRequestException('customer là bắt buộc, dạng chuỗi.');
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new BadRequestException('items phải là mảng không rỗng.');
    }
    for (const item of input.items) {
      if (typeof item !== 'object' || item === null) {
        throw new BadRequestException('mỗi item phải là 1 object.');
      }
      if (typeof item.sku !== 'string' || item.sku.trim() === '') {
        throw new BadRequestException('mỗi item cần sku dạng chuỗi.');
      }
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new BadRequestException(
          'quantity của mỗi item phải là số nguyên dương.',
        );
      }
    }
    if (typeof input.actor !== 'string' || input.actor.trim() === '') {
      throw new BadRequestException('actor là bắt buộc, dạng chuỗi.');
    }
    if (typeof input.role !== 'string' || input.role.trim() === '') {
      throw new BadRequestException('role là bắt buộc, dạng chuỗi.');
    }
    // Rào chắn: không xác nhận đơn trùng (cùng idempotencyKey).
    for (const existing of this.orders.values()) {
      if (existing.idempotencyKey === input.idempotencyKey) {
        throw new ConflictException(
          `Đơn với idempotencyKey "${input.idempotencyKey}" đã tồn tại (${existing.id}).`,
        );
      }
    }
    const now = new Date().toISOString();
    const order: Order = {
      id: `DH-${String(this.nextNumber++).padStart(4, '0')}`,
      idempotencyKey: input.idempotencyKey,
      customer: input.customer,
      items: input.items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
      })),
      state: 'Mới tạo',
      history: [
        { from: null, to: 'Mới tạo', by: input.actor, role: input.role, at: now },
      ],
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(order.id, order);
    this.audit.append({
      actor: input.actor,
      role: input.role,
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

  transition(id: string, input: TransitionOrderInput): Order {
    if (typeof input.to !== 'string' || input.to.trim() === '') {
      throw new BadRequestException('to là bắt buộc, dạng chuỗi.');
    }
    if (typeof input.actor !== 'string' || input.actor.trim() === '') {
      throw new BadRequestException('actor là bắt buộc, dạng chuỗi.');
    }
    if (typeof input.role !== 'string' || input.role.trim() === '') {
      throw new BadRequestException('role là bắt buộc, dạng chuỗi.');
    }
    const order = this.orders.get(id);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn ${id}.`);
    }
    const deny = (reason: string): never => {
      this.audit.append({
        actor: input.actor,
        role: input.role,
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
      order.state,
      input.to,
      input.role,
    );
    if (!check.allowed) {
      deny(check.reason ?? 'Chuyển trạng thái không được phép.');
    }
    // Rào chắn lý do: chuyển nào có guard nhắc tới lý do thì bắt buộc có reason.
    const transition = this.workflow
      .getTransitions()
      .find((item) => item.from === order.state && item.to === input.to);
    if (
      transition &&
      transition.guard.includes('lý do') &&
      (input.reason === undefined || input.reason.trim() === '')
    ) {
      throw new BadRequestException(
        `Chuyển sang "${input.to}" cần có lý do (guard "${transition.guard}").`,
      );
    }
    const now = new Date().toISOString();
    const from = order.state;
    order.state = input.to;
    order.updatedAt = now;
    order.history.push({
      from,
      to: input.to,
      by: input.actor,
      role: input.role,
      at: now,
      ...(input.reason ? { reason: input.reason } : {}),
    });
    this.audit.append({
      actor: input.actor,
      role: input.role,
      action: 'order.transition',
      orderId: id,
      from,
      to: input.to,
      detail: input.reason ?? '',
    });
    return copyOrder(order);
  }
}

function copyOrder(order: Order): Order {
  return JSON.parse(JSON.stringify(order)) as Order;
}
