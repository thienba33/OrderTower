"use client";

// SPDX-License-Identifier: Apache-2.0

import { useMemo, useRef, useState } from "react";
import { Pagination } from "../../components/ui/Pagination";
import { Table, type TableColumn } from "../../components/ui/Table";
import { getOrderDetail } from "../../data/order-detail";
import { ORDERS } from "../../data/orders";
import {
  ASSIGN_STATUS_PILL,
  MINH_ANH_SHIFT,
  MINH_ANH_WORK,
  PRIORITY_ORDERS,
  STAFF_STATUS_TEXT,
  TEAM_AVG_CALL_TIME,
  TEAM_FAILED,
  TEAM_SUCCESS,
  TEAM_SUCCESS_RATE,
  TEAM_TOTAL_CALLS,
  TELESALE_STAFF,
  WORK_RESULT_PILL,
  isUrgentEta,
  staffSuccessRate,
  type PriorityAssignStatus,
  type PriorityOrder,
  type TelesaleStaff,
  type TelesaleStaffStatus,
  type WorkItem,
  type WorkResult,
} from "../../data/telesale";

type Tab = "overview" | "dispatch" | "work" | "staff";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Tổng quan" },
  { key: "dispatch", label: "Phân chia đơn" },
  { key: "work", label: "Công việc" },
  { key: "staff", label: "Nhân viên" },
];

const DISPATCH_PAGE_SIZE = 7;
const STAFF_PAGE_SIZE = 6;

