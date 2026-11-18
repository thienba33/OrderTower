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
import { APPROVER_ROLES } from '../approvals/approval.service';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { computeNextNumber } from '../db/id-counter';
import type { Order } from '../orders/orders.types';
import { OrdersService } from '../orders/orders.service';
import type { Return } from '../returns/return.types';
import { ReturnsService } from '../returns/return.service';
import {
  InMemoryRestrictedFlagStore,
  RESTRICTED_FLAG_STORE,
} from './restricted-flag.store';
import type {
  CreateRestrictedFlagInput,
  ReasonInput,
  RestrictedFlag,
  RestrictedFlagDetail,
  RestrictedFlagSource,
  RestrictedFlagStats,
  RestrictedFlagStatus,
  RestrictedFlagStore,
} from './restricted-flag.types';

const CSKH_ROLE = 'Nhân viên chăm sóc khách hàng';
const CANCEL_ROLES = [CSKH_ROLE, ...APPROVER_ROLES];

// 3 trạng thái cờ đang hoạt động: đơn đã có cờ ở 1 trong 3 trạng thái này
// thì không tạo thêm cờ mới cho đơn đó. Cờ đã kiểm tra hoặc đã hủy thì đơn
// được tạo cờ mới.
const ACTIVE_STATUSES: RestrictedFlagStatus[] = [
  'Hoàn nhiều lần',
  'Chờ duyệt thêm',
  'Hạn chế',
];

const DAY_MS = 24 * 60 * 60 * 1000;

function copyFlag(flag: RestrictedFlag): RestrictedFlag {
  return JSON.parse(JSON.stringify(flag)) as RestrictedFlag;
}

function requireNonEmpty(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(message);
  }
  return value;
}

// Chuỗi tùy chọn: cắt khoảng trắng 2 đầu, rỗng thì về null để không lưu
// chuỗi toàn khoảng trắng vào kho.
function optionalText(value: unknown, message: string): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException(message);
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// Tỷ lệ hoàn của khách gắn với cờ, tính trực tiếp lúc đọc từ đơn và trả
// hàng, không lưu bền. Khóa nối là SĐT (đơn mẫu không mang customerId, xem
// README). Tử số đếm trả hàng tạo trong cửa sổ của khách (trả hàng gắn với
// khách qua đơn của khách, kể cả đơn tạo trước cửa sổ); mẫu số đếm đơn tạo
// trong cửa sổ của khách. 0 khi khách không có đơn nào trong cửa sổ.
function computeStats(
  phone: string | null,
  allOrders: Order[],
  allReturns: Return[],
  now: number = Date.now(),
): RestrictedFlagStats {
  if (phone === null) {
    return { return1m: 0, return3m: 0, orders3m: 0 };
  }
  const customerOrders = allOrders.filter(
    (order) => order.phone === phone,
  );
  const orderIds = new Set(customerOrders.map((order) => order.id));
  const orders30 = customerOrders.filter(
    (order) => now - Date.parse(order.createdAt) <= 30 * DAY_MS,
  );
  const orders90 = customerOrders.filter(
    (order) => now - Date.parse(order.createdAt) <= 90 * DAY_MS,
  );
  const returns30 = allReturns.filter(
    (ret) =>
      orderIds.has(ret.orderId) &&
      now - Date.parse(ret.createdAt) <= 30 * DAY_MS,
  );
  const returns90 = allReturns.filter(
    (ret) =>
      orderIds.has(ret.orderId) &&
      now - Date.parse(ret.createdAt) <= 90 * DAY_MS,
  );
  return {
    return1m:
      orders30.length === 0
        ? 0
        : Math.round((returns30.length / orders30.length) * 100),
    return3m:
      orders90.length === 0
        ? 0
        : Math.round((returns90.length / orders90.length) * 100),
    orders3m: orders90.length,
  };
}

