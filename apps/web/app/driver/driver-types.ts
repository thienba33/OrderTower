// SPDX-License-Identifier: Apache-2.0

// Hình API của màn Tài xế: tài xế khớp theo username đăng nhập, shipment
// của tài xế, đơn của từng shipment. Kiểu DriverOrder trong data/driver.ts
// là dữ liệu mẫu đóng băng nên không dùng lại ở đây; 2 màn này đọc API
// thật. ApiOrderDetail, ApiShipment, ApiDriver, ApiVehicle dùng lại từ màn
// chi tiết đơn, ApiDeliveryEvent dùng lại từ màn theo dõi, ApiInventoryItem
// dùng lại từ màn danh sách đơn.
import type { ApiInventoryItem } from "../orders/orders-types";
import type { ApiDeliveryEvent } from "../tracking/tracking-types";
import type {
  ApiDriver,
  ApiOrderDetail,
  ApiShipment,
  ApiShipmentStatus,
  ApiVehicle,
} from "../orders/[id]/order-detail-types";

export type { ApiDeliveryEvent, ApiDriver, ApiInventoryItem, ApiOrderDetail, ApiShipment, ApiShipmentStatus, ApiVehicle };

// Nhãn hiển thị cho trạng thái shipment trên màn tài xế. "Giao thất bại"
// hiện là "Giao không thành công" như khung mẫu.
export const DRIVER_SHIPMENT_LABEL: Record<ApiShipmentStatus, string> = {
  "Chờ điều xe": "Chờ điều xe",
  "Đang giao": "Đang giao",
  "Đã giao": "Đã giao",
  "Giao thất bại": "Giao không thành công",
  "Đã hủy": "Đã hủy",
};

export const DRIVER_SHIPMENT_PILL: Record<ApiShipmentStatus, string> = {
  "Chờ điều xe": "bg-amber-50 text-amber-800",
  "Đang giao": "bg-green-50 text-green-700",
  "Đã giao": "bg-gray-100 text-gray-700",
  "Giao thất bại": "bg-red-50 text-red-700",
  "Đã hủy": "bg-gray-100 text-gray-700",
};

// Shipment đang hoạt động (hiện ở tab Đơn) và đã kết thúc (tab Lịch sử).
export const ACTIVE_SHIPMENT_STATUSES: ApiShipmentStatus[] = [
  "Chờ điều xe",
  "Đang giao",
];
export const FINISHED_SHIPMENT_STATUSES: ApiShipmentStatus[] = [
  "Đã giao",
  "Giao thất bại",
  "Đã hủy",
];

// 1 thẻ đơn trong danh sách tài xế: shipment của tài xế + thông tin đơn
// lấy từ API đơn.
export interface DriverOrderCard {
  orderId: string;
  shipmentId: string;
  shipmentStatus: ApiShipmentStatus;
  address: string;
  deadline: string | null;
  itemsText: string;
  customer: string;
  phone: string | null;
  total: number;
}

export type DriverListView =
  | { kind: "login" }
  | { kind: "no-driver" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      driver: ApiDriver;
      vehicleLabel: string;
      dateLabel: string;
      cards: DriverOrderCard[];
      loadNote: string | null;
    };

export type DriverDetailView =
  | { kind: "login" }
  | { kind: "no-driver" }
  | { kind: "not-found"; id: string }
  | { kind: "no-shipment"; id: string }
  | { kind: "not-own"; id: string }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      order: ApiOrderDetail;
      shipment: ApiShipment;
      events: ApiDeliveryEvent[];
      products: ApiInventoryItem[];
      driver: ApiDriver;
      vehicleLabel: string;
    };
