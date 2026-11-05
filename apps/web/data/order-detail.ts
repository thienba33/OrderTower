// SPDX-License-Identifier: Apache-2.0

// Chi tiet don hang cho man Chi tiet don (Figma 45:939).
// Don DH-1044 lay dung tu Figma. Cac don con lai suy ra xac dinh tu dong
// trong data/orders.ts (khach hang, SDT, kenh, san pham, trang thai, moc giao),
// khong dung so ngau nhien, chay lai van ra cung mot noi dung.
// Luu y: dong DH-1044 trong danh sach chi hien mat hang dau (HS-KHO x3,
// 315.000d), con man chi tiet hien du 2 mat hang, tong 408.000d.

import { ORDERS, ORDER_STATUSES, type Order, type OrderStatus } from "./orders";

export type OrderItemDetail = {
  name: string;
  sku: string;
  lot: string;
  expiry: string;
  quantity: number;
  total: number;
};

export type WorkflowEvent = {
  time: string;
  title: string;
  description: string;
  current: boolean;
};

export type AuditEntry = {
  time: string;
  actor: string;
  action: string;
  note: string;
  hash: string;
};

export type OrderDetail = {
  order: Order;
  createdAt: string;
  address: string;
  trustPercent: number;
  trustNote: string;
  items: OrderItemDetail[];
  total: number;
  events: WorkflowEvent[];
  audit: AuditEntry[];
};

const SKU_INFO: Record<string, { name: string; lot: string; expiry: string }> = {
  "NM-25": { name: "Nước mắm 25 độ", lot: "L-118", expiry: "20/11/2026" },
  "NM-40": { name: "Nước mắm 40 độ", lot: "L-121", expiry: "25/11/2026" },
  "NM-15": { name: "Nước mắm 15 độ", lot: "L-115", expiry: "18/11/2026" },
  "HS-KHO": { name: "Hải sản khô 500g", lot: "H-052", expiry: "15/12/2026" },
};

// Dia chi mau, xoay vong theo thu tu don trong danh sach.
const SAMPLE_ADDRESSES = [
  "Số 12, ngõ 45 phố Lò Đúc, Hai Bà Trưng, Hà Nội",
  "Số 8, ngõ 12 phố Huế, Hai Bà Trưng, Hà Nội",
  "Số 56 phố Hàng Bông, Hoàn Kiếm, Hà Nội",
  "Số 23, ngõ 7 phố Khâm Thiên, Đống Đa, Hà Nội",
  "Số 101 phố Láng Hạ, Đống Đa, Hà Nội",
];

const DRIVERS = ["Văn Hùng (LX01)", "Minh Quân (LX02)", "Đức Anh (LX03)"];

export function fakeHash(seed: string): string {
  let h1 = 0;
  let h2 = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h1 = (h1 * 31 + seed.charCodeAt(i)) >>> 0;
    h2 = (h2 * 17 + seed.charCodeAt(i) * 7) >>> 0;
  }
  const part = (n: number) => n.toString(16).padStart(8, "0").slice(0, 4);
  return `${part(h1)}...${part(h2)}`;
}

function minutesToTime(totalMinutes: number): string {
  const hours = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function addMinutes(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes);
}

// Chi tiet dung tu Figma cho don DH-1044.
const DH_1044: Omit<OrderDetail, "order"> = {
  createdAt: "08:12",
  address: "Số 12, ngõ 45 phố Lò Đúc, Hai Bà Trưng, Hà Nội",
  trustPercent: 78,
  trustNote: " (đã duyệt hiệu chỉnh)",
  items: [
    { name: "Hải sản khô 500g", sku: "HS-KHO", lot: "H-052", expiry: "15/12/2026", quantity: 3, total: 315000 },
    { name: "Nước mắm 25 độ", sku: "NM-25", lot: "L-118", expiry: "20/11/2026", quantity: 1, total: 93000 },
  ],
  total: 408000,
  events: [
    { time: "08:12", title: "Mới tạo", description: "Hệ thống tiếp nhận từ kênh Điện thoại", current: false },
    { time: "08:20", title: "Địa chỉ tin cậy thấp", description: "AI chuẩn hóa 78% - chuyển chờ duyệt hiệu chỉnh", current: false },
    { time: "09:12", title: "Đã kiểm tra", description: "Sơn duyệt hiệu chỉnh địa chỉ, lý do: khách xác nhận qua điện thoại", current: false },
    { time: "09:15", title: "Chờ kho - Đang đóng gói", description: "Kho xác nhận đủ tồn, lô H-052 và L-118", current: false },
    { time: "09:40", title: "Đang giao", description: "Văn Hùng (LX01) - Xe 01, ảnh bằng chứng khi giao xong", current: true },
  ],
  audit: [
    { time: "08:12", actor: "Hệ thống", action: "Tạo đơn", note: "Tiếp nhận kênh Điện thoại", hash: "a91f...c204" },
    { time: "08:20", actor: "AI chuẩn hóa", action: "Gắn cờ địa chỉ", note: "Độ tin cậy 78%", hash: "b377...9e11" },
    { time: "09:12", actor: "Sơn", action: "Duyệt hiệu chỉnh", note: "Khách xác nhận qua điện thoại", hash: "c802...47ab" },
    { time: "09:40", actor: "Văn Hùng", action: "Bắt đầu giao", note: "Xe 01, mốc giao 10:30", hash: "d1e6...83f0" },
  ],
};

