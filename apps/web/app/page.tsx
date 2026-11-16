// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { canAccessScreen, firstAllowedScreen } from "@/lib/roles";
import { redirect } from "next/navigation";
import OverviewClient from "./overview-client";
import { approvalTypeLabel } from "./approval-queue/approval-queue-types";
import type { ApiApproval } from "./approval-queue/approval-queue-types";
import type { ApiAuditRecord, ApiWorkflowDefinition } from "./orders/[id]/order-detail-types";
import type { ApiOrder } from "./orders/orders-types";
import type { OverviewView, SlaRiskRow } from "./overview-types";

const VN_TIMEZONE = "Asia/Ho_Chi_Minh";
const TERMINAL_STATES = ["Hoàn", "Hủy"];
const SLA_DAY_MS = 24 * 60 * 60 * 1000;

// 5 loại duyệt hiện trong hàng đợi, theo đúng thứ tự của bản mẫu.
const APPROVAL_ROW_TYPES = [
  "address.low-trust",
  "customer.restrict",
  "order.overload",
  "sales.regulate",
  "ai.proposal",
];

// 4 loại rào chắn hiện trong dashboard, theo đúng thứ tự của bản mẫu.
const GUARDRAIL_LABELS = [
  "Chuyển trạng thái trái phép",
  "Tồn kho không đủ",
  "Đơn trùng",
  "Địa chỉ chưa đạt mức tối thiểu",
];

// Ngày theo giờ Việt Nam dạng YYYY-MM-DD để so sánh "hôm nay".
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: VN_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function isToday(iso: string, today: string): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return dayKeyFormat.format(date) === today;
}

