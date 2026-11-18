// SPDX-License-Identifier: Apache-2.0

// Màn Phân phối đơn, mô hình A: bàn điều phối đóng gói theo phân đơn
// kho thật (không còn vị trí kho, block, đợt, máy in, tốc độ hay ETA
// của dữ liệu mẫu đóng băng, vì API không có các khái niệm đó).
// Điều phối viên chia đơn đóng gói cho tài khoản nhân viên kho thật;
// nhân viên kho xem và làm phân đơn của mình ở màn Kho.

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Table, type TableColumn } from "@/components/ui/Table";
import {
  DEMO_WAREHOUSE_ACCOUNTS,
  OVERLOAD_STANDARD,
  type ApiAssignment,
  type ApiOrder,
  type AssignmentStatus,
  type DistributionError,
} from "./distribution-types";

type Tab = "all" | "attention" | "staff";
type SubTab = "assigned" | "unassigned";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "Xem tất cả" },
  { key: "attention", label: "Cần chú ý" },
  { key: "staff", label: "Nhân viên" },
];

const PAGE_SIZE = 5;

// Trạng thái đơn liên quan đóng gói. Đơn ở trạng thái khác không vào
// màn này.
const PACKING_STATES = ["Chờ kho", "Đang đóng gói"];
const ACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = ["Chờ xử lý", "Đang xử lý"];

const ASSIGN_STATUS_PILL: Record<AssignmentStatus, string> = {
  "Chờ xử lý": "bg-amber-50 text-amber-800",
  "Đang xử lý": "bg-green-50 text-green-700",
  "Hoàn thành": "bg-blue-50 text-blue-700",
  "Đã hủy": "bg-gray-50 text-gray-700",
};

interface PackingRow {
  order: ApiOrder;
  assignment: ApiAssignment | null;
}

interface DistributionClientProps {
  orders: ApiOrder[];
  assignments: ApiAssignment[];
  distributionError: DistributionError | null;
  roles: string[];
}

// Sản phẩm đầu tiên của đơn, dạng "SKU xN"; đơn không có mặt hàng thì "-".
function itemsSummary(order: ApiOrder): string {
  const item = order.items[0];
  return item === undefined ? "-" : `${item.sku} x${item.quantity}`;
}

function itemsDetail(order: ApiOrder): string {
  if (order.items.length === 0) return "-";
  return order.items.map((item) => `${item.sku} x${item.quantity}`).join(", ");
}

// Phân đơn kho đang hoạt động mới nhất theo đơn (API chỉ cho 1 phân đơn
// đang hoạt động mỗi (đơn, loại), nhưng vẫn lấy mới nhất cho chắc).
function activeAssignmentByOrder(
  assignments: ApiAssignment[],
): Map<string, ApiAssignment> {
  const byOrder = new Map<string, ApiAssignment>();
  for (const item of assignments) {
    if (item.kind !== "warehouse") continue;
    if (!ACTIVE_ASSIGNMENT_STATUSES.includes(item.status)) continue;
    const current = byOrder.get(item.orderId);
    if (current === undefined || item.updatedAt > current.updatedAt) {
      byOrder.set(item.orderId, item);
    }
  }
  return byOrder;
}

