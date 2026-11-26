// SPDX-License-Identifier: Apache-2.0

// Hình API của màn Quản trị hệ thống. AuditRecord và định nghĩa luồng dùng
// lại từ màn chi tiết đơn; API không có endpoint người dùng nên không có
// kiểu người dùng ở đây.
import type {
  ApiAuditRecord,
  ApiWorkflowDefinition,
} from "../orders/[id]/order-detail-types";

export interface ApiAuditVerifyResult {
  valid: boolean;
  checked: number;
  // Số thứ tự của bản ghi đầu tiên bị hỏng, null khi chuỗi còn nguyên.
  brokenAt: number | null;
}

export interface AdminView {
  audit: ApiAuditRecord[];
  // null khi không tải được kết quả xác minh; trang vẫn hiện, chỉ báo
  // là chưa kiểm tra được chuỗi hash.
  verify: ApiAuditVerifyResult | null;
  definitions: ApiWorkflowDefinition[];
  // Số bản ghi audit có at trong ngày hôm nay (giờ VN).
  auditToday: number;
}
