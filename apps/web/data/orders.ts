// SPDX-License-Identifier: Apache-2.0

// Du lieu mau dong bang ngay 02/11/2026, theo khung Figma Don hang (45:405).
// 8 dong dau lay dung tu Figma; 112 dong con lai sinh xac dinh tu so luong
// trang thai cua man Tong quan (14, 18, 22, 16, 12, 19, 11, 5, 3), khong dung
// so ngau nhien, chay lai van ra cung mot danh sach. Chua noi he thong that.

export type OrderStatus =
  | "Mới tạo"
  | "Đã kiểm tra"
  | "Chờ kho"
  | "Đang đóng gói"
  | "Chờ điều xe"
  | "Đang giao"
  | "Đã giao"
  | "Hoàn"
  | "Hủy";

export type OrderChannel = "Chat" | "Web" | "Điện thoại";

export type TrustLevel = "Tin cậy cao" | "Cần lưu ý" | "Rủi ro cao";

export type Order = {
  id: string;
  channel: OrderChannel;
  customer: string;
  phone: string;
  productSku: string;
  quantity: number;
  total: number;
  status: OrderStatus;
  deadline: string;
  trust: TrustLevel;
  address?: string;
  note?: string;
};

export const ORDER_STATUSES: OrderStatus[] = [
  "Mới tạo",
  "Đã kiểm tra",
  "Chờ kho",
  "Đang đóng gói",
  "Chờ điều xe",
  "Đang giao",
  "Đã giao",
  "Hoàn",
  "Hủy",
];

export const ORDER_CHANNELS: OrderChannel[] = ["Chat", "Web", "Điện thoại"];

export type OrderProduct = {
  sku: string;
  label: string;
  unitPrice: number;
};

export const ORDER_PRODUCTS: OrderProduct[] = [
  { sku: "NM-25", label: "NM-25 - Nước mắm 25 độ 500ml", unitPrice: 93000 },
  { sku: "NM-40", label: "NM-40 - Nước mắm 40 độ", unitPrice: 142000 },
  { sku: "NM-15", label: "NM-15 - Nước mắm 15 độ", unitPrice: 64000 },
  { sku: "HS-KHO", label: "HS-KHO - Hải sản khô 500 g", unitPrice: 105000 },
];

export function formatMoney(amount: number): string {
  return `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}đ`;
}

// 8 dong trang 1, lay dung tu Figma.
const EXPLICIT_ORDERS: Order[] = [
  { id: "DH-1051", channel: "Chat", customer: "KH-014", phone: "0912 *** 456", productSku: "NM-25", quantity: 2, total: 186000, status: "Chờ điều xe", deadline: "02/11 10:00", trust: "Tin cậy cao" },
  { id: "DH-1041", channel: "Web", customer: "KH-027", phone: "0903 *** 781", productSku: "NM-40", quantity: 1, total: 142000, status: "Đã kiểm tra", deadline: "02/11 11:00", trust: "Rủi ro cao" },
  { id: "DH-1044", channel: "Điện thoại", customer: "KH-033", phone: "0987 *** 210", productSku: "HS-KHO", quantity: 3, total: 315000, status: "Đang giao", deadline: "02/11 10:30", trust: "Cần lưu ý" },
  { id: "DH-1038", channel: "Chat", customer: "KH-041", phone: "0934 *** 902", productSku: "NM-25", quantity: 1, total: 93000, status: "Đã kiểm tra", deadline: "02/11 12:00", trust: "Rủi ro cao" },
  { id: "DH-1055", channel: "Web", customer: "KH-052", phone: "0909 *** 318", productSku: "NM-15", quantity: 2, total: 128000, status: "Chờ kho", deadline: "02/11 14:00", trust: "Tin cậy cao" },
  { id: "DH-1033", channel: "Chat", customer: "KH-058", phone: "0918 *** 674", productSku: "HS-KHO", quantity: 1, total: 105000, status: "Chờ kho", deadline: "02/11 11:30", trust: "Tin cậy cao" },
  { id: "DH-1029", channel: "Web", customer: "KH-019", phone: "0906 *** 443", productSku: "NM-40", quantity: 2, total: 284000, status: "Đang đóng gói", deadline: "02/11 09:30", trust: "Tin cậy cao" },
  { id: "DH-1024", channel: "Chat", customer: "KH-022", phone: "0915 *** 887", productSku: "NM-25", quantity: 4, total: 372000, status: "Đã giao", deadline: "02/11 09:00", trust: "Tin cậy cao" },
];

