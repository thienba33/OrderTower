// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { canAccessScreen, firstAllowedScreen } from "@/lib/roles";
import { redirect } from "next/navigation";
import OverviewClient from "./overview-client";
import { approvalTypeLabel } from "./approval-queue/approval-queue-types";
import type { ApiApproval } from "./approval-queue/approval-queue-types";
import type {
  ApiAnomaly,
  ApiDxScore,
  ApiRecommendation,
} from "./bi-dx-score/bi-dx-score-types";
import type {
  ApiAssignment,
  ApiReturn,
  ApiTicket,
} from "./customer-care/customer-care-types";
import type { ApiOrder } from "./orders/orders-types";
import type {
  ApiDriver,
  ApiVehicle,
} from "./orders/[id]/order-detail-types";
import type { ApiAuditRecord, ApiWorkflowDefinition } from "./orders/[id]/order-detail-types";
import type {
  ApiDeliveryEvent,
  BiWarningRow,
  DxSummary,
  FleetDriverRow,
  FleetVehicleRow,
  LowStockSection,
  LowTrustRow,
  MyCallsSection,
  MyWorkSection,
  OverviewKpi,
  OverviewView,
  SlaRiskRow,
  TicketSection,
} from "./overview-types";
import type { ApiInventoryItem } from "./warehouse/warehouse-types";
import { inventoryStatus } from "./warehouse/warehouse-types";

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

// Bộ KPI theo vai: Quản trị viên giữ 5 KPI hiện có, Quản lý xem KPI
// giám sát, Điều phối viên xem KPI điều hành, Nhân viên kho và CSKH
// không có hàng KPI (chỉ thấy mục việc của mình).
type KpiSet = "current" | "manager" | "dispatcher" | "none";

function buildView(
  orders: ApiOrder[],
  approvals: ApiApproval[],
  audit: ApiAuditRecord[],
  definition: ApiWorkflowDefinition,
  opts: {
    kpiSet: KpiSet;
    // null khi nhóm dữ liệu đó tải lỗi: bỏ KPI đó, không hiện số sai.
    biWarningCount: number | null;
    dxTotal: number | null;
    failedDeliveryCount: number | null;
    // Điều phối viên xem địa chỉ tin cậy thấp ở mục riêng nên bảng SLA
    // của vai này bỏ các dòng chỉ có nguy cơ tin cậy thấp.
    dispatcherSla: boolean;
  },
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

  const ordersToday = orders.filter((order) =>
    isToday(order.createdAt, today),
  ).length;
  const overdueSla = slaRows.filter(
    (row) => row.risk === "Quá SLA giao hẹn",
  ).length;
  const stateCount = (state: string) =>
    orders.filter((order) => order.state === state).length;

  let kpis: OverviewKpi[] | null;
  if (opts.kpiSet === "current") {
    kpis = [
      { label: "Đơn hôm nay", value: ordersToday },
      {
        label: "Đơn đang chạy",
        value: orders.filter((order) => !TERMINAL_STATES.includes(order.state)).length,
      },
      { label: "Chờ duyệt", value: approvals.length },
      { label: "Quá SLA / sắp quá", value: slaRows.length },
      { label: "Rào chắn hôm nay", value: denialsToday.length },
    ];
  } else if (opts.kpiSet === "manager") {
    kpis = [
      { label: "Đơn mới hôm nay", value: ordersToday },
      { label: "Duyệt đang chờ", value: approvals.length },
      ...(opts.biWarningCount === null
        ? []
        : [{ label: "Cảnh báo BI chưa xử lý", value: opts.biWarningCount }]),
      { label: "Đơn quá hạn SLA", value: overdueSla },
      ...(opts.dxTotal === null
        ? []
        : [{ label: "DX-Score hiện tại", value: opts.dxTotal }]),
    ];
  } else if (opts.kpiSet === "dispatcher") {
    kpis = [
      { label: "Đơn mới", value: ordersToday },
      { label: "Đơn chờ kho", value: stateCount("Chờ kho") },
      { label: "Đơn chờ điều xe", value: stateCount("Chờ điều xe") },
      { label: "Đơn đang giao", value: stateCount("Đang giao") },
      ...(opts.failedDeliveryCount === null
        ? []
        : [
            {
              label: "Giao thất bại cần xử lý lại",
              value: opts.failedDeliveryCount,
            },
          ]),
    ];
  } else {
    kpis = null;
  }

  return {
    kpis,
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
    slaRows: opts.dispatcherSla
      ? slaRows.filter((row) => row.risk !== "Địa chỉ tin cậy thấp")
      : slaRows,
    // Các mục theo role điền ở trang, sau khi tải xong nhóm dữ liệu
    // của role đó. null là ẩn hẳn mục đó với role hiện tại.
    dxSummary: null,
    biWarnings: null,
    lowTrustRows: null,
    fleetVehicles: null,
    fleetDrivers: null,
    myWork: null,
    lowStock: null,
    myCalls: null,
    myTickets: null,
    pendingReturns: null,
    loadWarnings: [],
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

// Lấy 1 đối tượng từ API, trả null khi API trả null. Sai dạng khác thì
// ném lỗi. Dùng cho /bi/dx-score và /bi/anomalies vì 2 endpoint này trả
// object {referenceDate, ...}, không phải mảng (lỗi màn BI từng mắc:
// dùng fetchList cho 2 endpoint này thì luôn ném lỗi).
async function fetchObject<T>(path: string): Promise<T | null> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new ApiError(response.status, `API trả về ${response.status}.`);
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return null;
  }
  if (data === null) {
    return null;
  }
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new ApiError(response.status, "API trả về dữ liệu không đúng dạng.");
  }
  return data as T;
}

