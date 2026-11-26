// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import {
  AddressService,
  MIN_ADDRESS_TRUST,
} from '../address/address.service';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { ChannelsService } from '../channels/channel.service';
import { isDriverOnly } from '../auth/permissions';
import { CustomersService } from '../customers/customer.service';
import { DriversService } from '../drivers/driver.service';
import { InventoryService } from '../inventory/inventory.service';
import { ApprovalService } from '../approvals/approval.service';
import type { Approval } from '../approvals/approval.types';
import type { Queryable } from '../db/db.types';
import { DbService } from '../db/db.service';
import { computeNextNumber } from '../db/id-counter';
import { IdSequenceService } from '../db/id-sequence';
import { OutboxService } from '../outbox/outbox.service';
import type { Return } from '../returns/return.types';
import { WorkflowInstanceService } from '../workflow/instance.service';
import type { WorkflowInstance } from '../workflow/instance.types';
import { WorkflowTransitionDeniedError } from '../workflow/instance.types';
import { WorkflowService } from '../workflow/workflow.service';
import { InMemoryOrderStore, ORDER_STORE } from './orders.store';
import type { OrderStore } from './orders.types';
import {
  ORDER_RETURN_GATE,
  type OrderReturnGate,
} from './order-return-gate';
import {
  ORDER_SHIPMENT_GATE,
  type OrderShipmentGate,
} from './order-shipment-gate';
import type {
  CreateOrderInput,
  Order,
  OrderItem,
  OrderSeedItem,
  TransitionOrderInput,
  UpdateOrderInput,
} from './orders.types';

// Trạng thái đóng: không còn chuyển nào đi ra, mọi thao tác đều bị chặn.
const CLOSED_STATES = ['Hoàn', 'Hủy'];

// Trạng thái chưa giữ hàng: còn sửa được mặt hàng. Từ "Đang đóng gói" trở đi
// kho đã giữ hàng cho đơn nên mặt hàng bị khóa, chỉ sửa được khách và địa chỉ.
const EDITABLE_ITEMS_STATES = ['Mới tạo', 'Đã kiểm tra', 'Chờ kho'];

// Tên tệp seed mặc định. Đổi tệp seed rồi khởi động lại thì đơn mẫu mới có hiệu lực.
const DEFAULT_SEED_FILE = 'orders.seed.json';

// Người gọi lúc nạp seed: tài khoản hệ thống "seed". Audit ghi actor là
// seed, vai đầu là Quản trị viên. Cần cả Điều phối viên (chuyển đơn tới
// Đã kiểm tra/Chờ kho) và Nhân viên kho (chuyển tới Đang đóng gói/Chờ điều
// xe) vì chuyển trạng thái kiểm vai theo định nghĩa; chỉ có Quản trị viên
// thì mọi chuyển đều bị từ chối 409.
const SEED_CALLER: Caller = {
  userId: 'seed',
  username: 'seed',
  roles: ['Quản trị viên', 'Điều phối viên', 'Nhân viên kho'],
};

