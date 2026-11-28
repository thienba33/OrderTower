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
import { ApprovalService } from '../approvals/approval.service';
import { AssignmentsService } from '../assignments/assignment.service';
import type { Assignment } from '../assignments/assignment.types';
import { AuditService } from '../audit/audit.service';
import type { AuditRecord } from '../audit/audit.types';
import type { Caller } from '../auth/auth.types';
import { OrdersService } from '../orders/orders.service';
import type { Order } from '../orders/orders.types';
import {
  InMemoryProposalStore,
  PROPOSAL_STORE,
} from './assignment.store';
import type {
  AiAssignmentProposal,
  ProposalItem,
  ProposalSkipped,
  ProposalStore,
} from './assignment.types';

const DISPATCHER_ROLE = 'Điều phối viên';

// Tài khoản nhân viên kho demo để xét chia, cùng danh sách với web
// (distribution-types.ts). Tài khoản khác từng nhận phân đơn kho cũng
// được xét chia, giống cách lấy staffList ở màn Phân phối đơn.
const DEMO_WAREHOUSE_ACCOUNTS = [
  'demo.warehouse-staff',
  'demo.warehouse-staff-2',
  'demo.warehouse-staff-3',
];

// Ngưỡng vượt tải: 30 phân đơn kho đang hoạt động/người (OVERLOAD_STANDARD
// ở distribution-types.ts). Điểm phê duyệt "phân đơn vượt tải" trong plan.
const OVERLOAD_STANDARD = 30;

const ACTIVE_ASSIGNMENT_STATUSES = ['Chờ xử lý', 'Đang xử lý'];

export interface ProposeWarehouseInput {
  orderIds?: string[];
  exclude?: string[];
}

export interface DecideProposalInput {
  decision: 'approved' | 'rejected';
  reason?: string;
  // Danh sách sau khi người duyệt sửa trong modal (đổi người nhận, bỏ đơn,
  // thêm đơn); không có thì áp dụng đúng như đề xuất.
  items?: { orderId: string; assignedTo: string }[];
}

export interface ReassignWarehouseInput {
  assignedTo: string;
  exclude?: string[];
}

export interface DecideProposalResult {
  proposal: AiAssignmentProposal;
  applied: { orderId: string; assignmentId: string }[];
  failed: { orderId: string; reason: string }[];
  // Mã phê duyệt vượt tải vừa tạo (khi đề xuất chuyển sang Chờ duyệt vượt tải).
  approvalId: string | null;
}

// Điểm hiệu suất nhân viên kho, tính từ dữ liệu thật (bản dự thảo AI chia
// đơn, mục 5.1): điểm tải x 2 + điểm kinh nghiệm tối đa 20 + điểm tốc độ
// tối đa 10. Tỉ lệ lỗi không tính ở v1 vì chưa có dữ liệu đo được.
interface StaffStats {
  active: number;
  completed: number;
  avgMinutes: number | null;
  score: number;
}

function scoreStaff(stats: {
  active: number;
  completed: number;
  avgMinutes: number | null;
}): number {
  const loadScore = Math.max(0, OVERLOAD_STANDARD - stats.active);
  const expScore = Math.min(stats.completed, 20);
  const speedScore =
    stats.avgMinutes === null
      ? 0
      : stats.avgMinutes <= 30
        ? 10
        : stats.avgMinutes <= 60
          ? 5
          : 0;
  return loadScore * 2 + expScore + speedScore;
}

// Thời gian trung bình từ assignment.started đến assignment.completed của
// cùng 1 đơn do cùng 1 người thực hiện, tính từ audit log. Ghép theo
// orderId (audit không lưu mã phân đơn). Chưa có cặp nào thì null, tính 0
// điểm tốc độ, không ước lượng.
function avgMinutesFromAudit(
  records: AuditRecord[],
  username: string,
): number | null {
  const started = new Map<string, number>();
  const durations: number[] = [];
  for (const record of records) {
    if (record.actor !== username) continue;
    if (record.action === 'assignment.started') {
      const at = Date.parse(record.at);
      if (!Number.isNaN(at)) {
        started.set(record.orderId, at);
      }
    } else if (record.action === 'assignment.completed') {
      const startAt = started.get(record.orderId);
      if (startAt === undefined) continue;
      const endAt = Date.parse(record.at);
      if (Number.isNaN(endAt) || endAt < startAt) continue;
      durations.push((endAt - startAt) / 60000);
      started.delete(record.orderId);
    }
  }
  if (durations.length === 0) return null;
  const total = durations.reduce((sum, value) => sum + value, 0);
  return Math.round(total / durations.length);
}

