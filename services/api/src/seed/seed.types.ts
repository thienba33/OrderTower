// SPDX-License-Identifier: Apache-2.0
import type { AddressInput } from '../address/address.types';
import type { OrderItem } from '../orders/orders.types';

// Một mục trong tệp seed đơn lịch sử (historical-orders.seed.json), sinh
// bởi scripts/generate-sample-data.mjs. Đơn được tạo qua đường dịch vụ
// thật (create rồi transition hợp lệ, kèm shipment và trả hàng khi cần)
// với thời gian lùi xác định trong 28 ngày 26/10-22/11/2026.
export interface HistoricalOrderSeedItem {
  idempotencyKey: string;
  customer: string;
  phone?: string;
  items: OrderItem[];
  channelId?: string;
  address?: AddressInput;
  deadline?: string;
  // Thời điểm tạo đơn (ISO). Mọi bước sau lệch theo giờ cố định từ mốc
  // này, xem bảng lệch giờ trong HistoricalSeedService.
  createdAt: string;
  targetState:
    | 'Mới tạo'
    | 'Đã kiểm tra'
    | 'Chờ kho'
    | 'Đang đóng gói'
    | 'Chờ điều xe'
    | 'Đang giao'
    | 'Đã giao'
    | 'Hoàn'
    | 'Hủy';
  // Giao thất bại 1 lần rồi quay lại Chờ điều xe (chỉ dùng cho đơn đích
  // là Chờ điều xe).
  failOnce?: boolean;
  // Lý do hủy, bắt buộc khi đích là Hủy.
  cancelReason?: string;
  // Hướng xử lý khi đóng đơn không qua trả hàng, bắt buộc khi đích là
  // Hoàn mà không có trả hàng đã duyệt hoặc đã hoàn tiền.
  closeHandling?: string;
  // Trả hàng kèm đơn: chỉ dùng cho đơn đã giao. Trả hàng chờ xử lý gắn
  // cho đơn còn ở Đã giao; trả hàng đã duyệt/từ chối/hoàn tiền gắn cho
  // đơn đã đóng (Hoàn).
  return?: HistoricalReturnSeed;
}

export interface HistoricalReturnSeed {
  reason: string;
  outcome: 'pending' | 'approved' | 'refunded' | 'rejected';
}
