// SPDX-License-Identifier: Apache-2.0

// Hình API của cờ hạn chế, chỉ lấy trường màn Danh sách hạn chế dùng.
// Kiểu RestrictedRow trong data/restricted.ts là dữ liệu mẫu đóng băng
// nên không dùng lại ở đây; trang này đọc API thật. Đơn/kênh/tồn kho
// lấy từ app/orders/orders-types.ts (hình đầy đủ của API), trạng thái
// và nguồn lấy từ data/restricted.ts (nhãn và màu pill giữ nguyên).

import type { RestrictedSource, RestrictedStatus } from "@/data/restricted";
import type {
  ApiChannel,
  ApiInventoryItem,
  ApiOrder,
} from "../orders/orders-types";

export type { ApiChannel, ApiInventoryItem, ApiOrder };

// Tỷ lệ hoàn của khách gắn với cờ, tính trực tiếp lúc đọc từ đơn và trả
// hàng, không lưu bền (xem README của mô-đun restricted-flags).
export interface ApiRestrictedFlagStats {
  return1m: number;
  return3m: number;
  orders3m: number;
}

// Một cờ hạn chế kèm đơn đầy đủ và tỷ lệ hoàn của khách: dạng trả về
// của GET /api/restricted-flags.
export interface ApiRestrictedFlagDetail {
  id: string;
  orderId: string;
  customerId: string | null;
  customerPhone: string | null;
  status: RestrictedStatus;
  source: RestrictedSource;
  reason: string | null;
  createdBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  order: ApiOrder;
  stats: ApiRestrictedFlagStats;
}

// Lỗi tải danh sách cờ: hết phiên thì hiện link đăng nhập lại, lỗi khác
// thì báo tải lại trang. null là tải được. Cùng quy ước như ReturnsError
// và CallsError của màn Chăm sóc khách hàng.
export type RestrictedFlagsError = "unauthorized" | "load-failed";
