// SPDX-License-Identifier: Apache-2.0
import type {
  AddressInput,
  AddressLevel,
} from '../address/address.types';

export interface OrderItem {
  sku: string;
  quantity: number;
}

export interface OrderHistoryEntry {
  from: string | null;
  to: string;
  by: string;
  role: string;
  at: string;
  reason?: string;
  // Hướng xử lý ghi khi đóng đơn (chuyển sang Hoàn).
  handling?: string;
}

export interface Order {
  id: string;
  idempotencyKey: string;
  customer: string;
  // Số điện thoại liên hệ giao hàng lúc đặt đơn, null khi đơn không ghi.
  // Chỉ là thông tin liên hệ, không kiểm tra định dạng (theo tiền lệ phone
  // của Customer).
  phone: string | null;
  items: OrderItem[];
  // Tổng tiền đơn (VND, số nguyên không âm), LUÔN do server tính từ giá
  // từng SKU trong kho: tổng (unitPrice ?? 0) * quantity. Client không gửi
  // trường này; SKU chưa có giá đóng góp 0.
  total: number;
  // Mốc giao hẹn, chuỗi ISO-8601, null khi đơn không ghi. Lưu dạng ISO đã
  // chuẩn hóa lúc tạo/sửa; không kiểm tra trong quá khứ.
  deadline: string | null;
  // Kênh nguồn đơn, null khi đơn không ghi kênh. Kênh phải có thật và
  // đang hoạt động thì đơn mới nhận, kiểm tra ở service.
  channelId: string | null;
  // Khách hàng nhận đơn, null khi đơn không ghi khách. Khách phải có thật
  // thì đơn mới nhận, kiểm tra ở service.
  customerId: string | null;
  address?: AddressInput;
  // Mức tin cậy địa chỉ tính lúc tạo đơn, null khi đơn không có địa chỉ.
  addressTrust: number | null;
  addressLevel: AddressLevel | null;
  // Id của workflow instance quản lý trạng thái của đơn.
  workflowInstanceId: string;
  state: string;
  history: OrderHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

// Lối ra vào kho đơn. Hiện có bản bộ nhớ; bản Postgres lưu bền qua cùng
// interface này, service phía trên không đổi. Mọi phương thức đều bất đồng bộ
// vì kho Postgres cần chờ truy vấn.
export interface OrderStore {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
  findByIdempotencyKey(key: string): Promise<Order | null>;
  list(): Promise<Order[]>;
}

export interface CreateOrderInput {
  idempotencyKey: string;
  customer: string;
  // Số điện thoại liên hệ giao hàng, vắng thì null; chuỗi rỗng/toàn
  // khoảng trắng cũng về null.
  phone?: string;
  items: OrderItem[];
  channelId?: string;
  customerId?: string;
  address?: AddressInput;
  // Mốc giao hẹn, chuỗi Date.parse được; chuỗi rỗng về null, không parse
  // được thì 400.
  deadline?: string;
}

// Người gọi lấy từ token Keycloak, không nằm trong body.
export interface TransitionOrderInput {
  to: string;
  reason?: string;
  // Hướng xử lý, bắt buộc khi guard của chuyển nhắc tới hướng xử lý.
  handling?: string;
}

export interface UpdateOrderInput {
  customer?: string;
  // Gửi null thì gỡ số điện thoại khỏi đơn.
  phone?: string | null;
  items?: OrderItem[];
  channelId?: string | null;
  customerId?: string | null;
  address?: AddressInput;
  // Gửi null thì gỡ mốc giao hẹn khỏi đơn; chuỗi phải Date.parse được.
  deadline?: string | null;
  reason?: string;
  // Id phê duyệt đã duyệt, bắt buộc khi sửa đơn đã đóng (thay chuỗi
  // approvedBy tự gõ trước đây).
  approvalId?: string;
}
