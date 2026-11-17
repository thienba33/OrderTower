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
import {
  ASSIGNMENT_STORE,
  CALL_LOG_STORE,
  InMemoryAssignmentStore,
  InMemoryCallLogStore,
} from './assignment.store';
import type {
  Assignment,
  AssignmentKind,
  AssignmentStatus,
  AssignmentStore,
  CallLog,
  CallLogStore,
  CallResult,
  CancelAssignmentInput,
  CreateAssignmentInput,
  CreateCallLogInput,
} from './assignment.types';

const DISPATCHER_ROLE = 'Điều phối viên';
const CSKH_ROLE = 'Nhân viên chăm sóc khách hàng';

// 2 trạng thái phân đơn đang hoạt động: đơn đã có phân đơn ở 1 trong 2
// trạng thái này (theo từng loại) thì không tạo thêm phân đơn cùng loại
// cho đơn đó. Phân đơn đã hoàn thành hoặc đã hủy thì đơn được tạo phân
// đơn mới cùng loại.
const ACTIVE_STATUSES: AssignmentStatus[] = ['Chờ xử lý', 'Đang xử lý'];

function copyAssignment(assignment: Assignment): Assignment {
  return JSON.parse(JSON.stringify(assignment)) as Assignment;
}

function copyCallLog(log: CallLog): CallLog {
  return JSON.parse(JSON.stringify(log)) as CallLog;
}

function requireNonEmpty(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(message);
  }
  return value;
}

function isAssignmentKind(value: unknown): value is AssignmentKind {
  return value === 'telesale' || value === 'warehouse';
}

function isCallResult(value: unknown): value is CallResult {
  return value === 'Thành công' || value === 'Thất bại';
}

// Phân đơn: điều phối viên giao 1 đơn cho 1 tài khoản để gọi điện
// (telesale) hoặc để đóng gói (kho). Người nhận tự bắt đầu xử lý; phân
// đơn kho hoàn thành bằng nút hoàn thành, phân đơn telesale hoàn thành
// bằng cách ghi nhật ký cuộc gọi. Người gọi lấy từ token Keycloak, không
// nhận actor/role từ body.
@Injectable()
export class AssignmentsService implements OnModuleInit {
  private nextNumber = 1001;

  // Store là tham số tùy chọn, mặc định bộ nhớ: kiểm thử đơn vị không cần
  // truyền gì thêm. Khi chạy trong NestJS, mô-đun tiêm kho Postgres.
  constructor(
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
    @Optional()
    @Inject(ASSIGNMENT_STORE)
    private readonly store: AssignmentStore = new InMemoryAssignmentStore(),
  ) {}

  // Tiếp tục số thứ tự từ kho: đã có PC-1001 thì phân đơn mới là PC-1002,
  // không quay về PC-1001 sau khi khởi động lại.
  async onModuleInit(): Promise<void> {
    const assignments = await this.store.list();
    this.nextNumber = computeNextNumber(
      assignments.map((item) => item.id),
      'PC',
    );
  }

