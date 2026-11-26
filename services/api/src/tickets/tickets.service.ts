// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { APPROVER_ROLES } from '../approvals/approval.service';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { computeNextNumber } from '../db/id-counter';
import { InMemoryTicketStore, TICKET_STORE } from './tickets.store';
import type {
  ChangeTicketStatusInput,
  CreateTicketInput,
  Ticket,
  TicketChannel,
  TicketKpis,
  TicketSeedItem,
  TicketStatus,
  TicketStore,
  TicketType,
} from './tickets.types';

const CSKH_ROLE = 'Nhân viên chăm sóc khách hàng';
// Tạo ticket và đổi trạng thái: CSKH làm, Quản lý hoặc Quản trị viên
// cũng làm được; Điều phối viên, Nhân viên kho, Tài xế thì không.
const TICKET_WRITE_ROLES = [CSKH_ROLE, ...APPROVER_ROLES];

// Ticket chỉ đi xuôi 1 bước mỗi lần, không nhảy cóc, không quay lại.
const NEXT_STATUS: Record<Exclude<TicketStatus, 'Đã đóng'>, TicketStatus> = {
  Mới: 'Đang xử lý',
  'Đang xử lý': 'Chờ khách',
  'Chờ khách': 'Đã đóng',
};

const TICKET_STATUSES: TicketStatus[] = [
  'Mới',
  'Đang xử lý',
  'Chờ khách',
  'Đã đóng',
];

const TICKET_TYPES: TicketType[] = [
  'Giao trễ',
  'Hoàn hàng',
  'Đổi địa chỉ',
  'Xác nhận COD',
  'Hỏi sản phẩm',
];

const TICKET_CHANNELS: TicketChannel[] = ['Điện thoại', 'Chat', 'Web'];

// Tên tệp seed mặc định. Đổi tệp seed rồi khởi động lại thì kho mới có
// hiệu lực.
const DEFAULT_SEED_FILE = 'tickets.seed.json';
// Ngày đóng băng của dữ liệu mẫu (apps/web/data/cskh.ts): giờ cập nhật
// HH:MM trong tệp seed là giờ trong ngày này.
const SEED_DATE = '2026-11-02';

function copyTicket(ticket: Ticket): Ticket {
  return JSON.parse(JSON.stringify(ticket)) as Ticket;
}

function requireNonEmpty(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(message);
  }
  return value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// Ngày dương lịch YYYY-MM-DD theo giờ Việt Nam, để KPI "Đã đóng hôm nay"
// đếm theo ngày làm việc của đội CSKH, không theo ngày UTC.
function vietnamDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

// 4 KPI đầu của màn CSKH, tính trực tiếp từ danh sách ticket lúc đọc,
// không lưu bền. "Đã đóng hôm nay" đếm ticket đóng trong ngày hiện tại
// theo giờ Việt Nam, không phải số dòng đang ở trạng thái "Đã đóng".
export function computeTicketKpis(
  tickets: Ticket[],
  now: Date = new Date(),
): TicketKpis {
  const today = vietnamDate(now);
  return {
    newRequests: tickets.filter((ticket) => ticket.status === 'Mới').length,
    inProgress: tickets.filter((ticket) => ticket.status === 'Đang xử lý')
      .length,
    waitingCustomer: tickets.filter(
      (ticket) => ticket.status === 'Chờ khách',
    ).length,
    closedToday: tickets.filter(
      (ticket) =>
        ticket.status === 'Đã đóng' &&
        ticket.closedAt !== null &&
        vietnamDate(new Date(ticket.closedAt)) === today,
    ).length,
  };
}

// Quản lý ticket CSKH: CSKH tạo ticket khi khách gửi yêu cầu, đổi trạng
// thái xuôi từng bước khi xử lý xong. Người gọi lấy từ token Keycloak,
// không nhận actor/role từ body.
@Injectable()
export class TicketsService implements OnModuleInit {
  private readonly logger = new Logger(TicketsService.name);
  private nextNumber = 1001;

