// SPDX-License-Identifier: Apache-2.0

// Màn Phân phối đơn, mô hình A: bàn điều phối đóng gói theo phân đơn
// kho thật (không còn vị trí kho, block, đợt, máy in, tốc độ hay ETA
// của dữ liệu mẫu đóng băng, vì API không có các khái niệm đó).
// Điều phối viên chia đơn đóng gói cho tài khoản nhân viên kho thật;
// nhân viên kho xem và làm phân đơn của mình ở màn Kho.

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Table, type TableColumn } from "@/components/ui/Table";
import {
  DEMO_WAREHOUSE_ACCOUNTS,
  OVERLOAD_STANDARD,
  type ApiAssignment,
  type ApiDecideResult,
  type ApiOrder,
  type ApiProposal,
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
  // Trang của từng cột ở tab Cần chú ý; 2 cột phân trang độc lập nhau.
  const [waitingPage, setWaitingPage] = useState(1);
  const [packingPage, setPackingPage] = useState(1);
  const [dialogRow, setDialogRow] = useState<PackingRow | null>(null);
  const [dialogAssignee, setDialogAssignee] = useState("");
  const [dialogErrorText, setDialogErrorText] = useState("");
  const [attentionErrorText, setAttentionErrorText] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Lựa chọn nhân viên cho từng đơn ở tab Cần chú ý; chưa chọn thì lấy
  // người gợi ý (ít phân đơn đang hoạt động nhất).
  const [assignChoice, setAssignChoice] = useState<Record<string, string>>({});

  // Modal AI chia đơn kho: bước 1 chọn nhân viên đang làm việc, bước 2
  // duyệt đề xuất theo đợt (đổi người nhận, bỏ đơn, áp dụng/từ chối).
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposal, setProposal] = useState<ApiProposal | null>(null);
  const [proposalBusy, setProposalBusy] = useState<string | null>(null);
  const [proposalError, setProposalError] = useState("");
  const [workingStaff, setWorkingStaff] = useState<string[]>([
    ...DEMO_WAREHOUSE_ACCOUNTS,
  ]);
  const [editedAssignee, setEditedAssignee] = useState<Record<string, string>>({});
  const [removedOrderIds, setRemovedOrderIds] = useState<string[]>([]);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [decideResult, setDecideResult] = useState<ApiDecideResult | null>(null);

  // Đề xuất gần đây (để mở lại đề xuất đang chờ duyệt vượt tải sau khi
  // Quản lý đã duyệt). Tải khi vào tab Cần chú ý.
  const [recentProposals, setRecentProposals] = useState<ApiProposal[]>([]);
  const loadRecentProposals = async () => {
    try {
      const response = await fetch("/api/ai-assignments/warehouse/proposals");
      if (!response.ok) return;
      const data = (await response.json()) as ApiProposal[];
      setRecentProposals(data.slice(0, 5));
    } catch {
      // Không chặn màn hình khi tải danh sách đề xuất lỗi.
    }
  };
  useEffect(() => {
    if (tab === "attention") {
      void loadRecentProposals();
    }
  }, [tab]);

  // Mở lại 1 đề xuất đã lưu trong modal để duyệt tiếp.
  const openProposal = (item: ApiProposal) => {
    setProposal(item);
    setProposalError("");
    setEditedAssignee({});
    setRemovedOrderIds([]);
    setRejectReason("");
    setShowReject(false);
    setDecideResult(null);
    setProposalOpen(true);
  };

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

  // Phân trang 2 cột ở tab Cần chú ý, theo đúng mẫu của tab Xem tất cả
  // và tab Nhân viên: 5 dòng/trang, trang an toàn kẹp trong tổng số
  // trang, khoảng hiển thị dạng 1-5 / tổng.
  const waitingTotalPages = Math.max(
    1,
    Math.ceil(unassignedWaiting.length / PAGE_SIZE),
  );
  const waitingSafePage = Math.min(waitingPage, waitingTotalPages);
  const waitingPaged = unassignedWaiting.slice(
    (waitingSafePage - 1) * PAGE_SIZE,
    waitingSafePage * PAGE_SIZE,
  );
  const waitingRange =
    unassignedWaiting.length === 0
      ? { start: 0, end: 0, total: 0 }
      : {
          start: (waitingSafePage - 1) * PAGE_SIZE + 1,
          end: Math.min(waitingSafePage * PAGE_SIZE, unassignedWaiting.length),
          total: unassignedWaiting.length,
        };

  const packingTotalPages = Math.max(
    1,
    Math.ceil(packingInProgress.length / PAGE_SIZE),
  );
  const packingSafePage = Math.min(packingPage, packingTotalPages);
  const packingPaged = packingInProgress.slice(
    (packingSafePage - 1) * PAGE_SIZE,
    packingSafePage * PAGE_SIZE,
  );
  const packingRange =
    packingInProgress.length === 0
      ? { start: 0, end: 0, total: 0 }
      : {
          start: (packingSafePage - 1) * PAGE_SIZE + 1,
          end: Math.min(packingSafePage * PAGE_SIZE, packingInProgress.length),
          total: packingInProgress.length,
        };

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

  // Mở modal AI chia đơn: bước 1 chọn nhân viên đang làm việc (mặc định
  // tick đủ 3 tài khoản demo kho); bỏ tick ai thì người đó không nhận đơn
  // trong đợt này.
  const openProposalModal = () => {
    setProposal(null);
    setProposalError("");
    setWorkingStaff([...DEMO_WAREHOUSE_ACCOUNTS]);
    setEditedAssignee({});
    setRemovedOrderIds([]);
    setRejectReason("");
    setShowReject(false);
    setDecideResult(null);
    setProposalOpen(true);
  };

  // Gửi đề xuất AI chia đơn qua route nội bộ; lỗi hiện message của API.
  const submitPropose = async () => {
    setProposalBusy("propose");
    setProposalError("");
    try {
      const exclude = DEMO_WAREHOUSE_ACCOUNTS.filter(
        (name) => !workingStaff.includes(name),
      );
      const response = await fetch("/api/ai-assignments/warehouse/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exclude }),
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message = (data as { message?: unknown } | null)?.message;
        setProposalError(
          typeof message === "string" && message !== ""
            ? message
            : `Không đề xuất được (${response.status}).`,
        );
        return;
      }
      const data = (await response.json()) as ApiProposal;
      setProposal(data);
      setEditedAssignee({});
      setRemovedOrderIds([]);
    } catch {
      setProposalError("Không gọi được máy chủ, thử lại sau.");
    } finally {
      setProposalBusy(null);
    }
  };

  // Chia lại đơn của nhân viên nghỉ đột xuất: mở modal với đề xuất chia lại.
  const submitReassign = async (staffName: string) => {
    setProposalBusy(`reassign-${staffName}`);
    setProposalError("");
    setProposal(null);
    setEditedAssignee({});
    setRemovedOrderIds([]);
    setRejectReason("");
    setShowReject(false);
    setDecideResult(null);
    setProposalOpen(true);
    try {
      const response = await fetch("/api/ai-assignments/warehouse/reassign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignedTo: staffName }),
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message = (data as { message?: unknown } | null)?.message;
        setProposalError(
          typeof message === "string" && message !== ""
            ? message
            : `Không chia lại được (${response.status}).`,
        );
        return;
      }
      const data = (await response.json()) as ApiProposal;
      setProposal(data);
    } catch {
      setProposalError("Không gọi được máy chủ, thử lại sau.");
    } finally {
      setProposalBusy(null);
    }
  };

  // Duyệt đề xuất: áp dụng cả đợt 1 lần (dùng danh sách đã sửa trong modal
  // nếu có), hoặc từ chối kèm lý do bắt buộc. Đề xuất vượt tải thì API
  // chuyển sang phê duyệt ở Hàng đợi duyệt, không áp dụng trực tiếp.
  const submitDecide = async (decision: "approved" | "rejected") => {
    if (proposal === null) return;
    if (decision === "rejected" && rejectReason.trim() === "") {
      setProposalError("Từ chối đề xuất cần có lý do.");
      return;
    }
    setProposalBusy(`decide-${decision}`);
    setProposalError("");
    try {
      const items = proposal.items
        .filter((item) => !removedOrderIds.includes(item.orderId))
        .map((item) => ({
          orderId: item.orderId,
          assignedTo: editedAssignee[item.orderId] ?? item.assignedTo,
        }));
      const response = await fetch(
        `/api/ai-assignments/warehouse/${encodeURIComponent(proposal.id)}/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decision,
            ...(decision === "rejected"
              ? { reason: rejectReason.trim() }
              : {}),
            ...(decision === "approved" ? { items } : {}),
          }),
        },
      );
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message = (data as { message?: unknown } | null)?.message;
        setProposalError(
          typeof message === "string" && message !== ""
            ? message
            : `Không duyệt được (${response.status}).`,
        );
        return;
      }
      const data = (await response.json()) as ApiDecideResult;
      setProposal(data.proposal);
      setDecideResult(data);
      router.refresh();
    } catch {
      setProposalError("Không gọi được máy chủ, thử lại sau.");
    } finally {
      setProposalBusy(null);
    }
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
    {
      key: "reassign",
      header: "Chia lại",
      render: (name) =>
        isDispatcher && (activeCounts.get(name) ?? 0) > 0 ? (
          <button
            type="button"
            disabled={proposalBusy !== null}
            onClick={() => void submitReassign(name)}
            className="flex h-8 items-center justify-center rounded-md border border-gray-300 px-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {proposalBusy === `reassign-${name}` ? "Đang chia..." : "Chia lại"}
          </button>
        ) : (
          <span className="text-xs text-gray-400">-</span>
        ),
      cellClassName: "text-xs",
      headerClassName: "w-[110px]",
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
            <div>
              {isDispatcher && (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busyKey !== null}
                    onClick={openProposalModal}
                    className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
                  >
                    AI chia đơn
                  </button>
                  <p className="text-xs text-gray-500">
                    AI gợi ý chia toàn bộ đơn đang chờ theo hiệu suất, điều phối viên duyệt trong modal rồi mới áp dụng.
                  </p>
                </div>
              )}
              {isDispatcher && recentProposals.length > 0 && (
                <div className="mb-4 flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-xs font-semibold text-gray-900">Đề xuất gần đây</p>
                  {recentProposals.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
                      <span className="font-medium text-gray-900">{item.id}</span>
                      <span>{item.items.length} đơn</span>
                      <span>{item.status}</span>
                      {item.status === "Chờ duyệt" || item.status === "Chờ duyệt vượt tải" ? (
                        <button
                          type="button"
                          onClick={() => openProposal(item)}
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Mở lại
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
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
                  waitingPaged.map((row) => {
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
                {unassignedWaiting.length > 0 && (
                  <div className="rounded-lg border border-gray-200 bg-white">
                    <Pagination
                      page={waitingSafePage}
                      totalPages={waitingTotalPages}
                      onPageChange={setWaitingPage}
                      range={waitingRange}
                    />
                  </div>
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
                  packingPaged.map((row) => (
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
                {packingInProgress.length > 0 && (
                  <div className="rounded-lg border border-gray-200 bg-white">
                    <Pagination
                      page={packingSafePage}
                      totalPages={packingTotalPages}
                      onPageChange={setPackingPage}
                      range={packingRange}
                    />
                  </div>
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

      <Modal
        open={proposalOpen}
        onClose={() => {
          setProposalOpen(false);
          setProposal(null);
          setDecideResult(null);
        }}
        title={
          proposal === null
            ? "AI chia đơn kho"
            : `Đề xuất ${proposal.id} (${proposal.items.length} đơn)`
        }
        footer={
          proposal === null ? (
            <button
              type="button"
              disabled={proposalBusy !== null || workingStaff.length === 0}
              onClick={() => void submitPropose()}
              className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {proposalBusy === "propose" ? "Đang đề xuất..." : "Đề xuất chia đơn"}
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {proposal.status === "Chờ duyệt" && (
                <>
                  <button
                    type="button"
                    disabled={proposalBusy !== null}
                    onClick={() => void submitDecide("approved")}
                    className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
                  >
                    {proposalBusy === "decide-approved" ? "Đang áp dụng..." : "Áp dụng"}
                  </button>
                  <button
                    type="button"
                    disabled={proposalBusy !== null}
                    onClick={() => setShowReject((prev) => !prev)}
                    className="flex h-9 items-center justify-center rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Từ chối
                  </button>
                </>
              )}
              {proposal.status === "Chờ duyệt vượt tải" && (
                <button
                  type="button"
                  disabled={proposalBusy !== null}
                  onClick={() => void submitDecide("approved")}
                  className="flex h-9 items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
                >
                  {proposalBusy === "decide-approved" ? "Đang áp dụng..." : "Áp dụng sau phê duyệt"}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setProposalOpen(false);
                  setProposal(null);
                  setDecideResult(null);
                }}
                className="flex h-9 items-center justify-center rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Đóng
              </button>
            </div>
          )
        }
      >
        {proposal === null ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-700">
              Chọn nhân viên đang làm việc hôm nay. Bỏ tick ai thì người đó
              không nhận đơn trong đợt này.
            </p>
            {staffList.map((name) => (
              <label key={name} className="flex items-center gap-2 text-sm text-gray-900">
                <input
                  type="checkbox"
                  checked={workingStaff.includes(name)}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setWorkingStaff((prev) => [...prev, name]);
                    } else {
                      setWorkingStaff((prev) => prev.filter((item) => item !== name));
                    }
                  }}
                  className="h-4 w-4 accent-red-700"
                />
                {name} ({activeCounts.get(name) ?? 0} đơn đang làm)
              </label>
            ))}
            {proposalError !== "" && (
              <p className="text-sm text-red-700">{proposalError}</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-700">
              Đề xuất {proposal.items.length} đơn cho{" "}
              {new Set(proposal.items.map((item) => item.assignedTo)).size}{" "}
              nhân viên kho. Người duyệt xem xét, sửa (đổi người nhận, bỏ đơn)
              rồi mới áp dụng.
            </p>
            {proposal.overloaded && proposal.status === "Chờ duyệt" && (
              <p className="text-sm font-medium text-red-700">
                Đề xuất này vượt tải (đẩy ai đó lên từ 30 đơn đang làm trở
                lên). Bấm Áp dụng sẽ gửi yêu cầu phê duyệt tới Quản lý/Quản trị
                viên ở Hàng đợi duyệt, chưa tạo phân đơn ngay.
              </p>
            )}
            {proposal.status === "Chờ duyệt vượt tải" && (
              <p className="text-sm font-medium text-amber-700">
                Đang chờ Quản lý/Quản trị viên duyệt vượt tải ở Hàng đợi duyệt
                (phê duyệt {proposal.approvalId ?? ""}). Sau khi được duyệt,
                mở lại đề xuất này và bấm Áp dụng sau phê duyệt.
              </p>
            )}
            {proposal.skipped.length > 0 && (
              <p className="text-sm text-gray-500">
                Bỏ qua {proposal.skipped.length} đơn:{" "}
                {proposal.skipped
                  .map((item) => `${item.orderId} (${item.reason})`)
                  .join("; ")}
              </p>
            )}
            {decideResult !== null && decideResult.failed.length > 0 && (
              <p className="text-sm text-red-700">
                {decideResult.failed.length} mục lỗi:{" "}
                {decideResult.failed
                  .map((item) => `${item.orderId} (${item.reason})`)
                  .join("; ")}
              </p>
            )}
            {decideResult !== null && decideResult.applied.length > 0 && (
              <p className="text-sm text-green-700">
                Đã tạo {decideResult.applied.length} phân đơn.
              </p>
            )}
            {Array.from(
              new Set(
                proposal.items.map(
                  (item) => editedAssignee[item.orderId] ?? item.assignedTo,
                ),
              ),
            ).map((assignee) => {
              const groupItems = proposal.items.filter(
                (item) =>
                  (editedAssignee[item.orderId] ?? item.assignedTo) === assignee &&
                  !removedOrderIds.includes(item.orderId),
              );
              if (groupItems.length === 0) return null;
              const active = activeCounts.get(assignee) ?? 0;
              return (
                <div
                  key={assignee}
                  className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3"
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {assignee}: đang làm {active}, nhận thêm {groupItems.length}, tổng{" "}
                    {active + groupItems.length}
                  </p>
                  {groupItems.map((item) => {
                    const order = orders.find((o) => o.id === item.orderId);
                    return (
                      <div
                        key={item.orderId}
                        className="flex flex-col gap-1 rounded-md border border-gray-100 p-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">
                            {item.orderId}
                            {order !== undefined ? ` - ${itemsSummary(order)}` : ""}
                          </p>
                          {item.originalAssignmentId !== null && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                              Chia lại
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-700">{item.reason}</p>
                        <p className="text-xs text-gray-500">
                          Đang làm {item.inputs.active} · Đã hoàn thành{" "}
                          {item.inputs.completed} ·{" "}
                          {item.inputs.avgMinutes === null
                            ? "Chưa đo tốc độ"
                            : `Trung bình ${item.inputs.avgMinutes} phút/đơn`}{" "}
                          · Điểm {item.inputs.score}
                        </p>
                        {proposal.status === "Chờ duyệt" && (
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={editedAssignee[item.orderId] ?? item.assignedTo}
                              onChange={(event) =>
                                setEditedAssignee((prev) => ({
                                  ...prev,
                                  [item.orderId]: event.target.value,
                                }))
                              }
                              aria-label={`Đổi người nhận đơn ${item.orderId}`}
                              className="h-8 rounded-md border border-gray-300 px-2 text-xs text-gray-700"
                            >
                              {staffList.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                setRemovedOrderIds((prev) => [...prev, item.orderId])
                              }
                              className="flex h-8 items-center justify-center rounded-md border border-gray-300 px-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Bỏ đơn khỏi đợt
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {showReject && proposal.status === "Chờ duyệt" && (
              <div className="flex flex-col gap-2">
                <label htmlFor="proposal-reject-reason" className="text-sm font-medium text-gray-900">
                  Lý do từ chối (bắt buộc)
                </label>
                <input
                  id="proposal-reject-reason"
                  type="text"
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder="Ví dụ: Chia chưa đều, làm lại."
                  className="h-9 rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
                />
                <button
                  type="button"
                  disabled={proposalBusy !== null || rejectReason.trim() === ""}
                  onClick={() => void submitDecide("rejected")}
                  className="flex h-9 w-fit items-center justify-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
                >
                  {proposalBusy === "decide-rejected" ? "Đang từ chối..." : "Xác nhận từ chối"}
                </button>
              </div>
            )}
            {proposalError !== "" && (
              <p className="text-sm text-red-700">{proposalError}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