// ISO -> "DD/MM HH:mm" giờ Việt Nam, sai thì "-".
function formatShortDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: VN_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}/${get("month")} ${get("hour")}:${get("minute")}`;
}

// Phân loại 1 lần chặn (audit denial) bằng chuỗi con trong detail.
// So khớp không phân biệt hoa thường vì API ghi detail dạng câu
// ("Tồn kho không đủ: ...", "Địa chỉ của đơn ... chỉ đạt mức tin cậy ...").
function classifyGuardrail(detail: string): string {
  const text = detail.toLowerCase();
  if (text.includes("tồn kho")) {
    return "Tồn kho không đủ";
  }
  if (text.includes("trùng")) {
    return "Đơn trùng";
  }
  if (text.includes("tin cậy") || text.includes("địa chỉ")) {
    return "Địa chỉ chưa đạt mức tối thiểu";
  }
  return "Chuyển trạng thái trái phép";
}

function buildSlaRows(orders: ApiOrder[], now: number): SlaRiskRow[] {
  const candidates: { deadlineMs: number | null; row: SlaRiskRow }[] = [];
  for (const order of orders) {
    if (TERMINAL_STATES.includes(order.state)) {
      continue;
    }
    const deadlineMs = order.deadline ? Date.parse(order.deadline) : NaN;
    const hasDeadline = Number.isFinite(deadlineMs);
    const overdue = hasDeadline && deadlineMs <= now;
    const soon = hasDeadline && deadlineMs > now && deadlineMs - now <= SLA_DAY_MS;
    const lowTrust = order.addressTrust !== null && order.addressTrust < 70;
    if (!overdue && !soon && !lowTrust) {
      continue;
    }
    // Đơn thỏa cả 2 điều kiện thì ưu tiên hiển thị lý do deadline.
    const risk = overdue
      ? "Quá SLA giao hẹn"
      : soon
        ? "Sắp quá SLA giao hẹn"
        : "Địa chỉ tin cậy thấp";
    const action = lowTrust
      ? "Xác nhận ĐC"
      : order.state === "Chờ kho" || order.state === "Đang đóng gói"
        ? "Ưu tiên kho"
        : "Gọi khách";
    candidates.push({
      deadlineMs: hasDeadline ? deadlineMs : null,
      row: {
        action,
        customer: order.customer,
        deadline: order.deadline ? formatShortDateTime(order.deadline) : "-",
        id: order.id,
        risk,
        status: order.state,
      },
    });
  }
  // Mốc quá hạn (thời gian trong quá khứ) tự lên trước khi xếp theo mốc
  // tăng dần; đơn không có mốc xuống cuối.
  candidates.sort((a, b) => (a.deadlineMs ?? Infinity) - (b.deadlineMs ?? Infinity));
  return candidates.map((candidate) => candidate.row);
}

function buildView(
  orders: ApiOrder[],
  approvals: ApiApproval[],
  audit: ApiAuditRecord[],
  definition: ApiWorkflowDefinition,
): OverviewView {
  const today = dayKeyFormat.format(new Date());
  const now = Date.now();

  const slaRows = buildSlaRows(orders, now);
  const denialsToday = audit.filter(
    (record) => record.action.endsWith(".denied") && isToday(record.at, today),
  );

  const counts = definition.states.map(
    (state) => orders.filter((order) => order.state === state).length,
  );
  const maxCount = counts.length > 0 ? Math.max(...counts) : 0;
  const firstMax = counts.indexOf(maxCount);

  return {
    kpis: [
      {
        label: "Đơn hôm nay",
        value: orders.filter((order) => isToday(order.createdAt, today)).length,
      },
      {
        label: "Đơn đang chạy",
        value: orders.filter((order) => !TERMINAL_STATES.includes(order.state)).length,
      },
      { label: "Chờ duyệt", value: approvals.length },
      { label: "Quá SLA / sắp quá", value: slaRows.length },
      { label: "Rào chắn hôm nay", value: denialsToday.length },
    ],
    flowStates: definition.states.map((label, index) => ({
      count: counts[index],
      highlight: index === firstMax,
      label,
    })),
    approvalRows: APPROVAL_ROW_TYPES.map((type) => ({
      count: approvals.filter((approval) => approval.type === type).length,
      label: approvalTypeLabel(type),
    })),
    pendingTotal: approvals.length,
    guardrailRows: GUARDRAIL_LABELS.map((label) => ({
      count: denialsToday.filter((record) => classifyGuardrail(record.detail) === label).length,
      label,
    })),
    guardrailTotal: denialsToday.length,
    slaRows,
  };
}

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

async function fetchDefinition(): Promise<ApiWorkflowDefinition> {
  const response = await apiFetch("/workflow/definition?definitionId=order-flow");
  if (!response.ok) {
    throw new ApiError(response.status, `API trả về ${response.status}.`);
  }
  const data: unknown = await response.json();
  if (
    data === null ||
    typeof data !== "object" ||
    !Array.isArray((data as ApiWorkflowDefinition).states)
  ) {
    throw new ApiError(response.status, "API trả về dữ liệu không đúng dạng.");
  }
  return data as ApiWorkflowDefinition;
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams?: { auth?: string | string[] };
}) {
  const session = await getSession();
  if (!session) {
    // Chưa đăng nhập thì chuyển thẳng tới trang đăng nhập của Keycloak,
    // không hiện khung dashboard kèm dòng nhắc đăng nhập. Ngoại lệ duy
    // nhất: callback đăng nhập báo lỗi (?auth=error) thì giữ lại dòng
    // nhắc để người dùng biết lần đăng nhập vừa rồi đã thất bại, tránh
    // vòng lặp chuyển hướng âm thầm giữa app và Keycloak.
    if (searchParams?.auth !== 'error') {
      redirect('/api/auth/login');
    }
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-gray-900">Tổng quan điều hành</h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Bạn chưa đăng nhập.{" "}
          <Link href="/api/auth/login" className="font-medium text-red-700 underline">
            Đăng nhập
          </Link>{" "}
          để xem tổng quan từ API.
        </p>
      </div>
    );
  }

  // Trang chủ là màn Tổng quan; vai không được xem Tổng quan thì chuyển
  // về màn đầu tiên được phép của vai đó (Tài xế -> /driver, Khách hàng
  // mô phỏng -> /tracking).
  if (!canAccessScreen("/", session.roles)) {
    redirect(firstAllowedScreen(session.roles));
  }

  let view: OverviewView;
  try {
    const [orders, approvals, audit, definition] = await Promise.all([
      fetchList<ApiOrder>("/orders"),
      fetchList<ApiApproval>("/approvals?status=pending"),
      fetchList<ApiAuditRecord>("/audit"),
      fetchDefinition(),
    ]);
    view = buildView(orders, approvals, audit, definition);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold text-gray-900">Tổng quan điều hành</h1>
          <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            Phiên đăng nhập đã hết hạn.{" "}
            <Link href="/api/auth/login" className="font-medium text-red-700 underline">
              Đăng nhập lại
            </Link>{" "}
            để xem tổng quan từ API.
          </p>
        </div>
      );
    }
    const message =
      error instanceof Error ? error.message : "Không tải được tổng quan.";
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-gray-900">Tổng quan điều hành</h1>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Không tải được tổng quan: {message}
        </p>
      </div>
    );
  }

  return <OverviewClient view={view} />;
}
