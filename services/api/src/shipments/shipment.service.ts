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
import { VehiclesService } from '../vehicles/vehicle.service';
import type { Vehicle } from '../vehicles/vehicle.types';
import { WorkflowService } from '../workflow/workflow.service';
import { InMemoryShipmentStore, SHIPMENT_STORE } from './shipment.store';
import type {
  CancelShipmentInput,
  CreateShipmentInput,
  DeliverShipmentInput,
  DispatchShipmentInput,
  FailShipmentInput,
  Shipment,
  ShipmentStatus,
  ShipmentStore,
} from './shipment.types';

// Trạng thái còn chạy: chưa giao xong và chưa hủy, nên đơn không tạo
// shipment mới khi đang có 1 shipment trong các trạng thái này.
const ACTIVE_STATUSES: ShipmentStatus[] = [
  'Chờ điều xe',
  'Đang giao',
  'Giao thất bại',
];

const DISPATCHER_ROLE = 'Điều phối viên';
const DRIVER_ROLE = 'Tài xế';

function copyShipment(shipment: Shipment): Shipment {
  return JSON.parse(JSON.stringify(shipment)) as Shipment;
}

function requireNonEmpty(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(message);
  }
  return value;
}

function requireRole(caller: Caller, role: string, action: string): void {
  if (!caller.roles.includes(role)) {
    throw new ConflictException(`${action} cần vai ${role}.`);
  }
}

// Quản lý vòng đời shipment: tạo, điều xe, giao hàng, giao thất bại, hủy.
// Mỗi sự kiện shipment kéo theo chuyển trạng thái đơn qua
// OrdersService.transitionForShipment (điều xe: Chờ điều xe -> Đang giao,
// giao hàng: Đang giao -> Đã giao, giao thất bại: Đang giao -> Chờ điều
// xe); hủy shipment không đổi trạng thái đơn. Người gọi lấy từ token
// Keycloak, không nhận actor/role từ body.
@Injectable()
export class ShipmentsService implements OnModuleInit {
  private nextNumber = 1001;

  // Store là tham số tùy chọn, mặc định bộ nhớ: kiểm thử đơn vị không cần
  // truyền gì thêm. Khi chạy trong NestJS, mô-đun tiêm kho Postgres.
  // OrdersService do OrdersModule export, ShipmentsModule lấy qua
  // forwardRef (xem OrdersModule); ngược lại phía đơn chỉ đọc shipment qua
  // cổng ORDER_SHIPMENT_GATE, không qua service này, nên mức service
  // không có vòng lặp.
  constructor(
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
    @Optional()
    @Inject(SHIPMENT_STORE)
    private readonly store: ShipmentStore = new InMemoryShipmentStore(),
    // Xe phục vụ điều xe tùy chọn: có khi chạy qua mô-đun (ShipmentsModule
    // nhập VehiclesModule), không có khi dựng service bằng tay trong kiểm
    // thử. Khi không có, điều xe bị chặn vì không kiểm tra được xe thật.
    @Optional()
    private readonly vehicles?: VehiclesService,
  ) {}

  // Tiếp tục số thứ tự từ kho: đã có GH-1001 thì shipment mới là GH-1002,
  // không quay về GH-1001 sau khi khởi động lại.
  async onModuleInit(): Promise<void> {
    const shipments = await this.store.list();
    this.nextNumber = computeNextNumber(
      shipments.map((shipment) => shipment.id),
      'GH',
    );
  }

