// SPDX-License-Identifier: Apache-2.0
import type { Order } from '../orders/orders.types';

// Luật ưu tiên cuộc gọi telesale, nhân đôi từ web để API tự tính được
// (bản dự thảo AI chia đơn, câu 13: v1 nhân đôi luật ở API, khóa bằng test
// chung). Luật này phải khớp đúng buildPriorityRows ở
// apps/web/app/customer-care/page.tsx: đơn chưa kết thúc mà mốc giao đã qua
// hoặc trong 24 giờ tới, hoặc địa chỉ tin cậy thấp. Thứ hạng theo ETA tăng
// dần: quá hạn trước, không có mốc giao xuống cuối.
export const SLA_WINDOW_MS = 24 * 60 * 60 * 1000;
export const HIGH_VALUE_TOTAL = 300000;
export const LOW_TRUST_THRESHOLD = 70;
export const TERMINAL_ORDER_STATES = ['Hoàn', 'Hủy'];

export interface TelesalePriorityRow {
  orderId: string;
  customer: string;
  phone: string | null;
  deadline: string | null;
  total: number;
  addressTrust: number | null;
  reason: string;
  suggestion: string;
  eta: string;
  etaMinutes: number | null;
}

// Giờ "HH:mm" của mốc giao hẹn, giờ Việt Nam, sai thì "".
function formatDeadlineTime(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('hour')}:${get('minute')}`;
}

// Tính hàng hiển thị cho 1 đơn (lý do, gợi ý, ETA) mà không lọc ứng viên:
// dùng cho đơn đã chia sẵn cho CSKH (phân đơn Chờ xử lý đang có). Đơn đã
// kết thúc thì trả null (không còn gì để gọi).
export function toDisplayRow(
  order: Order,
  now: number,
): TelesalePriorityRow | null {
  if (TERMINAL_ORDER_STATES.includes(order.state)) return null;
  const deadlineMs =
    order.deadline === null ? null : Date.parse(order.deadline);
  const validDeadline = deadlineMs !== null && !Number.isNaN(deadlineMs);
  const overdue = validDeadline && (deadlineMs as number) <= now;
  const withinSlaWindow =
    validDeadline && (deadlineMs as number) - now <= SLA_WINDOW_MS;
  const lowTrust =
    order.addressTrust !== null && order.addressTrust < LOW_TRUST_THRESHOLD;

  let reason: string;
  let suggestion: string;
  if (lowTrust) {
    reason = 'Địa chỉ độ tin cậy thấp';
    suggestion = 'Xác nhận địa chỉ';
  } else if (order.total >= HIGH_VALUE_TOTAL) {
    reason = 'Đơn giá trị cao';
    suggestion = 'Xác nhận COD';
  } else if (withinSlaWindow) {
    reason = overdue ? 'Quá SLA giao hẹn' : 'Sắp quá SLA giao hẹn';
    suggestion = `Gọi trước ${formatDeadlineTime(order.deadline)}`;
  } else {
    reason = '-';
    suggestion = 'Nhắc nhận hàng';
  }

  let eta: string;
  let etaMinutes: number | null;
  if (!validDeadline) {
    eta = '-';
    etaMinutes = null;
  } else if (overdue) {
    eta = 'Quá hạn';
    etaMinutes = -1;
  } else {
    const minutes = Math.floor(((deadlineMs as number) - now) / 60000);
    eta = `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
    etaMinutes = minutes;
  }

  return {
    orderId: order.id,
    customer: order.customer,
    phone: order.phone,
    deadline: order.deadline,
    total: order.total,
    addressTrust: order.addressTrust,
    reason,
    suggestion,
    eta,
    etaMinutes,
  };
}

// Tính hàng ưu tiên cho 1 đơn. Trả null khi đơn không phải ứng viên ưu tiên
// (đã kết thúc, hoặc mốc giao còn xa và địa chỉ tin cậy đủ).
export function toPriorityRow(
  order: Order,
  now: number,
): TelesalePriorityRow | null {
  if (TERMINAL_ORDER_STATES.includes(order.state)) return null;
  const deadlineMs =
    order.deadline === null ? null : Date.parse(order.deadline);
  const validDeadline = deadlineMs !== null && !Number.isNaN(deadlineMs);
  const withinSlaWindow =
    validDeadline && (deadlineMs as number) - now <= SLA_WINDOW_MS;
  const lowTrust =
    order.addressTrust !== null && order.addressTrust < LOW_TRUST_THRESHOLD;
  if (!withinSlaWindow && !lowTrust) return null;
  return toDisplayRow(order, now);
}

// Xếp hạng các hàng ưu tiên: ETA tăng dần, quá hạn lên trước, không có mốc
// giao xuống cuối. Cùng thứ tự sắp xếp với web.
export function sortPriorityRows(
  rows: TelesalePriorityRow[],
): TelesalePriorityRow[] {
  return [...rows].sort((a, b) => {
    if (a.etaMinutes === null && b.etaMinutes === null) return 0;
    if (a.etaMinutes === null) return 1;
    if (b.etaMinutes === null) return -1;
    return a.etaMinutes - b.etaMinutes;
  });
}
