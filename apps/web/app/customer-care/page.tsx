// SPDX-License-Identifier: Apache-2.0
import { redirect } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import CskhClient from "./customer-care-client";
import type {
  ApiAssignment,
  ApiCallLog,
  ApiReturn,
  CallsError,
  PriorityRow,
  ReturnChannelStat,
  ReturnsError,
} from "./customer-care-types";
import type {
  ApiChannel,
  ApiInventoryItem,
  ApiOrder,
} from "../orders/orders-types";

// Lấy danh sách từ API, trả về mảng đã kiểm tra dạng.
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

// Tính hoàn hàng theo từng kênh từ 3 danh sách API: đơn của kênh nào
// thì tính vào kênh đó, trả hàng theo đơn của kênh đó.
function buildReturnChannels(
  returns: ApiReturn[],
  orders: ApiOrder[],
  channels: ApiChannel[],
): ReturnChannelStat[] {
  const orderChannel = new Map(
    orders.map((order) => [order.id, order.channelId]),
  );
  return channels.map((channel) => {
    const orderCount = orders.filter(
      (order) => order.channelId === channel.id,
    ).length;
    const returnCount = returns.filter(
      (ret) => orderChannel.get(ret.orderId) === channel.id,
    ).length;
    return {
      channel: channel.name,
      returns: returnCount,
      orders: orderCount,
      percent:
        orderCount === 0 ? 0 : Math.round((returnCount / orderCount) * 100),
    };
  });
}

const VN_TIMEZONE = "Asia/Ho_Chi_Minh";
const TERMINAL_STATES = ["Hoàn", "Hủy"];
const SLA_WINDOW_MS = 24 * 60 * 60 * 1000;
const HIGH_VALUE_TOTAL = 300000;
const LOW_TRUST_THRESHOLD = 70;

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
// -> đơn giá trị cao -> sắp/quá SLA -> còn lại. Chuyển từ màn Telesale cũ
// sang khi gộp 2 màn thành 1 màn Chăm sóc khách hàng.
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

export default async function CskhPage() {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  if (!canAccessScreen("/customer-care", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="Chăm sóc khách hàng" />;
  }

  let returnChannels: ReturnChannelStat[] = [];
  let pendingReturns: number | null = null;
  let returnsError: ReturnsError | null = null;
  try {
    const [returns, orders, channels] = await Promise.all([
      fetchList<ApiReturn>("/returns"),
      fetchList<ApiOrder>("/orders"),
      fetchList<ApiChannel>("/channels"),
    ]);
    returnChannels = buildReturnChannels(returns, orders, channels);
    pendingReturns = returns.filter(
      (ret) => ret.status === "Chờ xử lý",
    ).length;
  } catch (error) {
    // Panel hoàn hàng là dữ liệu phụ: lỗi tải thì chỉ báo lỗi ở panel,
    // phần yêu cầu hỗ trợ vẫn hiện bằng dữ liệu mẫu như trước.
    returnsError =
      error instanceof ApiError && error.status === 401
        ? "unauthorized"
        : "load-failed";
  }

  // Cuộc gọi là dữ liệu phụ riêng: lỗi tải thì chỉ báo lỗi ở mục Cuộc
  // gọi, phần yêu cầu hỗ trợ và panel hoàn hàng vẫn hiện như thường.
  // Lấy riêng đơn/kênh/tồn kho ở khối này để lỗi ở đây không làm hỏng
  // panel hoàn hàng ở khối trên.
  let priorityRows: PriorityRow[] = [];
  let telesaleAssignments: ApiAssignment[] = [];
  let callLogs: ApiCallLog[] = [];
  let callsError: CallsError | null = null;
  try {
    const [orders, channels, products, assignments, logs] = await Promise.all([
      fetchList<ApiOrder>("/orders"),
      fetchList<ApiChannel>("/channels"),
      fetchList<ApiInventoryItem>("/inventory"),
      fetchList<ApiAssignment>("/assignments?kind=telesale"),
      fetchList<ApiCallLog>("/call-logs"),
    ]);
    priorityRows = buildPriorityRows(orders, channels, products, Date.now());
    telesaleAssignments = assignments.filter((item) => item.kind === "telesale");
    callLogs = logs;
  } catch (error) {
    callsError =
      error instanceof ApiError && error.status === 401
        ? "unauthorized"
        : "load-failed";
  }

  return (
    <CskhClient
      returnChannels={returnChannels}
      pendingReturns={pendingReturns}
      returnsError={returnsError}
      priorityRows={priorityRows}
      assignments={telesaleAssignments}
      callLogs={callLogs}
      callsError={callsError}
      username={session.username}
      roles={session.roles}
    />
  );
}
