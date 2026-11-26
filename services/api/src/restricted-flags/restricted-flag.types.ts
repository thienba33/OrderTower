// SPDX-License-Identifier: Apache-2.0

import type { Order } from '../orders/orders.types';

// Trạng thái xử lý của 1 cờ hạn chế. Chỉ 3 trạng thái đầu là đang hoạt
// động: đơn đã có cờ ở 1 trong 3 trạng thái này thì không tạo thêm cờ mới
// cho đơn đó. Cờ đã kiểm tra hoặc đã hủy thì đơn được tạo cờ mới.
export type RestrictedFlagStatus =
  | 'Hoàn nhiều lần'
  | 'Hạn chế'
  | 'Đã kiểm tra'
  | 'Đã hủy'
  | 'Chờ duyệt thêm';

// Nguồn phát hiện cờ. Bản này chỉ CSKH báo tay (xem README); 2 nguồn còn
// lại dành cho hệ thống và AI gắn cờ sau.
export type RestrictedFlagSource = 'AI cảnh báo' | 'Hệ thống' | 'CSKH';

// Một cờ hạn chế: 1 đơn bị rà soát vì khách hoàn nhiều lần. Cờ gắn với
// đơn, không gắn trực tiếp với khách: khách vào danh sách hạn chế khi 1 cờ
// của họ được duyệt (trạng thái "Hạn chế"). SĐT chụp lại từ đơn lúc tạo cờ
// vì đơn mẫu không mang customerId; SĐT cũng là khóa nối để tính tỷ lệ
// hoàn (xem README).
export interface RestrictedFlag {
  id: string;
  orderId: string;
  customerId: string | null;
  customerPhone: string | null;
  status: RestrictedFlagStatus;
  source: RestrictedFlagSource;
  reason: string | null;
  createdBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRestrictedFlagInput {
  orderId: string;
  reason?: string;
}

export interface ReasonInput {
  reason: string;
}

// Tỷ lệ hoàn của khách gắn với cờ, tính trực tiếp lúc đọc từ đơn và trả
// hàng, không lưu bền (xem README).
export interface RestrictedFlagStats {
  // Tỷ lệ hoàn trong 30 ngày qua: số trả hàng tạo trong 30 ngày qua của
  // khách chia số đơn tạo trong 30 ngày qua của khách, nhân 100, làm tròn.
  // 0 khi khách không có đơn nào trong 30 ngày qua.
  return1m: number;
  // Tỷ lệ hoàn trong 90 ngày qua, tính cùng cách với cửa sổ 90 ngày.
  return3m: number;
  // Số đơn của khách tạo trong 90 ngày qua.
  orders3m: number;
}

// Cờ kèm đơn đầy đủ và tỷ lệ hoàn của khách: dạng trả về của list/get.
export interface RestrictedFlagDetail extends RestrictedFlag {
  order: Order;
  stats: RestrictedFlagStats;
}

// Lối ra vào kho cờ hạn chế. Hiện có bản bộ nhớ; bản Postgres lưu bền qua
// cùng interface này, service phía trên không đổi. Mọi phương thức đều bất
// đồng bộ vì kho Postgres cần chờ truy vấn.
export interface RestrictedFlagStore {
  save(flag: RestrictedFlag): Promise<void>;
  findById(id: string): Promise<RestrictedFlag | null>;
  findByOrderId(orderId: string): Promise<RestrictedFlag[]>;
  list(): Promise<RestrictedFlag[]>;
}
