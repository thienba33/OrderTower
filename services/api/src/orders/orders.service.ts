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
import {
  AddressService,
  MIN_ADDRESS_TRUST,
} from '../address/address.service';
import { AuditService } from '../audit/audit.service';
import type { Caller } from '../auth/auth.types';
import { ChannelsService } from '../channels/channel.service';
import { CustomersService } from '../customers/customer.service';
import { InventoryService } from '../inventory/inventory.service';
import { ApprovalService } from '../approvals/approval.service';
import type { Approval } from '../approvals/approval.types';
import { computeNextNumber } from '../db/id-counter';
import { WorkflowInstanceService } from '../workflow/instance.service';
import { WorkflowService } from '../workflow/workflow.service';
import { InMemoryOrderStore, ORDER_STORE } from './orders.store';
import type { OrderStore } from './orders.types';
import {
  ORDER_SHIPMENT_GATE,
  type OrderShipmentGate,
} from './order-shipment-gate';
import type {
  CreateOrderInput,
  Order,
  OrderItem,
  TransitionOrderInput,
  UpdateOrderInput,
} from './orders.types';

// Trạng thái đóng: không còn chuyển nào đi ra, mọi thao tác đều bị chặn.
const CLOSED_STATES = ['Hoàn', 'Hủy'];

// Trạng thái chưa giữ hàng: còn sửa được mặt hàng. Từ "Đang đóng gói" trở đi
// kho đã giữ hàng cho đơn nên mặt hàng bị khóa, chỉ sửa được khách và địa chỉ.
const EDITABLE_ITEMS_STATES = ['Mới tạo', 'Đã kiểm tra', 'Chờ kho'];

// Đơn hàng nghiệp vụ: tạo, chuyển trạng thái qua Workflow engine, sửa.
// Trạng thái luồng sống ở workflow instance, đơn chỉ giữ mã instance và đồng
// bộ trạng thái sau mỗi lần chuyển.
@Injectable()
export class OrdersService implements OnModuleInit {
  private nextNumber = 1001;

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
  ) {}

  // Tiếp tục số thứ tự từ kho: đã có DH-1001 thì đơn mới là DH-1002, không
  // quay về DH-1001 sau khi khởi động lại.
  async onModuleInit(): Promise<void> {
    const orders = await this.store.list();
    this.nextNumber = computeNextNumber(
      orders.map((order) => order.id),
      'DH',
    );
  }

  async create(
    input: CreateOrderInput,
    caller: Caller,
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
    const id = `DH-${String(this.nextNumber++).padStart(4, '0')}`;
    // Mỗi đơn mở 1 workflow instance, trạng thái luồng sống ở instance,
    // đơn chỉ giữ mã instance và đồng bộ trạng thái sau mỗi lần chuyển.
    const instance = await this.instances.start(
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
    await this.store.save(order);
    await this.audit.append({
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

  // Chuyển trạng thái đơn qua endpoint: kiểm đủ vai theo định nghĩa.
  async transition(
    id: string,
    input: TransitionOrderInput,
    caller: Caller,
  ): Promise<Order> {
    return this.applyTransition(id, input, caller, true);
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
  ): Promise<Order> {
    return this.applyTransition(id, input, caller, false);
  }

  private async applyTransition(
    id: string,
    input: TransitionOrderInput,
    caller: Caller,
    checkRole: boolean,
  ): Promise<Order> {
    if (typeof input.to !== 'string' || input.to.trim() === '') {
      throw new BadRequestException('to là bắt buộc, dạng chuỗi.');
    }
    const order = await this.store.findById(id);
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn ${id}.`);
    }
    const deny = async (reason: string): Promise<never> => {
      await this.audit.append({
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
      await deny(
        `Đơn ${id} đã ở trạng thái đóng "${order.state}", không chuyển được nữa.`,
      );
    }
    const check = this.workflow.canTransition(
      'order-flow',
      order.state,
      input.to,
      checkRole ? caller.roles : undefined,
    );
    if (!check.allowed) {
      await deny(check.reason ?? 'Chuyển trạng thái không được phép.');
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
          await deny(addressDenial);
        }
      }
      if (transition.guard.includes('tồn kho')) {
        const stock = await this.inventory.checkSufficient(order.items);
        if (!stock.sufficient) {
          await deny(
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
          await deny(
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
          await deny(
            `Đơn ${id} chưa có bằng chứng giao hàng: không có shipment nào ở trạng thái "Đã giao" kèm proofPhotoKey.`,
          );
        }
      }
    }
    // Rào chắn qua rồi mới cho instance chuyển; trạng thái luồng đổi ở
    // instance, đơn đồng bộ lại trạng thái và lịch sử của mình.
    const instance = await this.instances.findByBusinessKey('order-flow', id);
    if (!instance) {
      throw new NotFoundException(`Không tìm thấy workflow instance của đơn ${id}.`);
    }
    const updated = await this.instances.transition(
      instance.id,
      {
        to: input.to,
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.handling ? { handling: input.handling } : {}),
      },
      caller,
      { skipRoleCheck: !checkRole },
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
    // Lưu đơn trước khi giữ hàng: giống bản bộ nhớ cũ, thay đổi trạng thái
    // đã nằm trong kho thì mới chạm tới kho hàng.
    await this.store.save(order);
    if (consumeStock) {
      await this.inventory.reserve(order.items);
    }
    return copyOrder(order);
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
