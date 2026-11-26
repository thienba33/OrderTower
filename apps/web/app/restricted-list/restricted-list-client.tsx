"use client";

// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Table, type TableColumn } from "@/components/ui/Table";
import { formatMoney } from "@/data/orders";
import {
  RESTRICTED_SOURCES,
  RESTRICTED_STATUSES,
  RESTRICTED_STATUS_PILL,
  restrictedBasisRateClass,
  restrictedRateClass,
  type RestrictedSource,
  type RestrictedStatus,
} from "@/data/restricted";
import type {
  ApiRestrictedFlagDetail,
  RestrictedFlagsError,
} from "./restricted-list-types";

const PAGE_SIZE = 6;
const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

interface RestrictedListClientProps {
  flags: ApiRestrictedFlagDetail[];
  channelNames: Record<string, string>;
  productNames: Record<string, string>;
  flagsError: RestrictedFlagsError | null;
  roles: string[];
}

const KPIS: { label: string; value: (counts: Map<RestrictedStatus, number>, total: number) => number }[] = [
  { label: "Tất cả trạng thái", value: (_counts, total) => total },
  { label: "Đã kiểm tra", value: (counts) => counts.get("Đã kiểm tra") ?? 0 },
  { label: "Hoàn nhiều lần", value: (counts) => counts.get("Hoàn nhiều lần") ?? 0 },
  { label: "Trong danh sách", value: (counts) => counts.get("Hạn chế") ?? 0 },
  { label: "Đã hủy", value: (counts) => counts.get("Đã hủy") ?? 0 },
  { label: "Chờ duyệt thêm", value: (counts) => counts.get("Chờ duyệt thêm") ?? 0 },
];

// Ngày "DD/MM" và "DD/MM/YYYY" giờ Việt Nam từ chuỗi ISO, sai thì "-".
function dateParts(iso: string): { day: string; month: string; year: string } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: VN_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return { day: get("day"), month: get("month"), year: get("year") };
}

function formatDayMonth(iso: string): string {
  const parts = dateParts(iso);
  return parts === null ? "-" : `${parts.day}/${parts.month}`;
}

function formatDayMonthYear(iso: string): string {
  const parts = dateParts(iso);
  return parts === null ? "-" : `${parts.day}/${parts.month}/${parts.year}`;
}

// SĐT hiện dạng che: 4 số đầu + " *** " + 3 số cuối, giống dữ liệu mẫu
// đóng băng ("0918 *** 674"). Tìm kiếm vẫn khớp SĐT đầy đủ.
function maskPhone(phone: string | null): string {
  if (phone === null) return "-";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return phone;
  return `${digits.slice(0, 4)} *** ${digits.slice(-3)}`;
}

// Khách hàng: mã khách khi đơn có, còn không thì tên khách trong đơn.
function customerLabel(flag: ApiRestrictedFlagDetail): string {
  return flag.order.customerId ?? flag.order.customer;
}

function firstItemLabel(flag: ApiRestrictedFlagDetail): string {
  const item = flag.order.items[0];
  return item === undefined ? "-" : `${item.sku} x${item.quantity}`;
}

function firstItemQuantity(flag: ApiRestrictedFlagDetail): string {
  const item = flag.order.items[0];
  return item === undefined ? "-" : String(item.quantity);
}

// Sản phẩm trong dialog: tên thật từ tồn kho, chưa biết tên thì chỉ SKU.
function dialogProductLabel(
  flag: ApiRestrictedFlagDetail,
  productNames: Record<string, string>,
): string {
  const item = flag.order.items[0];
  if (item === undefined) return "-";
  const name = productNames[item.sku];
  return name === undefined
    ? `${item.sku} x${item.quantity}`
    : `${name} (${item.sku}) x${item.quantity}`;
}

function channelLabel(
  flag: ApiRestrictedFlagDetail,
  channelNames: Record<string, string>,
): string {
  if (flag.order.channelId === null) return "-";
  return channelNames[flag.order.channelId] ?? flag.order.channelId;
}

