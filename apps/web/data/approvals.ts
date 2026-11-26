// SPDX-License-Identifier: Apache-2.0

// Muc cho duyet, dong bang ngay 02/11/2026. 6 muc trang 1 la du lieu mau co
// dinh, 2 muc trang 2 suy ra tu cung bo du lieu (1 dia chi, 1 han che).

export type ApprovalType = "Địa chỉ" | "Hạn chế" | "Vượt tải" | "Điều tiết" | "Đề xuất AI";

export type ApprovalLevel = "Cao" | "Trung bình";

export type ApprovalItem = {
  id: string;
  type: ApprovalType;
  target: string;
  content: string;
  summary: string;
  sender: string;
  time: string;
  level: ApprovalLevel;
};

export const APPROVAL_TYPES: ApprovalType[] = ["Địa chỉ", "Hạn chế", "Vượt tải", "Điều tiết", "Đề xuất AI"];

export const APPROVAL_ITEMS: ApprovalItem[] = [
  { id: "AP-01", type: "Địa chỉ", target: "DH-1041", content: "Hiệu chỉnh địa chỉ KH-027, tin cậy 62% - Rủi ro cao", summary: "Hiệu chỉnh địa chỉ, tin cậy 62%", sender: "AI chuẩn hóa", time: "08:20", level: "Cao" },
  { id: "AP-02", type: "Địa chỉ", target: "DH-1038", content: "Hiệu chỉnh địa chỉ KH-041, tin cậy 58% - Rủi ro cao", summary: "Hiệu chỉnh địa chỉ, tin cậy 58%", sender: "AI chuẩn hóa", time: "08:41", level: "Cao" },
  { id: "AP-03", type: "Hạn chế", target: "KH-058", content: "Đưa KH-058 vào danh sách hạn chế: hoàn 4/6 đơn 3 tháng", summary: "Đưa vào danh sách hạn chế, hoàn 4/6 đơn", sender: "Mai (CSKH)", time: "09:05", level: "Cao" },
  { id: "AP-04", type: "Vượt tải", target: "Đợt 14:00", content: "Phân 34 đơn cho Hoàng Nam (K01), vượt tải chuẩn 30 đơn", summary: "Phân 34 đơn, vượt tải chuẩn 30 đơn", sender: "Hệ thống gợi ý", time: "09:30", level: "Trung bình" },
  { id: "AP-05", type: "Điều tiết", target: "Lô L-118", content: "Giảm nhận đơn NM-25 kênh Chat đến khi nhập thêm 120 chai", summary: "Giảm nhận đơn NM-25 kênh Chat", sender: "Thu (Quản lý)", time: "09:52", level: "Trung bình" },
  { id: "AP-06", type: "Đề xuất AI", target: "DH-1051", content: "Đổi xe sang Xe 03 để kịp mốc giao 10:00, ảnh hưởng khách hàng", summary: "Đổi xe sang Xe 03, kịp mốc giao 10:00", sender: "AI cảnh báo trễ", time: "10:02", level: "Cao" },
  { id: "AP-07", type: "Địa chỉ", target: "DH-1005", content: "Hiệu chỉnh địa chỉ KH-029, tin cậy 60% - Rủi ro cao", summary: "Hiệu chỉnh địa chỉ, tin cậy 60%", sender: "AI chuẩn hóa", time: "10:25", level: "Cao" },
  { id: "AP-08", type: "Hạn chế", target: "KH-019", content: "Đưa KH-019 vào danh sách hạn chế: hoàn 3/5 đơn 3 tháng", summary: "Đưa vào danh sách hạn chế, hoàn 3/5 đơn", sender: "Mai (CSKH)", time: "10:40", level: "Cao" },
];

export const APPROVAL_TYPE_PILL: Record<ApprovalType, string> = {
  "Địa chỉ": "bg-amber-50 text-amber-800",
  "Hạn chế": "bg-red-50 text-red-700",
  "Vượt tải": "bg-gray-100 text-gray-700",
  "Điều tiết": "bg-gray-100 text-gray-700",
  "Đề xuất AI": "bg-gray-100 text-gray-700",
};

export const APPROVAL_LEVEL_TEXT: Record<ApprovalLevel, string> = {
  Cao: "text-red-700",
  "Trung bình": "text-amber-700",
};