  // Store là tham số tùy chọn, mặc định bộ nhớ: kiểm thử đơn vị không cần
  // truyền gì thêm. Khi chạy trong NestJS, mô-đun tiêm kho Postgres.
  constructor(
    private readonly audit: AuditService,
    @Optional()
    @Inject(TICKET_STORE)
    private readonly store: TicketStore = new InMemoryTicketStore(),
  ) {}

  // Nạp 14 dòng mẫu đóng băng khi bảng còn trống; đã có dữ liệu thì giữ
  // nguyên. Số thứ tự tiếp tục từ số lớn nhất đã có trong kho, khởi động
  // lại API không quay về YC-1001.
  async onModuleInit(): Promise<void> {
    // Đọc và kiểm tra seed trước: tệp seed sai vẫn chặn khởi động, dù kho
    // đã có dữ liệu.
    const seed = this.loadSeed();
    const existing = await this.store.list();
    if (existing.length === 0) {
      for (const item of seed) {
        const at = new Date(`${SEED_DATE}T${item.updated}:00+07:00`);
        await this.store.save({
          id: item.id,
          customer: item.customer,
          orderId: item.orderId,
          type: item.type,
          channel: item.channel,
          content: item.content,
          status: item.status,
          handler: item.handler,
          needsCall: item.needsCall,
          createdBy: 'seed',
          createdAt: at.toISOString(),
          updatedAt: at.toISOString(),
          closedAt: item.status === 'Đã đóng' ? at.toISOString() : null,
        });
      }
      this.logger.log(`Đã nạp ${seed.length} ticket mẫu từ tệp seed.`);
    } else {
      this.logger.log(
        `Kho đã có ${existing.length} ticket trong DB, giữ nguyên dữ liệu.`,
      );
    }
    const all = await this.store.list();
    this.nextNumber = computeNextNumber(
      all.map((ticket) => ticket.id),
      'YC',
    );
  }

  resolveSeedPath(): string {
    if (process.env.TICKETS_SEED_PATH) {
      return process.env.TICKETS_SEED_PATH;
    }
    return join(__dirname, 'data', DEFAULT_SEED_FILE);
  }

