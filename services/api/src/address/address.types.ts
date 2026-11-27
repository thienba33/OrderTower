// SPDX-License-Identifier: Apache-2.0

export interface AddressInput {
  province?: string;
  // Trường quận/huyện cũ, chỉ giữ lại cho dữ liệu lịch sử (112 đơn lịch
  // sử giữ nguyên địa chỉ cũ). Không chấm điểm, màn hình mới không cho
  // chọn quận/huyện nữa.
  district?: string;
  ward?: string;
  street?: string;
}

export type AddressLevel = 'Tin cậy cao' | 'Cần lưu ý' | 'Rủi ro cao';

export interface AddressEvaluation {
  trust: number;
  level: AddressLevel;
  provinceKnown: boolean;
  wardKnown: boolean;
  hasStreet: boolean;
}

export interface GazetteerWard {
  name: string;
  code: number;
}

export interface GazetteerProvince {
  name: string;
  code: number;
  wards: GazetteerWard[];
}

export type LegacyMergeForm = 'toan-bo' | 'chu-yeu' | 'mot-phan';

// Kết quả khớp 1 chuỗi nhập với danh sách tên ứng viên (xem matchCandidate
// trong address.suggest.ts): khớp chính xác, khớp chứa, hoặc khớp mờ
// (Levenshtein <= 2). fuzzy = true khi khớp chứa hoặc khớp mờ.
export interface MatchResult {
  name: string | null;
  fuzzy: boolean;
  method: 'exact' | 'fuzzy' | null;
  ambiguous: boolean;
}

export interface LegacyWardMapping {
  oldWard: string;
  oldDistrict: string;
  oldProvince: string;
  newWard: string;
  newProvince: string;
  newWardCode: string;
  form: LegacyMergeForm;
}

// Địa chỉ đã tách thành phần (từ chuỗi thô dán vào hoặc từ form đã tách
// sẵn). Các giá trị là chữ gốc như người dùng ghi, chưa chuẩn hóa.
export interface AddressParts {
  province?: string;
  ward?: string;
  // Phần quận/huyện cũ (nếu có trong chuỗi), chỉ để tra bảng ánh xạ
  // cũ -> mới cho phường, không chấm điểm.
  district?: string;
  street: string;
}

// Kết quả thuật toán đề xuất chuẩn hóa: địa chỉ đề xuất kèm lý do từng
// phần. Tỉnh trả về dạng tên ngắn (bỏ tiền tố "Tỉnh "/"Thành phố "),
// phường trả về tên đầy đủ như danh mục ("Phường Cửa Nam"), giống cách
// dữ liệu mẫu và màn hình đang ghi.
export interface SuggestedAddress {
  province: string;
  ward: string;
  street: string;
  district?: string;
  provinceKnown: boolean;
  wardKnown: boolean;
  hasStreet: boolean;
  reasons: string[];
  // true khi có ít nhất 1 phần khớp bằng khớp chứa hoặc khớp mờ
  // (Levenshtein), để người duyệt biết phần đó cần xem kỹ.
  fuzzy: boolean;
  // Ghi chú mơ hồ (ví dụ 2 phần cùng khớp tỉnh, phường trùng tên ở
  // nhiều tỉnh), để người duyệt xem xét.
  ambiguous: string[];
  // Các phường đúng của tỉnh đã khớp, để nhập tay khi phường chưa xác
  // định được (mức thấp).
  choices?: { wards: string[] };
}

export type AddressProposalStatus =
  | 'Chờ duyệt'
  | 'Đã áp dụng'
  | 'Đã từ chối'
  | 'Tự áp dụng';

// Nguồn của đề xuất chuẩn hóa: luật xác định, hay LLM (Workers AI) phân
// tích rồi luật kiểm lại phường với danh mục.
export type SuggestionSource = 'rules' | 'llm';

// Kết quả LLM phân tích chuỗi địa chỉ thô (Workers AI). Các trường là chữ
// gốc LLM trả về, chưa kiểm lại với danh mục; service gọi phải kiểm lại
// tỉnh/phường với danh mục (cùng luật suggest) trước khi dùng, phường
// không có trong danh mục thì bỏ.
export interface LlmParsedAddress {
  province?: string;
  ward?: string;
  street?: string;
}

// 1 ảnh chụp địa chỉ kèm điểm tin cậy và lý do, lưu trong before_json /
// after_json của đề xuất (dạng JSONB, xem migration 019).
export interface AddressSnapshot {
  address: AddressInput;
  trust: number;
  level: AddressLevel;
  reasons: string[];
}

export interface AddressProposal {
  id: string;
  orderId: string;
  status: AddressProposalStatus;
  source: SuggestionSource;
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

export interface SuggestInput {
  orderId?: string;
  raw?: string;
  address?: AddressInput;
}

export interface SuggestResponse {
  // null khi mức thấp (không có đề xuất áp dụng được), khi gọi dạng
  // { address } không kèm orderId (chỉ trả đề xuất, không lưu), hoặc khi
  // đơn đã đóng (chỉ trả đề xuất để nhập tay qua luồng sửa đơn đã đóng).
  proposal: AddressProposal | null;
  before: AddressSnapshot;
  after: AddressSnapshot;
  choices?: { wards: string[] };
  // Nguồn của đề xuất (luật hay LLM); khi địa chỉ đã đạt mức cao thì
  // không có đề xuất nên nguồn là 'rules' (điểm đã chấm bằng luật).
  source: SuggestionSource;
  // true chỉ khi mức cao và đã tự áp dụng vào đơn.
  applied: boolean;
  // Ghi chú thêm, ví dụ đơn đã đóng nên không tự áp dụng được.
  note?: string;
}

export interface DecisionProposalInput {
  decision: 'approved' | 'rejected';
  reason?: string;
  // Địa chỉ sau khi người duyệt sửa trong modal; không có thì áp dụng
  // đúng như đề xuất.
  address?: AddressInput;
}

// Lối ra vào kho đề xuất chuẩn hóa địa chỉ. Hiện có bản bộ nhớ; bản
// Postgres lưu bền qua cùng interface này, service phía trên không đổi.
// Mọi phương thức đều bất đồng bộ vì kho Postgres cần chờ truy vấn.
export interface AddressProposalStore {
  save(proposal: AddressProposal): Promise<void>;
  update(proposal: AddressProposal): Promise<void>;
  findById(id: string): Promise<AddressProposal | null>;
  listByOrderId(orderId: string): Promise<AddressProposal[]>;
  // Toàn bộ id đề xuất, để service nối số thứ tự (AC-1001, AC-1002...)
  // khi khởi động, giống cách BI nối số BR-.
  listIds(): Promise<string[]>;
}
