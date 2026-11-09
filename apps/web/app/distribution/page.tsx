// SPDX-License-Identifier: Apache-2.0

"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Table, type TableColumn } from "@/components/ui/Table";
import {
  DISTRIBUTION_AUDIT_ROWS,
  DISTRIBUTION_EXCEPTIONS,
  DISTRIBUTION_ROWS,
  DISTRIBUTION_STAFF,
  PACKING_PROGRESS,
  PROPOSAL_OVERLOAD_STANDARD,
  PROPOSAL_ROWS,
  staffLabel,
  type AuditRow,
  type DistributionRow,
  type DistributionStaff,
} from "@/data/distribution";

type Tab = "all" | "attention" | "staff";
type SubTab = "assigned" | "unassigned";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "Xem tất cả" },
  { key: "attention", label: "Cần chú ý" },
  { key: "staff", label: "Nhân viên" },
];

const PAGE_SIZE = 5;
const AUDIT_PAGE_SIZE = 4;
const DATE_OPTIONS = ["02/11/2026"];
const ZONE_OPTIONS = ["A1", "A2", "A3", "B1"];
const BLOCK_OPTIONS = ["B-16", "B-17", "B-18"];

function FilterSelect({
  id,
  value,
  onChange,
  ariaLabel,
  placeholder,
  options,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder: string;
  options: string[];
}) {
  return (
    <span className="relative block w-full">
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
    </span>
  );
}