function reasonFor(stats: StaffStats, username: string): string {
  const speed =
    stats.avgMinutes === null
      ? 'chưa đo tốc độ'
      : `trung bình ${stats.avgMinutes} phút/đơn`;
  return `${username} đang làm ${stats.active} đơn, đã hoàn thành ${stats.completed} đơn, ${speed}`;
}

// AI chia đơn kho theo đợt (wave): 1 lần bấm nút = 1 đợt, gồm toàn bộ đơn
// ở Chờ kho chưa có phân đơn kho đang hoạt động tại thời điểm đó. Đơn xếp
// theo mốc giao hẹn sớm trước, đơn không có mốc giao xếp sau cùng; giao
// lần lượt từng đơn cho người có điểm cao nhất lúc đó, rồi tính lại điểm
// trước khi giao đơn tiếp theo để đợt chia tự cân bằng dần.
@Injectable()
export class WarehouseAssignmentService implements OnModuleInit {
  private nextNumber = 1001;

  constructor(
    private readonly orders: OrdersService,
    private readonly assignments: AssignmentsService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalService,
    @Optional()
    @Inject(PROPOSAL_STORE)
    private readonly store: ProposalStore = new InMemoryProposalStore(),
  ) {}

  async onModuleInit(): Promise<void> {
    const proposals = await this.store.list();
    const numbers = proposals
      .map((item) => Number(item.id.replace(/^AD-/, '')))
      .filter((n) => Number.isFinite(n));
    if (numbers.length > 0) {
      this.nextNumber = Math.max(...numbers) + 1;
    }
  }

  private nextId(): string {
    return `AD-${String(this.nextNumber++).padStart(4, '0')}`;
  }

  private requireDispatcher(caller: Caller): void {
    if (!caller.roles.includes(DISPATCHER_ROLE)) {
      throw new ConflictException(
        `AI chia đơn kho cần vai ${DISPATCHER_ROLE}.`,
      );
    }
  }

  // Danh sách nhân viên xét chia: 3 tài khoản demo kho + các tài khoản từng
  // nhận phân đơn kho, trừ những người trong exclude.
  private async staffList(exclude: string[]): Promise<string[]> {
    const all = await this.assignments.list({ kind: 'warehouse' });
    const others = new Set<string>();
    for (const item of all) {
      if (!DEMO_WAREHOUSE_ACCOUNTS.includes(item.assignedTo)) {
        others.add(item.assignedTo);
      }
    }
    const excluded = new Set(exclude);
    return [...DEMO_WAREHOUSE_ACCOUNTS, ...Array.from(others).sort()].filter(
      (name) => !excluded.has(name),
    );
  }

  // Thống kê hiệu suất cho từng nhân viên: số đang làm, số đã hoàn thành,
  // tốc độ trung bình từ audit, điểm tổng.
  private async staffStats(
    staff: string[],
  ): Promise<Map<string, StaffStats>> {
    const all = await this.assignments.list({ kind: 'warehouse' });
    const records = await this.audit.getAll();
    const stats = new Map<string, StaffStats>();
    for (const name of staff) {
      const mine = all.filter((item) => item.assignedTo === name);
      const active = mine.filter((item) =>
        ACTIVE_ASSIGNMENT_STATUSES.includes(item.status),
      ).length;
      const completed = mine.filter(
        (item) => item.status === 'Hoàn thành',
      ).length;
      const avgMinutes = avgMinutesFromAudit(records, name);
      stats.set(name, {
        active,
        completed,
        avgMinutes,
        score: scoreStaff({ active, completed, avgMinutes }),
      });
    }
    return stats;
  }

