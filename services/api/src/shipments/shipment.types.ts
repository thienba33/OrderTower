// SPDX-License-Identifier: Apache-2.0

// Trạng thái giao hàng của 1 shipment. Sự kiện shipment kéo theo chuyển
// trạng thái đơn qua OrdersService.transitionForShipment: điều xe thì đơn
// sang Đang giao, giao hàng thì đơn sang Đã giao, giao thất bại thì đơn
// quay lại Chờ điều xe. Trạng thái đơn vẫn do Workflow engine giữ, shipment
// không tự ghi đè trạng thái đơn mà đi qua đúng đường chuyển của đơn.
export type ShipmentStatus =
  | 'Chờ điều xe'
  | 'Đang giao'
  | 'Đã giao'
  | 'Giao thất bại'
  | 'Đã hủy';

export interface ShipmentHistoryEntry {
  from: string | null;
  to: string;
  by: string;
  role: string;
  at: string;
  reason?: string;
}

// Một lượt giao 1 đơn. driverId là chuỗi tự do cho tới khi có mô đun
// Driver riêng; vehicleId là id của 1 Vehicle có thật (xem mô-đun
// vehicles), bắt buộc khi điều xe; proofPhotoKey là khóa tệp bằng chứng
// trong kho đối tượng, bắt buộc khi giao thành công.
export interface Shipment {
  id: string;
  orderId: string;
  status: ShipmentStatus;
  driverId: string | null;
  vehicleId: string | null;
  proofPhotoKey: string | null;
  history: ShipmentHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateShipmentInput {
  orderId: string;
}

export interface DispatchShipmentInput {
  driverId: string;
  vehicleId: string;
}

export interface DeliverShipmentInput {
  proofPhotoKey: string;
}

export interface FailShipmentInput {
  reason: string;
}

export interface CancelShipmentInput {
  reason: string;
}

// Lối ra vào kho shipment. Hiện có bản bộ nhớ; bản Postgres lưu bền qua cùng
// interface này, service phía trên không đổi. Mọi phương thức đều bất đồng bộ
// vì kho Postgres cần chờ truy vấn.
export interface ShipmentStore {
  save(shipment: Shipment): Promise<void>;
  findById(id: string): Promise<Shipment | null>;
  findByOrderId(orderId: string): Promise<Shipment[]>;
  list(): Promise<Shipment[]>;
}
