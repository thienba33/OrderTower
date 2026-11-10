// SPDX-License-Identifier: Apache-2.0

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

// Một yêu cầu phê duyệt của con người, độc lập với thực thể nghiệp vụ.
// type là việc cần duyệt, ví dụ 'order.edit.closed' (sửa đơn đã đóng);
// các điểm duyệt bắt buộc trong kế hoạch (sửa địa chỉ mức tin cậy thấp,
// đưa khách vào danh sách hạn chế, phân đơn vượt tải, điều tiết bán hàng
// và nhập hàng, áp dụng đề xuất AI) dùng chung thực thể này với type riêng.
export interface Approval {
  id: string;
  type: string;
  // Mã thực thể nghiệp vụ liên quan, ví dụ mã đơn DH-1001.
  subjectId: string;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  // Lần áp dụng phê duyệt đã duyệt (1 phê duyệt chỉ dùng 1 lần).
  appliedAt: string | null;
}

export interface RequestApprovalInput {
  type: string;
  subjectId: string;
  reason: string;
}

// Lối ra vào kho phê duyệt. Hiện có bản bộ nhớ; bản Postgres lưu bền qua
// cùng interface này, service phía trên không đổi. Mọi phương thức đều bất
// đồng bộ vì kho Postgres cần chờ truy vấn.
export interface ApprovalStore {
  save(approval: Approval): Promise<void>;
  findById(id: string): Promise<Approval | null>;
  list(): Promise<Approval[]>;
}