// Quản lý cờ hạn chế: CSKH báo đơn hoàn nhiều lần để rà soát, CSKH rà
// soát (cho đi đơn hoặc đề xuất hạn chế), quản lý hoặc quản trị viên duyệt
// hay từ chối đề xuất hạn chế. Người gọi lấy từ token Keycloak, không nhận
// actor/role từ body.
@Injectable()
export class RestrictedFlagsService implements OnModuleInit {
  private nextNumber = 1001;

  // Store là tham số tùy chọn, mặc định bộ nhớ: kiểm thử đơn vị không cần
  // truyền gì thêm. Khi chạy trong NestJS, mô-đun tiêm kho Postgres.
  constructor(
    private readonly orders: OrdersService,
    private readonly returns: ReturnsService,
    private readonly audit: AuditService,
    @Optional()
    @Inject(RESTRICTED_FLAG_STORE)
    private readonly store: RestrictedFlagStore = new InMemoryRestrictedFlagStore(),
  ) {}

  // Tiếp tục số thứ tự từ kho: đã có HG-1001 thì cờ mới là HG-1002,
  // không quay về HG-1001 sau khi khởi động lại.
  async onModuleInit(): Promise<void> {
    const flags = await this.store.list();
    this.nextNumber = computeNextNumber(
      flags.map((flag) => flag.id),
      'HG',
    );
  }

