// SPDX-License-Identifier: Apache-2.0

// Loại sự kiện trong nhật ký giao hàng của 1 shipment. Ba loại "Nhận
// đơn", "Đã giao" và "Giao thất bại" là hệ quả của chuyển shipment (điều
// xe, giao hàng, giao thất bại) nên chỉ ghi tự động, không tạo bằng tay;
// ba loại "Lấy hàng", "Đang giao" và "Ghi chú" là mốc do tài xế hoặc
// điều phối viên ghi bằng tay khi shipment đang giao.
export type DeliveryEventType =
  | 'Nhận đơn'
  | 'Lấy hàng'
  | 'Đang giao'
  | 'Đã giao'
  | 'Giao thất bại'
  | 'Ghi chú';

// Các loại sự kiện ghi bằng tay qua POST /api/delivery-events.
export const MANUAL_EVENT_TYPES: DeliveryEventType[] = [
  'Lấy hàng',
  'Đang giao',
  'Ghi chú',
];

// Các loại sự kiện chỉ ghi tự động theo chuyển shipment, tạo bằng tay
// thì báo 400.
export const AUTO_EVENT_TYPES: DeliveryEventType[] = [
  'Nhận đơn',
  'Đã giao',
  'Giao thất bại',
];

// Một sự kiện trong nhật ký giao hàng. orderId ghi dư từ shipment để
// lọc sự kiện theo đơn mà không cần nối bảng; shipment vẫn là chủ sở
// hữu của sự kiện (DeliveryEvent N-1 Shipment). by là tên đăng nhập
// Keycloak của người ghi, role là vai nghiệp vụ của người ghi lúc đó.
// at là thời điểm sự kiện xảy ra, createdAt là thời điểm bản ghi được
// tạo (2 mốc bằng nhau khi tạo, giữ cả 2 để phân biệt sự kiện với bản
// ghi như ở audit log). Không có GPS, vị trí hay tuyến đường.
export interface DeliveryEvent {
  id: string;
  shipmentId: string;
  orderId: string;
  type: DeliveryEventType;
  note: string | null;
  proofPhotoKey: string | null;
  by: string;
  role: string;
  at: string;
  createdAt: string;
}

export interface CreateDeliveryEventInput {
  shipmentId: string;
  type: DeliveryEventType;
  note?: string;
  proofPhotoKey?: string;
}

// Đầu vào ghi sự kiện tự động theo chuyển shipment. Service gọi không
// kiểm tra vai hay trạng thái: vai và trạng thái đã kiểm ở quy tắc
// shipment trước khi chuyển, sự kiện chỉ ghi lại những gì đã xảy ra.
export interface RecordAutoEventInput {
  shipmentId: string;
  orderId: string;
  type: DeliveryEventType;
  by: string;
  role: string;
  note?: string;
  proofPhotoKey?: string;
}

// Lối ra vào kho sự kiện giao hàng. Hiện có bản bộ nhớ; bản Postgres lưu
// bền qua cùng interface này, service phía trên không đổi. Mọi phương
// thức đều bất đồng bộ vì kho Postgres cần chờ truy vấn.
export interface DeliveryEventStore {
  save(event: DeliveryEvent): Promise<void>;
  findById(id: string): Promise<DeliveryEvent | null>;
  findByShipmentId(shipmentId: string): Promise<DeliveryEvent[]>;
  list(): Promise<DeliveryEvent[]>;
}
