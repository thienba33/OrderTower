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
  items: OrderItem[];
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

export interface CreateOrderInput {
  idempotencyKey: string;
  customer: string;
  items: OrderItem[];
  address?: AddressInput;
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
  items?: OrderItem[];
  address?: AddressInput;
  reason?: string;
  // Người phê duyệt, bắt buộc cùng lý do khi sửa đơn đã đóng.
  approvedBy?: string;
}
