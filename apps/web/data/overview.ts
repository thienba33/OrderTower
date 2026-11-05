// SPDX-License-Identifier: Apache-2.0

// Du lieu mau dong bang ngay 02/11/2026, theo khung Figma Tong quan (45:2).
// Chua noi he thong that.

export type OverviewKpi = {
  label: string;
  value: number;
};

export const OVERVIEW_KPIS: OverviewKpi[] = [
  { label: "Đơn hôm nay", value: 120 },
  { label: "Đơn đang chạy", value: 101 },
  { label: "Chờ duyệt", value: 8 },
  { label: "Quá SLA / sắp quá", value: 7 },
  { label: "Rào chắn hôm nay", value: 6 },
];

export type OrderFlowState = {
  count: number;
  highlight: boolean;
  label: string;
};

export const ORDER_FLOW_STATES: OrderFlowState[] = [
  { count: 14, highlight: false, label: "Mới tạo" },
  { count: 18, highlight: false, label: "Đã kiểm tra" },
  { count: 22, highlight: true, label: "Chờ kho" },
  { count: 16, highlight: false, label: "Đang đóng gói" },
  { count: 12, highlight: false, label: "Chờ điều xe" },
  { count: 19, highlight: false, label: "Đang giao" },
  { count: 11, highlight: false, label: "Đã giao" },
  { count: 5, highlight: false, label: "Hoàn" },
  { count: 3, highlight: false, label: "Hủy" },
];

export type ApprovalQueueItem = {
  count: number;
  label: string;
};

export const APPROVAL_QUEUE: ApprovalQueueItem[] = [
  { count: 3, label: "Địa chỉ tin cậy thấp" },
  { count: 2, label: "Danh sách hạn chế" },
  { count: 1, label: "Phân đơn vượt tải" },
  { count: 1, label: "Điều tiết bán / nhập" },
  { count: 1, label: "Đề xuất AI ảnh hưởng khách / tiền" },
];

export type GuardrailBlock = {
  count: number;
  label: string;
};

export const GUARDRAIL_BLOCKS: GuardrailBlock[] = [
  { count: 2, label: "Chuyển trạng thái trái phép" },
  { count: 2, label: "Tồn kho không đủ" },
  { count: 1, label: "Đơn trùng" },
  { count: 1, label: "Địa chỉ chưa đạt mức tối thiểu" },
];

export type SlaRiskOrder = {
  action: string;
  customer: string;
  deadline: string;
  id: string;
  risk: string;
  status: string;
};

export const SLA_RISK_ORDERS: SlaRiskOrder[] = [
  { action: "Gọi khách", customer: "KH-014", deadline: "02/11 10:00", id: "DH-1051", risk: "Sắp quá SLA giao hẹn", status: "Chờ điều xe" },
  { action: "Xác nhận ĐC", customer: "KH-027", deadline: "02/11 11:00", id: "DH-1041", risk: "Địa chỉ tin cậy thấp", status: "Đã kiểm tra" },
  { action: "Gọi khách", customer: "KH-033", deadline: "02/11 10:30", id: "DH-1044", risk: "Sắp quá SLA giao hẹn", status: "Đang giao" },
  { action: "Xác nhận ĐC", customer: "KH-041", deadline: "02/11 12:00", id: "DH-1038", risk: "Địa chỉ tin cậy thấp", status: "Đã kiểm tra" },
  { action: "Ưu tiên kho", customer: "KH-058", deadline: "02/11 11:30", id: "DH-1033", risk: "Sắp quá SLA giao hẹn", status: "Chờ kho" },
  // 2 dong trang 2: Figma chi ve trang 1, lay tu bang rui ro trong mockup.
  { action: "Ưu tiên kho", customer: "KH-003", deadline: "02/11 12:30", id: "DH-1029", risk: "Sắp quá SLA giao hẹn", status: "Chờ kho" },
  { action: "Gọi khách", customer: "KH-030", deadline: "02/11 13:00", id: "DH-1024", risk: "Sắp quá SLA giao hẹn", status: "Mới tạo" },
];

export type BiAnomaly = {
  detail: string;
  title: string;
};

export const BI_ANOMALIES: BiAnomaly[] = [
  { detail: "Còn 36/240 chai, bán 9/ngày, hết trong 4 ngày, hạn dùng 20/11/2026.", title: "Lô L-118 sắp hết" },
  { detail: "9/50 đơn (18%) so với 8% toàn hệ thống.", title: "Tỷ lệ hoàn kênh Chat cao" },
  { detail: "28 đơn tuần này so với 20 tuần trước (+40%).", title: "Cầu nước mắm 25 độ tăng đột biến" },
];

export type DxAxis = {
  key: string;
  percent: number;
  value: string;
};

export const DX_SCORE_TOTAL = "51 / 90";

export const DX_AXES: DxAxis[] = [
  { key: "P", percent: 60, value: "18 / 30" },
  { key: "D", percent: 70, value: "21 / 30" },
  { key: "I", percent: 40, value: "12 / 30" },
];
