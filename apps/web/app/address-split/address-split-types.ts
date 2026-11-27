// SPDX-License-Identifier: Apache-2.0

// Hình API màn Phân tách địa chỉ dùng lại từ trang chi tiết đơn:
// đơn đầy đủ kèm địa chỉ, tin cậy và trạng thái. Kiểu PendingAddressRow
// và ConfirmAddressRow trong data/address-split.ts là dữ liệu mẫu đóng
// băng nên không dùng lại ở đây; trang này đọc API thật.

// Địa chỉ đã tách của 1 đơn, người dùng chọn tay từng cấp. Chỉ còn 2 cấp
// theo danh mục sau sáp nhập 2025 (tỉnh/thành + xã/phường, xem
// data/address-gazetteer-2025.ts); quận/huyện cũ không còn là cấp chọn
// nữa, đơn cũ vẫn giữ trường đó ở dạng chỉ đọc trong địa chỉ đã lưu.
// Tỉnh/phường chỉ nhận giá trị trong danh mục mới (khớp gazetteer của
// API); cấp nào đơn chưa có thì để trống.
export interface RowSplit {
  province: string;
  ward: string;
  street: string;
}

// 1 ảnh chụp địa chỉ kèm điểm tin cậy và lý do, như API trả về trong
// đề xuất chuẩn hóa địa chỉ.
export interface AddressSnapshot {
  address: {
    province?: string;
    district?: string;
    ward?: string;
    street?: string;
  };
  trust: number;
  level: "Tin cậy cao" | "Cần lưu ý" | "Rủi ro cao";
  reasons: string[];
}

export type AddressProposalStatus =
  | "Chờ duyệt"
  | "Đã áp dụng"
  | "Đã từ chối"
  | "Tự áp dụng";

export interface AddressProposal {
  id: string;
  orderId: string;
  status: AddressProposalStatus;
  source: "rules" | "llm";
  before: AddressSnapshot;
  after: AddressSnapshot;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Lỗi phân tách: địa chỉ không xác định được an toàn từ dữ liệu hành
// chính nên hệ thống không đoán, màn hình đưa đơn vào phần Lỗi phân tách
// để người dùng tự hiệu chỉnh.
export type SplitErrorCode =
  | "ward-not-in-province"
  | "province-not-found"
  | "ward-not-found"
  | "ambiguous-ward";

export interface SplitError {
  code: SplitErrorCode;
  message: string;
}

// Kết quả POST /api/address/suggest. proposal null khi mức thấp (không
// có đề xuất áp dụng được), khi địa chỉ đã đạt mức cao, hoặc khi đơn đã
// đóng; applied true chỉ khi mức cao và đã tự áp dụng vào đơn. source ghi
// đề xuất đến từ luật hay từ LLM (đã kiểm lại phường với danh mục).
// splitError có khi địa chỉ không xác định được an toàn: màn hình đưa đơn
// vào phần Lỗi phân tách để người dùng tự hiệu chỉnh.
export interface SuggestResponse {
  proposal: AddressProposal | null;
  before: AddressSnapshot;
  after: AddressSnapshot;
  choices?: { wards: string[] };
  source: "rules" | "llm";
  applied: boolean;
  note?: string;
  splitError?: SplitError;
}