  // Đơn chờ chia: ở Chờ kho và chưa có phân đơn kho đang hoạt động. Đơn
  // không thỏa thì vào skipped kèm lý do.
  private async waitingOrders(
    orderIds: string[] | undefined,
  ): Promise<{ orders: Order[]; skipped: ProposalSkipped[] }> {
    const allOrders = await this.orders.list();
    const byId = new Map(allOrders.map((order) => [order.id, order]));
    const candidates =
      orderIds === undefined || orderIds.length === 0
        ? allOrders.filter((order) => order.state === 'Chờ kho')
        : orderIds
            .map((id) => byId.get(id))
            .filter((order): order is Order => order !== undefined);
    const activeWarehouse = await this.assignments.list({
      kind: 'warehouse',
    });
    const activeOrderIds = new Set(
      activeWarehouse
        .filter((item) => ACTIVE_ASSIGNMENT_STATUSES.includes(item.status))
        .map((item) => item.orderId),
    );
    const orders: Order[] = [];
    const skipped: ProposalSkipped[] = [];
    for (const order of candidates) {
      if (order.state !== 'Chờ kho') {
        skipped.push({
          orderId: order.id,
          reason: `Đơn đang ở trạng thái "${order.state}", không phải "Chờ kho".`,
        });
        continue;
      }
      if (activeOrderIds.has(order.id)) {
        skipped.push({
          orderId: order.id,
          reason: 'Đơn đã có phân đơn kho đang xử lý.',
        });
        continue;
      }
      orders.push(order);
    }
    // Mốc giao hẹn sớm trước, đơn không có mốc giao xếp sau cùng.
    orders.sort((a, b) => {
      if (a.deadline === null && b.deadline === null) return 0;
      if (a.deadline === null) return 1;
      if (b.deadline === null) return -1;
      return a.deadline.localeCompare(b.deadline);
    });
    return { orders, skipped };
  }

  // Áp dụng đúng như danh sách sẽ đẩy ai lên từ 30 phân đơn kho đang hoạt
  // động trở lên thì vượt tải.
  private wouldOverload(
    items: { orderId: string; assignedTo: string }[],
    stats: Map<string, StaffStats>,
  ): boolean {
    const after = new Map<string, number>();
    for (const [name, stat] of stats) {
      after.set(name, stat.active);
    }
    for (const item of items) {
      const current = after.get(item.assignedTo) ?? 0;
      after.set(item.assignedTo, current + 1);
    }
    for (const count of after.values()) {
      if (count >= OVERLOAD_STANDARD) return true;
    }
    return false;
  }

