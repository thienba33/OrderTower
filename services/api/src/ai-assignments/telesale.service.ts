// SPDX-License-Identifier: Apache-2.0
import { ConflictException, Injectable } from '@nestjs/common';
import { AssignmentsService } from '../assignments/assignment.service';
import type { Assignment } from '../assignments/assignment.types';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { OrdersService } from '../orders/orders.service';
import {
  sortPriorityRows,
  toDisplayRow,
  toPriorityRow,
  type TelesalePriorityRow,
} from './telesale-priority';

const CSKH_ROLE = 'Nhân viên chăm sóc khách hàng';

export interface TelesaleNextResult {
  assignment: Assignment | null;
  order: TelesalePriorityRow | null;
  reason: string;
  // true khi trả về phân đơn Chờ xử lý đã chia sẵn cho người gọi (không
  // tạo mới, không ghi audit mới).
  existing: boolean;
}

// AI chia cuộc gọi cho CSKH (telesale): gợi ý cuộc gọi tiếp theo cho chính
// người gọi, theo đúng luật ưu tiên của bảng telesale ở web. Không có modal
// duyệt theo đợt, vì telesale chia từng cuộc một; người gọi quyết định gọi
// hay bỏ qua từng cuộc.
@Injectable()
export class TelesaleService {
  constructor(
    private readonly orders: OrdersService,
    private readonly assignments: AssignmentsService,
    private readonly audit: AuditService,
  ) {}

  async next(caller: Caller): Promise<TelesaleNextResult> {
    if (!caller.roles.includes(CSKH_ROLE)) {
      throw new ConflictException(
        `Nhận cuộc gọi tiếp theo cần vai ${CSKH_ROLE}.`,
      );
    }
    const now = Date.now();

    // 1. Người gọi đang có phân đơn telesale ở Chờ xử lý thì trả luôn phân
    // đơn đó (đơn đã chia cho mình mà chưa gọi), không tạo mới, không ghi
    // audit mới vì không có thay đổi trạng thái nào.
    const pending = await this.assignments.list({
      kind: 'telesale',
      assignedTo: caller.username,
      status: 'Chờ xử lý',
    });
    if (pending.length > 0) {
      const assignment = pending[0];
      const order = await this.orders.findOne(assignment.orderId);
      const row = toDisplayRow(order, now);
      return {
        assignment,
        order: row,
        reason: row?.reason ?? 'Đã chia cho bạn, chưa gọi.',
        existing: true,
      };
    }

    // 2. Không có thì lấy đơn ưu tiên đầu tiên chưa có phân đơn telesale
    // đang hoạt động, tạo phân đơn telesale cho chính người gọi.
    const allOrders = await this.orders.list();
    const activeTelesale = await this.assignments.list({
      kind: 'telesale',
    });
    const activeOrderIds = new Set(
      activeTelesale
        .filter(
          (item) =>
            item.status === 'Chờ xử lý' || item.status === 'Đang xử lý',
        )
        .map((item) => item.orderId),
    );
    const ranked = sortPriorityRows(
      allOrders
        .filter((order) => !activeOrderIds.has(order.id))
        .map((order) => toPriorityRow(order, now))
        .filter((row): row is TelesalePriorityRow => row !== null),
    );
    if (ranked.length === 0) {
      return {
        assignment: null,
        order: null,
        reason: 'Đã hết đơn cần ưu tiên gọi.',
        existing: false,
      };
    }
    const row = ranked[0];
    const assignment = await this.assignments.createTelesaleSelf(
      row.orderId,
      caller,
    );
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'ai-next-call.created',
      orderId: row.orderId,
      from: null,
      to: 'Chờ xử lý',
      detail: `AI gợi ý cuộc gọi tiếp theo cho ${caller.username}: ${row.reason}, ETA ${row.eta}.`,
    });
    return {
      assignment,
      order: row,
      reason: row.reason,
      existing: false,
    };
  }
}
