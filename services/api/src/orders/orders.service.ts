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
import { InventoryService } from '../inventory/inventory.service';
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
    private readonly inventory: InventoryService,
    private readonly address: AddressService,
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
    if (input.address !== undefined) {
      if (typeof input.address !== 'object' || input.address === null) {
        throw new BadRequestException('address phải là 1 object khi có.');
      }
      for (const field of ['province', 'district', 'ward', 'street'] as const) {
        const value = input.address[field];
        if (value !== undefined && typeof value !== 'string') {
          throw new BadRequestException(
            `address.${field} phải là dạng chuỗi khi có.`,
          );
        }
      }
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
    const now = new Date().toISOString();
    const order: Order = {
      id: `DH-${String(this.nextNumber++).padStart(4, '0')}`,
      idempotencyKey: input.idempotencyKey,
      customer: input.customer,
      items: input.items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
      })),
      address: input.address ? { ...input.address } : undefined,
      addressTrust: evaluation ? evaluation.trust : null,
      addressLevel: evaluation ? evaluation.level : null,
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
    // Rào chắn theo guard trong tệp định nghĩa: lý do bắt buộc, địa chỉ và tồn kho.
    const transition = this.workflow
      .getTransitions()
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
    if (consumeStock) {
      this.inventory.reserve(order.items);
    }
    return copyOrder(order);
  }
}

function copyOrder(order: Order): Order {
  return JSON.parse(JSON.stringify(order)) as Order;
}
