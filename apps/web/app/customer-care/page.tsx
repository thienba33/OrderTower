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
  ApiTicket,
  ApiTicketKpis,
  CallsError,
  PriorityRow,
  ReturnChannelStat,
  ReturnsError,
  TicketsError,
} from "./customer-care-types";
import type {
  ApiChannel,
  ApiInventoryItem,
  ApiOrder,
} from "../orders/orders-types";
import type {
  ContactHistoryRow,
  TicketChannel,
  TicketRow,
} from "../../data/cskh";

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

// Lấy 1 object từ API, trả về object đã kiểm tra dạng (dùng cho KPI).
async function fetchObject<T>(path: string): Promise<T> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new ApiError(response.status, `API trả về ${response.status}.`);
  }
  const data: unknown = await response.json();
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ApiError(response.status, "API trả về dữ liệu không đúng dạng.");
  }
  return data as T;
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

// Lịch sử liên hệ gần đây từ nhật ký cuộc gọi thật: mỗi CallLog nối
// với đơn của nó để lấy tên khách, nối tiếp với kênh của đơn để lấy tên
// kênh. Log không nối được đơn (đơn không bao giờ bị xóa nên thực tế
// không xảy ra) hoặc không nối được kênh thì bỏ qua. Mới nhất lên trước.
function buildHistoryRows(
  logs: ApiCallLog[],
  orders: ApiOrder[],
  channels: ApiChannel[],
): ContactHistoryRow[] {
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const channelNameById = new Map(
    channels.map((channel) => [channel.id, channel.name]),
  );
  const rows: ContactHistoryRow[] = [];
  const sorted = [...logs].sort(
    (a, b) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      b.id.localeCompare(a.id),
  );
  for (const log of sorted) {
    const order = orderById.get(log.orderId);
    if (order === undefined) continue;
    const channelName =
      order.channelId === null
        ? undefined
        : channelNameById.get(order.channelId);
    if (
      channelName !== "Điện thoại" &&
      channelName !== "Chat" &&
      channelName !== "Web"
    ) {
      continue;
    }
    rows.push({
      time: formatDeadlineTime(log.createdAt) || "-",
      customer: order.customer,
      channel: channelName as TicketChannel,
      result: log.result,
      note: log.note ?? "—",
    });
  }
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
    // mục yêu cầu hỗ trợ và mục Cuộc gọi vẫn hiện như thường.
    returnsError =
      error instanceof ApiError && error.status === 401
        ? "unauthorized"
        : "load-failed";
  }

  // Ticket và KPI ticket là dữ liệu chính của màn, lấy riêng thành 1
  // khối: lỗi tải thì chỉ báo lỗi ở mục yêu cầu hỗ trợ, panel hoàn hàng
  // và mục Cuộc gọi vẫn hiện như thường. Giờ cập nhật ISO của API đổi
  // sang HH:MM giờ Việt Nam để khớp cột "Cập nhật" của bảng đóng băng.
  let tickets: TicketRow[] = [];
  let ticketKpis: ApiTicketKpis | null = null;
  let ticketsError: TicketsError | null = null;
  try {
    const [apiTickets, kpis] = await Promise.all([
      fetchList<ApiTicket>("/tickets"),
      fetchObject<ApiTicketKpis>("/tickets/kpis"),
    ]);
    tickets = apiTickets.map((ticket) => ({
      id: ticket.id,
      customer: ticket.customer,
      orderId: ticket.orderId,
      type: ticket.type,
      channel: ticket.channel,
      content: ticket.content,
      status: ticket.status,
      handler: ticket.handler,
      updated: formatDeadlineTime(ticket.updatedAt) || "-",
      needsCall: ticket.needsCall,
    }));
    ticketKpis = kpis;
  } catch (error) {
    ticketsError =
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
  let historyRows: ContactHistoryRow[] = [];
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
    historyRows = buildHistoryRows(logs, orders, channels);
  } catch (error) {
    callsError =
      error instanceof ApiError && error.status === 401
        ? "unauthorized"
        : "load-failed";
  }

  return (
    <CskhClient
      tickets={tickets}
      ticketKpis={ticketKpis}
      ticketsError={ticketsError}
      returnChannels={returnChannels}
      pendingReturns={pendingReturns}
      returnsError={returnsError}
      priorityRows={priorityRows}
      assignments={telesaleAssignments}
      callLogs={callLogs}
      historyRows={historyRows}
      callsError={callsError}
      username={session.username}
      roles={session.roles}
    />
  );
}