// Hành động rà soát trong dialog. Đề xuất hạn chế, từ chối hạn chế và
// hủy đơn bắt buộc có lý do; cho đi đơn và duyệt hạn chế thì không.
type DialogAction =
  | "release"
  | "propose-restrict"
  | "approve-restrict"
  | "reject-restrict"
  | "cancel";

const DIALOG_ACTION_LABEL: Record<DialogAction, string> = {
  release: "Cho đi đơn",
  "propose-restrict": "Đề xuất hạn chế",
  "approve-restrict": "Duyệt hạn chế",
  "reject-restrict": "Từ chối hạn chế",
  cancel: "Hủy đơn",
};

const REASON_ACTIONS: DialogAction[] = [
  "propose-restrict",
  "reject-restrict",
  "cancel",
];

export default function RestrictedListPage({
  flags,
  channelNames,
  productNames,
  flagsError,
  roles,
}: RestrictedListClientProps) {
  const router = useRouter();
  const isCskh = roles.includes("Nhân viên chăm sóc khách hàng");
  const isApprover =
    roles.includes("Quản lý") || roles.includes("Quản trị viên");

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<RestrictedSource | "">("");
  const [statusFilter, setStatusFilter] = useState<RestrictedStatus | "">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [dialogFlag, setDialogFlag] = useState<ApiRestrictedFlagDetail | null>(null);
  const [dialogAction, setDialogAction] = useState<DialogAction | null>(null);
  const [dialogReason, setDialogReason] = useState("");
  const [dialogErrorText, setDialogErrorText] = useState("");
  const [busyFlag, setBusyFlag] = useState<string | null>(null);

  // Form báo hoàn nhiều lần (chỉ CSKH): cờ bắt đầu trống và không có
  // chỗ nào khác tạo cờ, nên màn này cần 1 lối tạo cờ cho demo.
  const [createOrderId, setCreateOrderId] = useState("");
  const [createReason, setCreateReason] = useState("");
  const [createErrorText, setCreateErrorText] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  // Hủy hàng loạt cần lý do cho từng đơn: bấm "Hủy đơn" ở thanh chọn
  // thì hiện ô lý do, xác nhận mới gửi.
  const [bulkCancelArmed, setBulkCancelArmed] = useState(false);
  const [bulkCancelReason, setBulkCancelReason] = useState("");
  const [bulkErrorText, setBulkErrorText] = useState("");

  const counts = useMemo(() => {
    const byStatus = new Map<RestrictedStatus, number>();
    for (const flag of flags) {
      byStatus.set(flag.status, (byStatus.get(flag.status) ?? 0) + 1);
    }
    return byStatus;
  }, [flags]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return flags.filter((flag) => {
      if (statusFilter !== "" && flag.status !== statusFilter) return false;
      if (sourceFilter !== "" && flag.source !== sourceFilter) return false;
      if (query !== "") {
        const haystack =
          `${flag.id} ${flag.orderId} ${flag.order.customerId ?? ""} ${flag.order.customer} ${flag.order.phone ?? ""} ${flag.customerPhone ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [flags, search, sourceFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const range =
    filtered.length === 0
      ? { start: 0, end: 0, total: 0 }
      : {
          start: (safePage - 1) * PAGE_SIZE + 1,
          end: Math.min(safePage * PAGE_SIZE, filtered.length),
          total: filtered.length,
        };

  const selectedOnPage = paged.filter((flag) => selected.has(flag.id)).length;
  const allPageSelected = paged.length > 0 && selectedOnPage === paged.length;

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const flag of paged) {
        if (allPageSelected) {
          next.delete(flag.id);
        } else {
          next.add(flag.id);
        }
      }
      return next;
    });
  };

  // Nut "Ra soat hoan nhieu lan" loc ra nhom khach trong danh sach han che,
  // cung la nhom "N khach can quyet dinh" ke ben nut.
  const reviewRepeatReturns = () => {
    setStatusFilter("Hạn chế");
    setPage(1);
  };

  const resetFilters = () => {
    setSearch("");
    setSourceFilter("");
    setStatusFilter("");
    setPage(1);
  };

  const closeDialog = () => {
    setDialogFlag(null);
    setDialogAction(null);
    setDialogReason("");
    setDialogErrorText("");
  };

  const openDialog = (flag: ApiRestrictedFlagDetail) => {
    setDialogFlag(flag);
    setDialogAction(null);
    setDialogReason("");
    setDialogErrorText("");
  };

  // Gửi thao tác rà soát qua route nội bộ; lỗi hiện message của API,
  // xong thì tải lại dữ liệu server. Ẩn/hiện nút theo vai chỉ là tiện
  // ích giao diện; API kiểm tra lại vai trò và trạng thái ở mỗi thao tác.
  const postFlag = async (
    path: string,
    body: unknown,
    action: string,
    setErrorText: (text: string) => void,
  ): Promise<boolean> => {
    setBusyFlag(action);
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
      setBusyFlag(null);
    }
  };

  // Nút rà soát trong dialog theo trạng thái cờ và vai người xem.
  const availableDialogActions = (
    flag: ApiRestrictedFlagDetail,
  ): DialogAction[] => {
    if (flag.status === "Hoàn nhiều lần") {
      if (isCskh) return ["release", "propose-restrict", "cancel"];
      if (isApprover) return ["cancel"];
      return [];
    }
    if (flag.status === "Chờ duyệt thêm") {
      if (isApprover) return ["approve-restrict", "reject-restrict"];
      if (isCskh) return ["release", "cancel"];
      return [];
    }
    return [];
  };

  const submitDialogActionFor = async (action: DialogAction) => {
    if (dialogFlag === null) return;
    const body = REASON_ACTIONS.includes(action)
      ? { reason: dialogReason.trim() }
      : {};
    const ok = await postFlag(
      `/api/restricted-flags/${dialogFlag.id}/${action}`,
      body,
      `dialog-${action}`,
      setDialogErrorText,
    );
    if (!ok) return;
    const flagId = dialogFlag.id;
    closeDialog();
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(flagId);
      return next;
    });
    router.refresh();
  };

  const submitDialogAction = async () => {
    if (dialogAction === null) return;
    await submitDialogActionFor(dialogAction);
  };

  // Gửi hàng loạt theo từng cờ, dừng ở lỗi đầu tiên và hiện message
  // của API, giống cách duyệt hàng loạt ở màn Hàng đợi duyệt.
  const bulkRelease = async () => {
    const ids = flags
      .filter((flag) => selected.has(flag.id))
      .map((flag) => flag.id);
    for (const id of ids) {
      const ok = await postFlag(
        `/api/restricted-flags/${id}/release`,
        {},
        "bulk-release",
        setBulkErrorText,
      );
      if (!ok) return;
    }
    setSelected(new Set());
    router.refresh();
  };

  const bulkCancel = async () => {
    const ids = flags
      .filter((flag) => selected.has(flag.id))
      .map((flag) => flag.id);
    for (const id of ids) {
      const ok = await postFlag(
        `/api/restricted-flags/${id}/cancel`,
        { reason: bulkCancelReason.trim() },
        "bulk-cancel",
        setBulkErrorText,
      );
      if (!ok) return;
    }
    setSelected(new Set());
    setBulkCancelArmed(false);
    setBulkCancelReason("");
    router.refresh();
  };

  const submitCreate = async () => {
    const orderId = createOrderId.trim();
    if (orderId === "") return;
    setCreateBusy(true);
    setCreateErrorText("");
    try {
      const response = await fetch("/api/restricted-flags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId,
          ...(createReason.trim() === ""
            ? {}
            : { reason: createReason.trim() }),
        }),
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message = (data as { message?: unknown } | null)?.message;
        setCreateErrorText(
          typeof message === "string" && message !== ""
            ? message
            : `Tạo cờ lỗi (${response.status}).`,
        );
        return;
      }
      setCreateOrderId("");
      setCreateReason("");
      setPage(1);
      router.refresh();
    } catch {
      setCreateErrorText("Không gọi được máy chủ, thử lại sau.");
    } finally {
      setCreateBusy(false);
    }
  };

  const columns: TableColumn<ApiRestrictedFlagDetail>[] = [
    {
      key: "sel",
      header: (
        <input
          type="checkbox"
          aria-label="Chọn tất cả đơn trang này"
          checked={allPageSelected}
          ref={(el) => {
            if (el) {
              el.indeterminate = selectedOnPage > 0 && !allPageSelected;
            }
          }}
          onChange={toggleAllPage}
          className="size-4 cursor-pointer accent-red-700"
        />
      ),
      render: (flag) => (
        <input
          type="checkbox"
          aria-label={`Chọn đơn ${flag.orderId}`}
          checked={selected.has(flag.id)}
          onChange={() => toggleOne(flag.id)}
          className="size-4 cursor-pointer accent-red-700"
        />
      ),
      align: "center",
      headerClassName: "w-[40px]",
    },
    {
      key: "id",
      header: "Mã đơn",
      render: (flag) => flag.orderId,
      cellClassName: "text-xs font-medium text-gray-900",
      headerClassName: "w-[99px]",
    },
    {
      key: "date",
      header: "Ngày đặt",
      render: (flag) => formatDayMonth(flag.order.createdAt),
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[109px]",
    },
    {
      key: "customer",
      header: "Khách hàng",
      render: (flag) => customerLabel(flag),
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[109px]",
    },
    {
      key: "phone",
      header: "SĐT",
      render: (flag) => maskPhone(flag.order.phone ?? flag.customerPhone),
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[119px]",
    },
    {
      key: "product",
      header: "Sản phẩm",
      render: (flag) => firstItemLabel(flag),
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[167px]",
    },
    {
      key: "return1m",
      header: "Hoàn 1 tháng",
      render: (flag) => (
        <span className={restrictedRateClass(flag.stats.return1m)}>
          {flag.stats.return1m}%
        </span>
      ),
      cellClassName: "text-xs",
      headerClassName: "w-[109px]",
    },
    {
      key: "return3m",
      header: "Hoàn 3 tháng",
      render: (flag) => (
        <span className={restrictedRateClass(flag.stats.return3m)}>
          {flag.stats.return3m}%
        </span>
      ),
      cellClassName: "text-xs",
      headerClassName: "w-[109px]",
    },
    {
      key: "quantity",
      header: "Số lượng",
      render: (flag) => firstItemQuantity(flag),
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[79px]",
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (flag) => (
        <span
          className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${RESTRICTED_STATUS_PILL[flag.status]}`}
        >
          {flag.status}
        </span>
      ),
      headerClassName: "w-[129px]",
    },
    {
      key: "actions",
      header: "Hành động",
      render: (flag) => (
        <button
          type="button"
          onClick={() => openDialog(flag)}
          className="text-xs font-medium text-red-700 underline"
        >
          Chi tiết
        </button>
      ),
      headerClassName: "w-[79px]",
    },
  ];

  const restrictedCount = counts.get("Hạn chế") ?? 0;
  const dialogActions =
    dialogFlag === null ? [] : availableDialogActions(dialogFlag);
  const dialogReasonRequired =
    dialogAction !== null && REASON_ACTIONS.includes(dialogAction);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-gray-900">Danh sách hạn chế</h1>

      {isCskh && (
        <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold text-gray-900">Báo hoàn nhiều lần</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={createOrderId}
              onChange={(event) => setCreateOrderId(event.target.value)}
              placeholder="Mã đơn, ví dụ: DH-1001"
              aria-label="Mã đơn cần báo hoàn nhiều lần"
              className="h-10 w-[220px] max-w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none placeholder:text-gray-500 focus:border-gray-500"
            />
            <input
              type="text"
              value={createReason}
              onChange={(event) => setCreateReason(event.target.value)}
              placeholder="Lý do (không bắt buộc)"
              aria-label="Lý do báo hoàn nhiều lần"
              className="h-10 w-[320px] max-w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none placeholder:text-gray-500 focus:border-gray-500"
            />
            <button
              type="button"
              disabled={createOrderId.trim() === "" || createBusy}
              onClick={submitCreate}
              className="flex h-10 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {createBusy ? "Đang báo..." : "Báo hoàn nhiều lần"}
            </button>
          </div>
          {createErrorText !== "" && (
            <p className="text-sm text-red-700">{createErrorText}</p>
          )}
          <p className="text-xs text-gray-500">
            Cờ bắt đầu trống, CSKH báo đơn hoàn nhiều lần ở đây để đưa đơn
            vào danh sách rà soát.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {KPIS.map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm font-medium text-gray-500">{kpi.label}</p>
            <p className="mt-3 text-2xl font-semibold text-gray-900">
              {flagsError !== null ? "–" : kpi.value(counts, flags.length)}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={reviewRepeatReturns}
          className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800"
        >
          Rà soát hoàn nhiều lần
        </button>
        <p className="text-xs text-gray-500">{restrictedCount} khách cần quyết định</p>
        <div className="relative w-[170px] max-w-full">
          <select
            value={sourceFilter}
            onChange={(event) => {
              setSourceFilter(event.target.value as RestrictedSource | "");
              setPage(1);
            }}
            aria-label="Lọc theo nguồn"
            className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
          >
            <option value="">Nguồn: Tất cả</option>
            {RESTRICTED_SOURCES.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
        <div className="relative w-[190px] max-w-full">
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as RestrictedStatus | "");
              setPage(1);
            }}
            aria-label="Lọc theo trạng thái"
            className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
          >
            <option value="">Tất cả trạng thái</option>
            {RESTRICTED_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
        <div className="relative w-[260px] max-w-full">
          <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Tìm đơn hàng, SĐT..."
            aria-label="Tìm trong danh sách hạn chế"
            className="h-10 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-500 focus:border-gray-500"
          />
        </div>
        {(search !== "" || sourceFilter !== "" || statusFilter !== "") && (
          <button
            type="button"
            onClick={resetFilters}
            className="flex h-9 items-center rounded-md px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Xóa bộ lọc
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium text-gray-800">Đã chọn {selected.size} đơn</p>
            {isCskh && (
              <button
                type="button"
                disabled={busyFlag !== null}
                onClick={bulkRelease}
                className="flex h-8 items-center rounded-md bg-red-700 px-2.5 text-[13px] font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {busyFlag === "bulk-release" ? "Đang cho đi..." : "Cho đi đơn"}
              </button>
            )}
            {(isCskh || isApprover) && !bulkCancelArmed && (
              <button
                type="button"
                disabled={busyFlag !== null}
                onClick={() => {
                  setBulkCancelArmed(true);
                  setBulkErrorText("");
                }}
                className="flex h-8 items-center rounded-md border border-gray-300 bg-white px-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Hủy đơn
              </button>
            )}
          </div>
          {bulkCancelArmed && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={bulkCancelReason}
                onChange={(event) => setBulkCancelReason(event.target.value)}
                placeholder="Lý do hủy đơn (bắt buộc)"
                aria-label="Lý do hủy các đơn đã chọn"
                className="h-9 w-[320px] max-w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none placeholder:text-gray-500 focus:border-gray-500"
              />
              <button
                type="button"
                disabled={bulkCancelReason.trim() === "" || busyFlag !== null}
                onClick={bulkCancel}
                className="flex h-8 items-center rounded-md bg-red-700 px-2.5 text-[13px] font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {busyFlag === "bulk-cancel" ? "Đang hủy..." : `Xác nhận hủy ${selected.size} đơn`}
              </button>
              <button
                type="button"
                disabled={busyFlag !== null}
                onClick={() => {
                  setBulkCancelArmed(false);
                  setBulkCancelReason("");
                }}
                className="flex h-8 items-center rounded-md border border-gray-300 bg-white px-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Hủy bỏ
              </button>
            </div>
          )}
          {bulkErrorText !== "" && (
            <p className="text-sm text-red-700">{bulkErrorText}</p>
          )}
        </div>
      )}

      <section aria-label="Danh sách kiểm tra hoàn nhiều lần và hạn chế" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <h2 className="flex h-11 items-center border-b border-gray-200 px-4 text-sm font-semibold text-gray-900">
          Danh sách kiểm tra hoàn nhiều lần và hạn chế
        </h2>
        {flagsError !== null ? (
          <p className="px-4 py-6 text-sm text-gray-700">
            {flagsError === "unauthorized" ? (
              <>
                Phiên đăng nhập đã hết hạn.{" "}
                <Link href="/api/auth/login" className="font-medium text-red-700 underline">
                  Đăng nhập lại
                </Link>{" "}
                để xem danh sách hạn chế từ API.
              </>
            ) : (
              "Không tải được danh sách hạn chế. Tải lại trang để thử lại."
            )}
          </p>
        ) : (
          <>
            <Table
              bare
              columns={columns}
              rows={paged}
              rowKey={(flag) => flag.id}
              emptyText="Chưa có cờ hạn chế nào"
            />
            <div className="border-t border-gray-200">
              <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} range={range} />
            </div>
          </>
        )}
      </section>

      <Modal
        open={dialogFlag !== null}
        onClose={closeDialog}
        title={dialogFlag !== null ? `${dialogFlag.orderId} - Chi tiết đơn hàng` : ""}
        footer={
          dialogFlag !== null && dialogAction === null ? (
            <>
              {dialogActions.includes("cancel") && (
                <button
                  type="button"
                  disabled={busyFlag !== null}
                  onClick={() => setDialogAction("cancel")}
                  className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  Hủy đơn
                </button>
              )}
              {dialogActions.includes("reject-restrict") && (
                <button
                  type="button"
                  disabled={busyFlag !== null}
                  onClick={() => setDialogAction("reject-restrict")}
                  className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  Từ chối hạn chế
                </button>
              )}
              {dialogActions.includes("propose-restrict") && (
                <button
                  type="button"
                  disabled={busyFlag !== null}
                  onClick={() => setDialogAction("propose-restrict")}
                  className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
                >
                  Đề xuất hạn chế
                </button>
              )}
              {dialogActions.includes("approve-restrict") && (
                <button
                  type="button"
                  disabled={busyFlag !== null}
                  onClick={() => void submitDialogActionFor("approve-restrict")}
                  className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
                >
                  {busyFlag === "dialog-approve-restrict" ? "Đang duyệt..." : "Duyệt hạn chế"}
                </button>
              )}
              {dialogActions.includes("release") && (
                <button
                  type="button"
                  disabled={busyFlag !== null}
                  onClick={() => void submitDialogActionFor("release")}
                  className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
                >
                  {busyFlag === "dialog-release" ? "Đang cho đi..." : "Cho đi đơn"}
                </button>
              )}
            </>
          ) : dialogFlag !== null && dialogAction !== null ? (
            <>
              <button
                type="button"
                disabled={busyFlag !== null}
                onClick={() => {
                  setDialogAction(null);
                  setDialogReason("");
                  setDialogErrorText("");
                }}
                className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Quay lại
              </button>
              <button
                type="button"
                disabled={
                  (dialogReasonRequired && dialogReason.trim() === "") ||
                  busyFlag !== null
                }
                onClick={submitDialogAction}
                className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {busyFlag === `dialog-${dialogAction}`
                  ? "Đang gửi..."
                  : `Xác nhận ${DIALOG_ACTION_LABEL[dialogAction]}`}
              </button>
            </>
          ) : null
        }
      >
        {dialogFlag !== null && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-gray-500">
              Khách hàng: {customerLabel(dialogFlag)} - SĐT:{" "}
              {maskPhone(dialogFlag.order.phone ?? dialogFlag.customerPhone)} - Ngày đặt:{" "}
              {formatDayMonthYear(dialogFlag.order.createdAt)}
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[13px]">
                <p className="w-[130px] shrink-0 text-gray-500">Khách hàng</p>
                <p className="flex-1 text-gray-800">{customerLabel(dialogFlag)}</p>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="w-[130px] shrink-0 text-gray-500">SĐT</p>
                <p className="text-gray-800">
                  {maskPhone(dialogFlag.order.phone ?? dialogFlag.customerPhone)}
                </p>
                {dialogFlag.status === "Hạn chế" && (
                  <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full bg-red-50 px-2.5 text-xs font-medium text-red-700">
                    Trong danh sách hạn chế
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="w-[130px] shrink-0 text-gray-500">Sản phẩm</p>
                <p className="flex-1 text-gray-800">
                  {dialogProductLabel(dialogFlag, productNames)}
                </p>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="w-[130px] shrink-0 text-gray-500">Giá trị đơn</p>
                <p className="flex-1 text-gray-800">{formatMoney(dialogFlag.order.total)}</p>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="w-[130px] shrink-0 text-gray-500">Kênh / Người bán</p>
                <p className="flex-1 text-gray-800">
                  {channelLabel(dialogFlag, channelNames)}
                </p>
              </div>
              {dialogFlag.reason !== null && (
                <div className="flex items-center gap-2 text-[13px]">
                  <p className="w-[130px] shrink-0 text-gray-500">Lý do</p>
                  <p className="flex-1 text-gray-800">{dialogFlag.reason}</p>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm font-semibold text-gray-900">Căn cứ quyết định</p>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="flex-1 text-gray-500">Số đơn trong 3 tháng</p>
                <p className="font-semibold text-gray-900">{dialogFlag.stats.orders3m} đơn</p>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="flex-1 text-gray-500">Tỷ lệ hoàn 1 tháng</p>
                <p className={`font-semibold ${restrictedBasisRateClass(dialogFlag.stats.return1m)}`}>
                  {dialogFlag.stats.return1m}%
                </p>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="flex-1 text-gray-500">Tỷ lệ hoàn 3 tháng</p>
                <p className={`font-semibold ${restrictedBasisRateClass(dialogFlag.stats.return3m)}`}>
                  {dialogFlag.stats.return3m}%
                </p>
              </div>
            </div>
            {dialogAction !== null && dialogReasonRequired && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="restricted-dialog-reason"
                  className="text-sm font-medium text-gray-700"
                >
                  {dialogAction === "propose-restrict"
                    ? "Lý do đề xuất hạn chế"
                    : dialogAction === "reject-restrict"
                      ? "Lý do từ chối hạn chế"
                      : "Lý do hủy đơn"}
                </label>
                <textarea
                  id="restricted-dialog-reason"
                  value={dialogReason}
                  onChange={(event) => setDialogReason(event.target.value)}
                  rows={3}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-500 focus:border-gray-500"
                />
              </div>
            )}
            {dialogFlag.status === "Hạn chế" && (
              <p className="text-xs text-gray-500">
                Khách đã trong danh sách hạn chế, không còn hành động rà soát.
              </p>
            )}
            {dialogErrorText !== "" && (
              <p className="text-sm text-red-700">{dialogErrorText}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