export default function DistributionPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [proposalOpen, setProposalOpen] = useState(false);
  const [printConfirmed, setPrintConfirmed] = useState(false);
  const [auditRows, setAuditRows] = useState<AuditRow[]>(DISTRIBUTION_AUDIT_ROWS);

  // Xem tat ca
  const [subTab, setSubTab] = useState<SubTab>("assigned");
  const [allSearch, setAllSearch] = useState("");
  const [allZone, setAllZone] = useState("");
  const [allStatus, setAllStatus] = useState("");
  const [allWorker, setAllWorker] = useState("");
  const [allBatch, setAllBatch] = useState("");
  const [allPage, setAllPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [showAllAdvanced, setShowAllAdvanced] = useState(true);

  // Can chu y
  const [reassigned, setReassigned] = useState<Record<string, string>>({});
  const [reportedOff, setReportedOff] = useState<Set<string>>(new Set());
  const [printedNextBlock, setPrintedNextBlock] = useState<Set<string>>(new Set());

  // Nhan vien
  const [staffSearch, setStaffSearch] = useState("");
  const [staffZone, setStaffZone] = useState("");
  const [staffStatus, setStaffStatus] = useState("");
  const [staffWorker, setStaffWorker] = useState("");
  const [staffPage, setStaffPage] = useState(1);
  const [showStaffAdvanced, setShowStaffAdvanced] = useState(true);
  const [printedMore, setPrintedMore] = useState<Set<string>>(new Set());

  const filteredAll = useMemo(() => {
    const query = allSearch.trim().toLowerCase();
    return DISTRIBUTION_ROWS.filter((row) => {
      if (subTab === "assigned" && row.status === "Chưa chia") return false;
      if (subTab === "unassigned" && row.status !== "Chưa chia") return false;
      if (allZone !== "" && !row.position.startsWith(allZone)) return false;
      if (allStatus !== "" && row.status !== allStatus) return false;
      if (allWorker !== "" && row.worker !== allWorker) return false;
      if (allBatch !== "" && row.block !== allBatch) return false;
      if (query === "") return true;
      return [row.id, row.sku, row.position, row.worker].some((value) => value.toLowerCase().includes(query));
    });
  }, [allSearch, allZone, allStatus, allWorker, allBatch, subTab]);

  const allTotalPages = Math.max(1, Math.ceil(filteredAll.length / PAGE_SIZE));
  const allSafePage = Math.min(allPage, allTotalPages);
  const allPaged = filteredAll.slice((allSafePage - 1) * PAGE_SIZE, allSafePage * PAGE_SIZE);
  const allRange =
    filteredAll.length === 0
      ? { start: 0, end: 0, total: 0 }
      : { start: (allSafePage - 1) * PAGE_SIZE + 1, end: Math.min(allSafePage * PAGE_SIZE, filteredAll.length), total: filteredAll.length };

  const auditTotalPages = Math.max(1, Math.ceil(auditRows.length / AUDIT_PAGE_SIZE));
  const auditSafePage = Math.min(auditPage, auditTotalPages);
  const auditPaged = auditRows.slice((auditSafePage - 1) * AUDIT_PAGE_SIZE, auditSafePage * AUDIT_PAGE_SIZE);
  const auditRange = { start: (auditSafePage - 1) * AUDIT_PAGE_SIZE + 1, end: Math.min(auditSafePage * AUDIT_PAGE_SIZE, auditRows.length), total: auditRows.length };

  const filteredStaff = useMemo(() => {
    const query = staffSearch.trim().toLowerCase();
    return DISTRIBUTION_STAFF.filter((row) => {
      if (staffZone !== "" && row.zone !== staffZone) return false;
      if (staffStatus !== "" && row.status !== staffStatus) return false;
      if (staffWorker !== "" && row.name !== staffWorker) return false;
      if (query === "") return true;
      return [row.name, row.id, row.block].some((value) => value.toLowerCase().includes(query));
    });
  }, [staffSearch, staffZone, staffStatus, staffWorker]);

  const staffTotalPages = Math.max(1, Math.ceil(filteredStaff.length / PAGE_SIZE));
  const staffSafePage = Math.min(staffPage, staffTotalPages);
  const staffPaged = filteredStaff.slice((staffSafePage - 1) * PAGE_SIZE, staffSafePage * PAGE_SIZE);
  const staffRange =
    filteredStaff.length === 0
      ? { start: 0, end: 0, total: 0 }
      : { start: (staffSafePage - 1) * PAGE_SIZE + 1, end: Math.min(staffSafePage * PAGE_SIZE, filteredStaff.length), total: filteredStaff.length };

  const pendingExceptions = DISTRIBUTION_EXCEPTIONS.filter((item) => reassigned[item.id] === undefined).length;

  const reassignTarget = (absentCode: string | null): DistributionStaff | null => {
    const candidates = DISTRIBUTION_STAFF.filter((staff) => staff.status === "Đang đóng gói" && staff.id !== absentCode);
    if (candidates.length === 0) return null;
    return candidates.reduce((best, current) => (current.remaining < best.remaining ? current : best));
  };

  const reassign = (exceptionId: string, absentCode: string | null) => {
    const target = reassignTarget(absentCode);
    if (target === null) return;
    setReassigned((prev) => ({ ...prev, [exceptionId]: target.id }));
  };

  const confirmProposal = () => {
    setAuditRows((prev) => [
      {
        batch: "Đợt 14:00",
        approvedAt: "19:14",
        orderCount: 120,
        staffCount: 4,
        exceptionCount: 3,
        approver: "Sơn",
        note: "Đã xác nhận phân công, Hoàng Nam vượt tải cần duyệt riêng ở Hàng đợi duyệt",
      },
      ...prev,
    ]);
    setAuditPage(1);
    setProposalOpen(false);
    setTab("all");
  };

  const soonDoneStaff = DISTRIBUTION_STAFF.filter((staff) => staff.status === "Đang đóng gói" && staff.remaining > 0 && staff.remaining <= 5);
  const allSoonDonePrinted = soonDoneStaff.every((staff) => printedMore.has(staff.id));

  const printMoreForSoonDone = () => {
    setPrintedMore((prev) => {
      const next = new Set(prev);
      soonDoneStaff.forEach((staff) => next.add(staff.id));
      return next;
    });
  };

  const distributionColumns: TableColumn<DistributionRow>[] = [
    {
      key: "id",
      header: "Mã đơn",
      render: (row) => row.id,
      cellClassName: "text-xs font-medium text-gray-900",
      headerClassName: "w-[149px]",
    },
    {
      key: "sku",
      header: "SKU",
      render: (row) => row.sku,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[149px]",
    },
    {
      key: "position",
      header: "Vị trí kho",
      render: (row) => row.position,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[199px]",
    },
    {
      key: "worker",
      header: "Nhân viên",
      render: (row) => (row.worker === "" ? <span className="text-gray-400">-</span> : row.worker),
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[218px]",
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (row) => row.status,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[219px]",
    },
    {
      key: "block",
      header: "Block",
      render: (row) => (row.block === "" ? <span className="text-gray-400">-</span> : row.block),
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[219px]",
    },
  ];

  const auditColumns: TableColumn<AuditRow>[] = [
    {
      key: "batch",
      header: "Đợt",
      render: (row) => row.batch,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[109px]",
    },
    {
      key: "approvedAt",
      header: "Giờ duyệt",
      render: (row) => row.approvedAt,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[129px]",
    },
    {
      key: "orderCount",
      header: "Số đơn",
      render: (row) => `${row.orderCount} đơn`,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[119px]",
    },
    {
      key: "staffCount",
      header: "Nhân viên",
      render: (row) => `${row.staffCount} nhân viên`,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[159px]",
    },
    {
      key: "exceptionCount",
      header: "Đơn ngoại lệ",
      render: (row) => `${row.exceptionCount} đơn ngoại lệ`,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[159px]",
    },
    {
      key: "approver",
      header: "Người duyệt",
      render: (row) => row.approver,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[159px]",
    },
    {
      key: "note",
      header: "Ghi chú",
      render: (row) => row.note,
      cellClassName: "text-xs text-gray-700 !whitespace-normal",
      headerClassName: "w-[318px]",
    },
  ];

  const staffColumns: TableColumn<DistributionStaff>[] = [
    {
      key: "name",
      header: "Nhân viên",
      render: (row) => `${row.name} (${row.id})`,
      cellClassName: "text-xs font-medium text-gray-900",
      headerClassName: "w-[218px]",
    },
    {
      key: "block",
      header: "Đợt hiện tại",
      render: (row) => row.block,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[139px]",
    },
    {
      key: "done",
      header: "Đơn hoàn thành",
      render: (row) => row.done,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[149px]",
    },
    {
      key: "remaining",
      header: "Đơn còn lại",
      render: (row) => row.remaining,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[139px]",
    },
    {
      key: "speed",
      header: "Tốc độ làm (1 giờ)",
      render: (row) => `${row.speedPerHour} đơn/giờ`,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[189px]",
    },
    {
      key: "eta",
      header: "ETA",
      render: (row) => `${row.etaMinutes} phút`,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[129px]",
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (row) => {
        const soonDone = row.status === "Đang đóng gói" && row.remaining > 0 && row.remaining <= 5;
        if (!soonDone) return row.status;
        const printed = printedMore.has(row.id);
        return (
          <button
            type="button"
            disabled={printed}
            onClick={() => {
              setPrintedMore((prev) => {
                const next = new Set(prev);
                next.add(row.id);
                return next;
              });
            }}
            className="flex h-8 items-center rounded-md bg-red-700 px-2.5 text-[13px] font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {printed ? "Đã in thêm" : "In thêm"}
          </button>
        );
      },
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[189px]",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-lg font-bold text-gray-900">Phân phối đơn hàng</h1>
        <div className="flex gap-2">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`flex h-9 items-center justify-center rounded-md px-3 text-sm ${
                tab === item.key ? "bg-red-700 font-bold text-white" : "border border-gray-100 bg-white font-medium text-gray-700 hover:bg-gray-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-3 px-4 py-3">
          <p className="flex-1 text-sm">
            <span className="font-bold text-red-800">ĐỢT 14:00: 120 ĐƠN / 4 NHÂN VIÊN:</span>
            <span className="text-gray-500"> Hệ thống gợi ý phương án theo khu vực kho và công suất - 3 đơn cần xử lý tay</span>
          </p>
          <button
            type="button"
            onClick={() => setProposalOpen(true)}
            className="flex h-9 shrink-0 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800"
          >
            Xem đề xuất phân công
          </button>
        </div>
        <div className="h-[3px] w-full bg-red-600" />
      </div>

      {tab === "all" && (
        <>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center gap-3 px-4 py-2.5">
              <p className="flex-1 text-xs text-gray-500">
                {printConfirmed
                  ? "Đã xác nhận in mới cho Hoàng Nam (K01) - Block tiếp theo 22 phiếu"
                  : "[Máy in] 1 nhân viên yêu cầu in block tiếp: Hoàng Nam (K01) - Block tiếp theo 22 phiếu"}
              </p>
              <button
                type="button"
                disabled={printConfirmed}
                onClick={() => setPrintConfirmed(true)}
                className="flex h-9 shrink-0 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {printConfirmed ? "Đã xác nhận" : "Xác nhận in mới"}
              </button>
            </div>
            <div className="h-[3px] w-full bg-red-600" />
          </div>

          <div className="flex gap-1 rounded-lg border border-gray-300 bg-white p-1">
            <button
              type="button"
              onClick={() => {
                setSubTab("assigned");
                setAllPage(1);
              }}
              className={`flex h-9 flex-1 items-center justify-center rounded-md px-4 text-sm ${
                subTab === "assigned" ? "border border-gray-200 bg-white font-bold text-red-700" : "text-gray-500"
              }`}
            >
              Đã chia
            </button>
            <button
              type="button"
              onClick={() => {
                setSubTab("unassigned");
                setAllPage(1);
              }}
              className={`flex h-9 flex-1 items-center justify-center rounded-md px-4 text-sm ${
                subTab === "unassigned" ? "border border-gray-200 bg-white font-bold text-red-700" : "text-gray-500"
              }`}
            >
              Chưa chia
            </button>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-[340px] max-w-full">
                <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={allSearch}
                  onChange={(event) => {
                    setAllSearch(event.target.value);
                    setAllPage(1);
                  }}
                  placeholder="Tìm kiếm mã đơn, địa chỉ..."
                  aria-label="Tìm kiếm mã đơn, địa chỉ phân phối"
                  className="h-10 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-500 focus:border-gray-500"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowAllAdvanced((prev) => !prev)}
                className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Lọc nâng cao
              </button>
            </div>
            {showAllAdvanced && (
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex w-[200px] max-w-full flex-col gap-1.5">
                  <label htmlFor="all-zone" className="text-sm font-medium text-gray-700">
                    Khu vực kho
                  </label>
                  <FilterSelect
                    id="all-zone"
                    value={allZone}
                    onChange={(value) => {
                      setAllZone(value);
                      setAllPage(1);
                    }}
                    ariaLabel="Lọc theo khu vực kho"
                    placeholder="Tất cả kho"
                    options={ZONE_OPTIONS}
                  />
                </div>
                <div className="flex w-[200px] max-w-full flex-col gap-1.5">
                  <label htmlFor="all-status" className="text-sm font-medium text-gray-700">
                    Trạng thái
                  </label>
                  <FilterSelect
                    id="all-status"
                    value={allStatus}
                    onChange={(value) => {
                      setAllStatus(value);
                      setAllPage(1);
                    }}
                    ariaLabel="Lọc theo trạng thái"
                    placeholder="Tất cả trạng thái"
                    options={["Đang đóng gói", "Hoàn thành", "Chưa chia"]}
                  />
                </div>
                <div className="flex w-[200px] max-w-full flex-col gap-1.5">
                  <label htmlFor="all-worker" className="text-sm font-medium text-gray-700">
                    Nhân viên
                  </label>
                  <FilterSelect
                    id="all-worker"
                    value={allWorker}
                    onChange={(value) => {
                      setAllWorker(value);
                      setAllPage(1);
                    }}
                    ariaLabel="Lọc theo nhân viên"
                    placeholder="Tất cả nhân viên"
                    options={DISTRIBUTION_STAFF.map((staff) => staff.name)}
                  />
                </div>
                <div className="flex w-[200px] max-w-full flex-col gap-1.5">
                  <label htmlFor="all-batch" className="text-sm font-medium text-gray-700">
                    Đợt phân phối
                  </label>
                  <FilterSelect
                    id="all-batch"
                    value={allBatch}
                    onChange={(value) => {
                      setAllBatch(value);
                      setAllPage(1);
                    }}
                    ariaLabel="Lọc theo đợt phân phối"
                    placeholder="Tất cả đợt"
                    options={BLOCK_OPTIONS}
                  />
                </div>
                <div className="flex w-[200px] max-w-full flex-col gap-1.5">
                  <label htmlFor="all-date" className="text-sm font-medium text-gray-700">
                    Ngày tạo đơn
                  </label>
                  <FilterSelect id="all-date" value="02/11/2026" onChange={() => undefined} ariaLabel="Ngày tạo đơn" placeholder="02/11/2026" options={DATE_OPTIONS} />
                </div>
              </div>
            )}
          </div>

          <section aria-label="Danh sách phân phối đơn hàng" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <Table bare columns={distributionColumns} rows={allPaged} rowKey={(row) => row.id} emptyText="Không có đơn phân phối" />
            <div className="border-t border-gray-200">
              <Pagination page={allSafePage} totalPages={allTotalPages} onPageChange={setAllPage} range={allRange} />
            </div>
          </section>

          <section aria-label="Audit log lịch sử duyệt đợt phân công" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <h2 className="flex h-11 items-center border-b border-gray-200 px-4 text-sm font-semibold text-gray-900">
              Audit log - Lịch sử duyệt đợt phân công hôm nay
            </h2>
            <Table bare columns={auditColumns} rows={auditPaged} rowKey={(row) => `${row.batch}-${row.approvedAt}`} emptyText="Không có lịch sử duyệt" />
            <div className="border-t border-gray-200">
              <Pagination page={auditSafePage} totalPages={auditTotalPages} onPageChange={setAuditPage} range={auditRange} />
            </div>
          </section>
        </>
      )}

      {tab === "attention" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <div className="flex h-11 items-center rounded-lg border border-gray-200 bg-white px-4">
              <p className="text-xs font-semibold text-gray-900">Chờ phân công ({pendingExceptions} ngoại lệ)</p>
            </div>
            {DISTRIBUTION_EXCEPTIONS.map((item) => {
              const targetId = reassigned[item.id];
              return (
                <div key={item.id} className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-xs font-medium text-gray-900">
                    {item.id} {item.suffix}
                  </p>
                  <p className="text-xs text-gray-700">Vị trí: {item.position}</p>
                  <p className="text-xs text-gray-600">Lý do: {item.reason}</p>
                  {targetId !== undefined ? (
                    <p className="text-xs font-medium text-green-700">Đã phân công lại cho {staffLabel(targetId)}</p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => reassign(item.id, item.absentCode)}
                      className="flex h-9 w-full items-center justify-center rounded-md bg-red-700 text-[13px] font-medium text-white hover:bg-red-800"
                    >
                      Phân công lại
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4">
              <p className="flex-1 text-xs font-semibold text-gray-900">Đang đóng gói</p>
              <button
                type="button"
                onClick={() => setTab("staff")}
                className="flex h-8 items-center rounded-md border border-gray-300 bg-white px-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-100"
              >
                Xem tất cả
              </button>
            </div>
            {PACKING_PROGRESS.map((progress) => {
              const staff = DISTRIBUTION_STAFF.find((item) => item.id === progress.staffId);
              if (staff === undefined) return null;
              const reported = reportedOff.has(staff.id);
              const soonDone = staff.remaining > 0 && staff.remaining <= 5;
              const nextPrinted = printedNextBlock.has(staff.id);
              return (
                <div key={staff.id} className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-xs font-medium text-gray-900">
                      {staff.name} ({staff.id})
                    </p>
                    <button
                      type="button"
                      disabled={reported}
                      onClick={() => {
                        setReportedOff((prev) => {
                          const next = new Set(prev);
                          next.add(staff.id);
                          return next;
                        });
                      }}
                      className="flex h-8 items-center rounded-md bg-red-700 px-2.5 text-[13px] font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {reported ? "Đã báo nghỉ" : "Báo nghỉ"}
                    </button>
                  </div>
                  <p className="text-xs text-gray-700">
                    Block: {progress.blockTickets} phiếu | Đã xong: {progress.doneTickets}
                  </p>
                  <p className="text-xs text-gray-700">Tiến độ: {progress.progressPercent}%</p>
                  {soonDone ? (
                    <button
                      type="button"
                      disabled={nextPrinted}
                      onClick={() => {
                        setPrintedNextBlock((prev) => {
                          const next = new Set(prev);
                          next.add(staff.id);
                          return next;
                        });
                      }}
                      className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-[13px] font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {nextPrinted ? "Đã in block tiếp" : "In block tiếp"}
                    </button>
                  ) : (
                    <p className="text-xs text-gray-500">Đang làm block hiện tại...</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex h-11 items-center rounded-lg border border-gray-200 bg-white px-4">
              <p className="text-xs font-semibold text-gray-900">Sẵn sàng giao (127 đơn)</p>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-10">
              <p className="text-center text-xs font-semibold text-gray-900">127 đơn đã hoàn thành đóng gói</p>
              <p className="text-center text-xs text-gray-700">Đang chờ bàn giao vận chuyển</p>
              <p className="text-center text-xs text-gray-700">Đợt xuất hàng tiếp theo: 15:00</p>
              <button
                type="button"
                onClick={() => setTab("all")}
                className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Xem chi tiết 127 đơn sẵn sàng giao
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "staff" && (
        <>
          <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-[340px] max-w-full">
                <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={staffSearch}
                  onChange={(event) => {
                    setStaffSearch(event.target.value);
                    setStaffPage(1);
                  }}
                  placeholder="Tìm kiếm nhân viên..."
                  aria-label="Tìm kiếm nhân viên"
                  className="h-10 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-500 focus:border-gray-500"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowStaffAdvanced((prev) => !prev)}
                className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Lọc nâng cao
              </button>
            </div>
            {showStaffAdvanced && (
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex w-[220px] max-w-full flex-col gap-1.5">
                  <label htmlFor="staff-zone" className="text-sm font-medium text-gray-700">
                    Khu vực kho
                  </label>
                  <FilterSelect
                    id="staff-zone"
                    value={staffZone}
                    onChange={(value) => {
                      setStaffZone(value);
                      setStaffPage(1);
                    }}
                    ariaLabel="Lọc theo khu vực kho"
                    placeholder="Tất cả kho"
                    options={ZONE_OPTIONS}
                  />
                </div>
                <div className="flex w-[220px] max-w-full flex-col gap-1.5">
                  <label htmlFor="staff-status" className="text-sm font-medium text-gray-700">
                    Trạng thái
                  </label>
                  <FilterSelect
                    id="staff-status"
                    value={staffStatus}
                    onChange={(value) => {
                      setStaffStatus(value);
                      setStaffPage(1);
                    }}
                    ariaLabel="Lọc theo trạng thái"
                    placeholder="Tất cả trạng thái"
                    options={["Đang đóng gói", "Hoàn thành"]}
                  />
                </div>
                <div className="flex w-[220px] max-w-full flex-col gap-1.5">
                  <label htmlFor="staff-worker" className="text-sm font-medium text-gray-700">
                    Nhân viên
                  </label>
                  <FilterSelect
                    id="staff-worker"
                    value={staffWorker}
                    onChange={(value) => {
                      setStaffWorker(value);
                      setStaffPage(1);
                    }}
                    ariaLabel="Lọc theo nhân viên"
                    placeholder="Tất cả nhân viên"
                    options={DISTRIBUTION_STAFF.map((staff) => staff.name)}
                  />
                </div>
                <div className="flex w-[220px] max-w-full flex-col gap-1.5">
                  <span className="text-sm font-medium text-transparent" aria-hidden="true">
                    .
                  </span>
                  <button
                    type="button"
                    disabled={allSoonDonePrinted}
                    onClick={printMoreForSoonDone}
                    className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    In thêm cho NV sắp xong
                  </button>
                </div>
              </div>
            )}
          </div>

          <section aria-label="Danh sách nhân viên phân phối" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <Table bare columns={staffColumns} rows={staffPaged} rowKey={(row) => row.id} emptyText="Không có nhân viên" />
            <div className="border-t border-gray-200">
              <Pagination page={staffSafePage} totalPages={staffTotalPages} onPageChange={setStaffPage} range={staffRange} />
            </div>
          </section>
        </>
      )}

      <Modal
        open={proposalOpen}
        onClose={() => setProposalOpen(false)}
        title="Đề xuất phân công - Đợt 14:00"
        footer={
          <>
            <button
              type="button"
              onClick={() => setProposalOpen(false)}
              className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={confirmProposal}
              className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800"
            >
              Xác nhận phân công
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2">
            {(
              [
                { value: "120", label: "Tổng đơn" },
                { value: "4", label: "Nhân viên" },
                { value: "3", label: "Cần xử lý tay" },
              ] as { value: string; label: string }[]
            ).map((item) => (
              <div key={item.label} className="flex flex-1 flex-col items-center gap-1 rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-lg font-semibold text-gray-900">{item.value}</p>
                <p className="text-xs text-gray-500">{item.label}</p>
                <span className="h-[3px] w-full bg-red-600" aria-hidden="true" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {PROPOSAL_ROWS.map((item) => {
              const overloaded = item.orders > PROPOSAL_OVERLOAD_STANDARD;
              return (
                <div key={item.staffId} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                  <p className="flex-1 text-[13px] font-medium text-gray-900">{staffLabel(item.staffId)}</p>
                  <p className="text-xs text-gray-500">
                    Block {item.block} - {item.orders} đơn
                  </p>
                  <span
                    className={`flex h-[22px] items-center justify-center rounded-full px-2.5 text-xs font-medium ${
                      overloaded ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
                    }`}
                  >
                    {overloaded ? "Vượt tải" : "Trong tải"}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500">Hoàng Nam vượt tải chuẩn 30 đơn/đợt. Phân vượt tải cần duyệt riêng ở Hàng đợi duyệt trước khi áp dụng.</p>
        </div>
      </Modal>
    </div>
  );
}
