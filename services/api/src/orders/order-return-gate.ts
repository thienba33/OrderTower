// SPDX-License-Identifier: Apache-2.0
import type { Return } from '../returns/return.types';

// Cổng đọc trả hàng cho rào chắn đóng đơn. Phía đơn chỉ cần biết trả hàng
// có thật, thuộc đơn nào và ở trạng thái nào, không cần biết trả hàng lưu
// ở đâu hay service trả hàng làm gì. Nhờ vậy OrdersService không phụ thuộc
// ReturnsService: cổng do phía trả hàng cài đặt (ReturnGateAdapter, đọc
// qua ReturnStore), phía đơn chỉ tiêm theo token và dùng tùy chọn. Khi cổng
// không có (service dựng bằng tay trong kiểm thử, không qua mô-đun), đóng
// đơn bằng returnId bị chặn, nghĩa là chặn khi không kiểm được chứ không
// cho qua.
export const ORDER_RETURN_GATE = 'ORDER_RETURN_GATE';

export interface OrderReturnGate {
  findById(id: string): Promise<Return | null>;
}
