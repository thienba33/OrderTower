// SPDX-License-Identifier: Apache-2.0
// Du lieu mau dong bang ngay 02/11/2026 cho man Tai xe (mobile): danh sach
// "Don cua toi" (48:212) va chi tiet don (48:276) + dialog Cap nhat giao
// hang (49:161). 4 don cua tai xe Van Hung - Xe 01 lay dung gia tri trong
// khung. Danh sach don ghi khac o ca 4 don (DH-1072 HS-KHO x4/KH-046/da
// giao/14:00, DH-1068 HS-KHO x4/KH-018/cho kho/12:00, DH-1075 NM-15
// x3/KH-067/cho kho/15:30, DH-1062 NM-40 x2/KH-075/dang dong goi/09:00);
// man nay lay theo khung, giong cac man truoc. Rieng DH-1072 khung cho du
// khach hang (KH-071), SDT (0902 *** 339), COD (284.000d) va lo (L-121);
// 3 don con lai lay khach hang, SDT va COD tu danh sach don, lo theo bang
// SKU cua man Chi tiet don (NM-25 L-118, NM-40 L-121, NM-15 L-115,
// HS-KHO H-052). Lich su giao hang cua DH-1072 lay dung khung; 3 don con
// lai suy ra theo cung quy tac: nhan don = moc giao tru 50 phut, bat dau
// giao = moc giao tru 35 phut, da giao = moc giao tru 8 phut, roi den moc
// giao hen.

export type DriverOrderStatus = "Chờ điều xe" | "Đang giao" | "Đã giao" | "Giao không thành công";

export type DriverTimelineEvent = {
  time: string;
  label: string;
};

export type DriverOrder = {
  id: string;
  status: DriverOrderStatus;
  address: string;
  deadline: string;
  sku: string;
  quantity: number;
  customer: string;
  phone: string;
  cod: number;
  lot: string;
  timeline: DriverTimelineEvent[];
};

export const DRIVER_NAME = "Văn Hùng";
export const DRIVER_VEHICLE = "Xe 01";
export const DRIVER_DATE = "Hôm nay, 02/11/2026";

export const DRIVER_ORDERS: DriverOrder[] = [
  {
    id: "DH-1072",
    status: "Đang giao",
    address: "Số 8 phố Hàng Bè, Hoàn Kiếm, Hà Nội",
    deadline: "10:45",
    sku: "NM-40",
    quantity: 2,
    customer: "KH-071",
    phone: "0902 *** 339",
    cod: 284000,
    lot: "L-121",
    timeline: [
      { time: "09:55", label: "Nhận đơn - Xe 01" },
      { time: "10:10", label: "Bắt đầu giao" },
      { time: "10:45", label: "Mốc giao hẹn" },
    ],
  },
  {
    id: "DH-1068",
    status: "Chờ điều xe",
    address: "Số 22 phố Lò Đúc, Hai Bà Trưng, Hà Nội",
    deadline: "11:15",
    sku: "NM-25",
    quantity: 1,
    customer: "KH-018",
    phone: "0934 *** 483",
    cod: 420000,
    lot: "L-118",
    timeline: [
      { time: "10:25", label: "Nhận đơn - Xe 01" },
      { time: "11:15", label: "Mốc giao hẹn" },
    ],
  },
  {
    id: "DH-1075",
    status: "Chờ điều xe",
    address: "Số 5 ngõ 12 phố Huế, Hai Bà Trưng, Hà Nội",
    deadline: "13:00",
    sku: "HS-KHO",
    quantity: 2,
    customer: "KH-067",
    phone: "0987 *** 742",
    cod: 192000,
    lot: "H-052",
    timeline: [
      { time: "12:10", label: "Nhận đơn - Xe 01" },
      { time: "13:00", label: "Mốc giao hẹn" },
    ],
  },
  {
    id: "DH-1062",
    status: "Đã giao",
    address: "Số 30 phố Bà Triệu, Hoàn Kiếm, Hà Nội",
    deadline: "09:20",
    sku: "NM-15",
    quantity: 2,
    customer: "KH-075",
    phone: "0918 *** 261",
    cod: 284000,
    lot: "L-115",
    timeline: [
      { time: "08:30", label: "Nhận đơn - Xe 01" },
      { time: "08:45", label: "Bắt đầu giao" },
      { time: "09:12", label: "Đã giao" },
      { time: "09:20", label: "Mốc giao hẹn" },
    ],
  },
];

export const DRIVER_STATUS_PILL: Record<DriverOrderStatus, string> = {
  "Đang giao": "bg-green-50 text-green-700",
  "Chờ điều xe": "bg-amber-50 text-amber-800",
  "Đã giao": "bg-gray-100 text-gray-700",
  "Giao không thành công": "bg-red-50 text-red-700",
};

export function formatCod(cod: number): string {
  return `${cod.toLocaleString("vi-VN")}đ`;
}
