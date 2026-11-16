// SPDX-License-Identifier: Apache-2.0

// Hình API của đơn/kênh/tồn kho, chỉ lấy trường màn Đơn hàng dùng.
// Kiểu Order trong data/orders.ts là dữ liệu mẫu đóng băng nên không dùng
// lại ở đây; trang danh sách đọc API thật, không import ORDERS nữa.

export interface ApiOrderItem {
  sku: string;
  quantity: number;
}

export type ApiAddressLevel = "Tin cậy cao" | "Cần lưu ý" | "Rủi ro cao";

export interface ApiOrder {
  id: string;
  customer: string;
  phone: string | null;
  items: ApiOrderItem[];
  total: number;
  deadline: string | null;
  channelId: string | null;
  addressTrust: number | null;
  addressLevel: ApiAddressLevel | null;
  state: string;
  createdAt: string;
}

export interface ApiChannel {
  id: string;
  name: string;
}

export interface ApiInventoryItem {
  sku: string;
  name: string;
  unit: string;
  unitPrice: number | null;
}
