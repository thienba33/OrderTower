"use client";

// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { Pagination } from "../../components/ui/Pagination";
import { Table, type TableColumn } from "../../components/ui/Table";
import {
  CSKH_KPIS,
  TICKET_CHANNELS,
  TICKET_STATUSES,
  TICKET_STATUS_PILL,
  TICKET_TYPES,
  type ContactHistoryRow,
  type TicketChannel,
  type TicketRow,
  type TicketStatus,
  type TicketType,
} from "../../data/cskh";
import { isUrgentEta } from "../../data/telesale";
import {
  DEMO_CSKH_ACCOUNTS,
  type ApiAssignment,
  type ApiCallLog,
  type ApiNextCall,
  type ApiTicketKpis,
  type AssignmentStatus,
  type CallResult,
  type CallsError,
  type PriorityRow,
  type ReturnChannelStat,
  type ReturnsError,
  type TicketsError,
} from "./customer-care-types";

interface CskhClientProps {
  tickets: TicketRow[];
  ticketKpis: ApiTicketKpis | null;
  ticketsError: TicketsError | null;
  returnChannels: ReturnChannelStat[];
  pendingReturns: number | null;
  returnsError: ReturnsError | null;
  priorityRows: PriorityRow[];
  assignments: ApiAssignment[];
  callLogs: ApiCallLog[];
  historyRows: ContactHistoryRow[];
  callsError: CallsError | null;
  username: string;
  roles: string[];
}

const PAGE_SIZE = 6;

// Trạng thái kế tiếp khi đổi trạng thái ticket: chỉ đi xuôi 1 bước,
// không nhảy cóc, không quay lại trạng thái trước.
const NEXT_TICKET_STATUS: Record<Exclude<TicketStatus, "Đã đóng">, TicketStatus> = {
  "Mới": "Đang xử lý",
  "Đang xử lý": "Chờ khách",
  "Chờ khách": "Đã đóng",
};

const ticketColumns: TableColumn<TicketRow>[] = [
  { key: "id", header: "Mã YC", render: (row) => <span className="font-medium text-gray-900">{row.id}</span>, cellClassName: "w-[100px]" },
  { key: "customer", header: "Khách hàng", render: (row) => row.customer, cellClassName: "w-[110px]" },
  { key: "orderId", header: "Mã đơn", render: (row) => row.orderId, cellClassName: "w-[100px]" },
  { key: "type", header: "Loại yêu cầu", render: (row) => row.type, cellClassName: "w-[150px]" },
  { key: "channel", header: "Kênh", render: (row) => row.channel, cellClassName: "w-[80px]" },
  { key: "content", header: "Nội dung", render: (row) => row.content, cellClassName: "w-[220px] !whitespace-normal" },
  {
    key: "status",
    header: "Trạng thái",
    render: (row) => (
      <span className={`inline-flex h-[22px] items-center rounded-full px-[10px] text-xs font-medium ${TICKET_STATUS_PILL[row.status]}`}>
        {row.status}
      </span>
    ),
    cellClassName: "w-[140px]",
  },
  { key: "handler", header: "Người xử lý", render: (row) => row.handler, cellClassName: "w-[120px]" },
  { key: "updated", header: "Cập nhật", render: (row) => row.updated, cellClassName: "w-[140px]" },
];

const historyColumns: TableColumn<ContactHistoryRow>[] = [
  { key: "time", header: "Thời gian", render: (row) => row.time, cellClassName: "w-[140px]" },
  { key: "customer", header: "Khách hàng", render: (row) => row.customer, cellClassName: "w-[150px]" },
  { key: "channel", header: "Kênh", render: (row) => row.channel, cellClassName: "w-[130px]" },
  { key: "result", header: "Kết quả", render: (row) => row.result, cellClassName: "w-[220px]" },
  { key: "note", header: "Ghi chú", render: (row) => row.note, cellClassName: "w-[520px] !whitespace-normal" },
];

// Mục Cuộc gọi: 7 dòng 1 trang, giống bảng đơn ưu tiên ở màn Telesale cũ.
const CALL_PAGE_SIZE = 7;

// Tài khoản mặc định khi điều phối viên chia đơn mà chưa chọn ai.
const DEFAULT_ASSIGNEE = DEMO_CSKH_ACCOUNTS[0] ?? "demo.customer-service";

const MY_STATUS_PILL: Record<AssignmentStatus, string> = {
  "Chờ xử lý": "bg-amber-50 text-amber-800",
  "Đang xử lý": "bg-green-50 text-green-700",
  "Hoàn thành": "bg-blue-50 text-blue-700",
  "Đã hủy": "bg-gray-50 text-gray-700",
};

// 1 dòng bảng nhân viên: số liệu tính từ phân đơn và nhật ký cuộc gọi,
// nhân viên chỉ xuất hiện khi đã được giao đơn hoặc đã ghi cuộc gọi.
interface StaffRow {
  name: string;
  assigned: number;
  completed: number;
  success: number;
  failed: number;
  avgSeconds: number;
}

const staffColumns: TableColumn<StaffRow>[] = [
  { key: "name", header: "Nhân viên", render: (row) => <span className="font-medium text-gray-900">{row.name}</span>, cellClassName: "w-[200px]" },
  { key: "assigned", header: "Được giao", render: (row) => row.assigned, cellClassName: "w-[110px]" },
  { key: "completed", header: "Hoàn thành", render: (row) => row.completed, cellClassName: "w-[120px]" },
  { key: "success", header: "Thành công", render: (row) => row.success, cellClassName: "w-[120px]" },
  { key: "failed", header: "Thất bại", render: (row) => row.failed, cellClassName: "w-[110px]" },
  { key: "avgSeconds", header: "Thời gian TB (giây)", render: (row) => row.avgSeconds, cellClassName: "w-[170px]" },
];

