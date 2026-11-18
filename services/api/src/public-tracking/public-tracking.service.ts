// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryEventsService } from '../delivery-events/delivery-event.service';
import { DriversService } from '../drivers/driver.service';
import { InventoryService } from '../inventory/inventory.service';
import type { Order } from '../orders/orders.types';
import { OrdersService } from '../orders/orders.service';
import type { Shipment } from '../shipments/shipment.types';
import { ShipmentsService } from '../shipments/shipment.service';
import { VehiclesService } from '../vehicles/vehicle.service';
import type { PublicTrackingResult } from './public-tracking.types';

// Mọi trường hợp không tra được đều chung 1 thông báo: đơn không tồn
// tại, sai SĐT hay đơn không có SĐT đều trả y hệt nhau, để mã đơn dạng
// DH-1001... không dò được đơn của người khác bằng cách thử SĐT.
const NOT_FOUND_MESSAGE = 'Không tìm thấy đơn hàng.';

function requireNonEmpty(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(message);
  }
  return value.trim();
}

// Shipment mới nhất là shipment sửa đổi gần đây nhất; bằng thời điểm thì
// lấy cái gặp sau trong danh sách, giống route tra cứu của web.
function latestShipment(shipments: Shipment[]): Shipment | null {
  let latest: Shipment | null = null;
  for (const shipment of shipments) {
    if (!latest || shipment.updatedAt >= latest.updatedAt) {
      latest = shipment;
    }
  }
  return latest;
}

// Tra cứu đơn cho khách vãng lai: khách đưa mã đơn và SĐT lúc đặt đơn,
// API chỉ đọc qua service khác, không ghi gì, không có kho riêng và
// không ghi audit (tra cứu không phải hành động nghiệp vụ).
@Injectable()
export class PublicTrackingService {
  constructor(
    private readonly orders: OrdersService,
    private readonly shipments: ShipmentsService,
    private readonly events: DeliveryEventsService,
    private readonly drivers: DriversService,
    private readonly vehicles: VehiclesService,
    private readonly inventory: InventoryService,
  ) {}

  async track(
    orderIdInput: unknown,
    phoneInput: unknown,
  ): Promise<PublicTrackingResult> {
    const orderId = requireNonEmpty(orderIdInput, 'Tra cứu đơn cần có mã đơn.');
    const phone = requireNonEmpty(
      phoneInput,
      'Tra cứu đơn cần có số điện thoại.',
    );
    const order = await this.findOrder(orderId);
    // SĐT của đơn đã cắt khoảng trắng lúc tạo (trống thì về null); SĐT
    // khách đưa cũng đã cắt ở trên, so khớp đúng chuỗi.
    if (order.phone === null || order.phone.trim() !== phone) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }
    const [shipments, events, items] = await Promise.all([
      this.shipments.list({ orderId: order.id }),
      this.events.list({ orderId: order.id }),
      // Tên và đơn giá từng dòng tra từ kho theo SKU, cùng 1 lần gọi
      // như khi tính tổng đơn lúc tạo; SKU không có trong kho hoặc chưa
      // có giá thì về null, màn khách hiện "-" cho thành tiền dòng đó.
      Promise.all(
        order.items.map(async (item) => {
          const held = await this.inventory.get(item.sku);
          return {
            sku: item.sku,
            quantity: item.quantity,
            name: held?.name ?? null,
            unitPrice: held?.unitPrice ?? null,
          };
        }),
      ),
    ]);
    const shipment = latestShipment(shipments);
    return {
      order: {
        id: order.id,
        state: order.state,
        items,
        total: order.total,
        deadline: order.deadline,
        createdAt: order.createdAt,
        channelId: order.channelId,
        // Địa chỉ giao hàng nguyên các phần như đơn đã lưu, đúng dạng
        // màn Theo dõi của web nối lại thành chuỗi; đơn không ghi địa
        // chỉ thì null. Mức tin cậy địa chỉ không trả ra ngoài.
        address: order.address ?? null,
      },
      // Lịch sử trạng thái đơn đã lưu trên đơn (mốc tạo + từng lần
      // chuyển, cùng các chuyển mà audit log ghi lại): chỉ lấy trạng
      // thái mới và thời điểm, bỏ người chuyển, lý do và hướng xử lý
      // vì đó là nội dung nội bộ. Xếp theo thời điểm để khách thấy
      // đúng thứ tự, dù kho đã lưu theo thứ tự thêm vào.
      timeline: [...order.history]
        .sort((a, b) => a.at.localeCompare(b.at))
        .map((entry) => ({ state: entry.to, at: entry.at })),
      shipment: shipment
        ? {
            id: shipment.id,
            state: shipment.status,
            driverName: await this.findDriverName(shipment.driverId),
            vehiclePlate: await this.findVehiclePlate(shipment.vehicleId),
          }
        : null,
      deliveryEvents: [...events]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((event) => ({
          type: event.type,
          note: event.note,
          createdAt: event.createdAt,
        })),
      proofPhotoKey: shipment?.proofPhotoKey ?? null,
    };
  }

  private async findOrder(orderId: string): Promise<Order> {
    try {
      return await this.orders.findOne(orderId);
    } catch (error) {
      // Đơn không tồn tại cũng chung thông báo 404 với sai SĐT, để
      // không lộ đơn nào có thật qua thông báo lỗi.
      if (error instanceof NotFoundException) {
        throw new NotFoundException(NOT_FOUND_MESSAGE);
      }
      throw error;
    }
  }

  private async findDriverName(driverId: string | null): Promise<string | null> {
    if (!driverId) {
      return null;
    }
    const driver = await this.drivers.findById(driverId);
    return driver?.name ?? null;
  }

  // Xe không có thật thì trả biển số null, không lỗi cả tra cứu (giống
  // route tra cứu của web: tài xế/xe không tải được thì trả null).
  private async findVehiclePlate(
    vehicleId: string | null,
  ): Promise<string | null> {
    if (!vehicleId) {
      return null;
    }
    try {
      const vehicle = await this.vehicles.get(vehicleId);
      return vehicle.plate;
    } catch (error) {
      if (error instanceof NotFoundException) {
        return null;
      }
      throw error;
    }
  }
}
