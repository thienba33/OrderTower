// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import TelesaleClient from "./telesale-client";
import type { PriorityRow } from "./telesale-types";
import type { ApiChannel, ApiInventoryItem, ApiOrder } from "../orders/orders-types";

const VN_TIMEZONE = "Asia/Ho_Chi_Minh";
const TERMINAL_STATES = ["Hoàn", "Hủy"];
const SLA_WINDOW_MS = 24 * 60 * 60 * 1000;
const HIGH_VALUE_TOTAL = 300000;
const LOW_TRUST_THRESHOLD = 70;

// Lấy 1 danh sách từ API. Lỗi HTTP hoặc dữ liệu không phải mảng thì ném
// ApiError để trang quyết định hiện nhắc đăng nhập hay báo lỗi.
async function fetchList<T>(path: string): Promise<T[]> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new ApiError(response.status, `API trả về ${response.status}.`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new ApiError(response.status, "API trả về dữ liệu không đúng dạng.");
  }
  return data as T[];
}

// Mốc giao hẹn dạng "DD/MM HH:mm" giờ Việt Nam, sai thì "-".
function formatDeadline(iso: string | null): string {
  if (iso === null) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: VN_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}/${get("month")} ${get("hour")}:${get("minute")}`;
}

// Giờ "HH:mm" của mốc giao hẹn, giờ Việt Nam, sai thì "".
function formatDeadlineTime(iso: string | null): string {
  if (iso === null) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: VN_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")}`;
}

// Đơn nên ưu tiên gọi, giống quy tắc bảng SLA ở màn Tổng quan: đơn chưa kết
// thúc mà mốc giao đã qua hoặc trong 24 giờ tới, hoặc địa chỉ tin cậy thấp.
// Lý do và gợi ý suy ra từ dữ liệu thật, theo thứ tự ưu tiên: tin cậy thấp
// -> đơn giá trị cao -> sắp/quá SLA -> còn lại.
function buildPriorityRows(
  orders: ApiOrder[],
  channels: ApiChannel[],
  products: ApiInventoryItem[],
  now: number,
): PriorityRow[] {
  const channelNameById = new Map(channels.map((channel) => [channel.id, channel.name]));
  const productNameBySku = new Map(products.map((product) => [product.sku, product.name]));
  const rows: PriorityRow[] = [];

  for (const order of orders) {
    if (TERMINAL_STATES.includes(order.state)) continue;
    const deadlineMs = order.deadline === null ? null : Date.parse(order.deadline);
    const validDeadline = deadlineMs !== null && !Number.isNaN(deadlineMs);
    const overdue = validDeadline && (deadlineMs as number) <= now;
    const withinSlaWindow =
      validDeadline && (deadlineMs as number) - now <= SLA_WINDOW_MS;
    const lowTrust = order.addressTrust !== null && order.addressTrust < LOW_TRUST_THRESHOLD;
    if (!withinSlaWindow && !lowTrust) continue;

    let reason: string;
    let suggestion: string;
    if (lowTrust) {
      reason = "Địa chỉ độ tin cậy thấp";
      suggestion = "Xác nhận địa chỉ";
    } else if (order.total >= HIGH_VALUE_TOTAL) {
      reason = "Đơn giá trị cao";
      suggestion = "Xác nhận COD";
    } else if (withinSlaWindow) {
      reason = overdue ? "Quá SLA giao hẹn" : "Sắp quá SLA giao hẹn";
      suggestion = `Gọi trước ${formatDeadlineTime(order.deadline)}`;
    } else {
      reason = "-";
      suggestion = "Nhắc nhận hàng";
    }

    let eta: string;
    let etaMinutes: number | null;
    if (!validDeadline) {
      eta = "-";
      etaMinutes = null;
    } else if (overdue) {
      eta = "Quá hạn";
      etaMinutes = -1;
    } else {
      const minutes = Math.floor(((deadlineMs as number) - now) / 60000);
      eta = `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
      etaMinutes = minutes;
    }

    rows.push({
      id: order.id,
      channel: order.channelId === null ? "-" : (channelNameById.get(order.channelId) ?? "-"),
      customer: order.customer,
      phone: order.phone ?? "-",
      deadline: formatDeadline(order.deadline),
      product: order.items
        .map((item) => `${productNameBySku.get(item.sku) ?? item.sku} x${item.quantity}`)
        .join(", "),
      eta,
      etaMinutes,
      suggestion,
      reason,
    });
  }

  // Mốc giao tăng dần: đơn quá hạn lên trước, đơn không có mốc xuống cuối.
  rows.sort((a, b) => {
    if (a.etaMinutes === null && b.etaMinutes === null) return 0;
    if (a.etaMinutes === null) return 1;
    if (b.etaMinutes === null) return -1;
    return a.etaMinutes - b.etaMinutes;
  });
  return rows;
}

export default async function TelesalePage() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-gray-900">Telesale</h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Bạn chưa đăng nhập.{" "}
          <Link href="/api/auth/login" className="font-medium text-red-700 underline">
            Đăng nhập
          </Link>{" "}
          để xem đơn nên ưu tiên gọi từ API.
        </p>
      </div>
    );
  }

  if (!canAccessScreen("/telesale", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Telesale" />;
  }

  let orders: ApiOrder[];
  let channels: ApiChannel[];
  let products: ApiInventoryItem[];
  try {
    [orders, channels, products] = await Promise.all([
      fetchList<ApiOrder>("/orders"),
      fetchList<ApiChannel>("/channels"),
      fetchList<ApiInventoryItem>("/inventory"),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold text-gray-900">Telesale</h1>
          <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            Phiên đăng nhập đã hết hạn.{" "}
            <Link href="/api/auth/login" className="font-medium text-red-700 underline">
              Đăng nhập lại
            </Link>{" "}
            để xem đơn nên ưu tiên gọi từ API.
          </p>
        </div>
      );
    }
    const message =
      error instanceof Error ? error.message : "Không tải được danh sách đơn ưu tiên.";
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-gray-900">Telesale</h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Không tải được danh sách đơn ưu tiên: {message}
        </p>
      </div>
    );
  }

  const rows = buildPriorityRows(orders, channels, products, Date.now());
  return <TelesaleClient rows={rows} />;
}