  async create(
    input: CreateAssignmentInput,
    caller: Caller,
  ): Promise<Assignment> {
    const orderId = requireNonEmpty(
      input.orderId,
      'Tạo phân đơn cần có mã đơn.',
    ).trim();
    if (!isAssignmentKind(input.kind)) {
      throw new BadRequestException(
        'Loại phân đơn chỉ là "telesale" hoặc "warehouse".',
      );
    }
    const assignedTo = requireNonEmpty(
      input.assignedTo,
      'Tạo phân đơn cần có tên tài khoản được giao.',
    ).trim();
    if (!caller.roles.includes(DISPATCHER_ROLE)) {
      // Lỗi lúc tạo không ghi audit, giống tạo trả hàng sai vai: chỉ ghi
      // audit khi phân đơn đã được tạo thật.
      throw new ConflictException(
        `Tạo phân đơn cần vai ${DISPATCHER_ROLE}.`,
      );
    }
    // Đơn không tồn tại thì báo 404, không ghi audit, giống đơn không tồn
    // tại lúc tạo trả hàng.
    await this.orders.findOne(orderId);
    const existing = await this.store.findByOrderIdAndKind(
      orderId,
      input.kind,
    );
    const active = existing.find((item) =>
      ACTIVE_STATUSES.includes(item.status),
    );
    if (active) {
      throw new ConflictException(
        `Đơn ${orderId} đã có phân đơn ${input.kind === 'telesale' ? 'gọi điện' : 'kho'} đang xử lý (${active.id}, trạng thái "${active.status}").`,
      );
    }
    const now = new Date().toISOString();
    const assignment: Assignment = {
      id: `PC-${String(this.nextNumber++).padStart(4, '0')}`,
      orderId,
      kind: input.kind,
      assignedTo,
      assignedBy: caller.username,
      status: 'Chờ xử lý',
      cancelReason: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.save(assignment);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'assignment.created',
      // Audit log dùng chung trường orderId cho mã thực thể nghiệp vụ.
      orderId,
      from: null,
      to: 'Chờ xử lý',
      detail: `Phân đơn ${input.kind === 'telesale' ? 'gọi điện' : 'kho'} ${assignment.id} cho ${assignedTo}.`,
    });
    return copyAssignment(assignment);
  }

  async get(id: string): Promise<Assignment> {
    const assignment = await this.store.findById(id);
    if (!assignment) {
      throw new NotFoundException(`Không tìm thấy phân đơn ${id}.`);
    }
    return copyAssignment(assignment);
  }

  async list(
    filters: {
      orderId?: string;
      assignedTo?: string;
      kind?: AssignmentKind;
      status?: AssignmentStatus;
    } = {},
  ): Promise<Assignment[]> {
    const assignments = await this.store.list();
    return assignments.filter(
      (item) =>
        (filters.orderId === undefined ||
          item.orderId === filters.orderId) &&
        (filters.assignedTo === undefined ||
          item.assignedTo === filters.assignedTo) &&
        (filters.kind === undefined || item.kind === filters.kind) &&
        (filters.status === undefined || item.status === filters.status),
    );
  }

  async start(id: string, caller: Caller): Promise<Assignment> {
    const assignment = await this.get(id);
    // Tính lý do từ chối vào biến trước rồi mới từ chối 1 lần: TypeScript
    // không thu hẹp kiểu sau khi gọi hàm mũi tên gắn nhãn : never, nên
    // không viết kiểm tra nối tiếp nhau rồi gọi deny() trong từng nhánh.
    let denyMessage: string | null = null;
    if (assignment.status !== 'Chờ xử lý') {
      denyMessage = `Phân đơn ${id} đang ở trạng thái "${assignment.status}", chỉ bắt đầu xử lý khi phân đơn ở "Chờ xử lý".`;
    } else if (
      caller.username !== assignment.assignedTo &&
      !caller.roles.includes(DISPATCHER_ROLE)
    ) {
      denyMessage = `Bắt đầu phân đơn ${id} chỉ dành cho ${assignment.assignedTo} hoặc vai ${DISPATCHER_ROLE}.`;
    }
    if (denyMessage) {
      await this.denyTransition(assignment, 'Đang xử lý', caller, denyMessage);
    }
    const now = new Date().toISOString();
    assignment.status = 'Đang xử lý';
    assignment.updatedAt = now;
    await this.store.save(assignment);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'assignment.started',
      orderId: assignment.orderId,
      from: 'Chờ xử lý',
      to: 'Đang xử lý',
      detail: `Phân đơn ${id} cho đơn ${assignment.orderId} bắt đầu xử lý.`,
    });
    return copyAssignment(assignment);
  }

  async complete(id: string, caller: Caller): Promise<Assignment> {
    const assignment = await this.get(id);
    // Hoàn thành trực tiếp chỉ dành cho phân đơn kho: phân đơn telesale
    // hoàn thành bằng cách ghi nhật ký cuộc gọi, nên báo 400 (không ghi
    // audit, giống lỗi kiểm tra đầu vào khác).
    if (assignment.kind !== 'warehouse') {
      throw new BadRequestException(
        'Phân đơn gọi điện hoàn thành bằng cách ghi nhật ký cuộc gọi, không hoàn thành trực tiếp.',
      );
    }
    let denyMessage: string | null = null;
    if (assignment.status !== 'Đang xử lý') {
      denyMessage = `Phân đơn ${id} đang ở trạng thái "${assignment.status}", chỉ hoàn thành khi phân đơn ở "Đang xử lý".`;
    } else if (
      caller.username !== assignment.assignedTo &&
      !caller.roles.includes(DISPATCHER_ROLE)
    ) {
      denyMessage = `Hoàn thành phân đơn ${id} chỉ dành cho ${assignment.assignedTo} hoặc vai ${DISPATCHER_ROLE}.`;
    }
    if (denyMessage) {
      await this.denyTransition(assignment, 'Hoàn thành', caller, denyMessage);
    }
    const now = new Date().toISOString();
    assignment.status = 'Hoàn thành';
    assignment.updatedAt = now;
    await this.store.save(assignment);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'assignment.completed',
      orderId: assignment.orderId,
      from: 'Đang xử lý',
      to: 'Hoàn thành',
      detail: `Phân đơn ${id} cho đơn ${assignment.orderId} đã hoàn thành.`,
    });
    return copyAssignment(assignment);
  }

  async cancel(
    id: string,
    input: CancelAssignmentInput,
    caller: Caller,
  ): Promise<Assignment> {
    const reason = requireNonEmpty(
      input.reason,
      'Hủy phân đơn cần có lý do.',
    ).trim();
    const assignment = await this.get(id);
    let denyMessage: string | null = null;
    if (!ACTIVE_STATUSES.includes(assignment.status)) {
      denyMessage = `Phân đơn ${id} đang ở trạng thái "${assignment.status}", chỉ hủy khi phân đơn còn đang xử lý.`;
    } else if (!caller.roles.includes(DISPATCHER_ROLE)) {
      denyMessage = `Hủy phân đơn cần vai ${DISPATCHER_ROLE}.`;
    }
    if (denyMessage) {
      await this.denyTransition(assignment, 'Đã hủy', caller, denyMessage);
    }
    const now = new Date().toISOString();
    const from = assignment.status;
    assignment.status = 'Đã hủy';
    assignment.cancelReason = reason;
    assignment.updatedAt = now;
    await this.store.save(assignment);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'assignment.cancelled',
      orderId: assignment.orderId,
      from,
      to: 'Đã hủy',
      detail: `Lý do hủy: ${reason}.`,
    });
    return copyAssignment(assignment);
  }

  private async denyTransition(
    assignment: Assignment,
    to: AssignmentStatus,
    caller: Caller,
    message: string,
  ): Promise<never> {
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'assignment.transition.denied',
      orderId: assignment.orderId,
      from: assignment.status,
      to,
      detail: message,
    });
    throw new ConflictException(message);
  }
}

