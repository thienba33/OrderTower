// SPDX-License-Identifier: Apache-2.0

// Hình API cho màn Phân phối đơn (mô hình A: bàn điều phối đóng gói),
// chỉ lấy trường màn này dùng. Đơn lấy từ app/orders/orders-types.ts,
// phân đơn lấy từ app/customer-care/customer-care-types.ts (hình đầy
// đủ của API, dùng chung cho cả telesale và kho).

import type {
  ApiAssignment,
  AssignmentStatus,
} from "../customer-care/customer-care-types";
import type { ApiOrder } from "../orders/orders-types";

export type { ApiAssignment, ApiOrder, AssignmentStatus };

// Tài khoản nhân viên kho demo để điều phối viên chọn khi chia đơn.
// demo.warehouse-staff-2 và demo.warehouse-staff-3 có thể chưa có trên
// máy demo; chọn tài khoản chưa tạo thì API vẫn tạo phân đơn vì API
// không kiểm tra tài khoản có thật không (giống DEMO_CSKH_ACCOUNTS ở
// màn Chăm sóc khách hàng).
export const DEMO_WAREHOUSE_ACCOUNTS: readonly string[] = [
  "demo.warehouse-staff",
  "demo.warehouse-staff-2",
  "demo.warehouse-staff-3",
];

// Chuẩn vượt tải của thiết kế đóng băng (30 đơn/đợt): chỉ dùng làm
// ngưỡng cảnh báo chữ khi chia đơn, không chặn và không gọi phê duyệt.
// Điểm phê duyệt "phân đơn vượt tải" cần nối vào Hàng đợi duyệt thì làm
// sau M2.
export const OVERLOAD_STANDARD = 30;

// Lỗi tải danh sách phân phối: hết phiên thì hiện link đăng nhập lại,
// lỗi khác thì báo tải lại trang. null là tải được. Cùng quy ước như
// ReturnsError và CallsError của màn Chăm sóc khách hàng.
export type DistributionError = "unauthorized" | "load-failed";

// 1 mục đề xuất AI chia đơn kho: 1 đơn giao cho 1 nhân viên, kèm lý do +
// số đầu vào để người duyệt kiểm tra lại được.
export interface ApiProposalItem {
  orderId: string;
  assignedTo: string;
  reason: string;
  inputs: {
    active: number;
    completed: number;
    avgMinutes: number | null;
    score: number;
  };
  originalAssignmentId: string | null;
}

// 1 đề xuất AI chia đơn kho: 1 đợt chia, duyệt cả đợt 1 lần.
export interface ApiProposal {
  id: string;
  kind: "warehouse" | "telesale";
  status: "Chờ duyệt" | "Đã áp dụng" | "Đã từ chối" | "Chờ duyệt vượt tải";
  items: ApiProposalItem[];
  skipped: { orderId: string; reason: string }[];
  overloaded: boolean;
  approvalId: string | null;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Kết quả duyệt đề xuất: phân đơn tạo thành công + mục lỗi từng đơn.
export interface ApiDecideResult {
  proposal: ApiProposal;
  applied: { orderId: string; assignmentId: string }[];
  failed: { orderId: string; reason: string }[];
  approvalId: string | null;
}