  async propose(
    input: ProposeWarehouseInput,
    caller: Caller,
  ): Promise<AiAssignmentProposal> {
    this.requireDispatcher(caller);
    const exclude = input.exclude ?? [];
    const staff = await this.staffList(exclude);
    const { orders, skipped } = await this.waitingOrders(input.orderIds);
    const stats = await this.staffStats(staff);
    // Tính lại điểm sau mỗi lần giao để đợt chia tự cân bằng dần.
    const liveActive = new Map<string, number>();
    for (const [name, stat] of stats) {
      liveActive.set(name, stat.active);
    }
    const items: ProposalItem[] = [];
    for (const order of orders) {
      if (staff.length === 0) break;
      let best: string | null = null;
      let bestScore = -1;
      for (const name of staff) {
        const stat = stats.get(name);
        if (!stat) continue;
        const active = liveActive.get(name) ?? 0;
        if (active >= OVERLOAD_STANDARD) continue;
        const score = scoreStaff({
          active,
          completed: stat.completed,
          avgMinutes: stat.avgMinutes,
        });
        if (score > bestScore) {
          best = name;
          bestScore = score;
        }
      }
      if (best === null) break;
      const stat = stats.get(best) as StaffStats;
      items.push({
        orderId: order.id,
        assignedTo: best,
        reason: reasonFor(
          { ...stat, active: liveActive.get(best) ?? 0 },
          best,
        ),
        inputs: {
          active: liveActive.get(best) ?? 0,
          completed: stat.completed,
          avgMinutes: stat.avgMinutes,
          score: bestScore,
        },
        originalAssignmentId: null,
      });
      liveActive.set(best, (liveActive.get(best) ?? 0) + 1);
    }
    const now = new Date().toISOString();
    const proposal: AiAssignmentProposal = {
      id: this.nextId(),
      kind: 'warehouse',
      status: 'Chờ duyệt',
      items,
      skipped,
      overloaded: this.wouldOverload(items, stats),
      approvalId: null,
      requestedBy: caller.username,
      requestedAt: now,
      decidedBy: null,
      decidedAt: null,
      decisionReason: null,
      appliedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.save(proposal);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'ai-proposal.created',
      orderId: items[0]?.orderId ?? '',
      from: null,
      to: 'Chờ duyệt',
      detail: `AI đề xuất chia ${items.length} đơn cho ${new Set(items.map((item) => item.assignedTo)).size} nhân viên kho (${proposal.id}).`,
    });
    return JSON.parse(JSON.stringify(proposal));
  }

  async get(id: string): Promise<AiAssignmentProposal> {
    const proposal = await this.store.findById(id);
    if (!proposal) {
      throw new NotFoundException(`Không tìm thấy đề xuất ${id}.`);
    }
    return JSON.parse(JSON.stringify(proposal));
  }

  // Danh sách đề xuất gần đây nhất trước (để điều phối viên mở lại đề
  // xuất đang chờ duyệt vượt tải sau khi Quản lý đã duyệt).
  async list(): Promise<AiAssignmentProposal[]> {
    const proposals = await this.store.list();
    return proposals
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((proposal) => JSON.parse(JSON.stringify(proposal)));
  }

  async decide(
    id: string,
    input: DecideProposalInput,
    caller: Caller,
  ): Promise<DecideProposalResult> {
    this.requireDispatcher(caller);
    const proposal = await this.store.findById(id);
    if (!proposal) {
      throw new NotFoundException(`Không tìm thấy đề xuất ${id}.`);
    }
    if (input.decision !== 'approved' && input.decision !== 'rejected') {
      throw new BadRequestException(
        'Quyết định chỉ là "approved" hoặc "rejected".',
      );
    }
    if (proposal.status === 'Đã áp dụng' || proposal.status === 'Đã từ chối') {
      throw new ConflictException(
        `Đề xuất ${id} đã ở trạng thái "${proposal.status}", không quyết định lại được.`,
      );
    }
    const now = new Date().toISOString();

    if (input.decision === 'rejected') {
      const reason = (input.reason ?? '').trim();
      if (reason === '') {
        throw new BadRequestException(
          'Từ chối đề xuất cần có lý do.',
        );
      }
      proposal.status = 'Đã từ chối';
      proposal.decidedBy = caller.username;
      proposal.decidedAt = now;
      proposal.decisionReason = reason;
      proposal.updatedAt = now;
      await this.store.save(proposal);
      await this.audit.append({
        actor: caller.username,
        role: caller.roles[0] ?? '',
        action: 'ai-proposal.rejected',
        orderId: proposal.items[0]?.orderId ?? '',
        from: 'Chờ duyệt',
        to: 'Đã từ chối',
        detail: `Từ chối đề xuất ${id}: ${reason}`,
      });
      return {
        proposal: JSON.parse(JSON.stringify(proposal)),
        applied: [],
        failed: [],
        approvalId: null,
      };
    }

    // Duyệt: dùng danh sách đã sửa trong modal nếu có, không thì dùng đúng
    // như đề xuất.
    const toApply: { orderId: string; assignedTo: string }[] =
      input.items !== undefined
        ? input.items.map((item) => ({
            orderId: item.orderId,
            assignedTo: item.assignedTo,
          }))
        : proposal.items.map((item) => ({
            orderId: item.orderId,
            assignedTo: item.assignedTo,
          }));

    // Đề xuất đang chờ duyệt vượt tải: kiểm tra phê duyệt đã duyệt chưa.
    // Phê duyệt bị từ chối thì đề xuất về Chờ duyệt để sửa lại cho hết
    // vượt tải; phê duyệt còn chờ thì báo 409.
    if (proposal.status === 'Chờ duyệt vượt tải') {
      if (proposal.approvalId === null) {
        throw new ConflictException(
          `Đề xuất ${id} đang chờ duyệt vượt tải nhưng không có mã phê duyệt.`,
        );
      }
      const approval = await this.approvals.get(proposal.approvalId);
      if (approval.status === 'rejected') {
        proposal.status = 'Chờ duyệt';
        proposal.approvalId = null;
        proposal.updatedAt = now;
        await this.store.save(proposal);
        throw new ConflictException(
          `Phê duyệt vượt tải ${proposal.approvalId} đã bị từ chối, đề xuất ${id} về Chờ duyệt để sửa lại cho hết vượt tải.`,
        );
      }
      if (approval.status !== 'approved') {
        throw new ConflictException(
          `Phê duyệt vượt tải ${proposal.approvalId} đang chờ duyệt, chưa áp dụng được đề xuất ${id}.`,
        );
      }
      await this.approvals.markApplied(proposal.approvalId, caller);
      return this.applyItems(proposal, toApply, caller, now);
    }

    // Đề xuất bình thường: áp dụng đúng như danh sách sẽ đẩy ai lên từ 30
    // thì không áp dụng trực tiếp mà chuyển sang phê duyệt vượt tải.
    const staff = await this.staffList([]);
    const stats = await this.staffStats(staff);
    if (this.wouldOverload(toApply, stats)) {
      const overloadedNames = new Set<string>();
      const after = new Map<string, number>();
      for (const [name, stat] of stats) {
        after.set(name, stat.active);
      }
      for (const item of toApply) {
        after.set(item.assignedTo, (after.get(item.assignedTo) ?? 0) + 1);
      }
      for (const [name, count] of after) {
        if (count >= OVERLOAD_STANDARD) {
          overloadedNames.add(`${name} sẽ lên ${count} đơn`);
        }
      }
      const reason = `Áp dụng đề xuất ${id} sẽ vượt tải: ${Array.from(overloadedNames).join(', ')}, vượt chuẩn ${OVERLOAD_STANDARD} đơn/đợt.`;
      const approval = await this.approvals.request(
        {
          type: 'assignment.overload',
          subjectId: id,
          reason,
        },
        caller,
      );
      proposal.status = 'Chờ duyệt vượt tải';
      proposal.approvalId = approval.id;
      proposal.updatedAt = now;
      await this.store.save(proposal);
      await this.audit.append({
        actor: caller.username,
        role: caller.roles[0] ?? '',
        action: 'ai-proposal.overload-requested',
        orderId: proposal.items[0]?.orderId ?? '',
        from: 'Chờ duyệt',
        to: 'Chờ duyệt vượt tải',
        detail: reason,
      });
      return {
        proposal: JSON.parse(JSON.stringify(proposal)),
        applied: [],
        failed: [],
        approvalId: approval.id,
      };
    }

    return this.applyItems(proposal, toApply, caller, now);
  }

  // Áp dụng từng mục độc lập (không chung 1 giao dịch): mục nào lỗi thì
  // ghi vào failed, các mục còn lại vẫn áp dụng. Đề xuất sang Đã áp dụng
  // khi có ít nhất 1 mục áp dụng được.
  private async applyItems(
    proposal: AiAssignmentProposal,
    toApply: { orderId: string; assignedTo: string }[],
    caller: Caller,
    now: string,
  ): Promise<DecideProposalResult> {
    const applied: { orderId: string; assignmentId: string }[] = [];
    const failed: { orderId: string; reason: string }[] = [];
    for (const item of toApply) {
      // Chia lại khi nghỉ: hủy phân đơn cũ trước, rồi mới tạo phân đơn mới.
      const original = proposal.items.find(
        (proposalItem) => proposalItem.orderId === item.orderId,
      );
      if (
        original?.originalAssignmentId !== null &&
        original?.originalAssignmentId !== undefined
      ) {
        try {
          await this.assignments.cancel(original.originalAssignmentId, {
            reason: 'Nhân viên nghỉ đột xuất: chia lại',
          }, caller);
        } catch (error) {
          failed.push({
            orderId: item.orderId,
            reason:
              error instanceof Error
                ? error.message
                : `Không hủy được phân đơn cũ ${original.originalAssignmentId}.`,
          });
          continue;
        }
      }
      try {
        const assignment = await this.assignments.create(
          { orderId: item.orderId, kind: 'warehouse', assignedTo: item.assignedTo },
          caller,
        );
        applied.push({ orderId: item.orderId, assignmentId: assignment.id });
      } catch (error) {
        failed.push({
          orderId: item.orderId,
          reason:
            error instanceof Error
              ? error.message
              : `Không tạo được phân đơn cho đơn ${item.orderId}.`,
        });
      }
    }
    if (applied.length > 0) {
      proposal.status = 'Đã áp dụng';
      proposal.decidedBy = caller.username;
      proposal.decidedAt = now;
      proposal.appliedAt = now;
      proposal.updatedAt = now;
      await this.store.save(proposal);
      await this.audit.append({
        actor: caller.username,
        role: caller.roles[0] ?? '',
        action: 'ai-proposal.applied',
        orderId: applied[0].orderId,
        from: 'Chờ duyệt',
        to: 'Đã áp dụng',
        detail: `Áp dụng đề xuất ${proposal.id}: ${applied.length} phân đơn tạo thành công${failed.length > 0 ? `, ${failed.length} mục lỗi` : ''}.`,
      });
    }
    return {
      proposal: JSON.parse(JSON.stringify(proposal)),
      applied,
      failed,
      approvalId: proposal.approvalId,
    };
  }

  // Chia lại khi nhân viên nghỉ đột xuất: lấy toàn bộ phân đơn kho đang
  // hoạt động của người nghỉ, tính lại người nhận tốt nhất cho từng đơn
  // bằng cùng công thức (loại người nghỉ), trả về đề xuất để duyệt trong
  // cùng modal rồi mới áp dụng. Đơn đang làm dở (Đang đóng gói, phân đơn
  // Đang xử lý) thì trạng thái đơn không lùi: phân đơn mới bắt đầu ở Chờ
  // xử lý, người mới bấm "Bắt đầu xử lý" như bình thường.
  async reassign(
    input: ReassignWarehouseInput,
    caller: Caller,
  ): Promise<AiAssignmentProposal> {
    this.requireDispatcher(caller);
    const exclude = [...(input.exclude ?? []), input.assignedTo];
    const active = await this.assignments.list({
      kind: 'warehouse',
      assignedTo: input.assignedTo,
    });
    const toReassign = active.filter((item) =>
      ACTIVE_ASSIGNMENT_STATUSES.includes(item.status),
    );
    const staff = await this.staffList(exclude);
    const stats = await this.staffStats(staff);
    const liveActive = new Map<string, number>();
    for (const [name, stat] of stats) {
      liveActive.set(name, stat.active);
    }
    // Đơn đang làm dở chia lại trước (mốc giao sớm trước như đợt thường).
    const ordersById = new Map<string, Order>();
    for (const item of toReassign) {
      try {
        const order = await this.orders.findOne(item.orderId);
        ordersById.set(item.orderId, order);
      } catch {
        // Đơn không còn thì bỏ qua, không chặn cả đợt chia lại.
      }
    }
    const sorted = [...toReassign].sort((a, b) => {
      const deadlineA = ordersById.get(a.orderId)?.deadline ?? null;
      const deadlineB = ordersById.get(b.orderId)?.deadline ?? null;
      if (deadlineA === null && deadlineB === null) return 0;
      if (deadlineA === null) return 1;
      if (deadlineB === null) return -1;
      return deadlineA.localeCompare(deadlineB);
    });
    const items: ProposalItem[] = [];
    for (const assignment of sorted) {
      if (staff.length === 0) break;
      let best: string | null = null;
      let bestScore = -1;
      for (const name of staff) {
        const stat = stats.get(name);
        if (!stat) continue;
        const active = liveActive.get(name) ?? 0;
        if (active >= OVERLOAD_STANDARD) continue;
        const score = scoreStaff({
          active,
          completed: stat.completed,
          avgMinutes: stat.avgMinutes,
        });
        if (score > bestScore) {
          best = name;
          bestScore = score;
        }
      }
      if (best === null) break;
      const stat = stats.get(best) as StaffStats;
      items.push({
        orderId: assignment.orderId,
        assignedTo: best,
        reason: reasonFor(
          { ...stat, active: liveActive.get(best) ?? 0 },
          best,
        ),
        inputs: {
          active: liveActive.get(best) ?? 0,
          completed: stat.completed,
          avgMinutes: stat.avgMinutes,
          score: bestScore,
        },
        originalAssignmentId: assignment.id,
      });
      liveActive.set(best, (liveActive.get(best) ?? 0) + 1);
    }
    const now = new Date().toISOString();
    const proposal: AiAssignmentProposal = {
      id: this.nextId(),
      kind: 'warehouse',
      status: 'Chờ duyệt',
      items,
      skipped: [],
      overloaded: this.wouldOverload(items, stats),
      approvalId: null,
      requestedBy: caller.username,
      requestedAt: now,
      decidedBy: null,
      decidedAt: null,
      decisionReason: null,
      appliedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.save(proposal);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'ai-proposal.created',
      orderId: items[0]?.orderId ?? '',
      from: null,
      to: 'Chờ duyệt',
      detail: `AI đề xuất chia lại ${items.length} đơn của ${input.assignedTo} (nhân viên nghỉ đột xuất) cho ${new Set(items.map((item) => item.assignedTo)).size} nhân viên kho (${proposal.id}).`,
    });
    return JSON.parse(JSON.stringify(proposal));
  }
}
