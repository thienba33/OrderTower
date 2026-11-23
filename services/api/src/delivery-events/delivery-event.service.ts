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
import { InMemoryDriverStore, DRIVER_STORE } from '../drivers/driver.store';
import type { Driver, DriverStore } from '../drivers/driver.types';
import { InMemoryShipmentStore, SHIPMENT_STORE } from '../shipments/shipment.store';
import type { Shipment, ShipmentStore } from '../shipments/shipment.types';
import { InMemoryDeliveryEventStore, DELIVERY_EVENT_STORE } from './delivery-event.store';
import type {
  CreateDeliveryEventInput,
  DeliveryEvent,
  DeliveryEventStore,
  DeliveryEventType,
  RecordAutoEventInput,
} from './delivery-event.types';
import { AUTO_EVENT_TYPES, MANUAL_EVENT_TYPES } from './delivery-event.types';

const DISPATCHER_ROLE = 'Điều phối viên';
const DRIVER_ROLE = 'Tài xế';

function copyEvent(event: DeliveryEvent): DeliveryEvent {
  return JSON.parse(JSON.stringify(event)) as DeliveryEvent;
}

// Chuỗi tùy chọn: cắt khoảng trắng 2 đầu, rỗng thì về null để không lưu
// chuỗi toàn khoảng trắng vào kho.
function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function requireNonEmpty(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(message);
  }
  return value;
}

// Nhật ký sự kiện giao hàng của shipment: mốc do tài xế hoặc điều phối
// viên ghi bằng tay khi shipment đang giao, cộng sự kiện tự động theo
// chuyển shipment (điều xe, giao hàng, giao thất bại). Sự kiện chỉ ghi
// thêm, không có endpoint sửa hay xóa. Người gọi lấy từ token Keycloak,
// không nhận actor/role từ body.
@Injectable()
export class DeliveryEventsService implements OnModuleInit {
  private nextNumber = 1001;

  // Các kho đều là tham số tùy chọn, mặc định bộ nhớ: kiểm thử đơn vị
  // không cần truyền gì thêm. Khi chạy trong NestJS, mô-đun tiêm kho
  // Postgres (xem DeliveryEventsModule: kho shipment và kho tài xế đăng
  // ký ngay trong mô-đun này để đọc qua store mà không cần nhập
  // ShipmentsModule hay gọi service khác, nên không có vòng lặp mô-đun).
  constructor(
    private readonly audit: AuditService,
    @Optional()
    @Inject(DELIVERY_EVENT_STORE)
    private readonly store: DeliveryEventStore = new InMemoryDeliveryEventStore(),
    @Optional()
    @Inject(SHIPMENT_STORE)
    private readonly shipmentStore: ShipmentStore = new InMemoryShipmentStore(),
    @Optional()
    @Inject(DRIVER_STORE)
    private readonly driverStore: DriverStore = new InMemoryDriverStore(),
  ) {}

  // Tiếp tục số thứ tự từ kho: đã có SK-1001 thì sự kiện mới là SK-1002,
  // không quay về SK-1001 sau khi khởi động lại.
  async onModuleInit(): Promise<void> {
    const events = await this.store.list();
    this.nextNumber = computeNextNumber(
      events.map((event) => event.id),
      'SK',
    );
  }