  async create(
    input: CreateTicketInput,
    caller: Caller,
  ): Promise<Ticket> {
    const customer = requireNonEmpty(
      input.customer,
      'Tạo ticket cần có mã khách.',
    ).trim();
    const orderId = requireNonEmpty(
      input.orderId,
      'Tạo ticket cần có mã đơn.',
    ).trim();
    if (!TICKET_TYPES.includes(input.type)) {
      throw new BadRequestException(
        `Loại ticket phải là 1 trong: ${TICKET_TYPES.join(', ')}.`,
      );
    }
    if (!TICKET_CHANNELS.includes(input.channel)) {
      throw new BadRequestException(
        `Kênh ticket phải là 1 trong: ${TICKET_CHANNELS.join(', ')}.`,
      );
    }
    const content = requireNonEmpty(
      input.content,
      'Tạo ticket cần có nội dung.',
    ).trim();
    if (input.needsCall !== undefined && typeof input.needsCall !== 'boolean') {
      throw new BadRequestException('needsCall phải là true hoặc false.');
    }
    if (!TICKET_WRITE_ROLES.some((role) => caller.roles.includes(role))) {
      // Lỗi lúc tạo không ghi audit, giống tạo cờ hạn chế sai vai: chỉ ghi
      // audit khi ticket đã được tạo thật.
      throw new ConflictException(
        `Tạo ticket cần vai ${TICKET_WRITE_ROLES.join(' hoặc ')}.`,
      );
    }
    const now = new Date().toISOString();
    const ticket: Ticket = {
      id: `YC-${String(this.nextNumber++).padStart(4, '0')}`,
      customer,
      // Mã đơn là chuỗi tự do, không kiểm tra đơn có thật: 14 dòng mẫu
      // tham chiếu DH-1015..DH-1058, không tồn tại trong seed đơn.
      orderId,
      type: input.type,
      channel: input.channel,
      content,
      status: 'Mới',
      handler: 'Chưa gán',
      // Mặc định vào nhóm "chưa gọi lại" khi loại là "Giao trễ" hoặc khi
      // lúc tạo có ghi chú cần gọi lại.
      needsCall: input.needsCall === true || input.type === 'Giao trễ',
      createdBy: caller.username,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };
    await this.store.save(ticket);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'ticket.created',
      orderId,
      from: null,
      to: 'Mới',
      detail: `Ticket ${ticket.id} cho đơn ${orderId} (khách ${customer}, loại "${input.type}", kênh "${input.channel}").`,
    });
    return copyTicket(ticket);
  }

  async get(id: string): Promise<Ticket> {
    return this.getTicket(id);
  }

  async list(
    filters: {
      type?: TicketType;
      status?: TicketStatus;
      channel?: TicketChannel;
      needsCall?: boolean;
      q?: string;
    } = {},
  ): Promise<Ticket[]> {
    const tickets = await this.store.list();
    const query =
      filters.q === undefined ? undefined : filters.q.trim().toLowerCase();
    return tickets
      .filter(
        (ticket) =>
          (filters.type === undefined || ticket.type === filters.type) &&
          (filters.status === undefined ||
            ticket.status === filters.status) &&
          (filters.channel === undefined ||
            ticket.channel === filters.channel) &&
          (filters.needsCall === undefined ||
            ticket.needsCall === filters.needsCall) &&
          (query === undefined ||
            query === '' ||
            ticket.id.toLowerCase().includes(query) ||
            ticket.customer.toLowerCase().includes(query) ||
            ticket.orderId.toLowerCase().includes(query)),
      )
      .sort((a, b) => b.id.localeCompare(a.id));
  }

  async kpis(now: Date = new Date()): Promise<TicketKpis> {
    const tickets = await this.store.list();
    return computeTicketKpis(tickets, now);
  }

  // Đổi trạng thái ticket, chỉ đi xuôi 1 bước mỗi lần. Kiểm trạng thái
  // trước, kiểm quyền sau, giống thứ tự ở cờ hạn chế và phân đơn.
  async changeStatus(
    id: string,
    input: ChangeTicketStatusInput,
    caller: Caller,
  ): Promise<Ticket> {
    if (!TICKET_STATUSES.includes(input.status)) {
      throw new BadRequestException(
        `Trạng thái ticket phải là 1 trong: ${TICKET_STATUSES.join(', ')}.`,
      );
    }
    const ticket = await this.getTicket(id);
    // Tính lý do từ chối vào biến trước rồi mới từ chối 1 lần: TypeScript
    // không thu hẹp kiểu sau khi gọi hàm mũi tên gắn nhãn : never, nên
    // không viết kiểm tra nối tiếp nhau rồi gọi deny() trong từng nhánh.
    let denyMessage: string | null = null;
    const expected =
      ticket.status === 'Đã đóng'
        ? null
        : NEXT_STATUS[ticket.status as Exclude<TicketStatus, 'Đã đóng'>];
    if (expected === null) {
      denyMessage = `Ticket ${id} đã ở trạng thái "Đã đóng", không đổi trạng thái nữa.`;
    } else if (input.status !== expected) {
      denyMessage =
        `Ticket ${id} đang ở trạng thái "${ticket.status}", chỉ đổi sang "${expected}", không đổi thẳng sang "${input.status}".`;
    } else if (
      !TICKET_WRITE_ROLES.some((role) => caller.roles.includes(role))
    ) {
      denyMessage = `Đổi trạng thái ticket cần vai ${TICKET_WRITE_ROLES.join(' hoặc ')}.`;
    }
    if (denyMessage) {
      await this.denyTransition(ticket, input.status, caller, denyMessage);
    }
    const now = new Date().toISOString();
    const fromStatus = ticket.status;
    ticket.status = input.status;
    ticket.updatedAt = now;
    if (input.status === 'Đã đóng') {
      ticket.closedAt = now;
    }
    await this.store.save(ticket);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'ticket.status.changed',
      orderId: ticket.orderId,
      from: fromStatus,
      to: input.status,
      detail: `Ticket ${id} đổi trạng thái từ "${fromStatus}" sang "${input.status}".`,
    });
    return copyTicket(ticket);
  }

  private async getTicket(id: string): Promise<Ticket> {
    const ticket = await this.store.findById(id);
    if (!ticket) {
      throw new NotFoundException(`Không tìm thấy ticket ${id}.`);
    }
    return copyTicket(ticket);
  }

  private async denyTransition(
    ticket: Ticket,
    to: TicketStatus,
    caller: Caller,
    message: string,
  ): Promise<never> {
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'ticket.transition.denied',
      orderId: ticket.orderId,
      from: ticket.status,
      to,
      detail: message,
    });
    throw new ConflictException(message);
  }

  private loadSeed(): TicketSeedItem[] {
    const path = this.resolveSeedPath();
    let raw: string;
    try {
      raw = readFileSync(path, 'utf-8');
    } catch (error) {
      throw new Error(
        `Không đọc được tệp seed ticket tại ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      throw new Error(
        `Tệp seed ticket tại ${path} không phải JSON hợp lệ: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(
        `Tệp seed ticket tại ${path} không hợp lệ: nội dung phải là 1 object JSON.`,
      );
    }
    const items = (parsed as { items?: unknown }).items;
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error(
        `Tệp seed ticket tại ${path} không hợp lệ: items phải là mảng không rỗng.`,
      );
    }
    const seen = new Set<string>();
    for (const entry of items as unknown[]) {
      if (typeof entry !== 'object' || entry === null) {
        throw new Error(
          `Tệp seed ticket tại ${path} không hợp lệ: mỗi item phải là 1 object.`,
        );
      }
      const row = entry as Record<string, unknown>;
      for (const field of [
        'id',
        'customer',
        'orderId',
        'type',
        'channel',
        'content',
        'status',
        'handler',
      ]) {
        if (!isNonEmptyString(row[field])) {
          throw new Error(
            `Tệp seed ticket tại ${path} không hợp lệ: mỗi item cần ${field} dạng chuỗi.`,
          );
        }
      }
      if (!TICKET_TYPES.includes(row.type as TicketType)) {
        throw new Error(
          `Tệp seed ticket tại ${path} không hợp lệ: type "${String(row.type)}" không phải 1 trong 5 loại.`,
        );
      }
      if (!TICKET_CHANNELS.includes(row.channel as TicketChannel)) {
        throw new Error(
          `Tệp seed ticket tại ${path} không hợp lệ: channel "${String(row.channel)}" không phải 1 trong 3 kênh.`,
        );
      }
      if (!TICKET_STATUSES.includes(row.status as TicketStatus)) {
        throw new Error(
          `Tệp seed ticket tại ${path} không hợp lệ: status "${String(row.status)}" không phải 1 trong 4 trạng thái.`,
        );
      }
      if (
        typeof row.updated !== 'string' ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.updated)
      ) {
        throw new Error(
          `Tệp seed ticket tại ${path} không hợp lệ: updated của ${String(row.id)} phải dạng HH:MM.`,
        );
      }
      if (typeof row.needsCall !== 'boolean') {
        throw new Error(
          `Tệp seed ticket tại ${path} không hợp lệ: needsCall của ${String(row.id)} phải là true hoặc false.`,
        );
      }
      if (seen.has(row.id as string)) {
        throw new Error(
          `Tệp seed ticket tại ${path} không hợp lệ: id ${String(row.id)} bị trùng.`,
        );
      }
      seen.add(row.id as string);
    }
    return items as TicketSeedItem[];
  }
}