const EVENT_DESCRIPTION: Record<OrderStatus, (order: Order, driver: string) => string> = {
  "Mới tạo": (order) => `Hệ thống tiếp nhận từ kênh ${order.channel}`,
  "Đã kiểm tra": () => "Điều phối viên kiểm tra đơn",
  "Chờ kho": () => "Chuyển kho chờ xác nhận tồn",
  "Đang đóng gói": (order) => `Kho xác nhận đủ tồn, lô ${SKU_INFO[order.productSku].lot}`,
  "Chờ điều xe": () => "Chờ điều xe giao hàng",
  "Đang giao": (_order, driver) => `${driver} - Xe 01, ảnh bằng chứng khi giao xong`,
  "Đã giao": (_order, driver) => `${driver} - Xe 01, đã giao kèm ảnh bằng chứng`,
  Hoàn: () => "Đơn hoàn tất, đối soát COD xong",
  Hủy: () => "Đơn đã hủy theo yêu cầu",
};

const AUDIT_ACTION: Record<OrderStatus, string> = {
  "Mới tạo": "Tạo đơn",
  "Đã kiểm tra": "Kiểm tra",
  "Chờ kho": "Chuyển kho",
  "Đang đóng gói": "Đóng gói",
  "Chờ điều xe": "Điều xe",
  "Đang giao": "Bắt đầu giao",
  "Đã giao": "Đã giao",
  Hoàn: "Hoàn đơn",
  Hủy: "Hủy đơn",
};

const AUDIT_ACTOR: Record<OrderStatus, (driver: string) => string> = {
  "Mới tạo": () => "Hệ thống",
  "Đã kiểm tra": () => "Sơn",
  "Chờ kho": () => "Kho",
  "Đang đóng gói": () => "Kho",
  "Chờ điều xe": () => "Sơn",
  "Đang giao": (driver) => driver.split(" ")[0],
  "Đã giao": (driver) => driver.split(" ")[0],
  Hoàn: () => "Sơn",
  Hủy: () => "Sơn",
};

export function getOrderDetail(order: Order): OrderDetail {
  if (order.id === "DH-1044") {
    return { order, ...DH_1044 };
  }
  const index = Math.max(0, ORDERS.findIndex((item) => item.id === order.id));
  const info = SKU_INFO[order.productSku];
  const driver = DRIVERS[index % DRIVERS.length];
  const trustPercent =
    order.trust === "Tin cậy cao" ? 92 + (index % 6) : order.trust === "Cần lưu ý" ? 78 : 45 + (index % 11);
  // Gio tao don = moc giao tru 2 gio.
  const deadlineTime = order.deadline.slice(6);
  const createdAt = addMinutes(deadlineTime, -120);
  const statusIndex = ORDER_STATUSES.indexOf(order.status);
  const reached = ORDER_STATUSES.slice(0, statusIndex + 1);
  const events: WorkflowEvent[] = reached.map((status, i) => ({
    time: addMinutes(createdAt, i * 25),
    title: status,
    description: EVENT_DESCRIPTION[status](order, driver),
    current: i === reached.length - 1,
  }));
  const audit: AuditEntry[] = events.map((event, i) => ({
    time: event.time,
    actor: AUDIT_ACTOR[event.title as OrderStatus](driver),
    action: AUDIT_ACTION[event.title as OrderStatus],
    note: event.description,
    hash: fakeHash(`${order.id}-${i}`),
  }));
  return {
    order,
    createdAt,
    address: SAMPLE_ADDRESSES[index % SAMPLE_ADDRESSES.length],
    trustPercent,
    trustNote: "",
    items: [{ name: info.name, sku: order.productSku, lot: info.lot, expiry: info.expiry, quantity: order.quantity, total: order.total }],
    total: order.total,
    events,
    audit,
  };
}