// Đường chuyển hợp lệ tới từng trạng thái đích của đơn mẫu, theo đúng
// 10 chuyển trong order-flow.v1.json. Không seed đơn Đang giao/Đã giao
// vì cần shipment.
const SEED_TARGET_TRANSITIONS: Record<string, string[]> = {
  'Mới tạo': [],
  'Đã kiểm tra': ['Đã kiểm tra'],
  'Chờ kho': ['Đã kiểm tra', 'Chờ kho'],
  'Đang đóng gói': ['Đã kiểm tra', 'Chờ kho', 'Đang đóng gói'],
  'Chờ điều xe': ['Đã kiểm tra', 'Chờ kho', 'Đang đóng gói', 'Chờ điều xe'],
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// Lỗi từ chối chuyển trạng thái được ném ra khỏi transaction để service ghi
// audit denial sau khi rollback, không giữ khóa order/instance.
class OrderTransitionDeniedError extends Error {
  constructor(
    public readonly reason: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(reason);
    this.name = 'OrderTransitionDeniedError';
  }
}

// Đơn hàng nghiệp vụ: tạo, chuyển trạng thái qua Workflow engine, sửa.
// Trạng thái luồng sống ở workflow instance, đơn chỉ giữ mã instance và đồng
// bộ trạng thái sau mỗi lần chuyển.
@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);
  private nextNumber = 1001;
  // Số thứ tự riêng cho đơn lịch sử (mã LS-): tách khỏi dãy DH- của đơn
  // tạo tay và đơn demo, để đơn tạo tay đầu tiên sau khi nạp seed lịch sử
  // vẫn là DH-1009. Tính lại lúc khởi động từ id LS- đã lưu, giống dãy DH-.
  private nextHistoricalNumber = 1001;

  // Store là tham số tùy chọn, mặc định bộ nhớ: kiểm thử đơn vị cũ không cần
  // truyền gì thêm. Khi chạy trong NestJS, mô-đun tiêm kho Postgres.
  constructor(
    private readonly workflow: WorkflowService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly address: AddressService,
    private readonly instances: WorkflowInstanceService,
    private readonly approvals: ApprovalService,
    @Optional()
    @Inject(ORDER_STORE)
    private readonly store: OrderStore = new InMemoryOrderStore(),
    // Cổng đọc shipment tùy chọn: có khi chạy qua mô-đun (ShipmentsModule
    // đăng ký adapter), không có khi dựng service bằng tay trong kiểm thử.
    @Optional()
    @Inject(ORDER_SHIPMENT_GATE)
    private readonly shipmentGate?: OrderShipmentGate,
    // Kênh bán tùy chọn, đặt cuối: có khi chạy qua mô-đun (OrdersModule
    // nhập ChannelsModule), không có khi dựng service bằng tay trong kiểm
    // thử. Khi không có mà đơn kèm channelId thì chặn luôn vì không kiểm
    // tra được kênh thật.
    @Optional()
    private readonly channels?: ChannelsService,
    // Khách hàng tùy chọn, đặt cuối cùng: có khi chạy qua mô-đun
    // (OrdersModule nhập CustomersModule), không có khi dựng service bằng
    // tay trong kiểm thử. Khi không có mà đơn kèm customerId thì chặn luôn
    // vì không kiểm tra được khách thật.
    @Optional()
    private readonly customers?: CustomersService,
    // Cổng đọc trả hàng tùy chọn, đặt sau cùng: có khi chạy qua mô-đun
    // (ReturnsModule đăng ký adapter), không có khi dựng service bằng tay
    // trong kiểm thử. Khi không có mà đóng đơn bằng returnId thì chặn
    // luôn vì không kiểm tra được trả hàng thật.
    @Optional()
    @Inject(ORDER_RETURN_GATE)
    private readonly returnGate?: OrderReturnGate,
    // Tài xế chỉ được đọc đơn có shipment giao cho chính mình; cần tra
    // driver theo username. Optional để test đơn vị cũ dựng service bằng
    // tay không phải sửa.
    @Optional()
    private readonly drivers?: DriversService,
    // Các phụ thuộc hạ tầng đặt cuối, optional để test in-memory cũ không
    // phải sửa. Khi chạy qua NestJS, module cấp DbService/OutboxService/
    // IdSequenceService.
    @Optional()
    private readonly db?: DbService,
    @Optional()
    private readonly outbox?: OutboxService,
    @Optional()
    private readonly idSequence?: IdSequenceService,
  ) {}

  // Nạp 8 đơn mẫu qua đường dịch vụ thật (create rồi transition hợp lệ
  // tới trạng thái đích) khi bảng đơn còn trống, để demo không cần tạo
  // đơn bằng tay hay chạy lệnh trước. Đơn mẫu đi qua đúng workflow
  // instance, audit và giữ hàng như đơn tạo qua API nên số liệu khớp
  // nhau; bảng đã có dữ liệu thì giữ nguyên, khởi động lại không nạp lại.
  // Thứ tự khởi động của NestJS bảo đảm các mô-đun phụ thuộc đã nạp
  // trước: Workflow (định nghĩa luồng), Inventory (tồn kho cho rào chắn),
  // Channels (kênh K-1001..K-1003), Address (danh mục chấm tin cậy).
  async onModuleInit(): Promise<void> {
    // Đọc và kiểm tra seed trước: tệp seed sai vẫn chặn khởi động, dù kho
    // đã có dữ liệu.
    const seed = this.loadSeed();
    const existing = await this.store.list();
    if (existing.length > 0) {
      this.logger.log(
        `Bảng đã có ${existing.length} đơn trong DB, giữ nguyên dữ liệu.`,
      );
    } else {
      for (const item of seed) {
        const created = await this.create(
          {
            idempotencyKey: item.idempotencyKey,
            customer: item.customer,
            ...(item.phone !== undefined ? { phone: item.phone } : {}),
            items: item.items,
            ...(item.channelId !== undefined
              ? { channelId: item.channelId }
              : {}),
            ...(item.address !== undefined
              ? { address: item.address }
              : {}),
            ...(item.deadline !== undefined
              ? { deadline: item.deadline }
              : {}),
          },
          SEED_CALLER,
        );
        for (const to of SEED_TARGET_TRANSITIONS[item.targetState]) {
          await this.transition(created.id, { to }, SEED_CALLER);
        }
      }
      this.logger.log(`Đã nạp ${seed.length} đơn mẫu từ tệp seed.`);
    }
    const orders = await this.store.list();
    this.nextNumber = computeNextNumber(
      orders.map((order) => order.id),
      'DH',
    );
    this.nextHistoricalNumber = computeNextNumber(
      orders.map((order) => order.id),
      'LS',
    );
  }

  resolveSeedPath(): string {
    if (process.env.ORDERS_SEED_PATH) {
      return process.env.ORDERS_SEED_PATH;
    }
    return join(__dirname, 'data', DEFAULT_SEED_FILE);
  }

  private loadSeed(): OrderSeedItem[] {
    const path = this.resolveSeedPath();
    let raw: string;
    try {
      raw = readFileSync(path, 'utf-8');
    } catch (error) {
      throw new Error(
        `Không đọc được tệp seed đơn tại ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      throw new Error(
        `Tệp seed đơn tại ${path} không phải JSON hợp lệ: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(`Tệp seed đơn tại ${path} không hợp lệ: nội dung phải là 1 object JSON.`);
    }
    const items = (parsed as Record<string, unknown>).items;
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error(`Tệp seed đơn tại ${path} không hợp lệ: items phải là mảng không rỗng.`);
    }
    const seenKeys = new Set<string>();
    for (const item of items as unknown[]) {
      if (typeof item !== 'object' || item === null) {
        throw new Error(`Tệp seed đơn tại ${path} không hợp lệ: mỗi item phải là 1 object.`);
      }
      const entry = item as Record<string, unknown>;
      if (!isNonEmptyString(entry.idempotencyKey)) {
        throw new Error(`Tệp seed đơn tại ${path} không hợp lệ: mỗi item cần idempotencyKey dạng chuỗi.`);
      }
      if (!isNonEmptyString(entry.customer)) {
        throw new Error(`Tệp seed đơn tại ${path} không hợp lệ: mỗi item cần customer dạng chuỗi.`);
      }
      if (!Array.isArray(entry.items) || entry.items.length === 0) {
        throw new Error(`Tệp seed đơn tại ${path} không hợp lệ: items của ${String(entry.idempotencyKey)} phải là mảng không rỗng.`);
      }
      for (const line of entry.items as unknown[]) {
        if (typeof line !== 'object' || line === null) {
          throw new Error(`Tệp seed đơn tại ${path} không hợp lệ: mỗi mặt hàng của ${String(entry.idempotencyKey)} phải là 1 object.`);
        }
        const lineEntry = line as Record<string, unknown>;
        if (!isNonEmptyString(lineEntry.sku)) {
          throw new Error(`Tệp seed đơn tại ${path} không hợp lệ: mỗi mặt hàng của ${String(entry.idempotencyKey)} cần sku dạng chuỗi.`);
        }
        if (
          !Number.isInteger(lineEntry.quantity) ||
          (lineEntry.quantity as number) <= 0
        ) {
          throw new Error(`Tệp seed đơn tại ${path} không hợp lệ: quantity của ${String(lineEntry.sku)} phải là số nguyên dương.`);
        }
      }
      if (
        entry.targetState === undefined ||
        !Object.prototype.hasOwnProperty.call(
          SEED_TARGET_TRANSITIONS,
          entry.targetState as string,
        )
      ) {
        throw new Error(`Tệp seed đơn tại ${path} không hợp lệ: targetState của ${String(entry.idempotencyKey)} phải là 1 trong Mới tạo, Đã kiểm tra, Chờ kho, Đang đóng gói, Chờ điều xe.`);
      }
      if (entry.phone !== undefined && typeof entry.phone !== 'string') {
        throw new Error(`Tệp seed đơn tại ${path} không hợp lệ: phone của ${String(entry.idempotencyKey)} phải là dạng chuỗi khi có.`);
      }
      if (
        entry.channelId !== undefined &&
        typeof entry.channelId !== 'string'
      ) {
        throw new Error(`Tệp seed đơn tại ${path} không hợp lệ: channelId của ${String(entry.idempotencyKey)} phải là dạng chuỗi khi có.`);
      }
      if (
        entry.deadline !== undefined &&
        typeof entry.deadline !== 'string'
      ) {
        throw new Error(`Tệp seed đơn tại ${path} không hợp lệ: deadline của ${String(entry.idempotencyKey)} phải là dạng chuỗi khi có.`);
      }
      if (entry.address !== undefined) {
        if (typeof entry.address !== 'object' || entry.address === null) {
          throw new Error(`Tệp seed đơn tại ${path} không hợp lệ: address của ${String(entry.idempotencyKey)} phải là 1 object khi có.`);
        }
        for (const field of ['province', 'district', 'ward', 'street'] as const) {
          const value = (entry.address as Record<string, unknown>)[field];
          if (value !== undefined && typeof value !== 'string') {
            throw new Error(`Tệp seed đơn tại ${path} không hợp lệ: address.${field} của ${String(entry.idempotencyKey)} phải là dạng chuỗi khi có.`);
          }
        }
      }
      if (seenKeys.has(entry.idempotencyKey as string)) {
        throw new Error(`Tệp seed đơn tại ${path} không hợp lệ: idempotencyKey ${String(entry.idempotencyKey)} bị trùng.`);
      }
      seenKeys.add(entry.idempotencyKey as string);
    }
    return items as OrderSeedItem[];
  }

  async create(
    input: CreateOrderInput,
    caller: Caller,
    // Thời điểm ghi cho bản ghi: chỉ đường seed lịch sử dùng để lùi
    // thời gian, vắng thì lấy thời điểm hiện tại. idPrefix LS- cũng chỉ
    // đường seed lịch sử dùng, để đơn lịch sử mang mã LS-1001 trở đi mà
    // không làm lệch dãy DH- của đơn tạo tay và đơn demo.
    opts?: { at?: string; idPrefix?: 'LS' },
  ): Promise<Order> {
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
    const duplicate = await this.store.findByIdempotencyKey(
      input.idempotencyKey,
    );
    if (duplicate) {
      throw new ConflictException(
        `Đơn với idempotencyKey "${input.idempotencyKey}" đã tồn tại (${duplicate.id}).`,
      );
    }
    // SĐT liên hệ giao hàng: trim, rỗng thì null, không kiểm tra định
    // dạng. Mốc giao hẹn: chuỗi Date.parse được thì chuẩn hóa ISO, rỗng
    // thì null, không parse được thì 400. Kiểm tra sau rào chắn trùng
    // idempotencyKey, giống kiểm tra kênh/khách bên dưới.
    const phone = normalizePhone(input.phone);
    const deadline = parseDeadline(input.deadline);
    // Kênh nguồn đơn (nếu có): phải là kênh thật và đang hoạt động. Kênh
    // không có thì 404, kênh tạm dừng thì 409, cả 2 đều không ghi audit vì
    // đây là lỗi lúc tạo, giống đơn trùng idempotencyKey.
    let channelId: string | null = null;
    if (input.channelId !== undefined && input.channelId !== null) {
      if (
        typeof input.channelId !== 'string' ||
        input.channelId.trim() === ''
      ) {
        throw new BadRequestException(
          'channelId phải là chuỗi không rỗng khi có.',
        );
      }
      channelId = await this.requireActiveChannel(input.channelId.trim());
    }
    // Khách hàng nhận đơn (nếu có): phải là khách thật. Khách không có
    // thì 404, không ghi audit vì đây là lỗi lúc tạo, giống kênh nguồn.
    let customerId: string | null = null;
    if (input.customerId !== undefined && input.customerId !== null) {
      if (
        typeof input.customerId !== 'string' ||
        input.customerId.trim() === ''
      ) {
        throw new BadRequestException(
          'customerId phải là chuỗi không rỗng khi có.',
        );
      }
      customerId = await this.requireCustomer(input.customerId.trim());
    }
    // Tổng tiền do server tính từ giá từng SKU trong kho, client không gửi.
    const total = await this.computeTotal(input.items);
    // Order, instance, audit và outbox nằm trong 1 transaction: lỗi ở bất kỳ
    // bước nào cũng không để lại đơn/instance/audit dở dang.
    const created = await this.withTransaction(async (client) => {
      const id = await this.nextOrderId(
        opts?.idPrefix === 'LS' ? 'LS' : 'DH',
        client,
      );
      // Mỗi đơn mở 1 workflow instance, trạng thái luồng sống ở instance,
      // đơn chỉ giữ mã instance và đồng bộ trạng thái sau mỗi lần chuyển.
      const instance = await this.instances.start(
        {
          definitionId: 'order-flow',
          businessKey: id,
          context: {
            orderId: id,
            ...(deadline !== null ? { deadline } : {}),
          },
        },
        caller,
        { at: opts?.at, client },
      );
      const now = opts?.at ?? new Date().toISOString();
      const order: Order = {
        id,
        idempotencyKey: input.idempotencyKey,
        customer: input.customer,
        phone,
        items: input.items.map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
        })),
        total,
        deadline,
        channelId,
        customerId,
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
      await this.store.save(order, client);
      await this.audit.append(
        {
          actor: caller.username,
          role: caller.roles[0] ?? '',
          action: 'order.created',
          at: now,
          orderId: order.id,
          from: null,
          to: 'Mới tạo',
          detail: `Khách ${input.customer}, ${input.items.length} mặt hàng.`,
        },
        client,
      );
      await this.outbox?.append(
        {
          type: 'order.created',
          aggregateType: 'order',
          aggregateId: order.id,
          payload: {
            orderId: order.id,
            state: order.state,
            customer: order.customer,
            items: order.items,
            workflowInstanceId: order.workflowInstanceId,
            definitionVersion: instance.definitionVersion,
            deadline: order.deadline,
          },
        },
        client,
      );
      return order;
    });
    return copyOrder(created);
  }

  async list(
    filters: {
      channelId?: string;
      customerId?: string;
    } = {},
  ): Promise<Order[]> {
    const orders = await this.store.list();
    return orders
      .filter(
        (order) =>
          (filters.channelId === undefined ||
            order.channelId === filters.channelId) &&
          (filters.customerId === undefined ||
            order.customerId === filters.customerId),
      )
      .map(copyOrder);
  }

  async findOne(id: string): Promise<Order> {
    const order = await this.store.findById(id);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn ${id}.`);
    }
    return copyOrder(order);
  }

  // Đọc đơn theo người gọi. Vai nội bộ xem bình thường; tài xế thuần chỉ
  // được xem đơn có shipment do chính mình phụ trách. Khách hàng mô phỏng
  // không dùng endpoint này (đi qua public tracking).
  async findOneForCaller(id: string, caller: Caller): Promise<Order> {
    const order = await this.findOne(id);
    if (!isDriverOnly(caller.roles)) {
      return order;
    }
    const driver = this.drivers
      ? await this.drivers.findByUsername(caller.username)
      : null;
    if (!driver) {
      throw new ForbiddenException(
        `Tài khoản ${caller.username} chưa gắn với hồ sơ tài xế.`,
      );
    }
    const evidence = this.shipmentGate
      ? await this.shipmentGate.findByOrderId(id)
      : [];
    const ownsOrder = evidence.some((item) => item.driverId === driver.id);
    if (!ownsOrder) {
      throw new ForbiddenException(
        `Tài xế ${caller.username} không được xem đơn ${id} vì không có chuyến giao thuộc về mình.`,
      );
    }
    return order;
  }

  // Chuyển trạng thái đơn qua endpoint: kiểm đủ vai theo định nghĩa.
  async transition(
    id: string,
    input: TransitionOrderInput,
    caller: Caller,
    // Thời điểm ghi cho bản ghi: chỉ đường seed lịch sử dùng để lùi
    // thời gian, vắng thì lấy thời điểm hiện tại.
    opts?: { at?: string },
  ): Promise<Order> {
    return this.applyTransition(id, input, caller, true, opts);
  }

  // Chuyển trạng thái đơn theo sự kiện shipment. Chỉ ShipmentsService gọi.
  // Vai theo định nghĩa không kiểm ở đây vì vai đã kiểm ở quy tắc shipment
  // (điều xe cần Điều phối viên, giao hàng cần Tài xế, giao thất bại cần
  // 1 trong 2); việc chuyển đơn là hệ quả của sự kiện shipment, người báo
  // cáo ghi vào audit làm actor. Đường chuyển trực tiếp (controller) vẫn
  // kiểm vai đủ. Mọi rào chắn khác (trạng thái đóng, lý do, địa chỉ, tồn
  // kho, bằng chứng shipment) vẫn chạy như đường trực tiếp.
  async transitionForShipment(
    id: string,
    input: TransitionOrderInput,
    caller: Caller,
    // Thời điểm ghi cho bản ghi: chỉ đường seed lịch sử dùng để lùi
    // thời gian, vắng thì lấy thời điểm hiện tại.
    opts?: { at?: string },
  ): Promise<Order> {
    return this.applyTransition(id, input, caller, false, opts);
  }

  private async applyTransition(
    id: string,
    input: TransitionOrderInput,
    caller: Caller,
    checkRole: boolean,
    opts?: { at?: string },
  ): Promise<Order> {
    if (typeof input.to !== 'string' || input.to.trim() === '') {
      throw new BadRequestException('to là bắt buộc, dạng chuỗi.');
    }
    const now = opts?.at ?? new Date().toISOString();
    try {
      return await this.withTransaction((client) =>
        this.applyTransitionInTransaction(
          id,
          input,
          caller,
          checkRole,
          now,
          client,
        ),
      );
    } catch (error) {
      if (error instanceof OrderTransitionDeniedError) {
        // Transaction đã rollback; ghi audit denial ở giao dịch riêng để
        // bằng chứng không bị mất và không giữ khóa hàng.
        await this.audit.append({
          actor: caller.username,
          role: caller.roles[0] ?? '',
          action: 'order.transition.denied',
          at: now,
          orderId: id,
          from: error.from,
          to: error.to,
          detail: error.reason,
        });
        throw new ConflictException(error.reason);
      }
      throw error;
    }
  }

  private async applyTransitionInTransaction(
    id: string,
    input: TransitionOrderInput,
    caller: Caller,
    checkRole: boolean,
    now: string,
    client?: Queryable,
  ): Promise<Order> {
    const order = await this.store.findById(id, client, true);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn ${id}.`);
    }
    const deny = (reason: string): never => {
      throw new OrderTransitionDeniedError(reason, order.state, input.to);
    };
    // Rào chắn: không sửa đơn đã đóng.
    if (CLOSED_STATES.includes(order.state)) {
      deny(
        `Đơn ${id} đã ở trạng thái đóng "${order.state}", không chuyển được nữa.`,
      );
    }
    const instance = await this.instances.findByBusinessKey(
      'order-flow',
      id,
      client,
      true,
    );
    if (!instance) {
      throw new NotFoundException(
        `Không tìm thấy workflow instance của đơn ${id}.`,
      );
    }
    const check = this.workflow.canTransition(
      'order-flow',
      order.state,
      input.to,
      checkRole ? caller.roles : undefined,
      instance.definitionVersion,
    );
    if (!check.allowed) {
      deny(check.reason ?? 'Chuyển trạng thái không được phép.');
    }
    // Rào chắn theo guard trong tệp định nghĩa: lý do bắt buộc, địa chỉ và tồn kho.
    const transition = this.workflow.getTransition(
      'order-flow',
      order.state,
      input.to,
      instance.definitionVersion,
    );
    let consumeStock = false;
    // Hướng xử lý dùng cho phần còn lại của luồng: chuỗi tự gõ, hoặc
    // suy ra từ trả hàng đã duyệt khi đóng đơn bằng returnId.
    let handling = input.handling;
    if (transition) {
      if (
        input.returnId !== undefined &&
        !isNonEmptyString(input.returnId)
      ) {
        throw new BadRequestException(
          'returnId phải là chuỗi không rỗng khi có.',
        );
      }
      if (
        transition.guard.includes('lý do') &&
        (input.reason === undefined || input.reason.trim() === '')
      ) {
        throw new BadRequestException(
          `Chuyển sang "${input.to}" cần có lý do (guard "${transition.guard}").`,
        );
      }
      if (transition.guard.includes('hướng xử lý')) {
        if (isNonEmptyString(input.returnId)) {
          // Đóng đơn bằng trả hàng đã duyệt: trả hàng thay cho hướng xử
          // lý tự gõ, phần còn lại của luồng dùng hướng xử lý suy ra này.
          const ret = await this.requireApprovedReturn(input.returnId, id);
          handling = `Trả hàng ${ret.id} (${ret.status}): ${ret.reason}`;
        } else if (input.handling === undefined || input.handling.trim() === '') {
          throw new BadRequestException(
            `Chuyển sang "${input.to}" cần có hướng xử lý (guard "${transition.guard}").`,
          );
        }
      } else if (isNonEmptyString(input.returnId)) {
        // returnId chỉ dùng khi đóng đơn; chuyển khác không cần hướng xử
        // lý thì từ chối rõ ràng thay vì lặng lẽ bỏ qua.
        throw new BadRequestException(
          `returnId chỉ dùng khi đóng đơn: chuyển sang "${input.to}" không cần hướng xử lý.`,
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
        const stock = await this.inventory.checkSufficient(
          order.items,
          client,
        );
        if (!stock.sufficient) {
          deny(
            `Tồn kho không đủ: ${stock.lacking.map((item) => item.reason).join(' ')}`,
          );
        }
        consumeStock = true;
      }
      // Rào chắn bằng chứng shipment: chuyển sang Đang giao cần có shipment
      // đang giao, chuyển sang Đã giao cần có shipment đã giao kèm ảnh bằng
      // chứng. Không có cổng (dựng service bằng tay, không qua mô-đun) thì
      // coi như không có bằng chứng, chặn luôn chứ không cho qua.
      if (transition.guard.includes('đã điều xe')) {
        const evidence = this.shipmentGate
          ? await this.shipmentGate.findByOrderId(id)
          : [];
        const dispatched = evidence.some(
          (item) => item.status === 'Đang giao',
        );
        if (!dispatched) {
          deny(
            `Đơn ${id} chưa điều xe: không có shipment nào đang ở trạng thái "Đang giao".`,
          );
        }
      }
      if (transition.guard.includes('có ảnh bằng chứng')) {
        const evidence = this.shipmentGate
          ? await this.shipmentGate.findByOrderId(id)
          : [];
        const delivered = evidence.some(
          (item) =>
            item.status === 'Đã giao' &&
            item.proofPhotoKey !== null &&
            item.proofPhotoKey.trim() !== '',
        );
        if (!delivered) {
          deny(
            `Đơn ${id} chưa có bằng chứng giao hàng: không có shipment nào ở trạng thái "Đã giao" kèm proofPhotoKey.`,
          );
        }
      }
    }
    // Rào chắn qua rồi mới cho instance chuyển; trạng thái luồng đổi ở
    // instance, đơn đồng bộ lại trạng thái và lịch sử của mình.
    let updated: WorkflowInstance;
    try {
      updated = await this.instances.transition(
        instance.id,
        {
          to: input.to,
          ...(input.reason ? { reason: input.reason } : {}),
          ...(handling ? { handling } : {}),
        },
        caller,
        {
          skipRoleCheck: !checkRole,
          at: now,
          client,
          deferDenialAudit: true,
        },
      );
    } catch (error) {
      if (error instanceof WorkflowTransitionDeniedError) {
        deny(error.reason);
      }
      throw error;
    }
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
      ...(handling ? { handling } : {}),
    });
    // Lưu đơn trước khi giữ hàng: giống bản bộ nhớ cũ, thay đổi trạng thái
    // đã nằm trong kho thì mới chạm tới kho hàng.
    await this.store.save(order, client);
    await this.outbox?.append(
      {
        type: 'order.transitioned',
        aggregateType: 'order',
        aggregateId: order.id,
        payload: {
          orderId: order.id,
          from,
          to: input.to,
          by: caller.username,
          role: check.requiredRole ?? caller.roles[0] ?? '',
          workflowInstanceId: order.workflowInstanceId,
          definitionVersion: instance.definitionVersion,
          items: order.items,
          stockConsumed: consumeStock,
        },
      },
      client,
    );
    if (consumeStock) {
      await this.inventory.reserve(order.items, client);
      await this.outbox?.append(
        {
          type: 'inventory.reserved',
          aggregateType: 'order',
          aggregateId: order.id,
          payload: {
            orderId: order.id,
            items: order.items,
            state: order.state,
          },
        },
        client,
      );
    }
    return copyOrder(order);
  }

  // Chạy fn trong transaction Postgres khi có DbService; test in-memory
  // không có DbService thì chạy trực tiếp, giữ nguyên hành vi cũ.
  private async withTransaction<T>(
    fn: (client?: Queryable) => Promise<T>,
  ): Promise<T> {
    if (!this.db) {
      return fn(undefined);
    }
    return this.db.withTransaction(fn);
  }

  // Cấp mã DH/LS qua bộ đếm DB khi có; không có thì dùng bộ đếm bộ nhớ.
  private async nextOrderId(
    prefix: 'DH' | 'LS',
    client?: Queryable,
  ): Promise<string> {
    const initial =
      prefix === 'LS' ? this.nextHistoricalNumber : this.nextNumber;
    const value = this.idSequence
      ? await this.idSequence.next(`order:${prefix}`, initial, client)
      : initial;
    if (prefix === 'LS') {
      this.nextHistoricalNumber = value + 1;
    } else {
      this.nextNumber = value + 1;
    }
    return `${prefix}-${String(value).padStart(4, '0')}`;
  }

  // Tổng tiền đơn do server tính: tổng (unitPrice ?? 0) * quantity trên
  // từng item. SKU không có trong kho hoặc chưa có giá đóng góp 0; tạo
  // đơn không kiểm tra SKU tồn tại (rào chắn tồn kho chạy lúc đóng gói).
  private async computeTotal(items: OrderItem[]): Promise<number> {
    let total = 0;
    for (const item of items) {
      const held = await this.inventory.get(item.sku);
      total += (held?.unitPrice ?? 0) * item.quantity;
    }
    return total;
  }

  // Kiểm tra kênh có thật và đang hoạt động, dùng chung cho tạo đơn và
  // sửa đơn. Kênh không có thì 404, kênh tạm dừng thì 409, cả 2 đều không
  // ghi audit vì đây là lỗi lúc nhập, giống đơn trùng idempotencyKey.
  // Mô-đun kênh vắng mặt (chỉ gặp khi dựng service bằng tay) thì chặn
  // luôn vì không kiểm tra được kênh thật.
  private async requireActiveChannel(channelId: string): Promise<string> {
    const channels = this.channels;
    if (channels === undefined) {
      throw new ConflictException(
        `Không kiểm tra được kênh ${channelId} vì mô-đun kênh chưa được nối.`,
      );
    }
    const channel = await channels.findById(channelId);
    if (!channel) {
      throw new NotFoundException(`Không tìm thấy kênh ${channelId}.`);
    }
    if (channel.status !== 'Hoạt động') {
      throw new ConflictException(
        `Kênh ${channelId} đang ở trạng thái "${channel.status}", chỉ nhận đơn khi kênh đang hoạt động.`,
      );
    }
    return channelId;
  }

  // Kiểm tra khách hàng có thật, dùng chung cho tạo đơn và sửa đơn. Khách
  // không có thì 404, không ghi audit vì đây là lỗi lúc nhập, giống kênh
  // nguồn. Mô-đun khách hàng vắng mặt (chỉ gặp khi dựng service bằng tay)
  // thì chặn luôn vì không kiểm tra được khách thật.
  private async requireCustomer(customerId: string): Promise<string> {
    const customers = this.customers;
    if (customers === undefined) {
      throw new ConflictException(
        `Không kiểm tra được khách hàng ${customerId} vì mô-đun khách hàng chưa được nối.`,
      );
    }
    const customer = await customers.findById(customerId);
    if (!customer) {
      throw new NotFoundException(`Không tìm thấy khách hàng ${customerId}.`);
    }
    return customerId;
  }

  // Trả hàng làm hướng xử lý khi đóng đơn: phải là trả hàng có thật,
  // thuộc đúng đơn này, đã duyệt hoặc đã hoàn tiền (trả hàng đã hoàn
  // tiền thì trước đó đã duyệt, vẫn là hướng xử lý hợp lệ). Mô-đun trả
  // hàng vắng mặt (chỉ gặp khi dựng service bằng tay) thì chặn luôn vì
  // không kiểm tra được trả hàng thật.
  private async requireApprovedReturn(
    returnId: string,
    orderId: string,
  ): Promise<Return> {
    const gate = this.returnGate;
    if (gate === undefined) {
      throw new ConflictException(
        `Không kiểm tra được trả hàng ${returnId} vì mô-đun trả hàng chưa được nối.`,
      );
    }
    const ret = await gate.findById(returnId);
    if (!ret) {
      throw new BadRequestException(`Không tìm thấy trả hàng ${returnId}.`);
    }
    if (ret.orderId !== orderId) {
      throw new BadRequestException(
        `Trả hàng ${returnId} thuộc đơn ${ret.orderId}, không phải đơn ${orderId}.`,
      );
    }
    if (ret.status !== 'Đã duyệt' && ret.status !== 'Đã hoàn tiền') {
      throw new BadRequestException(
        `Trả hàng ${returnId} đang ở trạng thái "${ret.status}", chỉ dùng trả hàng đã duyệt hoặc đã hoàn tiền làm hướng xử lý khi đóng đơn.`,
      );
    }
    return ret;
  }

  // Sửa dữ liệu đơn. Đơn mở sửa trực tiếp; đơn đã đóng chỉ sửa khi có lý do
  // và người phê duyệt, mọi lần sửa đều ghi audit. Sửa mặt hàng làm đổi
  // lượng hàng đã giữ nên chỉ được khi đơn chưa giữ hàng, hoặc đơn đã đóng
  // (sửa hồ sơ, không chạm kho thật).
  async update(
    id: string,
    input: UpdateOrderInput,
    caller: Caller,
  ): Promise<Order> {
    const order = await this.store.findById(id);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn ${id}.`);
    }
    if (
      input.customer === undefined &&
      input.phone === undefined &&
      input.items === undefined &&
      input.channelId === undefined &&
      input.customerId === undefined &&
      input.address === undefined &&
      input.deadline === undefined
    ) {
      throw new BadRequestException(
        'Cần ít nhất 1 trường để sửa: customer, phone, items, channelId, customerId, address hoặc deadline.',
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
    // Đổi kênh (nếu có): null thì gỡ kênh khỏi đơn, chuỗi thì phải là kênh
    // thật và đang hoạt động. Kiểm tra trước khi sửa để đơn sai không tiêu
    // phê duyệt của đơn đã đóng.
    let newChannelId: string | null | undefined;
    if (input.channelId !== undefined) {
      if (input.channelId === null) {
        newChannelId = null;
      } else if (
        typeof input.channelId !== 'string' ||
        input.channelId.trim() === ''
      ) {
        throw new BadRequestException(
          'channelId phải là chuỗi không rỗng hoặc null khi có.',
        );
      } else {
        newChannelId = await this.requireActiveChannel(
          input.channelId.trim(),
        );
      }
    }
    // Đổi khách hàng (nếu có): null thì gỡ khách khỏi đơn, chuỗi thì
    // phải là khách thật. Kiểm tra trước khi sửa để đơn sai không tiêu
    // phê duyệt của đơn đã đóng.
    let newCustomerId: string | null | undefined;
    if (input.customerId !== undefined) {
      if (input.customerId === null) {
        newCustomerId = null;
      } else if (
        typeof input.customerId !== 'string' ||
        input.customerId.trim() === ''
      ) {
        throw new BadRequestException(
          'customerId phải là chuỗi không rỗng hoặc null khi có.',
        );
      } else {
        newCustomerId = await this.requireCustomer(
          input.customerId.trim(),
        );
      }
    }
    // Đổi SĐT/mốc giao hẹn (nếu có): null thì gỡ khỏi đơn. Kiểm tra
    // trước khi sửa để đơn sai không tiêu phê duyệt của đơn đã đóng,
    // giống kiểm tra kênh/khách bên trên.
    let newPhone: string | null | undefined;
    if (input.phone !== undefined) {
      newPhone = input.phone === null ? null : normalizePhone(input.phone);
    }
    let newDeadline: string | null | undefined;
    if (input.deadline !== undefined) {
      newDeadline =
        input.deadline === null ? null : parseDeadline(input.deadline);
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
      approval = await this.approvals.get(input.approvalId as string);
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
    if (newPhone !== undefined) {
      order.phone = newPhone;
    }
    if (input.items !== undefined) {
      order.items = input.items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
      }));
      // Đổi mặt hàng thì tính lại tổng tiền từ giá hiện tại trong kho.
      order.total = await this.computeTotal(order.items);
    }
    if (newDeadline !== undefined) {
      order.deadline = newDeadline;
    }
    if (newChannelId !== undefined) {
      order.channelId = newChannelId;
    }
    if (newCustomerId !== undefined) {
      order.customerId = newCustomerId;
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
    await this.store.save(order);
    await this.audit.append({
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
      await this.approvals.markApplied(approval.id, caller);
    }
    return copyOrder(order);
  }
}

// SĐT liên hệ: trim, chuỗi rỗng/toàn khoảng trắng về null, không kiểm
// tra định dạng. undefined nghĩa là client không gửi (chỉ gặp ở create).
function normalizePhone(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException('phone phải là chuỗi khi có.');
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// Mốc giao hẹn: chuỗi Date.parse được thì chuẩn hóa ISO-8601, chuỗi rỗng
// về null, không parse được thì 400. Không kiểm tra trong quá khứ.
function parseDeadline(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException('deadline phải là chuỗi ngày giờ khi có.');
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(
      `deadline "${value}" không parse được thành ngày giờ.`,
    );
  }
  return parsed.toISOString();
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