function ProgressBar({ percent }: { percent: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-[10px] w-[110px] overflow-hidden rounded-full bg-gray-200">
        <span className="block h-full rounded-full bg-red-700" style={{ width: `${percent}%` }} />
      </span>
      <span className="text-xs text-gray-700">{percent}%</span>
    </span>
  );
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-white p-5">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

export default function TelesalePage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [staff, setStaff] = useState<TelesaleStaff[]>(TELESALE_STAFF);

  // Tong quan
  const activeStaff = useMemo(() => staff.filter((row) => row.status !== "Nghỉ"), [staff]);
  const receivingCount = staff.filter((row) => row.status === "Đang nhận").length;
  const pausedCount = staff.filter((row) => row.status === "Tạm dừng").length;

  const goToWork = () => setTab("work");

  // Phan chia don
  const [dispatchOrders, setDispatchOrders] = useState<PriorityOrder[]>(PRIORITY_ORDERS);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(["DH-1051", "DH-1041"]));
  const [dispatchSearch, setDispatchSearch] = useState("");
  const [dispatchStatus, setDispatchStatus] = useState<"all" | PriorityAssignStatus>("all");
  const [sortByEta, setSortByEta] = useState(false);
  const [dispatchPage, setDispatchPage] = useState(1);
  const [assignStaffId, setAssignStaffId] = useState("NV01");

  const assignedDelta = useMemo(() => {
    const initial = new Map(PRIORITY_ORDERS.map((row) => [row.id, row.assignStatus]));
    return dispatchOrders.filter(
      (row) => initial.get(row.id) === "Chưa chia" && row.assignStatus === "Đã chia",
    ).length;
  }, [dispatchOrders]);

  const filteredDispatch = useMemo(() => {
    const query = dispatchSearch.trim().toLowerCase();
    let rows = dispatchOrders.filter((row) => {
      if (dispatchStatus !== "all" && row.assignStatus !== dispatchStatus) return false;
      if (!query) return true;
      return (
        row.id.toLowerCase().includes(query) ||
        row.customer.toLowerCase().includes(query) ||
        row.phone.includes(query)
      );
    });
    if (sortByEta) {
      const etaMinutes = (eta: string) => {
        const match = eta.match(/^(\d+)h(\d+)$/);
        return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
      };
      rows = [...rows].sort((a, b) => etaMinutes(a.eta) - etaMinutes(b.eta));
    }
    return rows;
  }, [dispatchOrders, dispatchSearch, dispatchStatus, sortByEta]);

  const dispatchTotalPages = Math.max(1, Math.ceil(filteredDispatch.length / DISPATCH_PAGE_SIZE));
  const dispatchPageRows = useMemo(() => {
    const start = (dispatchPage - 1) * DISPATCH_PAGE_SIZE;
    return filteredDispatch.slice(start, start + DISPATCH_PAGE_SIZE);
  }, [filteredDispatch, dispatchPage]);
  const dispatchRange = useMemo(
    () => ({
      start: (dispatchPage - 1) * DISPATCH_PAGE_SIZE + 1,
      end: Math.min(dispatchPage * DISPATCH_PAGE_SIZE, filteredDispatch.length),
      total: filteredDispatch.length,
    }),
    [filteredDispatch, dispatchPage],
  );

  const toggleSelect = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllPage = () => {
    const pageIds = dispatchPageRows.map((row) => row.id);
    const allSelected = pageIds.every((id) => selected.has(id));
    setSelected((current) => {
      const next = new Set(current);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const assignRows = (ids: Set<string>) => {
    if (ids.size === 0) return;
    setDispatchOrders((current) =>
      current.map((row) =>
        ids.has(row.id) && row.assignStatus === "Chưa chia" ? { ...row, assignStatus: "Đã chia" } : row,
      ),
    );
    setSelected(new Set());
  };

  const assignAllVisible = () => {
    const ids = new Set(
      filteredDispatch.filter((row) => row.assignStatus === "Chưa chia").map((row) => row.id),
    );
    assignRows(ids);
  };

  const resetDispatchFilters = () => {
    setDispatchSearch("");
    setDispatchStatus("all");
    setSortByEta(false);
    setDispatchPage(1);
  };

  const dispatchColumns: TableColumn<PriorityOrder>[] = [
    {
      key: "select",
      header: (
        <input
          type="checkbox"
          aria-label="Chọn tất cả đơn trên trang"
          checked={dispatchPageRows.length > 0 && dispatchPageRows.every((row) => selected.has(row.id))}
          ref={(el) => {
            if (!el) return;
            const some = dispatchPageRows.some((row) => selected.has(row.id));
            const all = dispatchPageRows.length > 0 && dispatchPageRows.every((row) => selected.has(row.id));
            el.indeterminate = some && !all;
          }}
          onChange={toggleSelectAllPage}
          className="size-4 accent-red-700"
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          aria-label={`Chọn đơn ${row.id}`}
          checked={selected.has(row.id)}
          onChange={() => toggleSelect(row.id)}
          className="size-4 accent-red-700"
        />
      ),
      cellClassName: "w-[40px]",
    },
    { key: "id", header: "Mã đơn", render: (row) => <span className="font-medium text-gray-900">{row.id}</span>, cellClassName: "w-[109px]" },
    { key: "channel", header: "Kênh", render: (row) => row.channel, cellClassName: "w-[89px]" },
    { key: "customer", header: "Khách hàng", render: (row) => row.customer, cellClassName: "w-[149px]" },
    { key: "phone", header: "SĐT", render: (row) => row.phone, cellClassName: "w-[129px]" },
    { key: "deadline", header: "Dự kiến giao", render: (row) => row.deadline, cellClassName: "w-[119px]" },
    { key: "product", header: "Sản phẩm", render: (row) => row.product, cellClassName: "w-[187px]" },
    {
      key: "eta",
      header: "ETA",
      render: (row) => (
        <span className={isUrgentEta(row.eta) ? "font-medium text-red-700" : ""}>{row.eta}</span>
      ),
      cellClassName: "w-[79px]",
    },
    { key: "suggestion", header: "Gợi ý gọi", render: (row) => row.suggestion, cellClassName: "w-[129px]" },
    {
      key: "status",
      header: "Trạng thái",
      render: (row) => (
        <span className={`inline-flex h-[22px] items-center rounded-full px-[10px] text-xs font-medium ${ASSIGN_STATUS_PILL[row.assignStatus]}`}>
          {row.assignStatus}
        </span>
      ),
      cellClassName: "w-[119px]",
    },
  ];

  // Cong viec (Minh Anh)
  const [workItems, setWorkItems] = useState<WorkItem[]>(MINH_ANH_WORK);
  const [selectedWorkId, setSelectedWorkId] = useState("DH-1044");
  const [workSearch, setWorkSearch] = useState("");

  const workDelta = useMemo(() => {
    const initial = new Map(MINH_ANH_WORK.map((row) => [row.id, row.result]));
    let success = 0;
    let failed = 0;
    let done = 0;
    for (const row of workItems) {
      const before = initial.get(row.id);
      if (row.result === "Thành công" && before !== "Thành công") success += 1;
      if (row.result === "Thất bại" && before !== "Thất bại") failed += 1;
      if (before === "Thành công" && row.result !== "Thành công") success -= 1;
      if (before === "Thất bại" && row.result !== "Thất bại") failed -= 1;
      const decidedBefore = before === "Thành công" || before === "Thất bại";
      const decidedNow = row.result === "Thành công" || row.result === "Thất bại";
      if (decidedNow && !decidedBefore) done += 1;
      if (decidedBefore && !decidedNow) done -= 1;
    }
    return { success, failed, done };
  }, [workItems]);

  const workDone = MINH_ANH_SHIFT.done + workDelta.done;
  const workSuccess = 8 + workDelta.success;
  const workFailed = 3 + workDelta.failed;
  const workPercent = Math.round((workDone / MINH_ANH_SHIFT.assigned) * 100);

  const minhAnh = staff.find((row) => row.id === "NV01");
  const isPaused = minhAnh?.status === "Tạm dừng";

  const togglePause = () => {
    setStaff((current) =>
      current.map((row) =>
        row.id === "NV01"
          ? { ...row, status: row.status === "Tạm dừng" ? "Đang nhận" : "Tạm dừng" }
          : row,
      ),
    );
  };

  const filteredWork = useMemo(() => {
    const query = workSearch.trim().toLowerCase();
    if (!query) return workItems;
    return workItems.filter(
      (row) =>
        row.id.toLowerCase().includes(query) ||
        row.customer.toLowerCase().includes(query) ||
        row.phone.includes(query),
    );
  }, [workItems, workSearch]);

  const selectedWork = workItems.find((row) => row.id === selectedWorkId) ?? workItems[0];
  const selectedOrder = ORDERS.find((row) => row.id === selectedWork.id);
  const selectedDetail = selectedOrder ? getOrderDetail(selectedOrder) : null;

  const markWorkResult = (result: "Thành công" | "Thất bại") => {
    setWorkItems((current) =>
      current.map((row) => (row.id === selectedWork.id ? { ...row, result } : row)),
    );
  };

  const workColumns: TableColumn<WorkItem>[] = [
    { key: "id", header: "Mã đơn", render: (row) => <span className="font-medium text-gray-900">{row.id}</span>, cellClassName: "w-[109px]" },
    { key: "customer", header: "Tên khách hàng", render: (row) => row.customer, cellClassName: "w-[128px]" },
    { key: "phone", header: "SĐT", render: (row) => row.phone, cellClassName: "w-[119px]" },
    { key: "channel", header: "Kênh", render: (row) => row.channel, cellClassName: "w-[79px]" },
    { key: "deadline", header: "Mốc giao", render: (row) => row.deadline, cellClassName: "w-[109px]" },
    { key: "duration", header: "Thời lượng", render: (row) => row.duration ?? "—", cellClassName: "w-[79px]" },
    {
      key: "result",
      header: "Kết quả",
      render: (row) => (
        <span className={`inline-flex h-[22px] items-center rounded-full px-[10px] text-xs font-medium ${WORK_RESULT_PILL[row.result]}`}>
          {row.result}
        </span>
      ),
      cellClassName: "w-[89px]",
    },
  ];

  // Nhan vien
  const [staffSearch, setStaffSearch] = useState("");
  const [topStatus, setTopStatus] = useState<"working" | "rest" | "all">("working");
  const [staffSelect, setStaffSelect] = useState("all");
  const [staffStatusFilter, setStaffStatusFilter] = useState<"all" | TelesaleStaffStatus>("all");
  const [callStatusFilter, setCallStatusFilter] = useState<"all" | "Đang gọi" | "Chờ gọi">("all");
  const [staffPage, setStaffPage] = useState(1);
  const staffSearchRef = useRef<HTMLInputElement>(null);

  const filteredStaff = useMemo(() => {
    const query = staffSearch.trim().toLowerCase();
    return staff.filter((row) => {
      if (topStatus === "working" && row.status === "Nghỉ") return false;
      if (topStatus === "rest" && row.status !== "Nghỉ") return false;
      if (staffSelect !== "all" && row.id !== staffSelect) return false;
      if (staffStatusFilter !== "all" && row.status !== staffStatusFilter) return false;
      if (callStatusFilter === "Đang gọi" && row.status !== "Đang nhận") return false;
      if (callStatusFilter === "Chờ gọi" && row.status !== "Tạm dừng") return false;
      if (query && !row.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [staff, topStatus, staffSelect, staffStatusFilter, callStatusFilter, staffSearch]);

  const staffTotalPages = Math.max(1, Math.ceil(filteredStaff.length / STAFF_PAGE_SIZE));
  const staffPageRows = useMemo(() => {
    const start = (staffPage - 1) * STAFF_PAGE_SIZE;
    return filteredStaff.slice(start, start + STAFF_PAGE_SIZE);
  }, [filteredStaff, staffPage]);
  const staffRange = useMemo(
    () => ({
      start: (staffPage - 1) * STAFF_PAGE_SIZE + 1,
      end: Math.min(staffPage * STAFF_PAGE_SIZE, filteredStaff.length),
      total: filteredStaff.length,
    }),
    [filteredStaff, staffPage],
  );

  const resetStaffFilters = () => {
    setStaffSearch("");
    setTopStatus("working");
    setStaffSelect("all");
    setStaffStatusFilter("all");
    setCallStatusFilter("all");
    setStaffPage(1);
  };

  const staffColumns: TableColumn<TelesaleStaff>[] = [
    { key: "name", header: "Nhân viên", render: (row) => <span className="font-medium text-gray-900">{row.name}</span>, cellClassName: "w-[163px]" },
    {
      key: "status",
      header: "Nhận cuộc gọi",
      render: (row) => <span className={STAFF_STATUS_TEXT[row.status]}>{row.status}</span>,
      cellClassName: "w-[141px]",
    },
    { key: "success", header: "Thành công", render: (row) => row.success, cellClassName: "w-[98px]" },
    { key: "failed", header: "Thất bại", render: (row) => row.failed, cellClassName: "w-[87px]" },
    { key: "rate", header: "Tỉ lệ TC", render: (row) => `${staffSuccessRate(row)}%`, cellClassName: "w-[87px]" },
    { key: "total", header: "Tổng cuộc", render: (row) => row.totalCalls, cellClassName: "w-[87px]" },
    { key: "avg", header: "TG gọi TB", render: (row) => row.avgCallTime, cellClassName: "w-[109px]" },
    { key: "totalTime", header: "Tổng TG gọi", render: (row) => row.totalCallTime, cellClassName: "w-[119px]" },
    { key: "progress", header: "Tiến độ", render: (row) => <ProgressBar percent={row.progressPercent} />, cellClassName: "w-[204px]" },
    {
      key: "detail",
      header: "Chi tiết",
      render: () => (
        <button type="button" onClick={goToWork} className="text-xs font-medium text-red-700 underline">
          Xem
        </button>
      ),
      cellClassName: "w-[54px]",
    },
  ];

  const overviewStaffColumns: TableColumn<TelesaleStaff>[] = [
    { key: "name", header: "Nhân viên", render: (row) => <span className="font-medium text-gray-900">{`${row.name} (${row.id})`}</span>, cellClassName: "w-[185px]" },
    {
      key: "status",
      header: "Trạng thái",
      render: (row) => <span className={STAFF_STATUS_TEXT[row.status]}>{row.status}</span>,
      cellClassName: "w-[141px]",
    },
    { key: "total", header: "Tổng cuộc", render: (row) => row.totalCalls, cellClassName: "w-[98px]" },
    { key: "success", header: "Thành công", render: (row) => row.success, cellClassName: "w-[109px]" },
    { key: "failed", header: "Thất bại", render: (row) => row.failed, cellClassName: "w-[98px]" },
    { key: "rate", header: "Tỉ lệ TC", render: (row) => `${staffSuccessRate(row)}%`, cellClassName: "w-[98px]" },
    { key: "avg", header: "TG gọi TB", render: (row) => row.avgCallTime, cellClassName: "w-[119px]" },
    { key: "progress", header: "Tiến độ", render: (row) => <ProgressBar percent={row.progressPercent} />, cellClassName: "w-[204px]" },
    {
      key: "detail",
      header: "Chi tiết",
      render: () => (
        <button type="button" onClick={goToWork} className="text-xs font-medium text-red-700 underline">
          Xem
        </button>
      ),
      cellClassName: "w-[98px]",
    },
  ];

  const priorityColumns: TableColumn<PriorityOrder>[] = [
    { key: "id", header: "Mã đơn", render: (row) => <span className="font-medium text-gray-900">{row.id}</span>, cellClassName: "w-[109px]" },
    { key: "customer", header: "Khách hàng", render: (row) => row.customer, cellClassName: "w-[149px]" },
    { key: "phone", header: "SĐT", render: (row) => row.phone, cellClassName: "w-[139px]" },
    {
      key: "eta",
      header: "ETA",
      render: (row) => (
        <span className={isUrgentEta(row.eta) ? "font-medium text-red-700" : ""}>{row.eta}</span>
      ),
      cellClassName: "w-[90px]",
    },
    { key: "suggestion", header: "Gợi ý gọi", render: (row) => row.suggestion, cellClassName: "w-[219px]" },
    { key: "reason", header: "Lý do ưu tiên", render: (row) => row.reason ?? "—", cellClassName: "w-[237px]" },
    { key: "status", header: "Trạng thái hệ thống", render: (row) => row.callStatus, cellClassName: "w-[209px]" },
  ];

  const asidePill =
    selectedWork.result === "Đang gọi" || selectedWork.result === "Thành công"
      ? "bg-green-50 text-green-700"
      : selectedWork.result === "Thất bại"
        ? "bg-red-50 text-red-700"
        : "bg-gray-100 text-gray-700";

  const asideEvents =
    selectedWork.id === "DH-1044"
      ? [
          { time: "08:12", title: "Mới tạo" },
          { time: "09:12", title: "Đơn được phân công" },
          { time: "09:15", title: "Bắt đầu gọi" },
        ]
      : (selectedDetail?.events.slice(0, 3) ?? []).map((event) => ({
          time: event.time,
          title: event.title,
        }));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-gray-900">Telesale</h1>

      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`flex h-9 flex-1 items-center justify-center rounded-md px-4 text-sm ${
              tab === item.key ? "bg-white font-bold text-red-700 shadow-sm" : "text-gray-500"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <KpiCard label="Tổng đơn hôm nay" value={120} />
            <KpiCard label="Đơn nên ưu tiên gọi" value={PRIORITY_ORDERS.length} />
            <KpiCard label="Đã xử lý" value={11} />
            <KpiCard label="Không cần gọi" value={9} />
            <KpiCard label="Tỷ lệ thành công" value={`${TEAM_SUCCESS_RATE}%`} />
          </div>

          <div className="flex flex-col gap-3 xl:flex-row">
            <section className="rounded-lg border bg-white p-4 xl:w-[680px] xl:shrink-0">
              <h2 className="text-sm font-semibold text-gray-900">Tiến độ tổng quan Telesale</h2>
              <div className="mt-3 flex items-center gap-2 text-sm">
                <p className="flex-1 font-medium text-gray-700">11/18 cuộc gọi ưu tiên hôm nay đã hoàn tất</p>
                <p className="shrink-0 font-semibold text-red-700">61%</p>
              </div>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-red-700" style={{ width: "61%" }} />
              </div>
            </section>

            <section className="min-w-0 flex-1 rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Kết quả gọi hôm nay</h2>
              <div className="mt-3 flex gap-3">
                <div className="flex w-[200px] shrink-0 flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-[22px] items-center rounded-full bg-green-50 px-[10px] text-xs font-medium text-green-700">
                      Thành công
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{TEAM_SUCCESS}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-[22px] items-center rounded-full bg-red-50 px-[10px] text-xs font-medium text-red-700">
                      Thất bại
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{TEAM_FAILED}</span>
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-gray-500">TG gọi TB</p>
                    <p className="shrink-0 font-semibold text-gray-900">{TEAM_AVG_CALL_TIME}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-gray-500">NV đang nhận</p>
                    <p className="shrink-0 font-semibold text-gray-900">{receivingCount}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-gray-500">NV đang tạm dừng</p>
                    <p className="shrink-0 font-semibold text-gray-900">{pausedCount}</p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab("dispatch")}
              className="flex h-9 shrink-0 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white"
            >
              Chia đơn
            </button>
            <p className="text-[13px] text-gray-500">
              Chia đơn theo danh sách ưu tiên, điều phối viên duyệt trước khi phân công.
            </p>
          </div>

          <section className="overflow-x-auto rounded-lg border bg-white">
            <div className="flex h-11 items-center px-4">
              <h2 className="text-sm font-semibold text-gray-900">Đơn ưu tiên gọi tiếp theo</h2>
            </div>
            <Table columns={priorityColumns} rows={PRIORITY_ORDERS.slice(0, 6)} rowKey={(row) => row.id} bare />
          </section>

          <section className="overflow-x-auto rounded-lg border bg-white">
            <div className="flex h-11 items-center px-4">
              <h2 className="text-sm font-semibold text-gray-900">Tiến độ nhân viên Telesale</h2>
            </div>
            <Table columns={overviewStaffColumns} rows={activeStaff} rowKey={(row) => row.id} bare />
          </section>
        </>
      )}

      {tab === "dispatch" && (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-gray-900">CSKH - Phân chia đơn</h2>
            <button
              type="button"
              onClick={assignAllVisible}
              className="flex h-9 shrink-0 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white"
            >
              Chia đơn
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <KpiCard label="Tất cả đơn" value={120} />
            <KpiCard label="Đơn nên ưu tiên gọi" value={PRIORITY_ORDERS.length} />
            <KpiCard label="Đã chia hôm nay" value={11 + assignedDelta} />
            <KpiCard label="NV đang hoạt động" value={receivingCount} />
            <KpiCard label="Không cần gọi" value={9} />
          </div>

          <section className="rounded-xl border bg-white">
            <div className="flex h-[52px] items-center px-4">
              <h2 className="text-sm font-semibold text-gray-900">DANH SÁCH ĐƠN NÊN ƯU TIÊN GỌI</h2>
            </div>
            <div className="h-px bg-gray-200" />
            <div className="flex flex-wrap items-center gap-3 p-4">
              <input
                type="text"
                value={dispatchSearch}
                onChange={(e) => {
                  setDispatchSearch(e.target.value);
                  setDispatchPage(1);
                }}
                placeholder="Tìm mã đơn, SĐT, khách hàng..."
                aria-label="Tìm đơn ưu tiên"
                className="h-10 w-[340px] max-w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
              />
              <select
                value={dispatchStatus}
                onChange={(e) => {
                  setDispatchStatus(e.target.value as "all" | PriorityAssignStatus);
                  setDispatchPage(1);
                }}
                aria-label="Lọc theo trạng thái"
                className="h-10 w-[176px] rounded-md border border-gray-300 px-3 text-sm text-gray-700"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="Chưa chia">Chưa chia</option>
                <option value="Đã chia">Đã chia</option>
                <option value="Đang gọi">Đang gọi</option>
              </select>
              <div className="flex h-10 w-[170px] items-center rounded-md border border-gray-300 px-3 text-sm text-gray-700">
                02/11/2026
              </div>
              <button
                type="button"
                onClick={() => {
                  setSortByEta((current) => !current);
                  setDispatchPage(1);
                }}
                className={`flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium ${
                  sortByEta
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-gray-300 bg-white text-gray-700"
                }`}
              >
                Sắp xếp theo ETA
              </button>
              <button
                type="button"
                onClick={resetDispatchFilters}
                className="flex h-9 items-center justify-center rounded-md bg-white px-3 text-sm font-medium text-gray-700"
              >
                Xóa bộ lọc
              </button>
            </div>
            <div className="h-px bg-gray-200" />
            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-gray-900">Đã chọn {selected.size} đơn</p>
                <select
                  value={assignStaffId}
                  onChange={(e) => setAssignStaffId(e.target.value)}
                  aria-label="Chọn nhân viên nhận đơn"
                  className="h-10 w-[260px] rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700"
                >
                  {activeStaff.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} ({row.id})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => assignRows(selected)}
                  className="flex h-8 items-center justify-center rounded-md bg-red-700 px-2.5 text-[13px] font-medium text-white"
                >
                  Phân công đã chọn
                </button>
                <button
                  type="button"
                  onClick={() => assignRows(selected)}
                  className="flex h-8 items-center justify-center rounded-md border border-gray-300 bg-white px-2.5 text-[13px] font-medium text-gray-700"
                >
                  Chia đơn
                </button>
              </div>
            )}
            <div className="overflow-x-auto">
              <Table columns={dispatchColumns} rows={dispatchPageRows} rowKey={(row) => row.id} bare />
            </div>
            <Pagination
              page={dispatchPage}
              totalPages={dispatchTotalPages}
              onPageChange={setDispatchPage}
              range={dispatchRange}
            />
          </section>
        </>
      )}

      {tab === "work" && (
        <>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
            <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="Tổng cuộc gọi" value={workDone} />
              <KpiCard label="Thành công" value={workSuccess} />
              <KpiCard label="Thất bại" value={workFailed} />
              <KpiCard label="Tốc độ gọi trung bình" value={minhAnh?.avgCallTime ?? "4p12"} />
            </div>
            <div className="flex h-9 shrink-0 items-center rounded-md border border-gray-300 bg-white px-3 text-xs text-gray-500">
              Ngày: 02/11/2026
            </div>
          </div>

          <section className="flex flex-wrap items-center gap-3 rounded-lg border bg-white p-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-700">
                Tiến độ ca: {workDone}/{MINH_ANH_SHIFT.assigned} cuộc gọi · {workPercent}%
              </p>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-red-700" style={{ width: `${workPercent}%` }} />
              </div>
            </div>
            <button
              type="button"
              onClick={togglePause}
              className="flex h-9 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700"
            >
              {isPaused ? "Tiếp tục nhận cuộc gọi mới" : "Tạm dừng nhận cuộc gọi mới"}
            </button>
          </section>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
            <section className="min-w-0 flex-1 overflow-x-auto rounded-lg border bg-white xl:w-[720px] xl:shrink-0">
              <div className="flex h-11 items-center px-4">
                <h2 className="text-sm font-semibold text-gray-900">Danh sách đơn được phân công</h2>
              </div>
              <div className="p-2">
                <input
                  type="text"
                  value={workSearch}
                  onChange={(e) => setWorkSearch(e.target.value)}
                  placeholder="Tìm kiếm mã đơn, SĐT, khách hàng..."
                  aria-label="Tìm đơn được phân công"
                  className="h-8 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
                />
              </div>
              <Table
                columns={workColumns}
                rows={filteredWork}
                rowKey={(row) => row.id}
                bare
                onRowClick={(row) => setSelectedWorkId(row.id)}
                rowClassName={(row) => (row.id === selectedWorkId ? "bg-red-50" : "")}
              />
            </section>

            <section className="rounded-lg border bg-white p-4 xl:w-[424px] xl:shrink-0">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-gray-900">Chi tiết đơn hàng</h2>
                  <p className="text-xs font-bold text-red-700">{selectedWork.id}</p>
                </div>
                <span className={`inline-flex h-[22px] items-center rounded-full px-[10px] text-xs font-medium ${asidePill}`}>
                  {selectedWork.result}
                </span>
              </div>
              {selectedWork.id === "DH-1044" ? (
                <div className="mt-3 flex gap-2">
                  <span className="flex h-8 items-center rounded-md border border-gray-200 px-3 text-xs font-medium text-gray-700">
                    Bắt đầu gọi: 09:12
                  </span>
                  <span className="flex h-8 items-center rounded-md border border-gray-200 px-3 text-xs font-medium text-gray-700">
                    Đang gọi: 04:32
                  </span>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <span className="flex h-8 items-center rounded-md border border-gray-200 px-3 text-xs font-medium text-gray-700">
                    Kết quả: {selectedWork.result}
                  </span>
                  <span className="flex h-8 items-center rounded-md border border-gray-200 px-3 text-xs font-medium text-gray-700">
                    {selectedWork.duration ? `Thời lượng: ${selectedWork.duration}` : "Chưa gọi"}
                  </span>
                </div>
              )}
              <div className="mt-3 flex flex-col gap-2 rounded-md border border-gray-200 p-3 text-xs">
                <div className="flex gap-2">
                  <p className="w-[110px] shrink-0 text-gray-500">Kênh</p>
                  <p className="min-w-0 flex-1 text-gray-800">{selectedWork.channel}</p>
                </div>
                <div className="flex gap-2">
                  <p className="w-[110px] shrink-0 text-gray-500">Mốc giao dự kiến</p>
                  <p className="min-w-0 flex-1 text-gray-800">{selectedWork.deadline}</p>
                </div>
                <div className="flex gap-2">
                  <p className="w-[110px] shrink-0 text-gray-500">Người phụ trách</p>
                  <p className="min-w-0 flex-1 text-gray-800">Minh Anh (NV01)</p>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2 rounded-md border border-gray-200 p-3">
                <p className="text-sm font-semibold text-gray-900">Thông tin khách hàng</p>
                <p className="text-sm text-gray-800">{selectedWork.customer}</p>
                <p className="text-sm text-gray-700">{selectedWork.phone}</p>
                <p className="text-xs text-gray-500">{selectedDetail?.address ?? "—"}</p>
              </div>
              <div className="mt-3 flex flex-col gap-2 rounded-md border border-gray-200 p-3">
                <p className="text-sm font-semibold text-gray-900">Trạng thái đơn hàng</p>
                {asideEvents.map((event) => (
                  <div key={`${event.time}-${event.title}`} className="flex items-center gap-2">
                    <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-green-600" />
                    <p className="w-11 shrink-0 text-xs text-gray-700">{event.time}</p>
                    <p className="min-w-0 flex-1 text-xs text-gray-700">{event.title}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2 rounded-md border border-gray-200 p-3">
                <p className="text-sm font-semibold text-gray-900">Cập nhật nhanh</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => markWorkResult("Thành công")}
                    disabled={selectedWork.result === "Thành công"}
                    className="flex h-9 flex-1 items-center justify-center rounded-md border border-green-200 bg-green-50 text-sm font-medium text-green-700 disabled:opacity-50"
                  >
                    Thành công
                  </button>
                  <button
                    type="button"
                    onClick={() => markWorkResult("Thất bại")}
                    disabled={selectedWork.result === "Thất bại"}
                    className="flex h-9 flex-1 items-center justify-center rounded-md border border-red-200 bg-red-50 text-sm font-medium text-red-700 disabled:opacity-50"
                  >
                    Thất bại
                  </button>
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {tab === "staff" && (
        <>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
            <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="NV đang nhận cuộc gọi" value={receivingCount} />
              <KpiCard label="NV đang tạm dừng" value={pausedCount} />
              <KpiCard label="Tổng cuộc gọi hôm nay" value={TEAM_TOTAL_CALLS} />
              <KpiCard label="Tỷ lệ thành công" value={`${TEAM_SUCCESS_RATE}%`} />
            </div>
            <div className="flex w-[230px] shrink-0 flex-col gap-2 py-1">
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[13px] text-amber-800">
                  Kết quả hôm nay: {TEAM_SUCCESS} Thành công · {TEAM_FAILED} Thất bại
                </p>
              </div>
              <div className="flex h-9 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-[13px]">
                <p className="text-gray-700">TG gọi TB toàn đội:</p>
                <p className="font-bold text-gray-900">{TEAM_AVG_CALL_TIME}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <select
              value={topStatus}
              onChange={(e) => {
                setTopStatus(e.target.value as "working" | "rest" | "all");
                setStaffPage(1);
              }}
              aria-label="Lọc theo trạng thái làm việc"
              className="h-10 w-[220px] rounded-md border border-gray-300 px-3 text-sm text-gray-700"
            >
              <option value="working">Trạng thái: Đang làm</option>
              <option value="rest">Trạng thái: Nghỉ</option>
              <option value="all">Tất cả trạng thái</option>
            </select>
            <button
              type="button"
              onClick={() => staffSearchRef.current?.focus()}
              className="flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700"
            >
              Tìm nhân viên...
            </button>
          </div>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-start gap-3">
              <input
                ref={staffSearchRef}
                type="text"
                value={staffSearch}
                onChange={(e) => {
                  setStaffSearch(e.target.value);
                  setStaffPage(1);
                }}
                placeholder="Tìm theo tên nhân viên"
                aria-label="Tìm theo tên nhân viên"
                className="h-10 w-[300px] max-w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
              />
              <select
                value={staffSelect}
                onChange={(e) => {
                  setStaffSelect(e.target.value);
                  setStaffPage(1);
                }}
                aria-label="Chọn nhân viên"
                className="h-10 w-[220px] rounded-md border border-gray-300 px-3 text-sm text-gray-700"
              >
                <option value="all">Tất cả nhân viên</option>
                {staff.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} ({row.id})
                  </option>
                ))}
              </select>
              <select
                value={staffStatusFilter}
                onChange={(e) => {
                  setStaffStatusFilter(e.target.value as "all" | TelesaleStaffStatus);
                  setStaffPage(1);
                }}
                aria-label="Lọc theo trạng thái nhân viên"
                className="h-10 w-[220px] rounded-md border border-gray-300 px-3 text-sm text-gray-700"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="Đang nhận">Đang nhận</option>
                <option value="Tạm dừng">Tạm dừng</option>
                <option value="Nghỉ">Nghỉ</option>
              </select>
              <select
                value={callStatusFilter}
                onChange={(e) => {
                  setCallStatusFilter(e.target.value as "all" | "Đang gọi" | "Chờ gọi");
                  setStaffPage(1);
                }}
                aria-label="Lọc theo trạng thái cuộc gọi"
                className="h-10 w-[220px] rounded-md border border-gray-300 px-3 text-sm text-gray-700"
              >
                <option value="all">Tất cả trạng thái cuộc gọi</option>
                <option value="Đang gọi">Đang gọi</option>
                <option value="Chờ gọi">Chờ gọi</option>
              </select>
              <button
                type="button"
                onClick={resetStaffFilters}
                className="flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700"
              >
                Xóa bộ lọc
              </button>
            </div>
          </section>

          <section className="overflow-x-auto rounded-lg border bg-white">
            <div className="flex h-11 items-center px-4">
              <h2 className="text-sm font-semibold text-gray-900">Tổng quan tiến độ Telesale</h2>
            </div>
            <Table columns={staffColumns} rows={staffPageRows} rowKey={(row) => row.id} bare />
            <Pagination
              page={staffPage}
              totalPages={staffTotalPages}
              onPageChange={setStaffPage}
              range={staffRange}
            />
          </section>
        </>
      )}
    </div>
  );
}
