// SPDX-License-Identifier: Apache-2.0

// Hình dữ liệu đã tính cho màn Tổng quan: server tính từ API thật, client
// chỉ hiển thị và giữ state phân trang. Kiểu dữ liệu mẫu trong
// data/overview.ts là dữ liệu đóng băng nên không dùng lại ở đây.
//
// Tổng quan là trang chủ của từng role: mỗi mục chỉ hiện với role làm
// việc đó. Trong OverviewView, mục nào là null thì client ẩn hẳn mục đó,
// không hiện số 0 hay mục trống. Mục nào là mảng rỗng (hoặc 0) thì vẫn
// hiện với trạng thái trống, vì đó là dữ liệu thật của role đó.

export interface OverviewKpi {
  label: string;
  value: number;
}

export interface OrderFlowState {
  count: number;
  highlight: boolean;
  label: string;
}

export interface OverviewCountRow {
  count: number;
  label: string;
}

export interface SlaRiskRow {
  action: string;
  customer: string;
  deadline: string;
  id: string;
  risk: string;
  status: string;
}

// Tóm tắt DX-Score: chỉ Quản trị viên và Quản lý thấy.
export interface DxSummary {
  total: number;
  p: number;
  d: number;
  i: number;
  h: number;
}

// Cảnh báo BI chưa xử lý: bất thường chưa có đề xuất đã quyết (duyệt
// hoặc từ chối). API bất thường không có trạng thái xử lý nên tính bằng
// cách đối chiếu với đề xuất qua anomalyKey.
export interface BiWarningRow {
  key: string;
  title: string;
  detail: string;
}

// Đơn địa chỉ tin cậy thấp chờ xác nhận: chỉ Điều phối viên thấy.
export interface LowTrustRow {
  id: string;
  customer: string;
  trust: number;
  deadline: string;
}

// Xe và tài xế sẵn sàng: chỉ Điều phối viên thấy.
export interface FleetVehicleRow {
  id: string;
  plate: string;
  type: string;
}

export interface FleetDriverRow {
  id: string;
  name: string;
  phone: string;
}

// Việc của tôi ở kho: phân đơn kho giao cho tài khoản đang đăng nhập,
// đang hoạt động (Chờ xử lý = đang chờ, Đang xử lý = đang đóng gói).
// rows chỉ lấy 5 phân đơn mới nhất; waiting/packing là tổng số.
export interface MyWorkRow {
  orderId: string;
  customer: string;
  orderState: string;
  status: string;
}

export interface MyWorkSection {
  waiting: number;
  packing: number;
  rows: MyWorkRow[];
}

// SKU sắp hết/hết hàng ở kho: theo đúng quy ước hiển thị của màn Kho
// (tồn 0 là Hết hàng, tồn <= 100 là Sắp hết). rows chỉ lấy 5 SKU tồn
// thấp nhất; total là tổng số SKU sắp hết/hết hàng.
export interface LowStockRow {
  sku: string;
  name: string;
  stock: number;
  unit: string;
  status: "Hết hàng" | "Sắp hết";
}

export interface LowStockSection {
  total: number;
  rows: LowStockRow[];
}

// Việc của tôi ở CSKH: phân đơn telesale giao cho tài khoản đang đăng
// nhập. rows chỉ lấy 5 phân đơn đang hoạt động mới nhất.
export interface MyCallRow {
  orderId: string;
  customer: string;
  status: string;
}

export interface MyCallsSection {
  waiting: number;
  inProgress: number;
  rows: MyCallRow[];
}

// Ticket đang mở (Mới/Đang xử lý/Chờ khách) của cả nhóm CSKH, không
// lọc theo người xử lý. rows chỉ lấy 5 ticket mở mới cập nhật nhất.
export interface OpenTicketRow {
  id: string;
  customer: string;
  orderId: string;
  type: string;
  status: string;
}

export interface TicketSection {
  fresh: number;
  inProgress: number;
  waitingCustomer: number;
  rows: OpenTicketRow[];
}

// Sự kiện giao hàng: chỉ lấy trường Tổng quan dùng để đếm đơn giao
// thất bại cần xử lý lại.
export interface ApiDeliveryEvent {
  orderId: string;
  type: string;
}

export interface OverviewView {
  kpis: OverviewKpi[] | null;
  flowStates: OrderFlowState[] | null;
  approvalRows: OverviewCountRow[] | null;
  pendingTotal: number;
  guardrailRows: OverviewCountRow[] | null;
  guardrailTotal: number;
  slaRows: SlaRiskRow[] | null;
  dxSummary: DxSummary | null;
  biWarnings: BiWarningRow[] | null;
  lowTrustRows: LowTrustRow[] | null;
  fleetVehicles: FleetVehicleRow[] | null;
  fleetDrivers: FleetDriverRow[] | null;
  myWork: MyWorkSection | null;
  lowStock: LowStockSection | null;
  myCalls: MyCallsSection | null;
  myTickets: TicketSection | null;
  pendingReturns: number | null;
  // Nhóm dữ liệu bổ sung nào tải lỗi: client hiện cảnh báo, mục đó ẩn.
  loadWarnings: string[];
}