  async create(
    input: CreateShipmentInput,
    caller: Caller,
  ): Promise<Shipment> {
    const orderId = requireNonEmpty(
      input.orderId,
      'orderId là bắt buộc, dạng chuỗi.',
    );
    requireRole(caller, DISPATCHER_ROLE, 'Tạo shipment');
    // Đơn không tồn tại thì OrdersService ném 404; đơn sai trạng thái và
    // đơn đã có shipment đang chạy đều là 409, không ghi audit vì đây là
    // lỗi lúc tạo, giống đơn trùng idempotencyKey ở OrdersService.
    const order = await this.orders.findOne(orderId);
    if (order.state !== 'Chờ điều xe') {
      throw new ConflictException(
        `Đơn ${orderId} đang ở trạng thái "${order.state}", chỉ tạo shipment khi đơn ở "Chờ điều xe".`,
      );
    }
    const existing = await this.store.findByOrderId(orderId);
    const active = existing.find((item) =>
      ACTIVE_STATUSES.includes(item.status),
    );
    if (active) {
      throw new ConflictException(
        `Đơn ${orderId} đã có shipment đang hoạt động (${active.id}, trạng thái "${active.status}").`,
      );
    }
    const now = new Date().toISOString();
    const shipment: Shipment = {
      id: `GH-${String(this.nextNumber++).padStart(4, '0')}`,
      orderId,
      status: 'Chờ điều xe',
      driverId: null,
      vehicleId: null,
      proofPhotoKey: null,
      history: [
        {
          from: null,
          to: 'Chờ điều xe',
          by: caller.username,
          role: caller.roles[0] ?? '',
          at: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    await this.store.save(shipment);
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'shipment.created',
      // Audit log dùng chung trường orderId cho mã thực thể nghiệp vụ.
      orderId,
      from: null,
      to: 'Chờ điều xe',
      detail: `Đơn ${orderId}.`,
    });
    return copyShipment(shipment);
  }

  async get(id: string): Promise<Shipment> {
    const shipment = await this.store.findById(id);
    if (!shipment) {
      throw new NotFoundException(`Không tìm thấy shipment ${id}.`);
    }
    return copyShipment(shipment);
  }

  async list(
    filters: {
      orderId?: string;
      status?: ShipmentStatus;
    } = {},
  ): Promise<Shipment[]> {
    const shipments = await this.store.list();
    return shipments.filter(
      (shipment) =>
        (filters.orderId === undefined ||
          shipment.orderId === filters.orderId) &&
        (filters.status === undefined || shipment.status === filters.status),
    );
  }

  // Kiểm tra trước khi đổi shipment: đơn phải ở đúng trạng thái nguồn và
  // chuyển sang trạng thái đích phải hợp lệ theo định nghĩa. Chặn sớm để
  // shipment chưa đổi mà đơn đã không theo được. Vai người gọi kiểm kèm
  // theo định nghĩa, trừ giao thất bại: tài xế báo cáo không có vai Điều
  // phối viên theo định nghĩa nên chỉ kiểm chuyển có tồn tại, vai đã kiểm
  // ở quy tắc shipment. Rào chắn bằng chứng shipment (đã điều xe, có ảnh)
  // kiểm ở lúc chuyển đơn, sau khi shipment đã lưu.
  private async precheckOrderMove(
    orderId: string,
    to: string,
    caller: Caller,
    skipRoleCheck: boolean,
    deny: (reason: string) => Promise<never>,
  ): Promise<void> {
    const order = await this.orders.findOne(orderId);
    const check = this.workflow.canTransition(
      'order-flow',
      order.state,
      to,
      skipRoleCheck ? undefined : caller.roles,
    );
    if (!check.allowed) {
      await deny(
        `Đơn ${orderId} đang ở trạng thái "${order.state}", không chuyển sang "${to}" được: ${check.reason ?? 'chuyển trạng thái không được phép.'}`,
      );
    }
  }

  // Kiểm tra xe ở giai đoạn pre-check: xe phải có thật và đang sẵn sàng.
  // Không có thì VehiclesService ném 404, không ghi audit denied vì đây
  // là tham chiếu thiếu, giống đơn không tồn tại lúc tạo shipment. Xe sai
  // trạng thái thì 409 và ghi audit denied qua deny. Mô-đun xe vắng mặt
  // (chỉ gặp khi dựng service bằng tay) thì chặn luôn bằng 409 trực tiếp:
  // đó là lỗi nối mô-đun, không phải lỗi nghiệp vụ nên không ghi audit
  // denied; khối throw này cũng để TypeScript thu hẹp kiểu vehicles.
  private async requireReadyVehicle(
    vehicleId: string,
    deny: (reason: string) => Promise<never>,
  ): Promise<Vehicle> {
    const vehicles = this.vehicles;
    if (vehicles === undefined) {
      throw new ConflictException(
        `Không kiểm tra được xe ${vehicleId} vì mô-đun xe chưa được nối.`,
      );
    }
    const vehicle = await vehicles.get(vehicleId);
    if (vehicle.status !== 'Sẵn sàng') {
      await deny(
        `Xe ${vehicleId} đang ở trạng thái "${vehicle.status}", chỉ điều xe đang sẵn sàng được.`,
      );
    }
    return vehicle;
  }

  // Đổi trạng thái xe do shipment kéo theo, sau khi shipment và đơn đã
  // xong. requireReadyVehicle đã chặn khi mô-đun xe vắng mặt nên tới đây
  // vehicles luôn có; toán tử ?. chỉ để TypeScript chấp nhận tham số tùy
  // chọn, không phải để bỏ qua âm thầm.
  private async markVehicleBusy(vehicleId: string): Promise<void> {
    await this.vehicles?.markBusy(vehicleId);
  }

  private async markVehicleAvailable(vehicleId: string): Promise<void> {
    await this.vehicles?.markAvailable(vehicleId);
  }

  async dispatch(
    id: string,
    input: DispatchShipmentInput,
    caller: Caller,
  ): Promise<Shipment> {
    const driverId = requireNonEmpty(
      input.driverId,
      'Điều xe cần có driverId.',
    );
    const vehicleId = requireNonEmpty(
      input.vehicleId,
      'Điều xe cần có vehicleId.',
    );
    const shipment = await this.get(id);
    const deny = async (reason: string): Promise<never> => {
      await this.audit.append({
        actor: caller.username,
        role: caller.roles[0] ?? '',
        action: 'shipment.transition.denied',
        orderId: shipment.orderId,
        from: shipment.status,
        to: 'Đang giao',
        detail: reason,
      });
      throw new ConflictException(reason);
    };
    if (
      shipment.status !== 'Chờ điều xe' &&
      shipment.status !== 'Giao thất bại'
    ) {
      await deny(
        `Shipment ${id} đang ở trạng thái "${shipment.status}", không điều xe được.`,
      );
    }
    if (!caller.roles.includes(DISPATCHER_ROLE)) {
      await deny(`Điều xe cần vai ${DISPATCHER_ROLE}.`);
    }
    const vehicle = await this.requireReadyVehicle(vehicleId, deny);
    await this.precheckOrderMove(
      shipment.orderId,
      'Đang giao',
      caller,
      false,
      deny,
    );
    const from = shipment.status;
    const now = new Date().toISOString();
    shipment.status = 'Đang giao';
    shipment.driverId = driverId;
    shipment.vehicleId = vehicleId;
    shipment.updatedAt = now;
    shipment.history.push({
      from,
      to: 'Đang giao',
      by: caller.username,
      role: DISPATCHER_ROLE,
      at: now,
    });
    await this.audit.append({
      actor: caller.username,
      role: DISPATCHER_ROLE,
      action: 'shipment.dispatched',
      orderId: shipment.orderId,
      from,
      to: 'Đang giao',
      detail: `Tài xế ${driverId}, xe ${vehicleId}.`,
    });
    await this.store.save(shipment);
    // Shipment đã lưu thì đơn mới theo được: rào chắn "đã điều xe" ở
    // chuyển đơn đọc trạng thái shipment vừa lưu.
    await this.orders.transitionForShipment(
      shipment.orderId,
      { to: 'Đang giao' },
      caller,
    );
    // Đơn đã sang Đang giao thì xe mới sang Đang giao.
    await this.markVehicleBusy(vehicle.id);
    return copyShipment(shipment);
  }

  async deliver(
    id: string,
    input: DeliverShipmentInput,
    caller: Caller,
  ): Promise<Shipment> {
    const proofPhotoKey = requireNonEmpty(
      input.proofPhotoKey,
      'Giao hàng cần có proofPhotoKey (khóa tệp bằng chứng).',
    );
    const shipment = await this.get(id);
    const deny = async (reason: string): Promise<never> => {
      await this.audit.append({
        actor: caller.username,
        role: caller.roles[0] ?? '',
        action: 'shipment.transition.denied',
        orderId: shipment.orderId,
        from: shipment.status,
        to: 'Đã giao',
        detail: reason,
      });
      throw new ConflictException(reason);
    };
    if (shipment.status !== 'Đang giao') {
      await deny(
        `Shipment ${id} đang ở trạng thái "${shipment.status}", không giao hàng được.`,
      );
    }
    if (!caller.roles.includes(DRIVER_ROLE)) {
      await deny(`Giao hàng cần vai ${DRIVER_ROLE}.`);
    }
    await this.precheckOrderMove(
      shipment.orderId,
      'Đã giao',
      caller,
      false,
      deny,
    );
    const from = shipment.status;
    const now = new Date().toISOString();
    shipment.status = 'Đã giao';
    shipment.proofPhotoKey = proofPhotoKey;
    shipment.updatedAt = now;
    shipment.history.push({
      from,
      to: 'Đã giao',
      by: caller.username,
      role: DRIVER_ROLE,
      at: now,
    });
    await this.audit.append({
      actor: caller.username,
      role: DRIVER_ROLE,
      action: 'shipment.delivered',
      orderId: shipment.orderId,
      from,
      to: 'Đã giao',
      detail: `Bằng chứng ${proofPhotoKey}.`,
    });
    await this.store.save(shipment);
    // Shipment đã lưu thì đơn mới theo được: rào chắn "có ảnh bằng chứng"
    // ở chuyển đơn đọc trạng thái và proofPhotoKey vừa lưu.
    await this.orders.transitionForShipment(
      shipment.orderId,
      { to: 'Đã giao' },
      caller,
    );
    // Đơn đã sang Đã giao thì trả xe về Sẵn sàng.
    if (shipment.vehicleId !== null) {
      await this.markVehicleAvailable(shipment.vehicleId);
    }
    return copyShipment(shipment);
  }

  async fail(
    id: string,
    input: FailShipmentInput,
    caller: Caller,
  ): Promise<Shipment> {
    const reason = requireNonEmpty(
      input.reason,
      'Đánh dấu giao thất bại cần có lý do.',
    );
    const shipment = await this.get(id);
    const deny = async (denyReason: string): Promise<never> => {
      await this.audit.append({
        actor: caller.username,
        role: caller.roles[0] ?? '',
        action: 'shipment.transition.denied',
        orderId: shipment.orderId,
        from: shipment.status,
        to: 'Giao thất bại',
        detail: denyReason,
      });
      throw new ConflictException(denyReason);
    };
    if (shipment.status !== 'Đang giao') {
      await deny(
        `Shipment ${id} đang ở trạng thái "${shipment.status}", không đánh dấu giao thất bại được.`,
      );
    }
    if (
      !caller.roles.includes(DRIVER_ROLE) &&
      !caller.roles.includes(DISPATCHER_ROLE)
    ) {
      await deny(
        `Đánh dấu giao thất bại cần vai ${DRIVER_ROLE} hoặc ${DISPATCHER_ROLE}.`,
      );
    }
    await this.precheckOrderMove(
      shipment.orderId,
      'Chờ điều xe',
      caller,
      true,
      deny,
    );
    const from = shipment.status;
    const now = new Date().toISOString();
    shipment.status = 'Giao thất bại';
    shipment.updatedAt = now;
    shipment.history.push({
      from,
      to: 'Giao thất bại',
      by: caller.username,
      role: caller.roles[0] ?? '',
      at: now,
      reason,
    });
    await this.audit.append({
      actor: caller.username,
      role: caller.roles[0] ?? '',
      action: 'shipment.failed',
      orderId: shipment.orderId,
      from,
      to: 'Giao thất bại',
      detail: `Lý do: ${reason}`,
    });
    await this.store.save(shipment);
    // Đơn quay lại Chờ điều xe là hệ quả của báo cáo thất bại, không phải
    // quyết định của Điều phối viên, nên chuyển đơn cũng do người báo cáo
    // kéo theo (ghi audit với người báo cáo làm actor).
    await this.orders.transitionForShipment(
      shipment.orderId,
      { to: 'Chờ điều xe', reason },
      caller,
    );
    // Đơn đã quay lại Chờ điều xe thì trả xe về Sẵn sàng, để điều xe lại
    // được phép đổi xe khác.
    if (shipment.vehicleId !== null) {
      await this.markVehicleAvailable(shipment.vehicleId);
    }
    return copyShipment(shipment);
  }

  async cancel(
    id: string,
    input: CancelShipmentInput,
    caller: Caller,
  ): Promise<Shipment> {
    const reason = requireNonEmpty(
      input.reason,
      'Hủy shipment cần có lý do.',
    );
    const shipment = await this.get(id);
    const deny = async (denyReason: string): Promise<never> => {
      await this.audit.append({
        actor: caller.username,
        role: caller.roles[0] ?? '',
        action: 'shipment.transition.denied',
        orderId: shipment.orderId,
        from: shipment.status,
        to: 'Đã hủy',
        detail: denyReason,
      });
      throw new ConflictException(denyReason);
    };
    if (shipment.status !== 'Chờ điều xe') {
      await deny(
        `Shipment ${id} đang ở trạng thái "${shipment.status}", không hủy được.`,
      );
    }
    if (!caller.roles.includes(DISPATCHER_ROLE)) {
      await deny(`Hủy shipment cần vai ${DISPATCHER_ROLE}.`);
    }
    const from = shipment.status;
    const now = new Date().toISOString();
    shipment.status = 'Đã hủy';
    shipment.updatedAt = now;
    shipment.history.push({
      from,
      to: 'Đã hủy',
      by: caller.username,
      role: DISPATCHER_ROLE,
      at: now,
      reason,
    });
    await this.audit.append({
      actor: caller.username,
      role: DISPATCHER_ROLE,
      action: 'shipment.cancelled',
      orderId: shipment.orderId,
      from,
      to: 'Đã hủy',
      detail: `Lý do: ${reason}`,
    });
    await this.store.save(shipment);
    return copyShipment(shipment);
  }
}
