// SPDX-License-Identifier: Apache-2.0

// Hình API của màn Theo dõi đơn hàng: đơn, nhật ký giao hàng, shipment
// mới nhất và tồn kho. Kiểu OrderDetail trong data/order-detail.ts là dữ
// liệu mẫu đóng băng nên không dùng lại ở đây; trang này đọc API thật.
// ApiOrderDetail và ApiShipment dùng lại từ màn chi tiết đơn, ApiInventoryItem
// dùng lại từ màn danh sách đơn.
import type { ApiInventoryItem } from "../orders/orders-types";
import type {
  ApiOrderDetail,
  ApiShipment,
} from "../orders/[id]/order-detail-types";

export type { ApiInventoryItem };
export type { ApiOrderDetail, ApiShipment };

export interface ApiDeliveryEvent {
  id: string;
  shipmentId: string;
  orderId: string;
  type: string;
  note: string | null;
  proofPhotoKey: string | null;
  by: string;
  role: string;
  at: string;
  createdAt: string;
}

// Gói tra cứu trả về từ route handler /api/tracking/[id].
export interface TrackingLookupResult {
  order: ApiOrderDetail;
  events: ApiDeliveryEvent[];
  shipment: ApiShipment | null;
  driverName: string | null;
  vehiclePlate: string | null;
  products: ApiInventoryItem[];
}

export type TrackingStepState = "done" | "current" | "todo";

export interface TrackingStep {
  title: string;
  time: string | null;
  description: string;
  state: TrackingStepState;
}