// Hình trả về của GET /api/bi/anomalies, so khớp
// services/api/src/bi/bi.service.ts.
interface BiAnomaliesResponse {
  referenceDate: string | null;
  anomalies: ApiAnomaly[];
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

  const isAdmin = session.roles.includes("Quản trị viên");
  const isManager = session.roles.includes("Quản lý");
  const isDispatcher = session.roles.includes("Điều phối viên");
  const isWarehouse = session.roles.includes("Nhân viên kho");
  const isCskh = session.roles.includes("Nhân viên chăm sóc khách hàng");

  let orders: ApiOrder[];
  let approvals: ApiApproval[];
  let audit: ApiAuditRecord[];
  let definition: ApiWorkflowDefinition;
  try {
    const [orderList, approvalList, auditList, definitionData] =
      await Promise.all([
        fetchList<ApiOrder>("/orders"),
        fetchList<ApiApproval>("/approvals?status=pending"),
        fetchList<ApiAuditRecord>("/audit"),
        fetchDefinition(),
      ]);
    orders = orderList;
    approvals = approvalList;
    audit = auditList;
    definition = definitionData;
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

  // Dữ liệu bổ sung tải riêng theo role, mỗi nhóm lỗi thì chỉ hỏng mục
  // của nhóm đó (ghi vào loadWarnings để client hiện cảnh báo), các mục
  // chính vẫn hiện như thường.
  const loadWarnings: string[] = [];

  // DX-Score + cảnh báo BI (Quản trị viên, Quản lý). Gọi GET anomalies
  // trước vì nó có tác dụng phụ tạo đề xuất cho bất thường mới (như màn
  // BI), rồi mới đọc đề xuất để đối chiếu trạng thái xử lý.
  let dxSummary: DxSummary | null = null;
  let biWarnings: BiWarningRow[] | null = null;
  if (isAdmin || isManager) {
    try {
      const anomaliesRes = await fetchObject<BiAnomaliesResponse>(
        "/bi/anomalies",
      );
      if (anomaliesRes === null) {
        throw new ApiError(502, "API trả về dữ liệu không đúng dạng.");
      }
      const [recommendations, score] = await Promise.all([
        fetchList<ApiRecommendation>("/bi/recommendations"),
        fetchObject<ApiDxScore>("/bi/dx-score"),
      ]);
      if (score !== null) {
        dxSummary = {
          total: score.total,
          p: score.p.score,
          d: score.d.score,
          i: score.i.score,
          h: score.h.score,
        };
      }
      // Bất thường chưa xử lý = chưa có đề xuất đã quyết (duyệt hoặc từ
      // chối). API bất thường không có trạng thái xử lý nên phải đối
      // chiếu qua anomalyKey của đề xuất.
      const decided = new Set(
        recommendations
          .filter((rec) => rec.status !== "Chờ duyệt")
          .map((rec) => rec.anomalyKey),
      );
      biWarnings = anomaliesRes.anomalies
        .filter((anomaly) => !decided.has(anomaly.key))
        .map((anomaly) => ({
          key: anomaly.key,
          title: anomaly.title,
          detail: anomaly.detail,
        }));
    } catch {
      loadWarnings.push("DX-Score và cảnh báo BI");
    }
  }

  // Xe + tài xế sẵn sàng + đơn giao thất bại (Điều phối viên).
  let fleetVehicles: FleetVehicleRow[] | null = null;
  let fleetDrivers: FleetDriverRow[] | null = null;
  let failedDeliveryCount: number | null = null;
  if (isDispatcher) {
    try {
      const [vehicles, drivers, events] = await Promise.all([
        fetchList<ApiVehicle>("/vehicles"),
        fetchList<ApiDriver>("/drivers"),
        fetchList<ApiDeliveryEvent>("/delivery-events"),
      ]);
      fleetVehicles = vehicles
        .filter((vehicle) => vehicle.status === "Sẵn sàng")
        .map((vehicle) => ({
          id: vehicle.id,
          plate: vehicle.plate,
          type: vehicle.type,
        }));
      fleetDrivers = drivers
        .filter((driver) => driver.status === "Sẵn sàng")
        .map((driver) => ({
          id: driver.id,
          name: driver.name,
          phone: driver.phone,
        }));
      // Đơn giao thất bại cần xử lý lại = đơn chưa kết thúc mà có sự
      // kiện giao hàng loại "Giao thất bại". Không có trạng thái đơn
      // riêng cho giao thất bại nên đếm theo sự kiện.
      const failedOrderIds = new Set(
        events
          .filter((event) => event.type === "Giao thất bại")
          .map((event) => event.orderId),
      );
      failedDeliveryCount = orders.filter(
        (order) =>
          !TERMINAL_STATES.includes(order.state) &&
          failedOrderIds.has(order.id),
      ).length;
    } catch {
      loadWarnings.push("Xe, tài xế và đơn giao thất bại");
    }
  }

  // Địa chỉ tin cậy thấp chờ xác nhận (Điều phối viên): tính từ đơn đã
  // tải, không cần gọi thêm API.
  const lowTrustRows: LowTrustRow[] = orders
    .filter(
      (order) =>
        !TERMINAL_STATES.includes(order.state) &&
        order.addressTrust !== null &&
        order.addressTrust < 70,
    )
    .map((order) => ({
      id: order.id,
      customer: order.customer,
      trust: order.addressTrust as number,
      deadline: order.deadline ? formatShortDateTime(order.deadline) : "-",
    }))
    .sort((a, b) => a.trust - b.trust);

  // Việc của tôi + SKU sắp hết (Nhân viên kho).
  let myWork: MyWorkSection | null = null;
  let lowStock: LowStockSection | null = null;
  if (isWarehouse) {
    try {
      const [assignments, inventory] = await Promise.all([
        fetchList<ApiAssignment>(
          `/assignments?kind=warehouse&assignedTo=${encodeURIComponent(session.username)}`,
        ),
        fetchList<ApiInventoryItem>("/inventory"),
      ]);
      const orderById = new Map(orders.map((order) => [order.id, order]));
      const active = assignments
        .filter(
          (item) =>
            item.kind === "warehouse" &&
            item.assignedTo === session.username &&
            (item.status === "Chờ xử lý" || item.status === "Đang xử lý"),
        )
        .sort((a, b) =>
          a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
        );
      myWork = {
        waiting: active.filter((item) => item.status === "Chờ xử lý").length,
        packing: active.filter((item) => item.status === "Đang xử lý").length,
        rows: active.slice(0, 5).map((item) => {
          const order = orderById.get(item.orderId);
          return {
            orderId: item.orderId,
            customer: order?.customer ?? "-",
            orderState: order?.state ?? "-",
            status: item.status,
          };
        }),
      };
      // SKU sắp hết theo đúng quy ước hiển thị của màn Kho (tồn 0 là
      // Hết hàng, tồn <= 100 là Sắp hết). Dữ liệu mẫu có tới 33/40 SKU
      // ở ngưỡng này nên chỉ hiện 5 SKU tồn thấp nhất.
      const low = inventory
        .map((item) => ({ ...item, status: inventoryStatus(item) }))
        .filter((row) => row.status !== "Đủ hàng")
        .sort((a, b) => a.stock - b.stock);
      lowStock = {
        total: low.length,
        rows: low.slice(0, 5).map((row) => ({
          sku: row.sku,
          name: row.name,
          stock: row.stock,
          unit: row.unit,
          // Filter ở trên đã loại "Đủ hàng" nên chỉ còn 2 trạng thái này.
          status: row.status as "Hết hàng" | "Sắp hết",
        })),
      };
    } catch {
      loadWarnings.push("Việc của tôi và tồn kho");
    }
  }

  // Cuộc gọi + ticket + hoàn hàng (Nhân viên CSKH).
  let myCalls: MyCallsSection | null = null;
  let myTickets: TicketSection | null = null;
  let pendingReturns: number | null = null;
  if (isCskh) {
    try {
      const [assignments, tickets, returns] = await Promise.all([
        fetchList<ApiAssignment>(
          `/assignments?kind=telesale&assignedTo=${encodeURIComponent(session.username)}`,
        ),
        fetchList<ApiTicket>("/tickets"),
        fetchList<ApiReturn>("/returns"),
      ]);
      const orderById = new Map(orders.map((order) => [order.id, order]));
      const mine = assignments
        .filter(
          (item) =>
            item.kind === "telesale" && item.assignedTo === session.username,
        )
        .sort((a, b) =>
          a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
        );
      const activeCalls = mine.filter(
        (item) => item.status === "Chờ xử lý" || item.status === "Đang xử lý",
      );
      myCalls = {
        waiting: mine.filter((item) => item.status === "Chờ xử lý").length,
        inProgress: mine.filter((item) => item.status === "Đang xử lý").length,
        rows: activeCalls.slice(0, 5).map((item) => ({
          orderId: item.orderId,
          customer: orderById.get(item.orderId)?.customer ?? "-",
          status: item.status,
        })),
      };
      // Ticket đang mở của cả nhóm CSKH, không lọc theo người xử lý.
      const open = tickets
        .filter((ticket) => ticket.status !== "Đã đóng")
        .sort((a, b) =>
          a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
        );
      myTickets = {
        fresh: tickets.filter((ticket) => ticket.status === "Mới").length,
        inProgress: tickets.filter((ticket) => ticket.status === "Đang xử lý")
          .length,
        waitingCustomer: tickets.filter((ticket) => ticket.status === "Chờ khách")
          .length,
        rows: open.slice(0, 5).map((ticket) => ({
          id: ticket.id,
          customer: ticket.customer,
          orderId: ticket.orderId,
          type: ticket.type,
          status: ticket.status,
        })),
      };
      pendingReturns = returns.filter(
        (ret) => ret.status === "Chờ xử lý",
      ).length;
    } catch {
      loadWarnings.push("Cuộc gọi, ticket và hoàn hàng của tôi");
    }
  }

  const kpiSet: KpiSet = isAdmin
    ? "current"
    : isManager
      ? "manager"
      : isDispatcher
        ? "dispatcher"
        : "none";
  const view = buildView(orders, approvals, audit, definition, {
    kpiSet,
    biWarningCount: biWarnings === null ? null : biWarnings.length,
    dxTotal: dxSummary === null ? null : dxSummary.total,
    failedDeliveryCount,
    dispatcherSla: isDispatcher && !isAdmin && !isManager,
  });
  view.dxSummary = dxSummary;
  view.biWarnings = biWarnings;
  view.lowTrustRows = isDispatcher ? lowTrustRows : null;
  view.fleetVehicles = fleetVehicles;
  view.fleetDrivers = fleetDrivers;
  view.myWork = myWork;
  view.lowStock = lowStock;
  view.myCalls = myCalls;
  view.myTickets = myTickets;
  view.pendingReturns = pendingReturns;
  view.loadWarnings = loadWarnings;

  // Ẩn hẳn mục role không làm. Tài khoản nhiều vai thì hợp nhất các
  // mục của các vai đó (cùng quy ước hợp nhất trong lib/roles.ts).
  if (!(isAdmin || isManager || isDispatcher)) {
    view.flowStates = null;
    view.slaRows = null;
  }
  if (!(isAdmin || isManager)) {
    view.approvalRows = null;
    view.guardrailRows = null;
    view.dxSummary = null;
    view.biWarnings = null;
  }

  return <OverviewClient view={view} />;
}
