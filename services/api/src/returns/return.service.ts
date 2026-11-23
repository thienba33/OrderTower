// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { computeNextNumber } from '../db/id-counter';
import { OrdersService } from '../orders/orders.service';
import { InMemoryReturnStore, RETURN_STORE } from './return.store';
import type {
  CreateReturnInput,
  RejectReturnInput,
  Return,
  ReturnStatus,
  ReturnStore,
} from './return.types';

const CSKH_ROLE = 'Nhân viên chăm sóc khách hàng';
const MANAGER_ROLE = 'Quản lý';
const ADMIN_ROLE = 'Quản trị viên';
const DISPATCHER_ROLE = 'Điều phối viên';

// 2 trạng thái trả hàng đang hoạt động: đơn đã có trả hàng ở 1 trong 2
// trạng thái này thì không tạo thêm trả hàng mới cho đơn đó. Trả hàng đã
// từ chối hoặc đã hoàn tiền thì đơn được tạo trả hàng mới.
const ACTIVE_STATUSES: ReturnStatus[] = ['Chờ xử lý', 'Đã duyệt'];

function copyReturn(ret: Return): Return {
  return JSON.parse(JSON.stringify(ret)) as Return;
}

function requireNonEmpty(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(message);
  }
  return value;
}

// Quản lý yêu cầu trả hàng cho đơn đã giao: CSKH tạo, quản lý hoặc quản
// trị viên duyệt hay từ chối, điều phối viên hoàn tiền sau khi duyệt.
// Người gọi lấy từ token Keycloak, không nhận actor/role từ body.
@Injectable()
export class ReturnsService implements OnModuleInit {
  private nextNumber = 1001;

  // Store là tham số tùy chọn, mặc định bộ nhớ: kiểm thử đơn vị không cần
  // truyền gì thêm. Khi chạy trong NestJS, mô-đun tiêm kho Postgres.
  constructor(
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
    @Optional()
    @Inject(RETURN_STORE)
    private readonly store: ReturnStore = new InMemoryReturnStore(),
  ) {}

  // Tiếp tục số thứ tự từ kho: đã có TH-1001 thì trả hàng mới là TH-1002,
  // không quay về TH-1001 sau khi khởi động lại.
  async onModuleInit(): Promise<void> {
    const returns = await this.store.list();
    this.nextNumber = computeNextNumber(
      returns.map((ret) => ret.id),
      'TH',
    );
  }