// So luong con lai theo tung trang thai, tru 8 dong tren.
const STATUS_REMAINING: [OrderStatus, number][] = [
  ["Mới tạo", 14],
  ["Đã kiểm tra", 16],
  ["Chờ kho", 20],
  ["Đang đóng gói", 15],
  ["Chờ điều xe", 11],
  ["Đang giao", 18],
  ["Đã giao", 10],
  ["Hoàn", 5],
  ["Hủy", 3],
];

const PHONE_PREFIXES = ["0912", "0903", "0987", "0934", "0909", "0918", "0906", "0915"];
const TRUST_CYCLE: TrustLevel[] = ["Tin cậy cao", "Tin cậy cao", "Tin cậy cao", "Cần lưu ý", "Rủi ro cao"];

function buildGeneratedOrders(): Order[] {
  const usedIds = new Set(EXPLICIT_ORDERS.map((order) => order.id));
  const ids: string[] = [];
  for (let n = 1001; n <= 1120 && ids.length < 112; n += 1) {
    const id = `DH-${n}`;
    if (!usedIds.has(id)) {
      ids.push(id);
    }
  }
  // Xep trang thai theo vong lap, het luot thi lap lai cho den khi du 112 dong.
  const queue: OrderStatus[] = [];
  const left = STATUS_REMAINING.map(([status, count]) => ({ status, left: count }));
  while (queue.length < 112) {
    let added = false;
    for (const item of left) {
      if (item.left > 0) {
        queue.push(item.status);
        item.left -= 1;
        added = true;
      }
    }
    if (!added) {
      break;
    }
  }
  return ids.map((id, i) => {
    const product = ORDER_PRODUCTS[i % ORDER_PRODUCTS.length];
    const quantity = 1 + (i % 4);
    const minutes = 8 * 60 + ((i * 30) % (8 * 60 + 30));
    const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mins = String(minutes % 60).padStart(2, "0");
    return {
      id,
      channel: ORDER_CHANNELS[i % ORDER_CHANNELS.length],
      customer: `KH-${String(1 + ((i * 7) % 99)).padStart(3, "0")}`,
      phone: `${PHONE_PREFIXES[i % PHONE_PREFIXES.length]} *** ${100 + ((i * 37) % 900)}`,
      productSku: product.sku,
      quantity,
      total: product.unitPrice * quantity,
      status: queue[i],
      deadline: `02/11 ${hours}:${mins}`,
      trust: TRUST_CYCLE[i % TRUST_CYCLE.length],
    };
  });
}

export const ORDERS: Order[] = [...EXPLICIT_ORDERS, ...buildGeneratedOrders()];

export const ORDER_STATUS_PILL: Record<OrderStatus, string> = {
  "Mới tạo": "bg-amber-50 text-amber-800",
  "Đã kiểm tra": "bg-amber-50 text-amber-800",
  "Chờ kho": "bg-amber-50 text-amber-800",
  "Đang đóng gói": "bg-green-50 text-green-700",
  "Chờ điều xe": "bg-green-50 text-green-700",
  "Đang giao": "bg-green-50 text-green-700",
  "Đã giao": "bg-green-50 text-green-700",
  Hoàn: "bg-green-50 text-green-700",
  Hủy: "bg-red-50 text-red-700",
};

export const ORDER_TRUST_TEXT: Record<TrustLevel, string> = {
  "Tin cậy cao": "text-green-700",
  "Cần lưu ý": "text-yellow-600",
  "Rủi ro cao": "text-red-700",
};
