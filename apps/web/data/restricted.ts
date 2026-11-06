// SPDX-License-Identifier: Apache-2.0

// Du lieu mau dong bang ngay 02/11/2026.
// 6 dong trang 1 la du lieu mau co dinh; 18 dong con lai sinh xac dinh de du
// 24 ban ghi, khong dung so ngau nhien, chay lai van ra cung mot danh sach.
// Chua noi he thong that.
// Luu y: cac chi so trang thai trong khung goc cong lai la 26 (9 + 7 + 5 + 3
// + 2) trong khi tong va chan trang ghi 24 ban ghi. Ban nay giu tong 24
// (kha hop ly nhat vi co 2 cho ghi 24) nen "Da kiem tra" la 8 thay vi 9 va
// "Cho duyet them" la 1 thay vi 2; doi tong thanh 26 thi chan trang thanh
// "1-6 / 26 ban ghi".

import { ORDER_PRODUCTS, formatMoney, type OrderChannel } from "./orders";

export type RestrictedStatus =
  | "Đã kiểm tra"
  | "Hoàn nhiều lần"
  | "Hạn chế"
  | "Đã hủy"
  | "Chờ duyệt thêm";

export type RestrictedSource = "AI cảnh báo" | "Hệ thống" | "CSKH";

export type RestrictedRow = {
  id: string;
  date: string;
  customer: string;
  phone: string;
  productSku: string;
  quantity: number;
  return1m: number;
  return3m: number;
  status: RestrictedStatus;
  source: RestrictedSource;
  orders3m: number;
  channel: OrderChannel;
};

export const RESTRICTED_STATUSES: RestrictedStatus[] = [
  "Đã kiểm tra",
  "Hoàn nhiều lần",
  "Hạn chế",
  "Đã hủy",
  "Chờ duyệt thêm",
];

export const RESTRICTED_SOURCES: RestrictedSource[] = ["AI cảnh báo", "Hệ thống", "CSKH"];

const PRODUCT_SHORT_NAMES: Record<string, string> = {
  "NM-25": "Nước mắm 25 độ",
  "NM-40": "Nước mắm 40 độ",
  "NM-15": "Nước mắm 15 độ",
  "HS-KHO": "Hải sản khô 500g",
};

export function restrictedProductLabel(row: RestrictedRow): string {
  return `${PRODUCT_SHORT_NAMES[row.productSku]} (${row.productSku}) x${row.quantity}`;
}

export function restrictedTotal(row: RestrictedRow): number {
  const product = ORDER_PRODUCTS.find((item) => item.sku === row.productSku);
  return (product?.unitPrice ?? 0) * row.quantity;
}

export function formatRestrictedTotal(row: RestrictedRow): string {
  return formatMoney(restrictedTotal(row));
}

// Ty le hoan tren 60% hien mau do, con lai mau xanh la.
export function restrictedRateClass(rate: number): string {
  return rate > 60 ? "text-red-700" : "text-green-700";
}

// Trong hop "Can cu quyet dinh" cua dialog, ty le cao hien mau do,
// ty le thap hien mau chu binh thuong thay vi mau xanh la.
export function restrictedBasisRateClass(rate: number): string {
  return rate > 60 ? "text-red-700" : "text-gray-900";
}

export const RESTRICTED_STATUS_PILL: Record<RestrictedStatus, string> = {
  "Hạn chế": "bg-red-50 text-red-700",
  "Hoàn nhiều lần": "bg-amber-50 text-amber-800",
  "Đã kiểm tra": "bg-green-50 text-green-700",
  "Đã hủy": "bg-gray-100 text-gray-700",
  // Mau pill cua "Cho duyet them" khong co tren trang 1 nen lay mau ho vang
  // giong trang thai cho xu ly khac.
  "Chờ duyệt thêm": "bg-amber-50 text-amber-800",
};

// 6 dong trang 1 la du lieu mau co dinh.
const EXPLICIT_ROWS: RestrictedRow[] = [
  { id: "DH-1061", date: "02/11", customer: "KH-058", phone: "0918 *** 674", productSku: "NM-25", quantity: 2, return1m: 75, return3m: 67, status: "Hạn chế", source: "CSKH", orders3m: 6, channel: "Chat" },
  { id: "DH-1058", date: "02/11", customer: "KH-041", phone: "0934 *** 902", productSku: "NM-40", quantity: 1, return1m: 67, return3m: 60, status: "Hoàn nhiều lần", source: "AI cảnh báo", orders3m: 5, channel: "Web" },
  { id: "DH-1052", date: "01/11", customer: "KH-027", phone: "0903 *** 781", productSku: "HS-KHO", quantity: 2, return1m: 33, return3m: 40, status: "Đã kiểm tra", source: "Hệ thống", orders3m: 4, channel: "Chat" },
  { id: "DH-1049", date: "01/11", customer: "KH-063", phone: "0905 *** 129", productSku: "NM-15", quantity: 1, return1m: 80, return3m: 71, status: "Hạn chế", source: "AI cảnh báo", orders3m: 7, channel: "Điện thoại" },
  { id: "DH-1046", date: "01/11", customer: "KH-019", phone: "0906 *** 443", productSku: "NM-25", quantity: 3, return1m: 50, return3m: 55, status: "Hoàn nhiều lần", source: "Hệ thống", orders3m: 5, channel: "Web" },
  { id: "DH-1042", date: "31/10", customer: "KH-052", phone: "0909 *** 318", productSku: "NM-40", quantity: 2, return1m: 20, return3m: 25, status: "Đã hủy", source: "CSKH", orders3m: 3, channel: "Chat" },
];