export default function DistributionClient({
  orders,
  assignments,
  distributionError,
  roles,
}: DistributionClientProps) {
  const router = useRouter();
  const isDispatcher = roles.includes("Điều phối viên");

  const [tab, setTab] = useState<Tab>("all");
  const [subTab, setSubTab] = useState<SubTab>("assigned");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [workerFilter, setWorkerFilter] = useState("");
  const [page, setPage] = useState(1);
  const [staffSearch, setStaffSearch] = useState("");
  const [staffPage, setStaffPage] = useState(1);
  const [dialogRow, setDialogRow] = useState<PackingRow | null>(null);
  const [dialogAssignee, setDialogAssignee] = useState("");
  const [dialogErrorText, setDialogErrorText] = useState("");
  const [attentionErrorText, setAttentionErrorText] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Lựa chọn nhân viên cho từng đơn ở tab Cần chú ý; chưa chọn thì lấy
  // người gợi ý (ít phân đơn đang hoạt động nhất).
  const [assignChoice, setAssignChoice] = useState<Record<string, string>>({});

  const packingRows = useMemo<PackingRow[]>(() => {
    const activeByOrder = activeAssignmentByOrder(assignments);
    return orders
      .filter((order) => PACKING_STATES.includes(order.state))
      .map((order) => ({
        order,
        assignment: activeByOrder.get(order.id) ?? null,
      }));
  }, [orders, assignments]);

  const waitingCount = useMemo(
    () => orders.filter((order) => order.state === "Chờ kho").length,
    [orders],
  );
  const packingCount = useMemo(
    () => orders.filter((order) => order.state === "Đang đóng gói").length,
    [orders],
  );
  const readyCount = useMemo(
    () => orders.filter((order) => order.state === "Chờ điều xe").length,
    [orders],
  );

  // Số phân đơn đang hoạt động và đã hoàn thành theo từng tài khoản.
  const activeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of assignments) {
      if (item.kind !== "warehouse") continue;
      if (!ACTIVE_ASSIGNMENT_STATUSES.includes(item.status)) continue;
      counts.set(item.assignedTo, (counts.get(item.assignedTo) ?? 0) + 1);
    }
    return counts;
  }, [assignments]);
  const completedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of assignments) {
      if (item.kind !== "warehouse") continue;
      if (item.status !== "Hoàn thành") continue;
      counts.set(item.assignedTo, (counts.get(item.assignedTo) ?? 0) + 1);
    }
    return counts;
  }, [assignments]);

  const workingStaffCount = useMemo(() => {
    const staff = new Set<string>();
    for (const item of assignments) {
      if (item.kind !== "warehouse") continue;
      if (ACTIVE_ASSIGNMENT_STATUSES.includes(item.status)) staff.add(item.assignedTo);
    }
    return staff.size;
  }, [assignments]);

  // Bảng nhân viên: tài khoản demo trước, rồi các tài khoản khác từng
  // nhận phân đơn kho (sắp xếp theo tên tài khoản).
  const staffList = useMemo(() => {
    const others = new Set<string>();
    for (const item of assignments) {
      if (item.kind !== "warehouse") continue;
      if (!DEMO_WAREHOUSE_ACCOUNTS.includes(item.assignedTo)) {
        others.add(item.assignedTo);
      }
    }
    return [...DEMO_WAREHOUSE_ACCOUNTS, ...Array.from(others).sort()];
  }, [assignments]);

  // Gợi ý chia đơn: tài khoản demo có ít phân đơn đang hoạt động nhất;
  // bằng nhau thì lấy tài khoản đứng trước trong danh sách demo.
  const suggestedStaff = useMemo(() => {
    let best = DEMO_WAREHOUSE_ACCOUNTS[0] ?? "";
    let bestCount = Number.MAX_SAFE_INTEGER;
    for (const account of DEMO_WAREHOUSE_ACCOUNTS) {
      const count = activeCounts.get(account) ?? 0;
      if (count < bestCount) {
        best = account;
        bestCount = count;
      }
    }
    return best;
  }, [activeCounts]);

  const choiceFor = (orderId: string): string =>
    assignChoice[orderId] ?? suggestedStaff;

  const unassignedWaiting = useMemo(
    () =>
      packingRows.filter(
        (row) => row.order.state === "Chờ kho" && row.assignment === null,
      ),
    [packingRows],
  );
  const packingInProgress = useMemo(
    () => packingRows.filter((row) => row.order.state === "Đang đóng gói"),
    [packingRows],
  );

  const filteredAll = useMemo(() => {
    const query = search.trim().toLowerCase();
    return packingRows.filter((row) => {
      if (subTab === "assigned" && row.assignment === null) return false;
      if (subTab === "unassigned" && row.assignment !== null) return false;
      if (stateFilter !== "" && row.order.state !== stateFilter) return false;
      if (
        workerFilter !== "" &&
        row.assignment?.assignedTo !== workerFilter
      ) {
        return false;
      }
      if (query === "") return true;
      return [
        row.order.id,
        row.order.items.map((item) => item.sku).join(" "),
        row.assignment?.assignedTo ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [packingRows, search, stateFilter, workerFilter, subTab]);

  const allTotalPages = Math.max(1, Math.ceil(filteredAll.length / PAGE_SIZE));
  const allSafePage = Math.min(page, allTotalPages);
  const allPaged = filteredAll.slice(
    (allSafePage - 1) * PAGE_SIZE,
    allSafePage * PAGE_SIZE,
  );
  const allRange =
    filteredAll.length === 0
      ? { start: 0, end: 0, total: 0 }
      : {
          start: (allSafePage - 1) * PAGE_SIZE + 1,
          end: Math.min(allSafePage * PAGE_SIZE, filteredAll.length),
          total: filteredAll.length,
        };

  const filteredStaff = useMemo(() => {
    const query = staffSearch.trim().toLowerCase();
    return staffList.filter((name) =>
      query === "" ? true : name.toLowerCase().includes(query),
    );
  }, [staffList, staffSearch]);

  const staffTotalPages = Math.max(
    1,
    Math.ceil(filteredStaff.length / PAGE_SIZE),
  );
  const staffSafePage = Math.min(staffPage, staffTotalPages);
  const staffPaged = filteredStaff.slice(
    (staffSafePage - 1) * PAGE_SIZE,
    staffSafePage * PAGE_SIZE,
  );
  const staffRange =
    filteredStaff.length === 0
      ? { start: 0, end: 0, total: 0 }
      : {
          start: (staffSafePage - 1) * PAGE_SIZE + 1,
          end: Math.min(staffSafePage * PAGE_SIZE, filteredStaff.length),
          total: filteredStaff.length,
        };

  // Gửi thao tác phân đơn qua route nội bộ; lỗi hiện message của API,
  // xong thì tải lại dữ liệu server. Ẩn nút chia đơn với vai khác chỉ
  // là tiện ích giao diện; API kiểm tra lại vai trò ở mỗi thao tác.
  const postAssignment = async (
    path: string,
    body: unknown,
    actionKey: string,
    setErrorText: (text: string) => void,
  ): Promise<boolean> => {
    setBusyKey(actionKey);
    setErrorText("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message = (data as { message?: unknown } | null)?.message;
        setErrorText(
          typeof message === "string" && message !== ""
            ? message
            : `Thao tác lỗi (${response.status}).`,
        );
        return false;
      }
      return true;
    } catch {
      setErrorText("Không gọi được máy chủ, thử lại sau.");
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  const createAssignment = async (
    orderId: string,
    assignedTo: string,
    actionKey: string,
    setErrorText: (text: string) => void,
  ): Promise<boolean> =>
    postAssignment(
      "/api/assignments",
      { orderId, kind: "warehouse", assignedTo },
      actionKey,
      setErrorText,
    );

  // Phân công lại: hủy phân đơn cũ (lý do cố định) rồi tạo phân đơn
  // mới. Tạo mới lỗi sau khi đã hủy thì vẫn tải lại trang để đơn hiện
  // là chưa chia, lỗi API giữ nguyên trên màn hình.
  const reassign = async (
    row: PackingRow,
    assignedTo: string,
    actionKey: string,
    setErrorText: (text: string) => void,
  ): Promise<boolean> => {
    if (row.assignment !== null) {
      const cancelled = await postAssignment(
        `/api/assignments/${row.assignment.id}/cancel`,
        { reason: "Phân công lại" },
        actionKey,
        setErrorText,
      );
      if (!cancelled) return false;
    }
    const created = await createAssignment(
      row.order.id,
      assignedTo,
      actionKey,
      setErrorText,
    );
    router.refresh();
    return created;
  };

  const submitAssignCard = async (row: PackingRow) => {
    const ok = await createAssignment(
      row.order.id,
      choiceFor(row.order.id),
      `assign-${row.order.id}`,
      setAttentionErrorText,
    );
    if (!ok) return;
    router.refresh();
  };

  const submitDialogAssign = async () => {
    if (dialogRow === null) return;
    const row = dialogRow;
    const assignedTo = dialogAssignee === "" ? suggestedStaff : dialogAssignee;
    if (row.assignment === null) {
      const ok = await createAssignment(
        row.order.id,
        assignedTo,
        `dialog-assign-${row.order.id}`,
        setDialogErrorText,
      );
      if (!ok) return;
      setDialogRow(null);
      setDialogErrorText("");
      router.refresh();
      return;
    }
    const ok = await reassign(
      row,
      assignedTo,
      `dialog-assign-${row.order.id}`,
      setDialogErrorText,
    );
    if (!ok) return;
    setDialogRow(null);
    setDialogErrorText("");
  };

  const openDialog = (row: PackingRow) => {
    setDialogRow(row);
    setDialogAssignee(suggestedStaff);
    setDialogErrorText("");
  };

  const closeDialog = () => {
    setDialogRow(null);
    setDialogAssignee("");
    setDialogErrorText("");
  };

  const overloadFor = (assignee: string): boolean =>
    (activeCounts.get(assignee) ?? 0) >= OVERLOAD_STANDARD;

  const columns: TableColumn<PackingRow>[] = [
    {
      key: "id",
      header: "Mã đơn",
      render: (row) => row.order.id,
      cellClassName: "text-xs font-medium text-gray-900",
      headerClassName: "w-[149px]",
    },
    {
      key: "sku",
      header: "SKU",
      render: (row) => itemsSummary(row.order),
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[149px]",
    },
    {
      key: "state",
      header: "Trạng thái đơn",
      render: (row) => row.order.state,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[149px]",
    },
    {
      key: "worker",
      header: "Nhân viên",
      render: (row) =>
        row.assignment === null ? (
          <span className="text-gray-400">-</span>
        ) : (
          row.assignment.assignedTo
        ),
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[218px]",
    },
    {
      key: "assignStatus",
      header: "Trạng thái phân đơn",
      render: (row) =>
        row.assignment === null ? (
          <span className="text-gray-400">-</span>
        ) : (
          <span
            className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${ASSIGN_STATUS_PILL[row.assignment.status]}`}
          >
            {row.assignment.status}
          </span>
        ),
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[149px]",
    },
    {
      key: "actions",
      header: "Hành động",
      render: (row) => (
        <button
          type="button"
          onClick={() => openDialog(row)}
          className="text-xs font-medium text-red-700 underline"
        >
          Chi tiết
        </button>
      ),
      headerClassName: "w-[79px]",
    },
  ];

  const staffColumns: TableColumn<string>[] = [
    {
      key: "name",
      header: "Nhân viên",
      render: (name) => <span className="font-medium text-gray-900">{name}</span>,
      cellClassName: "text-xs",
      headerClassName: "w-[258px]",
    },
    {
      key: "active",
      header: "Đơn đang làm",
      render: (name) => String(activeCounts.get(name) ?? 0),
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[149px]",
    },
    {
      key: "done",
      header: "Đơn đã xong",
      render: (name) => String(completedCounts.get(name) ?? 0),
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[149px]",
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (name) =>
        (activeCounts.get(name) ?? 0) > 0 ? "Đang đóng gói" : "-",
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
                tab === item.key
                  ? "bg-red-700 font-bold text-white"
                  : "border border-gray-100 bg-white font-medium text-gray-700 hover:bg-gray-50"
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
            <span className="font-bold text-red-800">
              {distributionError !== null
                ? "- ĐƠN CHỜ KHO / - ĐƠN ĐANG ĐÓNG GÓI / - NHÂN VIÊN ĐANG LÀM:"
                : `${waitingCount} ĐƠN CHỜ KHO / ${packingCount} ĐƠN ĐANG ĐÓNG GÓI / ${workingStaffCount} NHÂN VIÊN ĐANG LÀM:`}
            </span>
            <span className="text-gray-500">
              {" "}
              Phân đơn đóng gói theo tài khoản nhân viên kho thật, điều phối
              viên chia đơn ở tab Cần chú ý.
            </span>
          </p>
        </div>
        <div className="h-[3px] w-full bg-red-600" />
      </div>

      {distributionError !== null ? (
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-sm text-gray-700">
          {distributionError === "unauthorized" ? (
            <>
              Phiên đăng nhập đã hết hạn.{" "}
              <Link href="/api/auth/login" className="font-medium text-red-700 underline">
                Đăng nhập lại
              </Link>{" "}
              để xem phân phối đơn từ API.
            </>
          ) : (
            "Không tải được phân phối đơn. Tải lại trang để thử lại."
          )}
        </p>
      ) : (
        <>
          {tab === "all" && (
            <>
              <div className="flex gap-1 rounded-lg border border-gray-300 bg-white p-1">
                <button
                  type="button"
                  onClick={() => {
                    setSubTab("assigned");
                    setPage(1);
                  }}
                  className={`flex h-9 flex-1 items-center justify-center rounded-md px-4 text-sm ${
                    subTab === "assigned"
                      ? "border border-gray-200 bg-white font-bold text-red-700"
                      : "text-gray-500"
                  }`}
                >
                  Đã chia
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSubTab("unassigned");
                    setPage(1);
                  }}
                  className={`flex h-9 flex-1 items-center justify-center rounded-md px-4 text-sm ${
                    subTab === "unassigned"
                      ? "border border-gray-200 bg-white font-bold text-red-700"
                      : "text-gray-500"
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
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                      }}
                      placeholder="Tìm kiếm mã đơn, SKU, nhân viên..."
                      aria-label="Tìm kiếm mã đơn, SKU, nhân viên"
                      className="h-10 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-500 focus:border-gray-500"
                    />
                  </div>
                  <div className="relative w-[200px] max-w-full">
                    <select
                      value={stateFilter}
                      onChange={(event) => {
                        setStateFilter(event.target.value);
                        setPage(1);
                      }}
                      aria-label="Lọc theo trạng thái đơn"
                      className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
                    >
                      <option value="">Tất cả trạng thái</option>
                      {PACKING_STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                  <div className="relative w-[220px] max-w-full">
                    <select
                      value={workerFilter}
                      onChange={(event) => {
                        setWorkerFilter(event.target.value);
                        setPage(1);
                      }}
                      aria-label="Lọc theo nhân viên"
                      className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
                    >
                      <option value="">Tất cả nhân viên</option>
                      {staffList.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
              </div>

              <section aria-label="Danh sách phân phối đơn hàng" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <Table bare columns={columns} rows={allPaged} rowKey={(row) => row.order.id} emptyText="Không có đơn phân phối" />
                <div className="border-t border-gray-200">
                  <Pagination page={allSafePage} totalPages={allTotalPages} onPageChange={setPage} range={allRange} />
                </div>
              </section>
            </>
          )}

          {tab === "attention" && (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="flex flex-col gap-2">
                <div className="flex h-11 items-center rounded-lg border border-gray-200 bg-white px-4">
                  <p className="text-xs font-semibold text-gray-900">
                    Chờ phân công ({unassignedWaiting.length} đơn)
                  </p>
                </div>
                {unassignedWaiting.length === 0 ? (
                  <p className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-sm text-gray-500">
                    Không có đơn nào chờ phân công.
                  </p>
                ) : (
                  unassignedWaiting.map((row) => {
                    const assignee = choiceFor(row.order.id);
                    const overloaded = overloadFor(assignee);
                    return (
                      <div key={row.order.id} className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3">
                        <p className="text-xs font-medium text-gray-900">
                          {row.order.id} - {itemsSummary(row.order)}
                        </p>
                        <p className="text-xs text-gray-700">
                          Khách hàng: {row.order.customer}
                        </p>
                        {isDispatcher ? (
                          <>
                            <div className="relative">
                              <select
                                value={assignee}
                                onChange={(event) =>
                                  setAssignChoice((prev) => ({
                                    ...prev,
                                    [row.order.id]: event.target.value,
                                  }))
                                }
                                aria-label={`Chia đơn ${row.order.id} cho nhân viên kho`}
                                className="h-9 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
                              >
                                {DEMO_WAREHOUSE_ACCOUNTS.map((name) => (
                                  <option key={name} value={name}>
                                    {name} ({activeCounts.get(name) ?? 0} đơn đang làm)
                                  </option>
                                ))}
                              </select>
                              <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            </div>
                            {overloaded && (
                              <p className="text-xs font-medium text-red-700">
                                Vượt tải chuẩn 30 đơn/đợt
                              </p>
                            )}
                            <button
                              type="button"
                              disabled={busyKey !== null}
                              onClick={() => void submitAssignCard(row)}
                              className="flex h-9 w-full items-center justify-center rounded-md bg-red-700 text-[13px] font-medium text-white hover:bg-red-800 disabled:opacity-50"
                            >
                              {busyKey === `assign-${row.order.id}`
                                ? "Đang chia..."
                                : "Chia đơn"}
                            </button>
                          </>
                        ) : (
                          <p className="text-xs text-gray-500">
                            Chỉ điều phối viên chia đơn.
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
                {attentionErrorText !== "" && (
                  <p className="text-sm text-red-700">{attentionErrorText}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex h-11 items-center rounded-lg border border-gray-200 bg-white px-4">
                  <p className="text-xs font-semibold text-gray-900">Đang đóng gói</p>
                </div>
                {packingInProgress.length === 0 ? (
                  <p className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-sm text-gray-500">
                    Không có đơn nào đang đóng gói.
                  </p>
                ) : (
                  packingInProgress.map((row) => (
                    <div key={row.order.id} className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-4">
                      <p className="text-xs font-medium text-gray-900">
                        {row.order.id} - {itemsSummary(row.order)}
                      </p>
                      <p className="text-xs text-gray-700">
                        Nhân viên:{" "}
                        {row.assignment === null
                          ? "Chưa chia"
                          : `${row.assignment.assignedTo} (${row.assignment.status})`}
                      </p>
                      <Link
                        href={`/orders/${row.order.id}`}
                        className="text-xs font-medium text-red-700 underline"
                      >
                        Xem đơn
                      </Link>
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex h-11 items-center rounded-lg border border-gray-200 bg-white px-4">
                  <p className="text-xs font-semibold text-gray-900">
                    Sẵn sàng giao ({readyCount} đơn)
                  </p>
                </div>
                <div className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-10">
                  <p className="text-center text-xs font-semibold text-gray-900">
                    {readyCount} đơn đang chờ điều xe
                  </p>
                  <p className="text-center text-xs text-gray-700">
                    Đang chờ bàn giao vận chuyển
                  </p>
                  <Link
                    href="/orders"
                    className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Xem đơn hàng
                  </Link>
                </div>
              </div>
            </div>
          )}

          {tab === "staff" && (
            <>
              <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
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
              </div>

              <section aria-label="Danh sách nhân viên phân phối" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <Table bare columns={staffColumns} rows={staffPaged} rowKey={(name) => name} emptyText="Không có nhân viên" />
                <div className="border-t border-gray-200">
                  <Pagination page={staffSafePage} totalPages={staffTotalPages} onPageChange={setStaffPage} range={staffRange} />
                </div>
              </section>
            </>
          )}
        </>
      )}

      <Modal
        open={dialogRow !== null}
        onClose={closeDialog}
        title={dialogRow !== null ? `${dialogRow.order.id} - Chi tiết đơn hàng` : ""}
        footer={
          dialogRow !== null ? (
            <>
              <button
                type="button"
                disabled={busyKey !== null}
                onClick={closeDialog}
                className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Đóng
              </button>
              {isDispatcher && (
                <button
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => void submitDialogAssign()}
                  className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
                >
                  {busyKey === `dialog-assign-${dialogRow.order.id}`
                    ? "Đang gửi..."
                    : dialogRow.assignment === null
                      ? "Xác nhận chia đơn"
                      : "Xác nhận phân công lại"}
                </button>
              )}
            </>
          ) : null
        }
      >
        {dialogRow !== null && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[13px]">
                <p className="w-[130px] shrink-0 text-gray-500">Trạng thái đơn</p>
                <p className="flex-1 text-gray-800">{dialogRow.order.state}</p>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="w-[130px] shrink-0 text-gray-500">Khách hàng</p>
                <p className="flex-1 text-gray-800">{dialogRow.order.customer}</p>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="w-[130px] shrink-0 text-gray-500">Sản phẩm</p>
                <p className="flex-1 text-gray-800">{itemsDetail(dialogRow.order)}</p>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="w-[130px] shrink-0 text-gray-500">Nhân viên</p>
                <p className="flex-1 text-gray-800">
                  {dialogRow.assignment === null
                    ? "Chưa chia"
                    : `${dialogRow.assignment.assignedTo} (${dialogRow.assignment.status})`}
                </p>
              </div>
            </div>
            {isDispatcher && (
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="distribution-dialog-assignee"
                  className="text-sm font-medium text-gray-700"
                >
                  {dialogRow.assignment === null
                    ? "Chia đơn cho nhân viên kho"
                    : "Phân công lại cho nhân viên kho"}
                </label>
                <div className="relative">
                  <select
                    id="distribution-dialog-assignee"
                    value={dialogAssignee === "" ? suggestedStaff : dialogAssignee}
                    onChange={(event) => setDialogAssignee(event.target.value)}
                    className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
                  >
                    {DEMO_WAREHOUSE_ACCOUNTS.map((name) => (
                      <option key={name} value={name}>
                        {name} ({activeCounts.get(name) ?? 0} đơn đang làm)
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
                {overloadFor(
                  dialogAssignee === "" ? suggestedStaff : dialogAssignee,
                ) && (
                  <p className="text-xs font-medium text-red-700">
                    Vượt tải chuẩn 30 đơn/đợt
                  </p>
                )}
                {dialogRow.assignment !== null && (
                  <p className="text-xs text-gray-500">
                    Phân công lại hủy phân đơn cũ (lý do “Phân công lại”) rồi
                    tạo phân đơn mới.
                  </p>
                )}
              </div>
            )}
            <Link
              href={`/orders/${dialogRow.order.id}`}
              className="text-sm font-medium text-red-700 underline"
            >
              Xem chi tiết đơn
            </Link>
            {dialogErrorText !== "" && (
              <p className="text-sm text-red-700">{dialogErrorText}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
