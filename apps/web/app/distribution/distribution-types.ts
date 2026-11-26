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
