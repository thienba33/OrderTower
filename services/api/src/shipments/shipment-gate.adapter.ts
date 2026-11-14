// SPDX-License-Identifier: Apache-2.0
import type {
  OrderShipmentEvidence,
  OrderShipmentGate,
} from '../orders/order-shipment-gate';
import type { ShipmentStore } from './shipment.types';

// Adapter cho cổng phía đơn: đọc trạng thái shipment qua kho, không qua
// ShipmentsService, để không tạo vòng lặp service (OrdersService ->
// ShipmentsService -> OrdersService). Đăng ký và export ở ShipmentsModule,
// OrdersModule lấy qua forwardRef; phía đơn chỉ thấy cổng, không thấy kho.
export class ShipmentGateAdapter implements OrderShipmentGate {
  constructor(private readonly store: ShipmentStore) {}

  async findByOrderId(orderId: string): Promise<OrderShipmentEvidence[]> {
    const shipments = await this.store.findByOrderId(orderId);
    return shipments.map((shipment) => ({
      status: shipment.status,
      proofPhotoKey: shipment.proofPhotoKey,
    }));
  }
}