  async create(
    input: CreateDeliveryEventInput,
    caller: Caller,
  ): Promise<DeliveryEvent> {
    const shipmentId = requireNonEmpty(
      input.shipmentId,
      'Tạo sự kiện cần có shipmentId.',
    ).trim();
    const type = this.requireManualType(input.type);
    const note = optionalText(input.note);
    const proofPhotoKey = optionalText(input.proofPhotoKey);
    if (type === 'Ghi chú' && note === null) {
      throw new BadRequestException('Sự kiện "Ghi chú" cần có note.');
    }
    // Shipment không tồn tại thì báo 404, không ghi audit denied, giống
    // đơn không tồn tại lúc tạo shipment.
    const shipment = await this.shipmentStore.findById(shipmentId);
    if (!shipment) {
      throw new NotFoundException(`Không tìm thấy shipment ${shipmentId}.`);
    }
    const deny = async (reason: string): Promise<never> => {
      await this.audit.append({
        actor: caller.username,
        role: caller.roles[0] ?? '',
        action: 'delivery-event.create.denied',
        orderId: shipment.orderId,
        from: shipment.status,
        to: type,
        detail: reason,
      });
      throw new ConflictException(reason);
    };
    // Kiểm trạng thái trước, kiểm vai sau, giống thứ tự ở dispatch của
    // shipment và changeStatus của tài xế.
    if (shipment.status !== 'Đang giao') {
      await deny(
        `Shipment ${shipmentId} đang ở trạng thái "${shipment.status}", chỉ ghi sự kiện khi shipment đang giao.`,
      );
    }
    if (
      !caller.roles.includes(DRIVER_ROLE) &&
      !caller.roles.includes(DISPATCHER_ROLE)
    ) {
      await deny(
        `Ghi sự kiện giao hàng cần vai ${DRIVER_ROLE} hoặc ${DISPATCHER_ROLE}.`,
      );
    }
    // Chỉ kiểm tra quyền sở hữu khi người gọi là tài xế: tài xế chỉ ghi
    // sự kiện cho shipment giao cho mình. Điều phối viên ghi sự kiện cho
    // shipment bất kỳ nên không kiểm tra, giống giao thất bại.
    if (caller.roles.includes(DRIVER_ROLE)) {
      await this.requireEventDriver(shipment, caller, deny);
    }
    const now = new Date().toISOString();
    const event: DeliveryEvent = {
      id: `SK-${String(this.nextNumber++).padStart(4, '0')}`,
      shipmentId,
      orderId: shipment.orderId,
      type,
      note,
      proofPhotoKey,
      by: caller.username,
      role: caller.roles[0] ?? '',
      at: now,
      createdAt: now,
    };
    await this.store.save(event);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'delivery-event.created',
      // Audit log dùng chung trường orderId cho mã thực thể nghiệp vụ.
      orderId: shipment.orderId,
      from: null,
      to: type,
      detail:
        `Shipment ${shipmentId}.` +
        (note ? ` Ghi chú: ${note}` : '') +
        (proofPhotoKey ? ` Bằng chứng ${proofPhotoKey}.` : ''),
    });
    return copyEvent(event);
  }

  // Ghi sự kiện tự động theo chuyển shipment, sau khi đơn đã chuyển xong.
  // Không ghi audit riêng: audit shipment.dispatched/delivered/failed đã
  // bao phủ sự kiện, giống trạng thái xe và tài xế đổi theo shipment
  // không ghi audit riêng. Không kiểm tra vai hay trạng thái vì vai đã
  // kiểm ở quy tắc shipment trước khi chuyển.
  async recordAuto(
    input: RecordAutoEventInput,
    // Thời điểm ghi cho bản ghi: chỉ đường seed lịch sử dùng để lùi
    // thời gian, vắng thì lấy thời điểm hiện tại.
    opts?: { at?: string },
  ): Promise<DeliveryEvent> {
    const now = opts?.at ?? new Date().toISOString();
    const event: DeliveryEvent = {
      id: `SK-${String(this.nextNumber++).padStart(4, '0')}`,
      shipmentId: input.shipmentId,
      orderId: input.orderId,
      type: input.type,
      note: optionalText(input.note),
      proofPhotoKey: optionalText(input.proofPhotoKey),
      by: input.by,
      role: input.role,
      at: now,
      createdAt: now,
    };
    await this.store.save(event);
    return copyEvent(event);
  }

  async get(id: string): Promise<DeliveryEvent> {
    const event = await this.store.findById(id);
    if (!event) {
      throw new NotFoundException(`Không tìm thấy sự kiện giao hàng ${id}.`);
    }
    return copyEvent(event);
  }

  async list(
    filters: {
      shipmentId?: string;
      orderId?: string;
      type?: DeliveryEventType;
    } = {},
  ): Promise<DeliveryEvent[]> {
    const events = await this.store.list();
    return events.filter(
      (event) =>
        (filters.shipmentId === undefined ||
          event.shipmentId === filters.shipmentId) &&
        (filters.orderId === undefined ||
          event.orderId === filters.orderId) &&
        (filters.type === undefined || event.type === filters.type),
    );
  }

  // Chỉ 3 loại "Lấy hàng", "Đang giao" và "Ghi chú" được tạo bằng tay.
  // Ba loại còn lại là hệ quả của chuyển shipment nên tạo bằng tay thì
  // báo 400; type ngoài tập kín cũng báo 400.
  private requireManualType(value: unknown): DeliveryEventType {
    if (
      typeof value === 'string' &&
      MANUAL_EVENT_TYPES.includes(value as DeliveryEventType)
    ) {
      return value as DeliveryEventType;
    }
    if (
      typeof value === 'string' &&
      (AUTO_EVENT_TYPES as string[]).includes(value)
    ) {
      throw new BadRequestException(
        `Sự kiện "${value}" chỉ ghi tự động theo chuyển shipment, không tạo bằng tay được.`,
      );
    }
    throw new BadRequestException(
      'Tạo sự kiện cần có type là "Lấy hàng", "Đang giao" hoặc "Ghi chú".',
    );
  }

  // Kiểm tra quyền sở hữu ở ghi sự kiện bằng tay: tài xế của shipment
  // phải đúng là người gọi. Tài xế không có trong kho, shipment chưa
  // giao cho ai, hoặc người gọi không phải tài xế của shipment đều chặn
  // 409 và ghi audit denied (fail-closed), giống giao hàng và giao thất
  // bại ở ShipmentsService. Thông báo từ chối tính trước vào biến rồi
  // mới gọi deny một lần, để TypeScript thu hẹp kiểu driver chắc chắn.
  private async requireEventDriver(
    shipment: Shipment,
    caller: Caller,
    deny: (reason: string) => Promise<never>,
  ): Promise<Driver> {
    const driverId = shipment.driverId;
    const driver: Driver | null =
      driverId === null
        ? null
        : await this.driverStore.findById(driverId);
    let denied: string | null = null;
    if (driver === null) {
      denied =
        driverId === null
          ? `Shipment ${shipment.id} chưa giao cho tài xế nào.`
          : `Không tìm thấy tài xế ${driverId} của shipment ${shipment.id}.`;
    } else if (driver.username !== caller.username) {
      denied = `Tài xế của shipment ${shipment.id} là ${driver.username}, không phải ${caller.username}.`;
    }
    if (denied !== null) {
      await deny(denied);
    }
    if (driver === null) {
      // Không tới được đây vì deny đã ném lỗi, chỉ để TypeScript thu hẹp
      // kiểu driver sau khi đã kiểm hết các trường hợp từ chối.
      throw new ConflictException(
        `Không tìm thấy tài xế của shipment ${shipment.id}.`,
      );
    }
    return driver;
  }
}
