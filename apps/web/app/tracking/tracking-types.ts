// SPDX-License-Identifier: Apache-2.0

// Hình API của màn Theo dõi đơn hàng. ApiOrderDetail và ApiShipment dùng
// lại từ màn chi tiết đơn, ApiInventoryItem dùng lại từ màn danh sách đơn;
// ApiDeliveryEvent dùng lại cho màn tài xế. Kiểu OrderDetail trong
// data/order-detail.ts là dữ liệu mẫu đóng băng nên không dùng lại ở đây.
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

// Hình trả về của endpoint công khai GET /api/public/tracking: chỉ những
// gì khách vãng lai được xem (đơn, lịch sử trạng thái, shipment, sự kiện
// giao, ảnh bằng chứng); không có người chuyển đơn, lý do, hướng xử lý,
// tên người ghi sự kiện hay SĐT.
export interface PublicTrackingAddress {
  street?: string;
  ward?: string;
  district?: string;
  province?: string;
}

export interface PublicTrackingOrderItem {
  sku: string;
  quantity: number;
  name: string | null;
  unitPrice: number | null;
}

export interface PublicTrackingOrder {
  id: string;
  state: string;
  items: PublicTrackingOrderItem[];
  total: number;
  deadline: string | null;
  createdAt: string;
  channelId: string | null;
  address: PublicTrackingAddress | null;
}

export interface PublicTrackingTimelineEntry {
  state: string;
  at: string;
}

export interface PublicTrackingShipment {
  id: string;
  state: string;
  driverName: string | null;
  vehiclePlate: string | null;
}

export interface PublicTrackingDeliveryEvent {
  type: string;
  note: string | null;
  createdAt: string;
}

export interface PublicTrackingResult {
  order: PublicTrackingOrder;
  timeline: PublicTrackingTimelineEntry[];
  shipment: PublicTrackingShipment | null;
  deliveryEvents: PublicTrackingDeliveryEvent[];
  proofPhotoKey: string | null;
}

export type TrackingStepState = "done" | "current" | "todo";

export interface TrackingStep {
  title: string;
  time: string | null;
  description: string;
  state: TrackingStepState;
}