  async create(
    input: CreateReturnInput,
    caller: Caller,
    // Thời điểm ghi cho bản ghi: chỉ đường seed lịch sử dùng để lùi
    // thời gian, vắng thì lấy thời điểm hiện tại.
    opts?: { at?: string },
  ): Promise<Return> {
    const orderId = requireNonEmpty(
      input.orderId,
      'Tạo trả hàng cần có mã đơn.',
    ).trim();
    const reason = requireNonEmpty(
      input.reason,
      'Tạo trả hàng cần có lý do.',
    ).trim();
    if (!caller.roles.includes(CSKH_ROLE)) {
      // Lỗi lúc tạo không ghi audit, giống tạo shipment sai: chỉ ghi audit
      // khi trả hàng đã được tạo thật.
      throw new ConflictException(`Tạo trả hàng cần vai ${CSKH_ROLE}.`);
    }
    // Đơn không tồn tại thì báo 404, không ghi audit, giống đơn không tồn
    // tại lúc tạo shipment.
    const order = await this.orders.findOne(orderId);
    if (order.state !== 'Đã giao') {
      throw new ConflictException(
        `Đơn ${orderId} đang ở trạng thái "${order.state}", chỉ tạo trả hàng khi đơn đã giao.`,
      );
    }
    const existing = await this.store.findByOrderId(orderId);
    const active = existing.find((item) =>
      ACTIVE_STATUSES.includes(item.status),
    );
    if (active) {
      throw new ConflictException(
        `Đơn ${orderId} đã có trả hàng đang xử lý (${active.id}, trạng thái "${active.status}").`,
      );
    }
    const now = opts?.at ?? new Date().toISOString();
    const ret: Return = {
      id: `TH-${String(this.nextNumber++).padStart(4, '0')}`,
      orderId,
      reason,
      status: 'Chờ xử lý',
      createdAt: now,
      updatedAt: now,
    };
    await this.store.save(ret);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'return.created',
      at: now,
      // Audit log dùng chung trường orderId cho mã thực thể nghiệp vụ.
      orderId,
      from: null,
      to: 'Chờ xử lý',
      detail: `Lý do: ${reason}.`,
    });
    return copyReturn(ret);
  }

  async get(id: string): Promise<Return> {
    const ret = await this.store.findById(id);
    if (!ret) {
      throw new NotFoundException(`Không tìm thấy trả hàng ${id}.`);
    }
    return copyReturn(ret);
  }

  async list(
    filters: {
      orderId?: string;
      status?: ReturnStatus;
    } = {},
  ): Promise<Return[]> {
    const returns = await this.store.list();
    return returns.filter(
      (ret) =>
        (filters.orderId === undefined || ret.orderId === filters.orderId) &&
        (filters.status === undefined || ret.status === filters.status),
    );
  }

  async approve(
    id: string,
    caller: Caller,
    // Thời điểm ghi cho bản ghi: chỉ đường seed lịch sử dùng để lùi
    // thời gian, vắng thì lấy thời điểm hiện tại.
    opts?: { at?: string },
  ): Promise<Return> {
    return this.changeStatus(
      id,
      'Chờ xử lý',
      'Đã duyệt',
      caller,
      'Duyệt trả hàng',
      'return.approved',
      [MANAGER_ROLE, ADMIN_ROLE],
      undefined,
      opts,
    );
  }

  async reject(
    id: string,
    input: RejectReturnInput,
    caller: Caller,
    // Thời điểm ghi cho bản ghi: chỉ đường seed lịch sử dùng để lùi
    // thời gian, vắng thì lấy thời điểm hiện tại.
    opts?: { at?: string },
  ): Promise<Return> {
    const reason = requireNonEmpty(
      input.reason,
      'Từ chối trả hàng cần có lý do.',
    ).trim();
    return this.changeStatus(
      id,
      'Chờ xử lý',
      'Đã từ chối',
      caller,
      'Từ chối trả hàng',
      'return.rejected',
      [MANAGER_ROLE, ADMIN_ROLE],
      `Lý do từ chối: ${reason}.`,
      opts,
    );
  }

  async refund(
    id: string,
    caller: Caller,
    // Thời điểm ghi cho bản ghi: chỉ đường seed lịch sử dùng để lùi
    // thời gian, vắng thì lấy thời điểm hiện tại.
    opts?: { at?: string },
  ): Promise<Return> {
    return this.changeStatus(
      id,
      'Đã duyệt',
      'Đã hoàn tiền',
      caller,
      'Hoàn tiền trả hàng',
      'return.refunded',
      [DISPATCHER_ROLE],
      undefined,
      opts,
    );
  }

  private async changeStatus(
    id: string,
    from: ReturnStatus,
    to: ReturnStatus,
    caller: Caller,
    action: string,
    auditAction: string,
    allowedRoles: string[],
    detail?: string,
    // Thời điểm ghi cho bản ghi: chỉ đường seed lịch sử dùng để lùi
    // thời gian, vắng thì lấy thời điểm hiện tại.
    opts?: { at?: string },
  ): Promise<Return> {
    const ret = await this.get(id);
    const now = opts?.at ?? new Date().toISOString();
    const deny = async (reason: string): Promise<never> => {
      await this.audit.append({
        actor: caller.username,
        role: caller.roles[0] ?? '',
        action: 'return.transition.denied',
        at: now,
        orderId: ret.orderId,
        from: ret.status,
        to,
        detail: reason,
      });
      throw new ConflictException(reason);
    };
    // Kiểm trạng thái trước, kiểm vai sau, giống thứ tự ở dispatch của
    // shipment và changeStatus của kênh.
    if (ret.status !== from) {
      await deny(
        `Trả hàng ${id} đang ở trạng thái "${ret.status}", chỉ ${action.toLowerCase()} khi trả hàng ở "${from}".`,
      );
    }
    if (!allowedRoles.some((role) => caller.roles.includes(role))) {
      await deny(`${action} cần vai ${allowedRoles.join(' hoặc ')}.`);
    }
    ret.status = to;
    ret.updatedAt = now;
    await this.store.save(ret);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: auditAction,
      at: now,
      orderId: ret.orderId,
      from,
      to,
      detail: detail ?? `Trả hàng ${id} cho đơn ${ret.orderId}.`,
    });
    return copyReturn(ret);
  }
}