// Nhật ký cuộc gọi: nhân viên CSKH ghi lại kết quả gọi cho đơn được phân
// telesale. Ghi nhật ký xong thì phân đơn đó tự sang "Hoàn thành" (2 bước
// nối tiếp, không chung 1 giao dịch, cùng loại hạn chế đã biết của các mô
// đun khác: lưu nhật ký rồi mới đổi trạng thái phân đơn).
@Injectable()
export class CallLogsService implements OnModuleInit {
  private nextNumber = 1001;

  constructor(
    private readonly audit: AuditService,
    @Optional()
    @Inject(ASSIGNMENT_STORE)
    private readonly assignments: AssignmentStore = new InMemoryAssignmentStore(),
    @Optional()
    @Inject(CALL_LOG_STORE)
    private readonly store: CallLogStore = new InMemoryCallLogStore(),
  ) {}

  // Tiếp tục số thứ tự từ kho: đã có CG-1001 thì nhật ký mới là CG-1002,
  // không quay về CG-1001 sau khi khởi động lại.
  async onModuleInit(): Promise<void> {
    const logs = await this.store.list();
    this.nextNumber = computeNextNumber(
      logs.map((log) => log.id),
      'CG',
    );
  }

  async create(
    input: CreateCallLogInput,
    caller: Caller,
  ): Promise<CallLog> {
    const assignmentId = requireNonEmpty(
      input.assignmentId,
      'Ghi nhật ký cuộc gọi cần có mã phân đơn.',
    ).trim();
    if (!isCallResult(input.result)) {
      throw new BadRequestException(
        'Kết quả cuộc gọi chỉ là "Thành công" hoặc "Thất bại".',
      );
    }
    if (
      typeof input.durationSeconds !== 'number' ||
      !Number.isFinite(input.durationSeconds) ||
      input.durationSeconds < 0
    ) {
      throw new BadRequestException(
        'Thời lượng cuộc gọi phải là số giây không âm.',
      );
    }
    let note: string | null = null;
    if (input.note !== undefined) {
      if (typeof input.note !== 'string') {
        throw new BadRequestException('Ghi chú cuộc gọi phải là chuỗi.');
      }
      note = input.note.trim() === '' ? null : input.note.trim();
    }
    if (!caller.roles.includes(CSKH_ROLE)) {
      // Lỗi lúc tạo không ghi audit, giống tạo phân đơn sai vai: chỉ ghi
      // audit khi nhật ký đã được tạo thật.
      throw new ConflictException(`Ghi nhật ký cuộc gọi cần vai ${CSKH_ROLE}.`);
    }
    // Phân đơn không tồn tại thì báo 404, không ghi audit.
    const assignment = await this.assignments.findById(assignmentId);
    if (!assignment) {
      throw new NotFoundException(`Không tìm thấy phân đơn ${assignmentId}.`);
    }
    // Phân đơn kho không ghi nhật ký cuộc gọi: báo 400, không ghi audit.
    if (assignment.kind !== 'telesale') {
      throw new BadRequestException(
        'Chỉ phân đơn gọi điện mới ghi nhật ký cuộc gọi.',
      );
    }
    let denyMessage: string | null = null;
    if (assignment.status !== 'Đang xử lý') {
      denyMessage = `Phân đơn ${assignmentId} đang ở trạng thái "${assignment.status}", chỉ ghi nhật ký cuộc gọi khi phân đơn ở "Đang xử lý".`;
    } else if (caller.username !== assignment.assignedTo) {
      denyMessage = `Ghi nhật ký cuộc gọi cho phân đơn ${assignmentId} chỉ dành cho ${assignment.assignedTo}.`;
    }
    if (denyMessage) {
      await this.audit.append({
        actor: caller.username,
        role: caller.roles[0] ?? '',
        action: 'call-log.transition.denied',
        orderId: assignment.orderId,
        from: assignment.status,
        to: 'Hoàn thành',
        detail: denyMessage,
      });
      throw new ConflictException(denyMessage);
    }
    const now = new Date().toISOString();
    const log: CallLog = {
      id: `CG-${String(this.nextNumber++).padStart(4, '0')}`,
      assignmentId,
      orderId: assignment.orderId,
      caller: caller.username,
      result: input.result,
      durationSeconds: input.durationSeconds,
      note,
      createdAt: now,
    };
    await this.store.save(log);
    assignment.status = 'Hoàn thành';
    assignment.updatedAt = now;
    await this.assignments.save(assignment);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'call-log.created',
      orderId: assignment.orderId,
      from: 'Đang xử lý',
      to: 'Hoàn thành',
      detail:
        `Nhật ký ${log.id} cho phân đơn ${assignmentId}: ${input.result}, ${input.durationSeconds} giây.` +
        (note ? ` Ghi chú: ${note}.` : ''),
    });
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'assignment.completed',
      orderId: assignment.orderId,
      from: 'Đang xử lý',
      to: 'Hoàn thành',
      detail: `Phân đơn ${assignmentId} hoàn thành qua nhật ký cuộc gọi ${log.id}.`,
    });
    return copyCallLog(log);
  }

  async list(
    filters: {
      orderId?: string;
      caller?: string;
      assignmentId?: string;
    } = {},
  ): Promise<CallLog[]> {
    const logs = await this.store.list();
    return logs.filter(
      (log) =>
        (filters.orderId === undefined ||
          log.orderId === filters.orderId) &&
        (filters.caller === undefined || log.caller === filters.caller) &&
        (filters.assignmentId === undefined ||
          log.assignmentId === filters.assignmentId),
    );
  }
}