  async create(
    input: CreateRestrictedFlagInput,
    caller: Caller,
  ): Promise<RestrictedFlag> {
    const orderId = requireNonEmpty(
      input.orderId,
      'Tạo cờ hạn chế cần có mã đơn.',
    ).trim();
    const reason = optionalText(
      input.reason,
      'Lý do tạo cờ hạn chế phải là chuỗi.',
    );
    if (!caller.roles.includes(CSKH_ROLE)) {
      // Lỗi lúc tạo không ghi audit, giống tạo trả hàng sai vai: chỉ ghi
      // audit khi cờ đã được tạo thật.
      throw new ConflictException(`Tạo cờ hạn chế cần vai ${CSKH_ROLE}.`);
    }
    // Đơn không tồn tại thì báo 404, không ghi audit, giống đơn không tồn
    // tại lúc tạo trả hàng.
    const order = await this.orders.findOne(orderId);
    const existing = await this.store.findByOrderId(orderId);
    const active = existing.find((item) =>
      ACTIVE_STATUSES.includes(item.status),
    );
    if (active) {
      throw new ConflictException(
        `Đơn ${orderId} đã có cờ hạn chế đang xử lý (${active.id}, trạng thái "${active.status}").`,
      );
    }
    const now = new Date().toISOString();
    const flag: RestrictedFlag = {
      id: `HG-${String(this.nextNumber++).padStart(4, '0')}`,
      orderId,
      // SĐT chụp lại từ đơn lúc tạo cờ; đơn mẫu không mang customerId nên
      // SĐT là khóa nối để tính tỷ lệ hoàn (xem README).
      customerId: order.customerId,
      customerPhone: order.phone,
      status: 'Hoàn nhiều lần',
      source: 'CSKH',
      reason,
      createdBy: caller.username,
      decidedBy: null,
      decidedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.save(flag);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'restricted-flag.created',
      // Audit log dùng chung trường orderId cho mã thực thể nghiệp vụ.
      orderId,
      from: null,
      to: 'Hoàn nhiều lần',
      detail:
        `Cờ ${flag.id} cho đơn ${orderId} (khách ${order.customer}).` +
        (reason ? ` Lý do: ${reason}.` : ''),
    });
    return copyFlag(flag);
  }

  async get(id: string): Promise<RestrictedFlagDetail> {
    const flag = await this.getFlag(id);
    return this.toDetail(flag);
  }

  async list(
    filters: {
      status?: RestrictedFlagStatus;
      source?: RestrictedFlagSource;
      orderId?: string;
      customerId?: string;
    } = {},
  ): Promise<RestrictedFlagDetail[]> {
    const flags = await this.store.list();
    const filtered = flags.filter(
      (flag) =>
        (filters.status === undefined || flag.status === filters.status) &&
        (filters.source === undefined || flag.source === filters.source) &&
        (filters.orderId === undefined ||
          flag.orderId === filters.orderId) &&
        (filters.customerId === undefined ||
          flag.customerId === filters.customerId),
    );
    const allOrders = await this.orders.list();
    const allReturns = await this.returns.list();
    return filtered.map((flag) =>
      this.toDetailFromLists(flag, allOrders, allReturns),
    );
  }

  // "Cho đi đơn": gỡ cờ, đơn đi tiếp. Chỉ CSKH, chỉ từ cờ đang chờ rà
  // soát ("Hoàn nhiều lần") hoặc đang chờ duyệt thêm.
  async release(id: string, caller: Caller): Promise<RestrictedFlag> {
    return this.changeStatus(
      id,
      ['Hoàn nhiều lần', 'Chờ duyệt thêm'],
      'Đã kiểm tra',
      caller,
      'Cho đi đơn',
      'restricted-flag.released',
      [CSKH_ROLE],
      true,
      `Cờ ${id} đã kiểm tra, đơn đi tiếp.`,
    );
  }

  // Đề xuất đưa khách vào danh sách hạn chế: CSKH chỉ đề xuất, chưa phải
  // quyết định cuối (đề thi bắt duyệt tay bước này). Chỉ từ "Hoàn nhiều
  // lần", bắt buộc có lý do.
  async proposeRestrict(
    id: string,
    input: ReasonInput,
    caller: Caller,
  ): Promise<RestrictedFlag> {
    const reason = requireNonEmpty(
      input.reason,
      'Đề xuất hạn chế cần có lý do.',
    ).trim();
    return this.changeStatus(
      id,
      ['Hoàn nhiều lần'],
      'Chờ duyệt thêm',
      caller,
      'Đề xuất hạn chế',
      'restricted-flag.restrict-proposed',
      [CSKH_ROLE],
      false,
      `Lý do đề xuất: ${reason}.`,
      reason,
    );
  }

  // Duyệt đề xuất hạn chế: khách vào danh sách hạn chế. Chỉ Quản lý hoặc
  // Quản trị viên, chỉ từ "Chờ duyệt thêm".
  async approveRestrict(id: string, caller: Caller): Promise<RestrictedFlag> {
    return this.changeStatus(
      id,
      ['Chờ duyệt thêm'],
      'Hạn chế',
      caller,
      'Duyệt hạn chế',
      'restricted-flag.restrict-approved',
      APPROVER_ROLES,
      true,
      `Cờ ${id} đã duyệt, khách vào danh sách hạn chế.`,
    );
  }

  // Từ chối đề xuất hạn chế: cờ thành "Đã kiểm tra", khách không vào danh
  // sách. Chỉ Quản lý hoặc Quản trị viên, chỉ từ "Chờ duyệt thêm", bắt
  // buộc có lý do.
  async rejectRestrict(
    id: string,
    input: ReasonInput,
    caller: Caller,
  ): Promise<RestrictedFlag> {
    const reason = requireNonEmpty(
      input.reason,
      'Từ chối hạn chế cần có lý do.',
    ).trim();
    return this.changeStatus(
      id,
      ['Chờ duyệt thêm'],
      'Đã kiểm tra',
      caller,
      'Từ chối hạn chế',
      'restricted-flag.restrict-rejected',
      APPROVER_ROLES,
      true,
      `Lý do từ chối: ${reason}.`,
      reason,
    );
  }

  // "Hủy đơn" ở màn danh sách hạn chế: chỉ ghi quyết định rà soát trên cờ,
  // KHÔNG chuyển trạng thái đơn (xem README: đơn chỉ hủy được từ "Mới
  // tạo"/"Đã kiểm tra" và chỉ bởi Điều phối viên, còn màn này chỉ có
  // CSKH/quản lý). Chỉ từ cờ đang chờ rà soát hoặc đang chờ duyệt thêm,
  // bắt buộc có lý do.
  async cancel(
    id: string,
    input: ReasonInput,
    caller: Caller,
  ): Promise<RestrictedFlag> {
    const reason = requireNonEmpty(
      input.reason,
      'Hủy đơn ở danh sách hạn chế cần có lý do.',
    ).trim();
    return this.changeStatus(
      id,
      ['Hoàn nhiều lần', 'Chờ duyệt thêm'],
      'Đã hủy',
      caller,
      'Hủy đơn',
      'restricted-flag.cancelled',
      CANCEL_ROLES,
      true,
      `Lý do hủy: ${reason}. Chỉ ghi quyết định trên cờ, đơn vẫn giữ trạng thái cũ, điều phối viên hủy đơn ở màn chi tiết đơn.`,
      reason,
    );
  }

  private async getFlag(id: string): Promise<RestrictedFlag> {
    const flag = await this.store.findById(id);
    if (!flag) {
      throw new NotFoundException(`Không tìm thấy cờ hạn chế ${id}.`);
    }
    return copyFlag(flag);
  }

  private async toDetail(flag: RestrictedFlag): Promise<RestrictedFlagDetail> {
    const allOrders = await this.orders.list();
    const allReturns = await this.returns.list();
    return this.toDetailFromLists(flag, allOrders, allReturns);
  }

  private toDetailFromLists(
    flag: RestrictedFlag,
    allOrders: Order[],
    allReturns: Return[],
  ): RestrictedFlagDetail {
    const order = allOrders.find((item) => item.id === flag.orderId);
    if (!order) {
      // Đơn không bao giờ bị xóa trong hệ thống nên không tới được đây;
      // giữ lỗi rõ ràng thay vì trả cờ thiếu đơn.
      throw new NotFoundException(`Không tìm thấy đơn ${flag.orderId}.`);
    }
    return {
      ...copyFlag(flag),
      order,
      stats: computeStats(flag.customerPhone, allOrders, allReturns),
    };
  }

  private async changeStatus(
    id: string,
    from: RestrictedFlagStatus[],
    to: RestrictedFlagStatus,
    caller: Caller,
    action: string,
    auditAction: string,
    allowedRoles: string[],
    markDecided: boolean,
    detail: string,
    reason?: string,
  ): Promise<RestrictedFlag> {
    const flag = await this.getFlag(id);
    // Tính lý do từ chối vào biến trước rồi mới từ chối 1 lần: TypeScript
    // không thu hẹp kiểu sau khi gọi hàm mũi tên gắn nhãn : never, nên
    // không viết kiểm tra nối tiếp nhau rồi gọi deny() trong từng nhánh.
    let denyMessage: string | null = null;
    if (!from.includes(flag.status)) {
      denyMessage =
        `Cờ ${id} đang ở trạng thái "${flag.status}", chỉ ${action.toLowerCase()} khi cờ ở ` +
        from.map((status) => `"${status}"`).join(' hoặc ') +
        '.';
    } else if (!allowedRoles.some((role) => caller.roles.includes(role))) {
      denyMessage = `${action} cần vai ${allowedRoles.join(' hoặc ')}.`;
    }
    if (denyMessage) {
      await this.denyTransition(flag, to, caller, denyMessage);
    }
    const now = new Date().toISOString();
    const fromStatus = flag.status;
    flag.status = to;
    if (reason !== undefined) {
      flag.reason = reason;
    }
    if (markDecided) {
      flag.decidedBy = caller.username;
      flag.decidedAt = now;
    }
    flag.updatedAt = now;
    await this.store.save(flag);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: auditAction,
      orderId: flag.orderId,
      from: fromStatus,
      to,
      detail,
    });
    return copyFlag(flag);
  }

  private async denyTransition(
    flag: RestrictedFlag,
    to: RestrictedFlagStatus,
    caller: Caller,
    message: string,
  ): Promise<never> {
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'restricted-flag.transition.denied',
      orderId: flag.orderId,
      from: flag.status,
      to,
      detail: message,
    });
    throw new ConflictException(message);
  }
}
