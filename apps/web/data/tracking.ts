// SPDX-License-Identifier: Apache-2.0
// Man Theo doi don hang: goc nhin khach hang, rut gon tu chi tiet don.
// 5 buoc co dinh: Dat hang thanh cong, Da kiem tra, Dang dong goi,
// Dang giao, Da giao. Buoc "Dia chi tin cay thap" trong luong noi bo
// khong hien cho khach. Don Huy chi hien buoc da dat hang, vi khong biet
// thoi diem huy tu du lieu mau.

import { ORDERS, type Order, type OrderStatus } from "./orders";
import { getOrderDetail, type OrderDetail } from "./order-detail";

export type TrackingStepState = "done" | "current" | "todo";

export type TrackingStep = {
  title: string;
  time: string | null;
  description: string;
  state: TrackingStepState;
};

// Ten san pham day du nhu trong khung, khac voi ten ngan trong chi tiet don.
export const TRACKING_PRODUCT_NAMES: Record<string, string> = {
  "NM-25": "Nước mắm 25 độ 500ml",
  "NM-40": "Nước mắm 40 độ 500ml",
  "NM-15": "Nước mắm 15 độ 500ml",
  "HS-KHO": "Hải sản khô 500g",
};

// So buoc da toi theo trang thai don (chi so buoc, dem tu 1).
const REACHED_STEPS: Record<OrderStatus, number> = {
  "Mới tạo": 1,
  "Đã kiểm tra": 2,
  "Chờ kho": 2,
  "Đang đóng gói": 3,
  "Chờ điều xe": 3,
  "Đang giao": 4,
  "Đã giao": 5,
  Hoàn: 5,
  Hủy: 1,
};

// Buoc hien tai to do chi khi don dang chay (chua giao xong, chua huy).
const HAS_CURRENT_STEP: Record<OrderStatus, boolean> = {
  "Mới tạo": true,
  "Đã kiểm tra": true,
  "Chờ kho": true,
  "Đang đóng gói": true,
  "Chờ điều xe": true,
  "Đang giao": true,
  "Đã giao": false,
  Hoàn: false,
  Hủy: false,
};

function eventTime(detail: OrderDetail, titles: string[]): string | null {
  const event = detail.events.find((item) => titles.includes(item.title));
  return event ? event.time : null;
}

export function buildTrackingSteps(detail: OrderDetail): TrackingStep[] {
  const order = detail.order;
  const deadlineTime = order.deadline.slice(6);
  const reached = REACHED_STEPS[order.status];
  const hasCurrent = HAS_CURRENT_STEP[order.status];
  const times: (string | null)[] = [
    eventTime(detail, ["Mới tạo"]),
    eventTime(detail, ["Đã kiểm tra"]),
    eventTime(detail, ["Đang đóng gói", "Chờ kho - Đang đóng gói"]),
    eventTime(detail, ["Đang giao"]),
    eventTime(detail, ["Đã giao"]),
  ];
  const titles = ["Đặt hàng thành công", "Đã kiểm tra", "Đang đóng gói", "Đang giao", "Đã giao"];
  const descriptions = [
    `Đơn đã tiếp nhận từ kênh ${order.channel}.`,
    "Địa chỉ và hàng hóa đã xác nhận.",
    "Hàng đã đóng gói tại kho, chờ điều xe.",
    `Tài xế đang trên đường giao, mốc giao ${deadlineTime}.`,
    "Ảnh bằng chứng sẽ hiện ở đây khi giao xong.",
  ];
  return titles.map((title, index) => {
    const stepNumber = index + 1;
    const state: TrackingStepState =
      stepNumber < reached || (stepNumber === reached && !hasCurrent)
        ? "done"
        : stepNumber === reached && hasCurrent
          ? "current"
          : "todo";
    const description =
      stepNumber === 5 && stepNumber <= reached
        ? "Đã giao kèm ảnh bằng chứng."
        : descriptions[index];
    return { title, time: stepNumber <= reached ? times[index] : null, description, state };
  });
}

// Lay ten tai xe tu mo ta su kien giao hang, vi du "Van Hung (LX01) - Xe 01".
export function trackingDriver(detail: OrderDetail): string | null {
  const event = detail.events.find((item) => item.title === "Đang giao" || item.title === "Đã giao");
  if (!event) return null;
  const name = event.description.split(" - Xe ")[0].split(" (")[0].trim();
  return name || null;
}

export function findTrackedOrder(id: string): OrderDetail | null {
  const code = id.trim().toUpperCase();
  if (!code) return null;
  const order = ORDERS.find((item: Order) => item.id.toUpperCase() === code);
  return order ? getOrderDetail(order) : null;
}
