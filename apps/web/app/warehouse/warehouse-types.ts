// SPDX-License-Identifier: Apache-2.0

import { INVENTORY_STATUS_PILL } from "@/data/inventory";

// Hình API của tồn kho, chỉ lấy trường màn Kho dùng.
export interface ApiInventoryItem {
  sku: string;
  name: string;
  unit: string;
  unitPrice: number | null;
  stock: number;
  reserved: number;
}

// Trạng thái tồn ở màn Kho. "Hết hàng" là trạng thái mới, không có trong
// dữ liệu mẫu đóng băng (chỉ có Sắp hết / Sắp hết hạn / Cần theo dõi /
// Đủ hàng), vì dữ liệu mẫu theo lô còn API theo SKU.
export type WarehouseStatus = "Hết hàng" | "Sắp hết" | "Đủ hàng";

export const WAREHOUSE_STATUSES: WarehouseStatus[] = ["Hết hàng", "Sắp hết", "Đủ hàng"];

// QUY ƯỚC HIỂN THỊ ở phía web, không phải quy tắc nghiệp vụ của API:
// API không có tốc độ bán hay hạn dùng nên không tính được "sắp hết"
// theo ngày; ngưỡng 100 chỉ là quy tắc hiển thị tạm, quy tắc ngưỡng thật
// thuộc về lớp BI sau này.
export const LOW_STOCK_THRESHOLD = 100;

export function inventoryStatus(item: ApiInventoryItem): WarehouseStatus {
  if (item.stock === 0) return "Hết hàng";
  if (item.stock <= LOW_STOCK_THRESHOLD) return "Sắp hết";
  return "Đủ hàng";
}

// Pill của "Hết hàng" mượn class pill đỏ của "Sắp hết" trong
// INVENTORY_STATUS_PILL, vì trạng thái này không có trong dữ liệu mẫu.
export const WAREHOUSE_STATUS_PILL: Record<WarehouseStatus, string> = {
  "Hết hàng": INVENTORY_STATUS_PILL["Sắp hết"],
  "Sắp hết": INVENTORY_STATUS_PILL["Sắp hết"],
  "Đủ hàng": INVENTORY_STATUS_PILL["Đủ hàng"],
};

// Lỗi tải hàng đợi phân đơn của nhân viên kho: hết phiên thì hiện
// link đăng nhập lại, lỗi khác thì báo tải lại trang. null là tải
// được. Cùng quy ước như ReturnsError của màn Chăm sóc khách hàng.
export type PackingQueueError = "unauthorized" | "load-failed";

export interface WarehouseRow extends ApiInventoryItem {
  status: WarehouseStatus;
  total: number;
}
