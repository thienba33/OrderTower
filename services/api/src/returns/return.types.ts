// SPDX-License-Identifier: Apache-2.0

// Trạng thái xử lý của 1 yêu cầu trả hàng. Chỉ 2 trạng thái đầu là đang
// hoạt động: đơn đã có trả hàng ở 1 trong 2 trạng thái này thì không tạo
// thêm trả hàng mới cho đơn đó.
export type ReturnStatus =
  | 'Chờ xử lý'
  | 'Đã duyệt'
  | 'Đã từ chối'
  | 'Đã hoàn tiền';

// Một yêu cầu trả hàng cho đơn đã giao. Khách muốn trả hàng thì CSKH ghi
// nhận; quản lý hoặc quản trị viên duyệt hay từ chối; điều phối viên hoàn
// tiền sau khi duyệt. Không có chi tiết từng mặt hàng: trả là trả cả đơn.
export interface Return {
  id: string;
  orderId: string;
  reason: string;
  status: ReturnStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReturnInput {
  orderId: string;
  reason: string;
}

export interface RejectReturnInput {
  reason: string;
}

// Lối ra vào kho trả hàng. Hiện có bản bộ nhớ; bản Postgres lưu bền qua
// cùng interface này, service phía trên không đổi. Mọi phương thức đều bất
// đồng bộ vì kho Postgres cần chờ truy vấn.
export interface ReturnStore {
  save(ret: Return): Promise<void>;
  findById(id: string): Promise<Return | null>;
  findByOrderId(orderId: string): Promise<Return[]>;
  list(): Promise<Return[]>;
}