export default function CskhPage({
  tickets,
  ticketKpis,
  ticketsError,
  returnChannels,
  pendingReturns,
  returnsError,
  priorityRows,
  assignments,
  callLogs,
  historyRows,
  callsError,
  username,
  roles,
}: CskhClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [callOnly, setCallOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [formCustomer, setFormCustomer] = useState("");
  const [formOrderId, setFormOrderId] = useState("");
  const [formType, setFormType] = useState<TicketType>("Giao trễ");
  const [formChannel, setFormChannel] = useState<TicketChannel>("Chat");
  const [formContent, setFormContent] = useState("");
  // Lỗi và trạng thái bận của thao tác ticket (tạo mới, đổi trạng thái).
  const [ticketFormError, setTicketFormError] = useState("");
  const [ticketErrorText, setTicketErrorText] = useState("");
  const [busyTicket, setBusyTicket] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const bannerCounts = useMemo(
    () => ({
      late: tickets.filter((row) => row.type === "Giao trễ").length,
      toCall: tickets.filter((row) => row.needsCall).length,
    }),
    [tickets],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((row) => {
      if (callOnly && !row.needsCall) return false;
      if (typeFilter && row.type !== typeFilter) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (channelFilter && row.channel !== channelFilter) return false;
      if (q && ![row.id, row.customer, row.orderId, row.content].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [tickets, search, typeFilter, statusFilter, channelFilter, callOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 4 thẻ đầu lấy số ticket từ API; thẻ "Hoàn / trả chờ xử lý" lấy số
  // trả hàng chờ xử lý từ API. Tải lỗi thì thẻ đó hiện dấu gạch ngang.
  const ticketKpiByLabel: Record<string, number> = {
    "Yêu cầu mới": ticketKpis?.newRequests ?? 0,
    "Đang xử lý": ticketKpis?.inProgress ?? 0,
    "Chờ khách phản hồi": ticketKpis?.waitingCustomer ?? 0,
    "Đã đóng hôm nay": ticketKpis?.closedToday ?? 0,
  };
  const kpis = CSKH_KPIS.map((kpi) => {
    if (kpi.label === "Hoàn / trả chờ xử lý") {
      return { ...kpi, value: pendingReturns === null ? "–" : pendingReturns };
    }
    return {
      ...kpi,
      value: ticketKpis === null ? "–" : (ticketKpiByLabel[kpi.label] ?? 0),
    };
  });

  // Tổng panel hoàn hàng theo kênh, tính từ các dòng theo kênh để tiêu
  // đề khớp với tổng các dòng.
  const totalReturns = returnChannels.reduce((sum, row) => sum + row.returns, 0);
  const totalOrders = returnChannels.reduce((sum, row) => sum + row.orders, 0);
  const totalPercent =
    totalOrders === 0 ? 0 : Math.round((totalReturns / totalOrders) * 100);
  const overThreshold = returnChannels.filter((row) => row.percent >= 18);
  const warningNote =
    overThreshold.length > 0
      ? `Kênh ${overThreshold.map((row) => row.channel).join(", ")} vượt ngưỡng cảnh báo. Đã chuyển quản lý xem xét. Hệ thống không tự dừng nhận đơn, không tự thay đổi kênh bán.`
      : "Chưa có kênh nào vượt ngưỡng cảnh báo.";

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("");
    setStatusFilter("");
    setChannelFilter("");
    setCallOnly(false);
    setPage(1);
  };

  const showCallList = () => {
    setCallOnly(true);
    setPage(1);
    tableRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const openForm = () => {
    setFormCustomer("");
    setFormOrderId("");
    setFormType("Giao trễ");
    setFormChannel("Chat");
    setFormContent("");
    setTicketFormError("");
    setFormOpen(true);
  };

  // Tạo ticket mới qua API rồi tải lại dữ liệu server; ticket mới có
  // trạng thái "Mới", chưa gán người xử lý, hiện đầu bảng. Lỗi hiện
  // message của API trong form.
  const submitTicket = async () => {
    if (!formCustomer.trim() || !formOrderId.trim() || !formContent.trim()) return;
    setBusyTicket("create");
    setTicketFormError("");
    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer: formCustomer.trim(),
          orderId: formOrderId.trim(),
          type: formType,
          channel: formChannel,
          content: formContent.trim(),
        }),
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message = (data as { message?: unknown } | null)?.message;
        setTicketFormError(
          typeof message === "string" && message !== ""
            ? message
            : `Tạo yêu cầu lỗi (${response.status}).`,
        );
        return;
      }
      setPage(1);
      setFormOpen(false);
      router.refresh();
    } catch {
      setTicketFormError("Không gọi được máy chủ, thử lại sau.");
    } finally {
      setBusyTicket(null);
    }
  };

  // ---- Mục Cuộc gọi (gộp từ màn Telesale cũ) ----
  const isDispatcher = roles.includes("Điều phối viên");
  const isCskh = roles.includes("Nhân viên chăm sóc khách hàng");
  // Ghi ticket (tạo mới, đổi trạng thái): chỉ CSKH, Quản lý và Quản trị
  // viên; điều phối viên chỉ xem bảng ticket để chia đơn gọi điện.
  const canWriteTicket =
    isCskh || roles.includes("Quản lý") || roles.includes("Quản trị viên");

  const [assignTo, setAssignTo] = useState<Record<string, string>>({});
  const [callsErrorText, setCallsErrorText] = useState("");
  const [busyCall, setBusyCall] = useState<string | null>(null);
  // Thẻ "Cuộc gọi tiếp theo" do AI gợi ý: hiện sau khi ghi kết quả 1 cuộc
  // gọi xong (tự nhảy). null là chưa có gợi ý nào đang hiện.
  const [nextCall, setNextCall] = useState<ApiNextCall | null>(null);
  const [nextCallBusy, setNextCallBusy] = useState(false);
  const [nextCallDone, setNextCallDone] = useState("");

  // Gửi thao tác cuộc gọi (chia đơn, bắt đầu gọi, ghi kết quả) qua route
  // nội bộ; lỗi hiện message của API, xong thì tải lại dữ liệu server.
  // Ẩn/hiện theo vai chỉ là tiện ích giao diện; API kiểm tra lại vai trò
  // và trạng thái ở mỗi thao tác. Trả true khi thao tác thành công.
  const postCall = async (path: string, body: unknown, action: string) => {
    setBusyCall(action);
    setCallsErrorText("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message = (data as { message?: unknown } | null)?.message;
        setCallsErrorText(
          typeof message === "string" && message !== ""
            ? message
            : `Thao tác cuộc gọi lỗi (${response.status}).`,
        );
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setCallsErrorText("Không gọi được máy chủ, thử lại sau.");
      return false;
    } finally {
      setBusyCall(null);
    }
  };

  // Lấy cuộc gọi tiếp theo do AI gợi ý cho chính người đang đăng nhập.
  // Hết đơn ưu tiên thì hiện thông báo hết đơn, không báo lỗi.
  const fetchNextCall = async () => {
    setNextCallBusy(true);
    setNextCallDone("");
    try {
      const response = await fetch("/api/ai-assignments/telesale/next", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message = (data as { message?: unknown } | null)?.message;
        setCallsErrorText(
          typeof message === "string" && message !== ""
            ? message
            : `Không lấy được cuộc gọi tiếp theo (${response.status}).`,
        );
        return;
      }
      const data = (await response.json()) as ApiNextCall;
      if (data.assignment === null) {
        setNextCall(null);
        setNextCallDone(data.reason);
        return;
      }
      setNextCall(data);
      router.refresh();
    } catch {
      setCallsErrorText("Không gọi được máy chủ, thử lại sau.");
    } finally {
      setNextCallBusy(false);
    }
  };

  // Phân đơn đang hoạt động theo đơn (telesale): 1 đơn tối đa 1 phân đơn
  // đang hoạt động. Phân đơn đã hoàn thành/hủy thì đơn được chia lại.
  const activeAssignmentByOrder = useMemo(() => {
    const map = new Map<string, ApiAssignment>();
    for (const item of assignments) {
      if (item.kind !== "telesale") continue;
      if (item.status === "Chờ xử lý" || item.status === "Đang xử lý") {
        map.set(item.orderId, item);
      }
    }
    return map;
  }, [assignments]);

  // Phân đơn telesale mới nhất theo đơn, để hiện trạng thái phân đơn và
  // kết quả cuộc gọi đã ghi (hoàn thành) hoặc lý do hủy.
  const latestAssignmentByOrder = useMemo(() => {
    const map = new Map<string, ApiAssignment>();
    for (const item of assignments) {
      if (item.kind !== "telesale") continue;
      const current = map.get(item.orderId);
      if (!current || item.updatedAt > current.updatedAt) {
        map.set(item.orderId, item);
      }
    }
    return map;
  }, [assignments]);

  const callLogByAssignment = useMemo(
    () => new Map(callLogs.map((log) => [log.assignmentId, log])),
    [callLogs],
  );

  const ASSIGN_STATUS_PILL: Record<string, string> = {
    "Đã chia": "bg-gray-100 text-gray-700",
    "Đang gọi": "bg-green-50 text-green-700",
    "Thành công": "bg-green-50 text-green-700",
    "Thất bại": "bg-red-50 text-red-700",
    "Đã hủy": "bg-gray-50 text-gray-700",
  };

  // Nhãn trạng thái phân đơn của 1 dòng ưu tiên: chưa chia, đã chia,
  // đang gọi, kết quả cuộc gọi khi hoàn thành, đã hủy.
  const assignmentLabel = (row: PriorityRow): string => {
    const item = latestAssignmentByOrder.get(row.id);
    if (!item) return "Chưa chia";
    if (item.status === "Chờ xử lý") return "Đã chia";
    if (item.status === "Đang xử lý") return "Đang gọi";
    if (item.status === "Hoàn thành") {
      return callLogByAssignment.get(item.id)?.result ?? "Hoàn thành";
    }
    return "Đã hủy";
  };

  // Số liệu cả đội tính từ nhật ký cuộc gọi, không có cuộc gọi nào thì 0.
  const teamStats = useMemo(() => {
    const total = callLogs.length;
    const success = callLogs.filter((log) => log.result === "Thành công").length;
    const failed = total - success;
    const totalSeconds = callLogs.reduce((sum, log) => sum + log.durationSeconds, 0);
    return {
      total,
      success,
      failed,
      rate: total === 0 ? 0 : Math.round((success / total) * 100),
      avgSeconds: total === 0 ? 0 : Math.round(totalSeconds / total),
    };
  }, [callLogs]);

  // Bảng nhân viên tính từ phân đơn + nhật ký cuộc gọi, gom theo tài
  // khoản: người được giao, người gọi. Nhân viên chưa có phân đơn và
  // chưa ghi cuộc gọi thì không xuất hiện.
  const staffRows: StaffRow[] = useMemo(() => {
    const byUser = new Map<
      string,
      { assigned: number; completed: number; success: number; failed: number; seconds: number; calls: number }
    >();
    const ensure = (name: string) => {
      let row = byUser.get(name);
      if (!row) {
        row = { assigned: 0, completed: 0, success: 0, failed: 0, seconds: 0, calls: 0 };
        byUser.set(name, row);
      }
      return row;
    };
    for (const item of assignments) {
      if (item.kind !== "telesale") continue;
      const row = ensure(item.assignedTo);
      row.assigned += 1;
      if (item.status === "Hoàn thành") row.completed += 1;
    }
    for (const log of callLogs) {
      const row = ensure(log.caller);
      row.calls += 1;
      row.seconds += log.durationSeconds;
      if (log.result === "Thành công") row.success += 1;
      else row.failed += 1;
    }
    return Array.from(byUser.entries())
      .map(([name, row]) => ({
        name,
        assigned: row.assigned,
        completed: row.completed,
        success: row.success,
        failed: row.failed,
        avgSeconds: row.calls === 0 ? 0 : Math.round(row.seconds / row.calls),
      }))
      .sort((a, b) => b.assigned - a.assigned);
  }, [assignments, callLogs]);

  // Việc của tôi: phân đơn gọi điện giao cho tài khoản đang đăng nhập,
  // mới nhất lên trước.
  const myAssignments = useMemo(
    () =>
      assignments
        .filter((item) => item.kind === "telesale" && item.assignedTo === username)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)),
    [assignments, username],
  );

  // Form ghi kết quả theo từng phân đơn: kết quả, thời lượng giây, ghi
  // chú không bắt buộc. Thời lượng để trống hoặc âm thì không cho ghi.
  const [callForms, setCallForms] = useState<
    Record<string, { result: CallResult; duration: string; note: string }>
  >({});
  const callFormFor = (id: string) =>
    callForms[id] ?? { result: "Thành công", duration: "", note: "" };
  const setCallForm = (
    id: string,
    patch: Partial<{ result: CallResult; duration: string; note: string }>,
  ) => setCallForms((prev) => ({ ...prev, [id]: { ...callFormFor(id), ...patch } }));

  // 3 tab cấp trang: Yêu cầu hỗ trợ, Cuộc gọi, Lịch sử liên hệ. Tab
  // mặc định là Yêu cầu hỗ trợ (mục đầu tiên như hiện tại); một tab
  // hiện tại một thời điểm, bấm tab thì hiện nội dung thay vì kéo xuống.
  type PageTab = "tickets" | "calls" | "history";
  const PAGE_TABS: { key: PageTab; label: string }[] = [
    { key: "tickets", label: "Yêu cầu hỗ trợ" },
    { key: "calls", label: "Cuộc gọi" },
    { key: "history", label: "Lịch sử liên hệ" },
  ];
  const [pageTab, setPageTab] = useState<PageTab>("tickets");

  // 4 tab của mục Cuộc gọi, theo 4 chế độ xem của màn Telesale cũ:
  // Tổng quan, Phân chia đơn, Công việc, Nhân viên. Tab mặc định là
  // Tổng quan; tab Công việc chỉ hiện với vai CSKH.
  type CallTab = "overview" | "assign" | "work" | "staff";
  const CALL_TABS: { key: CallTab; label: string }[] = [
    { key: "overview", label: "Tổng quan" },
    { key: "assign", label: "Phân chia đơn" },
    { key: "work", label: "Công việc" },
    { key: "staff", label: "Nhân viên" },
  ];
  const [callTab, setCallTab] = useState<CallTab>("overview");

  // Bảng đơn ưu tiên ở tab Tổng quan: giữ nguyên cột và bộ lọc của màn
  // Telesale cũ (tìm kiếm, sắp xếp ETA, 7 dòng 1 trang).
  const [callSearch, setCallSearch] = useState("");
  const [callSortByEta, setCallSortByEta] = useState(false);
  const [callPage, setCallPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  // Lịch sử liên hệ tăng theo từng cuộc gọi nên phân trang 6 dòng/trang,
  // dùng chung PAGE_SIZE của màn.
  const historyTotalPages = Math.max(1, Math.ceil(historyRows.length / PAGE_SIZE));
  const historySafePage = Math.min(historyPage, historyTotalPages);
  const historyPaged = historyRows.slice((historySafePage - 1) * PAGE_SIZE, historySafePage * PAGE_SIZE);
  const historyRange =
    historyRows.length === 0
      ? { start: 0, end: 0, total: 0 }
      : {
          start: (historySafePage - 1) * PAGE_SIZE + 1,
          end: Math.min(historySafePage * PAGE_SIZE, historyRows.length),
          total: historyRows.length,
        };

  const filteredPriority = useMemo(() => {
    const query = callSearch.trim().toLowerCase();
    let result = priorityRows;
    if (query) {
      result = priorityRows.filter(
        (row) =>
          row.id.toLowerCase().includes(query) ||
          row.customer.toLowerCase().includes(query) ||
          row.phone.includes(query),
      );
    }
    if (callSortByEta) {
      // Quá hạn (etaMinutes -1) lên trước, không có mốc xuống cuối.
      const key = (row: PriorityRow) =>
        row.etaMinutes === null ? Number.MAX_SAFE_INTEGER : row.etaMinutes;
      result = [...result].sort((a, b) => key(a) - key(b));
    }
    return result;
  }, [priorityRows, callSearch, callSortByEta]);

  const callTotalPages = Math.max(1, Math.ceil(filteredPriority.length / CALL_PAGE_SIZE));
  const callPageRows = filteredPriority.slice(
    (callPage - 1) * CALL_PAGE_SIZE,
    callPage * CALL_PAGE_SIZE,
  );

  const priorityOverviewColumns: TableColumn<PriorityRow>[] = [
    { key: "id", header: "Mã đơn", render: (row) => <span className="font-medium text-gray-900">{row.id}</span>, cellClassName: "w-[109px]" },
    { key: "channel", header: "Kênh", render: (row) => row.channel, cellClassName: "w-[89px]" },
    { key: "customer", header: "Khách hàng", render: (row) => row.customer, cellClassName: "w-[149px]" },
    { key: "phone", header: "SĐT", render: (row) => row.phone, cellClassName: "w-[129px]" },
    { key: "deadline", header: "Mốc giao hẹn", render: (row) => row.deadline, cellClassName: "w-[119px]" },
    { key: "product", header: "Sản phẩm", render: (row) => row.product, cellClassName: "w-[187px]" },
    {
      key: "eta",
      header: "ETA",
      render: (row) => (
        <span className={row.eta === "Quá hạn" || isUrgentEta(row.eta) ? "font-medium text-red-700" : ""}>
          {row.eta}
        </span>
      ),
      cellClassName: "w-[79px]",
    },
    { key: "suggestion", header: "Gợi ý", render: (row) => row.suggestion, cellClassName: "w-[129px]" },
    { key: "reason", header: "Lý do", render: (row) => row.reason, cellClassName: "w-[179px]" },
  ];
  // Bảng đơn ưu tiên ở tab Phân chia đơn: thêm cột Phân đơn và (chỉ điều
  // phối viên) cột Chia đơn; các cột khác giữ nguyên như tab Tổng quan.
  const priorityAssignColumns: TableColumn<PriorityRow>[] = [
    ...priorityOverviewColumns,
    {
      key: "assign",
      header: "Phân đơn",
      render: (row) => {
        const item = latestAssignmentByOrder.get(row.id);
        const label = assignmentLabel(row);
        return (
          <span className="flex flex-col gap-1">
            <span
              className={`inline-flex h-[22px] w-fit items-center rounded-full px-[10px] text-xs font-medium ${ASSIGN_STATUS_PILL[label] ?? "bg-gray-100 text-gray-700"}`}
            >
              {label}
            </span>
            {item && <span className="text-xs text-gray-500">{item.assignedTo}</span>}
          </span>
        );
      },
      cellClassName: "w-[149px]",
    },
  ];
  if (isDispatcher) {
    priorityAssignColumns.push({
      key: "assign-action",
      header: "Chia đơn",
      render: (row) => {
        const active = activeAssignmentByOrder.get(row.id);
        if (active) {
          return <span className="text-xs text-gray-500">Đã chia cho {active.assignedTo}</span>;
        }
        const selected = assignTo[row.id] ?? DEFAULT_ASSIGNEE;
        return (
          <span className="flex items-center gap-2">
            <select
              value={selected}
              onChange={(e) => setAssignTo((prev) => ({ ...prev, [row.id]: e.target.value }))}
              aria-label={`Chọn nhân viên cho đơn ${row.id}`}
              className="h-9 rounded-md border border-gray-300 px-2 text-sm text-gray-700"
            >
              {DEMO_CSKH_ACCOUNTS.map((account) => (
                <option key={account} value={account}>{account}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={busyCall !== null}
              onClick={() =>
                postCall(
                  "/api/assignments",
                  { orderId: row.id, kind: "telesale", assignedTo: selected },
                  `assign-${row.id}`,
                )
              }
              className="flex h-9 shrink-0 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {busyCall === `assign-${row.id}` ? "Đang chia..." : "Chia đơn"}
            </button>
          </span>
        );
      },
      cellClassName: "w-[260px]",
    });
  }

  // Đổi trạng thái ticket: chỉ đi xuôi 1 bước, gọi API rồi tải lại dữ
  // liệu server. Ẩn/hiện nút chỉ là tiện ích giao diện; API kiểm tra
  // lại vai trò và trạng thái ở mỗi thao tác.
  const changeTicketStatus = async (row: TicketRow) => {
    const next = row.status === "Đã đóng" ? null : NEXT_TICKET_STATUS[row.status];
    if (!next) return;
    setBusyTicket(`status-${row.id}`);
    setTicketErrorText("");
    try {
      const response = await fetch(`/api/tickets/${encodeURIComponent(row.id)}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message = (data as { message?: unknown } | null)?.message;
        setTicketErrorText(
          typeof message === "string" && message !== ""
            ? message
            : `Đổi trạng thái lỗi (${response.status}).`,
        );
        return;
      }
      router.refresh();
    } catch {
      setTicketErrorText("Không gọi được máy chủ, thử lại sau.");
    } finally {
      setBusyTicket(null);
    }
  };

  // Bảng ticket thêm cột Thao tác khi vai được ghi: nút chuyển sang trạng
  // thái kế tiếp, chỉ hiện khi ticket chưa đóng. Vai không được ghi thì
  // bảng giữ nguyên 9 cột đóng băng.
  const ticketTableColumns: TableColumn<TicketRow>[] = canWriteTicket
    ? [
        ...ticketColumns,
        {
          key: "action",
          header: "Thao tác",
          render: (row) => {
            const next = row.status === "Đã đóng" ? null : NEXT_TICKET_STATUS[row.status];
            if (!next) {
              return <span className="text-xs text-gray-400">Đã đóng</span>;
            }
            const busy = busyTicket === `status-${row.id}`;
            return (
              <button
                type="button"
                disabled={busyTicket !== null}
                onClick={() => changeTicketStatus(row)}
                className="flex h-8 items-center justify-center whitespace-normal rounded-md border border-gray-300 px-2 text-xs font-medium text-gray-700 disabled:opacity-50"
              >
                {busy ? "Đang chuyển..." : `Chuyển sang ${next}`}
              </button>
            );
          },
          cellClassName: "w-[160px]",
        },
      ]
    : ticketColumns;

  // Khối bảng đơn ưu tiên (tìm kiếm, sắp xếp ETA, phân trang 7 dòng),
  // dùng chung cho tab Tổng quan và tab Phân chia đơn, chỉ khác cột.
  const priorityTable = (columns: TableColumn<PriorityRow>[]) => (
    <div>
      <p className="mb-2 text-sm font-semibold text-gray-900">
        ĐƠN NÊN ƯU TIÊN GỌI ({filteredPriority.length})
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={callSearch}
          onChange={(e) => {
            setCallSearch(e.target.value);
            setCallPage(1);
          }}
          placeholder="Tìm mã đơn, SĐT, khách hàng..."
          aria-label="Tìm đơn ưu tiên"
          className="h-10 w-[340px] max-w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
        />
        <button
          type="button"
          onClick={() => {
            setCallSortByEta((current) => !current);
            setCallPage(1);
          }}
          className={`flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium ${
            callSortByEta
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-gray-300 bg-white text-gray-700"
          }`}
        >
          Sắp xếp theo ETA
        </button>
        <button
          type="button"
          onClick={() => {
            setCallSearch("");
            setCallSortByEta(false);
            setCallPage(1);
          }}
          className="flex h-9 items-center justify-center rounded-md bg-white px-3 text-sm font-medium text-gray-700"
        >
          Xóa bộ lọc
        </button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <Table
          columns={columns}
          rows={callPageRows}
          rowKey={(row) => row.id}
          emptyText="Không có đơn nào cần ưu tiên gọi"
          bare
        />
      </div>
      <Pagination
        page={callPage}
        totalPages={callTotalPages}
        onPageChange={setCallPage}
        range={{
          start: filteredPriority.length === 0 ? 0 : (callPage - 1) * CALL_PAGE_SIZE + 1,
          end: Math.min(callPage * CALL_PAGE_SIZE, filteredPriority.length),
          total: filteredPriority.length,
        }}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-xl font-semibold text-gray-900">Chăm sóc khách hàng</h1>
        {canWriteTicket && (
          <button
            type="button"
            onClick={openForm}
            className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white"
          >
            Tạo yêu cầu hỗ trợ
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm font-medium text-gray-600">{kpi.label}</p>
            <p className="text-2xl font-semibold text-gray-900">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Mục chăm sóc khách hàng">
        {PAGE_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={pageTab === item.key}
            onClick={() => setPageTab(item.key)}
            className={`flex h-9 items-center justify-center rounded-md px-3 text-sm ${
              pageTab === item.key
                ? "bg-red-700 font-bold text-white"
                : "border border-gray-100 bg-white font-medium text-gray-700 hover:bg-gray-50"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {pageTab === "tickets" && (ticketsError !== null ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold text-gray-900">Yêu cầu hỗ trợ</p>
          <p className="mt-2 text-sm text-gray-700">
            {ticketsError === "unauthorized" ? (
              <>
                Phiên đăng nhập đã hết hạn.{" "}
                <Link href="/api/auth/login" className="font-medium text-red-700 underline">
                  Đăng nhập lại
                </Link>{" "}
                để xem yêu cầu hỗ trợ từ API.
              </>
            ) : (
              "Không tải được yêu cầu hỗ trợ. Tải lại trang để thử lại."
            )}
          </p>
        </div>
      ) : (
        <>
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-3 px-4 py-3">
          <p className="flex-1 text-sm">
            <span className="font-bold text-red-800">CẢNH BÁO: {bannerCounts.late} đơn trễ hạn - {bannerCounts.toCall} đơn chưa gọi lại.</span>
            <span className="text-gray-500"> Ưu tiên gọi theo mốc giao hẹn, không gọi theo hãng vận chuyển.</span>
          </p>
          <button
            type="button"
            onClick={showCallList}
            className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white"
          >
            Xem danh sách cần gọi
          </button>
        </div>
        <div className="h-[3px] w-full bg-red-600" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Tìm mã đơn, khách hàng, nội dung..."
            aria-label="Tìm mã đơn, khách hàng, nội dung"
            className="h-10 w-[340px] rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
          />
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            aria-label="Loại yêu cầu"
            className="h-10 w-[200px] rounded-md border border-gray-300 px-3 text-sm text-gray-700"
          >
            <option value="">Tất cả loại yêu cầu</option>
            {TICKET_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            aria-label="Trạng thái"
            className="h-10 w-[180px] rounded-md border border-gray-300 px-3 text-sm text-gray-700"
          >
            <option value="">Tất cả trạng thái</option>
            {TICKET_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <select
            value={channelFilter}
            onChange={(e) => { setChannelFilter(e.target.value); setPage(1); }}
            aria-label="Kênh"
            className="h-10 w-[160px] rounded-md border border-gray-300 px-3 text-sm text-gray-700"
          >
            <option value="">Tất cả kênh</option>
            {TICKET_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>{channel}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={resetFilters}
            className="flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-gray-700"
          >
            Xóa bộ lọc
          </button>
        </div>
        {callOnly && (
          <div className="mt-3 flex items-center gap-2">
            <p className="text-sm text-gray-700">Đang lọc: {bannerCounts.toCall} yêu cầu cần gọi lại.</p>
            <button
              type="button"
              onClick={() => { setCallOnly(false); setPage(1); }}
              className="text-xs font-medium text-red-700 underline"
            >
              Bỏ lọc này
            </button>
          </div>
        )}
      </div>

      <div ref={tableRef} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex h-11 items-center px-4">
          <p className="text-sm font-semibold text-gray-900">Yêu cầu hỗ trợ</p>
        </div>
        {ticketErrorText !== "" && (
          <p className="px-4 pb-2 text-sm text-red-700">{ticketErrorText}</p>
        )}
        <Table
          columns={ticketTableColumns}
          rows={pageRows}
          rowKey={(row) => row.id}
          emptyText="Không có yêu cầu nào khớp bộ lọc"
          bare
        />
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          range={{ start: filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1, end: Math.min(page * PAGE_SIZE, filtered.length), total: filtered.length }}
        />
      </div>
        </>
      ))}

      {pageTab === "tickets" && (
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">
          {returnsError === null
            ? `Hoàn hàng theo kênh (${totalReturns}/${totalOrders} đơn = ${totalPercent}%)`
            : "Hoàn hàng theo kênh"}
        </p>
        {returnsError !== null ? (
          <p className="text-sm text-gray-700">
            {returnsError === "unauthorized" ? (
              <>
                Phiên đăng nhập đã hết hạn.{" "}
                <Link href="/api/auth/login" className="font-medium text-red-700 underline">
                  Đăng nhập lại
                </Link>{" "}
                để xem hoàn hàng theo kênh từ API.
              </>
            ) : (
              "Không tải được hoàn hàng theo kênh. Tải lại trang để thử lại."
            )}
          </p>
        ) : (
          <>
            {returnChannels.map((row) => (
              <div key={row.channel} className="flex items-center gap-3">
                <p className="w-[110px] text-[13px] font-medium text-gray-800">{row.channel}</p>
                <div className="h-[10px] w-[520px] max-w-full rounded-full bg-gray-200">
                  <div
                    className="h-[10px] rounded-full bg-red-700"
                    style={{ width: `${row.percent}%` }}
                  />
                </div>
                <p className={`text-[13px] font-semibold ${row.percent >= 18 ? "text-red-700" : "text-gray-800"}`}>
                  {row.returns}/{row.orders} đơn ({row.percent}%)
                </p>
              </div>
            ))}
            <p className="text-xs text-gray-500">{warningNote}</p>
          </>
        )}
      </div>
      )}

      {pageTab === "calls" && (
      <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">Cuộc gọi</p>
        {callsError !== null ? (
          <p className="text-sm text-gray-700">
            {callsError === "unauthorized" ? (
              <>
                Phiên đăng nhập đã hết hạn.{" "}
                <Link href="/api/auth/login" className="font-medium text-red-700 underline">
                  Đăng nhập lại
                </Link>{" "}
                để xem cuộc gọi từ API.
              </>
            ) : (
              "Không tải được cuộc gọi. Tải lại trang để thử lại."
            )}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Chế độ xem cuộc gọi">
              {CALL_TABS.filter((item) => item.key !== "work" || isCskh).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={callTab === item.key}
                  onClick={() => setCallTab(item.key)}
                  className={`flex h-9 items-center justify-center rounded-md px-3 text-sm ${
                    callTab === item.key
                      ? "bg-red-700 font-bold text-white"
                      : "border border-gray-100 bg-white font-medium text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {callsErrorText !== "" && (
              <p className="text-sm text-red-700">{callsErrorText}</p>
            )}

            {callTab === "overview" && priorityTable(priorityOverviewColumns)}

            {callTab === "assign" && priorityTable(priorityAssignColumns)}

            {callTab === "work" && isCskh && (
              <div>
                <p className="mb-2 text-sm font-semibold text-gray-900">VIỆC CỦA TÔI</p>
                {nextCall !== null && nextCall.assignment !== null && nextCall.order !== null && (
                  <div className="mb-3 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm font-semibold text-gray-900">
                      Cuộc gọi tiếp theo (AI gợi ý)
                    </p>
                    <p className="text-sm text-gray-900">
                      Đơn {nextCall.order.orderId} · {nextCall.order.customer}
                      {nextCall.order.phone !== null ? ` · ${nextCall.order.phone}` : ""}
                    </p>
                    <p className="text-sm text-gray-700">
                      {nextCall.order.reason} · ETA {nextCall.order.eta}
                      {nextCall.order.suggestion !== "" ? ` · ${nextCall.order.suggestion}` : ""}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busyCall !== null}
                        onClick={async () => {
                          const ok = await postCall(
                            `/api/assignments/${nextCall.assignment?.id}/start`,
                            {},
                            `start-${nextCall.assignment?.id}`,
                          );
                          if (ok) {
                            setNextCall(null);
                          }
                        }}
                        className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {busyCall === `start-${nextCall.assignment.id}` ? "Đang bắt đầu..." : "Bắt đầu gọi"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNextCall(null)}
                        className="flex h-9 items-center justify-center rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700"
                      >
                        Bỏ qua cuộc này
                      </button>
                    </div>
                  </div>
                )}
                {nextCallDone !== "" && (
                  <p className="mb-3 text-sm text-gray-700">{nextCallDone}</p>
                )}
                {myAssignments.length === 0 ? (
                  <p className="text-sm text-gray-500">Chưa có đơn nào được chia cho bạn.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {myAssignments.map((item) => {
                      const form = callFormFor(item.id);
                      const durationNumber = Number(form.duration);
                      const durationValid =
                        form.duration.trim() !== "" &&
                        Number.isInteger(durationNumber) &&
                        durationNumber >= 0;
                      const log = callLogByAssignment.get(item.id);
                      return (
                        <div
                          key={item.id}
                          className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">Đơn {item.orderId}</p>
                            <span
                              className={`inline-flex h-[22px] items-center rounded-full px-[10px] text-xs font-medium ${MY_STATUS_PILL[item.status]}`}
                            >
                              {item.status}
                            </span>
                            <p className="text-xs text-gray-500">Giao bởi {item.assignedBy}</p>
                          </div>
                          {item.status === "Chờ xử lý" && (
                            <button
                              type="button"
                              disabled={busyCall !== null}
                              onClick={() =>
                                postCall(
                                  `/api/assignments/${item.id}/start`,
                                  {},
                                  `start-${item.id}`,
                                )
                              }
                              className="flex h-9 w-fit items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white disabled:opacity-50"
                            >
                              {busyCall === `start-${item.id}` ? "Đang bắt đầu..." : "Bắt đầu gọi"}
                            </button>
                          )}
                          {item.status === "Đang xử lý" && (
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                value={form.result}
                                onChange={(e) =>
                                  setCallForm(item.id, {
                                    result: e.target.value as CallResult,
                                  })
                                }
                                aria-label="Kết quả cuộc gọi"
                                className="h-9 rounded-md border border-gray-300 px-2 text-sm text-gray-700"
                              >
                                <option value="Thành công">Thành công</option>
                                <option value="Thất bại">Thất bại</option>
                              </select>
                              <input
                                type="number"
                                min={0}
                                value={form.duration}
                                onChange={(e) => setCallForm(item.id, { duration: e.target.value })}
                                placeholder="Thời lượng (giây)"
                                aria-label="Thời lượng cuộc gọi (giây)"
                                className="h-9 w-[160px] rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
                              />
                              <input
                                type="text"
                                value={form.note}
                                onChange={(e) => setCallForm(item.id, { note: e.target.value })}
                                placeholder="Ghi chú (không bắt buộc)"
                                aria-label="Ghi chú cuộc gọi"
                                className="h-9 w-[220px] rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
                              />
                              <button
                                type="button"
                                disabled={!durationValid || busyCall !== null}
                                onClick={async () => {
                                  const ok = await postCall(
                                    "/api/call-logs",
                                    {
                                      assignmentId: item.id,
                                      result: form.result,
                                      durationSeconds: durationNumber,
                                      ...(form.note.trim() === ""
                                        ? {}
                                        : { note: form.note.trim() }),
                                    },
                                    `log-${item.id}`,
                                  );
                                  // Ghi kết quả xong thì AI tự nhảy cuộc
                                  // tiếp theo cho chính người vừa gọi xong.
                                  if (ok) {
                                    await fetchNextCall();
                                  }
                                }}
                                className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white disabled:opacity-50"
                              >
                                {busyCall === `log-${item.id}` ? "Đang ghi..." : "Ghi kết quả"}
                              </button>
                            </div>
                          )}
                          {item.status === "Hoàn thành" && (
                            <p className="text-sm text-gray-700">
                              {log
                                ? `Kết quả: ${log.result} · ${log.durationSeconds} giây${log.note ? ` · ${log.note}` : ""}`
                                : "Đã hoàn thành."}
                            </p>
                          )}
                          {item.status === "Đã hủy" && (
                            <p className="text-sm text-gray-700">
                              Đã hủy{item.cancelReason ? `: ${item.cancelReason}` : ""}.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {callTab === "staff" && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                  <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm font-medium text-gray-600">Tổng quan đội</p>
                    <p className="text-2xl font-semibold text-gray-900">{teamStats.total} cuộc</p>
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm font-medium text-gray-600">Thành công</p>
                    <p className="text-2xl font-semibold text-gray-900">{teamStats.success}</p>
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm font-medium text-gray-600">Thất bại</p>
                    <p className="text-2xl font-semibold text-gray-900">{teamStats.failed}</p>
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm font-medium text-gray-600">Tỷ lệ thành công</p>
                    <p className="text-2xl font-semibold text-gray-900">{teamStats.rate}%</p>
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm font-medium text-gray-600">Thời gian gọi TB</p>
                    <p className="text-2xl font-semibold text-gray-900">{teamStats.avgSeconds} giây</p>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-900">NHÂN VIÊN</p>
                  <Table
                    columns={staffColumns}
                    rows={staffRows}
                    rowKey={(row) => row.name}
                    emptyText="Chưa có nhân viên được giao đơn"
                    bare
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
      )}

      {pageTab === "history" && (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex h-11 items-center px-4">
          <p className="text-sm font-semibold text-gray-900">Lịch sử liên hệ gần đây</p>
        </div>
        {callsError !== null ? (
          <p className="px-4 py-6 text-sm text-gray-700">
            {callsError === "unauthorized" ? (
              <>
                Phiên đăng nhập đã hết hạn.{" "}
                <Link href="/api/auth/login" className="font-medium text-red-700 underline">
                  Đăng nhập lại
                </Link>{" "}
                để xem lịch sử liên hệ từ API.
              </>
            ) : (
              "Không tải được lịch sử liên hệ. Tải lại trang để thử lại."
            )}
          </p>
        ) : (
          <>
            <Table
              columns={historyColumns}
              rows={historyPaged}
              rowKey={(row, index) => `${row.time}-${row.customer}-${index}`}
              emptyText="Chưa có lịch sử liên hệ. Ghi nhật ký cuộc gọi ở tab Công việc để hiện ở đây."
              bare
            />
            <div className="border-t">
              <Pagination page={historySafePage} totalPages={historyTotalPages} onPageChange={setHistoryPage} range={historyRange} />
            </div>
          </>
        )}
      </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Tạo yêu cầu hỗ trợ"
        footer={
          <>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={submitTicket}
              disabled={!formCustomer.trim() || !formOrderId.trim() || !formContent.trim() || busyTicket !== null}
              className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {busyTicket === "create" ? "Đang tạo..." : "Tạo yêu cầu"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ticket-customer" className="text-sm font-medium text-gray-700">Khách hàng</label>
            <input
              id="ticket-customer"
              type="text"
              value={formCustomer}
              onChange={(e) => setFormCustomer(e.target.value)}
              placeholder="Ví dụ: KH-033"
              className="h-10 rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ticket-order" className="text-sm font-medium text-gray-700">Mã đơn</label>
            <input
              id="ticket-order"
              type="text"
              value={formOrderId}
              onChange={(e) => setFormOrderId(e.target.value)}
              placeholder="Ví dụ: DH-1044"
              className="h-10 rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ticket-type" className="text-sm font-medium text-gray-700">Loại yêu cầu</label>
            <select
              id="ticket-type"
              value={formType}
              onChange={(e) => setFormType(e.target.value as TicketType)}
              className="h-10 rounded-md border border-gray-300 px-3 text-sm text-gray-700"
            >
              {TICKET_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ticket-channel" className="text-sm font-medium text-gray-700">Kênh</label>
            <select
              id="ticket-channel"
              value={formChannel}
              onChange={(e) => setFormChannel(e.target.value as TicketChannel)}
              className="h-10 rounded-md border border-gray-300 px-3 text-sm text-gray-700"
            >
              {TICKET_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>{channel}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ticket-content" className="text-sm font-medium text-gray-700">Nội dung</label>
            <textarea
              id="ticket-content"
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              rows={3}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
            />
          </div>
          <p className="text-xs text-gray-500">Yêu cầu mới tạo có trạng thái &quot;Mới&quot;, chưa gán người xử lý, hiện đầu bảng.</p>
          {ticketFormError !== "" && (
            <p className="text-sm text-red-700">{ticketFormError}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
