// SPDX-License-Identifier: Apache-2.0
import type { OrderReturnGate } from '../orders/order-return-gate';
import type { Return, ReturnStore } from './return.types';

// Adapter cho cổng phía đơn: đọc trả hàng qua kho, không qua
// ReturnsService, để không tạo vòng lặp service (OrdersService ->
// ReturnsService -> OrdersService). Đăng ký và export ở ReturnsModule,
// OrdersModule lấy qua forwardRef; phía đơn chỉ thấy cổng, không thấy kho.
export class ReturnGateAdapter implements OrderReturnGate {
  constructor(private readonly store: ReturnStore) {}

  async findById(id: string): Promise<Return | null> {
    return this.store.findById(id);
  }
}
