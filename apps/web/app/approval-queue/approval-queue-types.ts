// SPDX-License-Identifier: Apache-2.0

// Hình API của yêu cầu phê duyệt, chỉ lấy trường màn Hàng đợi duyệt dùng.
// Kiểu ApprovalItem trong data/approvals.ts là dữ liệu mẫu đóng băng nên
// không dùng lại ở đây; trang này đọc API thật, không import APPROVAL_ITEMS.

export type ApiApprovalStatus = "pending" | "approved" | "rejected";

export interface ApiApproval {
  id: string;
  type: string;
  subjectId: string;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  status: ApiApprovalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  appliedAt: string | null;
}

// Nhãn tiếng Việt cho các loại duyệt đã biết. Type là chuỗi tự do ở API
// nên loại nào chưa có trong bảng thì hiển thị đúng chuỗi type gốc.
export const APPROVAL_TYPE_LABEL: Record<string, string> = {
  "order.edit.closed": "Sửa đơn đã đóng",
  "address.low-trust": "Sửa địa chỉ tin cậy thấp",
  "customer.restrict": "Đưa vào danh sách hạn chế",
  "order.overload": "Phân đơn vượt tải",
  "sales.regulate": "Điều tiết bán hàng và nhập hàng",
  "ai.proposal": "Áp dụng đề xuất AI",
};

export function approvalTypeLabel(type: string): string {
  return APPROVAL_TYPE_LABEL[type] ?? type;
}

const APPROVAL_TYPE_PILL: Record<string, string> = {
  "address.low-trust": "bg-amber-50 text-amber-800",
  "customer.restrict": "bg-red-50 text-red-700",
};

export function approvalTypePill(type: string): string {
  return APPROVAL_TYPE_PILL[type] ?? "bg-gray-100 text-gray-700";
}
