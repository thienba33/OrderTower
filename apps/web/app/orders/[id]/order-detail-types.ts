// SPDX-License-Identifier: Apache-2.0

// Hình API của trang chi tiết đơn: đơn đầy đủ, định nghĩa luồng, audit.
// Kiểu Order trong data/orders.ts là dữ liệu mẫu đóng băng nên không dùng
// lại ở đây; trang chi tiết đọc API thật, không import ORDERS nữa.
// ApiChannel và ApiInventoryItem dùng lại từ màn danh sách.

export interface ApiOrderHistoryEntry {
  from: string | null;
  to: string;
  by: string;
  role: string;
  at: string;
  reason?: string;
  handling?: string;
}

export interface ApiOrderAddress {
  province?: string;
  district?: string;
  ward?: string;
  street?: string;
  // Chuỗi địa chỉ thô khách ghi, lưu nguyên văn lúc tạo đơn; đơn chưa
  // tách chỉ có trường này, chưa có điểm tin cậy.
  raw?: string;
  // Lỗi phân tách đã lưu (khi tách chuỗi thô thất bại): đơn vào tab Lỗi
  // phân tách để nhập tay. null nghĩa là đã xóa lỗi.
  splitError?: { code: string; message: string } | null;
}

export interface ApiOrderDetail {
  id: string;
  customer: string;
  phone: string | null;
  items: { sku: string; quantity: number }[];
  total: number;
  deadline: string | null;
  channelId: string | null;
  address?: ApiOrderAddress;
  addressTrust: number | null;
  addressLevel: "Tin cậy cao" | "Cần lưu ý" | "Rủi ro cao" | null;
  state: string;
  history: ApiOrderHistoryEntry[];
  createdAt: string;
}

export interface ApiWorkflowTransition {
  from: string;
  to: string;
  role: string;
  guard: string;
}

export interface ApiWorkflowDefinition {
  definitionId: string;
  version: string;
  states: string[];
  transitions: ApiWorkflowTransition[];
}

export interface ApiAuditRecord {
  seq: number;
  at: string;
  actor: string;
  role: string;
  action: string;
  orderId: string;
  from: string | null;
  to: string | null;
  detail: string;
  prevHash: string;
  hash: string;
}

export type ApiShipmentStatus =
  | "Chờ điều xe"
  | "Đang giao"
  | "Đã giao"
  | "Giao thất bại"
  | "Đã hủy";

export interface ApiShipmentHistoryEntry {
  from: string | null;
  to: string;
  by: string;
  role: string;
  at: string;
  reason?: string;
}

export interface ApiShipment {
  id: string;
  orderId: string;
  status: ApiShipmentStatus;
  driverId: string | null;
  vehicleId: string | null;
  proofPhotoKey: string | null;
  proofPhotoFileId?: string | null;
  history: ApiShipmentHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiDriver {
  id: string;
  name: string;
  phone: string;
  username: string;
  vehicleId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiVehicle {
  id: string;
  plate: string;
  type: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export type ApiReturnStatus =
  | "Chờ xử lý"
  | "Đã duyệt"
  | "Đã từ chối"
  | "Đã hoàn tiền";

// Trả hàng của đơn, đọc từ API thật. Chỉ 2 trạng thái đầu là đang hoạt
// động: đơn có trả hàng ở 1 trong 2 trạng thái này thì không tạo thêm.
export interface ApiReturn {
  id: string;
  orderId: string;
  reason: string;
  status: ApiReturnStatus;
  createdAt: string;
  updatedAt: string;
}