// 18 dong con lai, chia theo trang thai de tong du 24 ban ghi:
// Da kiem tra 8, Hoan nhieu lan 7, Han che 5, Da huy 3, Cho duyet them 1.
const DERIVED_ROWS: RestrictedRow[] = [
  { id: "DH-1037", date: "31/10", customer: "KH-030", phone: "0915 *** 221", productSku: "NM-25", quantity: 1, return1m: 72, return3m: 68, status: "Hạn chế", source: "AI cảnh báo", orders3m: 6, channel: "Chat" },
  { id: "DH-1035", date: "31/10", customer: "KH-047", phone: "0912 *** 630", productSku: "HS-KHO", quantity: 1, return1m: 45, return3m: 52, status: "Hoàn nhiều lần", source: "Hệ thống", orders3m: 4, channel: "Web" },
  { id: "DH-1031", date: "30/10", customer: "KH-012", phone: "0903 *** 114", productSku: "NM-40", quantity: 1, return1m: 30, return3m: 35, status: "Đã kiểm tra", source: "Hệ thống", orders3m: 3, channel: "Điện thoại" },
  { id: "DH-1028", date: "30/10", customer: "KH-066", phone: "0987 *** 502", productSku: "NM-15", quantity: 2, return1m: 58, return3m: 61, status: "Hoàn nhiều lần", source: "AI cảnh báo", orders3m: 5, channel: "Chat" },
  { id: "DH-1026", date: "30/10", customer: "KH-071", phone: "0934 *** 845", productSku: "NM-25", quantity: 2, return1m: 25, return3m: 28, status: "Đã kiểm tra", source: "CSKH", orders3m: 2, channel: "Web" },
  { id: "DH-1021", date: "29/10", customer: "KH-023", phone: "0906 *** 377", productSku: "NM-40", quantity: 1, return1m: 81, return3m: 74, status: "Hạn chế", source: "AI cảnh báo", orders3m: 8, channel: "Điện thoại" },
  { id: "DH-1018", date: "29/10", customer: "KH-055", phone: "0918 *** 908", productSku: "HS-KHO", quantity: 3, return1m: 48, return3m: 44, status: "Đã kiểm tra", source: "Hệ thống", orders3m: 4, channel: "Chat" },
  { id: "DH-1015", date: "29/10", customer: "KH-038", phone: "0909 *** 156", productSku: "NM-15", quantity: 1, return1m: 63, return3m: 59, status: "Hoàn nhiều lần", source: "CSKH", orders3m: 6, channel: "Web" },
  { id: "DH-1012", date: "28/10", customer: "KH-060", phone: "0912 *** 489", productSku: "NM-25", quantity: 1, return1m: 15, return3m: 18, status: "Đã hủy", source: "CSKH", orders3m: 2, channel: "Chat" },
  { id: "DH-1009", date: "28/10", customer: "KH-017", phone: "0903 *** 742", productSku: "NM-40", quantity: 2, return1m: 38, return3m: 42, status: "Đã kiểm tra", source: "Hệ thống", orders3m: 3, channel: "Điện thoại" },
  { id: "DH-1006", date: "28/10", customer: "KH-074", phone: "0987 *** 263", productSku: "HS-KHO", quantity: 1, return1m: 55, return3m: 57, status: "Hoàn nhiều lần", source: "AI cảnh báo", orders3m: 5, channel: "Web" },
  { id: "DH-1003", date: "27/10", customer: "KH-026", phone: "0934 *** 591", productSku: "NM-25", quantity: 2, return1m: 22, return3m: 30, status: "Đã kiểm tra", source: "CSKH", orders3m: 3, channel: "Chat" },
  { id: "DH-1101", date: "27/10", customer: "KH-081", phone: "0906 *** 834", productSku: "NM-15", quantity: 3, return1m: 66, return3m: 70, status: "Hạn chế", source: "AI cảnh báo", orders3m: 7, channel: "Điện thoại" },
  { id: "DH-1105", date: "27/10", customer: "KH-044", phone: "0915 *** 318", productSku: "NM-40", quantity: 1, return1m: 41, return3m: 47, status: "Đã kiểm tra", source: "Hệ thống", orders3m: 4, channel: "Web" },
  { id: "DH-1109", date: "26/10", customer: "KH-069", phone: "0918 *** 675", productSku: "HS-KHO", quantity: 2, return1m: 53, return3m: 49, status: "Hoàn nhiều lần", source: "CSKH", orders3m: 5, channel: "Chat" },
  { id: "DH-1112", date: "26/10", customer: "KH-033", phone: "0909 *** 402", productSku: "NM-25", quantity: 1, return1m: 12, return3m: 20, status: "Đã hủy", source: "Hệ thống", orders3m: 2, channel: "Điện thoại" },
  { id: "DH-1116", date: "26/10", customer: "KH-090", phone: "0912 *** 147", productSku: "NM-25", quantity: 2, return1m: 44, return3m: 58, status: "Chờ duyệt thêm", source: "AI cảnh báo", orders3m: 4, channel: "Chat" },
  { id: "DH-1119", date: "25/10", customer: "KH-086", phone: "0903 *** 860", productSku: "NM-40", quantity: 1, return1m: 29, return3m: 33, status: "Đã kiểm tra", source: "CSKH", orders3m: 3, channel: "Web" },
];

export const RESTRICTED_ROWS: RestrictedRow[] = [...EXPLICIT_ROWS, ...DERIVED_ROWS];
