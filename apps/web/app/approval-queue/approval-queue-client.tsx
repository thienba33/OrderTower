// SPDX-License-Identifier: Apache-2.0
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Table, type TableColumn } from "@/components/ui/Table";
import {
  approvalTypeLabel,
  approvalTypePill,
  type ApiApproval,
  type ApiApprovalStatus,
} from "./approval-queue-types";

const PAGE_SIZE = 6;

type Tab = "Tất cả" | "Chờ duyệt" | "Đã duyệt" | "Đã từ chối";

const TAB_STATUS: Record<Exclude<Tab, "Tất cả">, ApiApprovalStatus> = {
  "Chờ duyệt": "pending",
  "Đã duyệt": "approved",
  "Đã từ chối": "rejected",
};

// Giờ VN dạng DD/MM HH:mm, ví dụ 16/11 12:19.
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}/${get("month")} ${get("hour")}:${get("minute")}`;
}

export default function ApprovalQueueClient({
  approvals,
  username,
  roles,
}: {
  approvals: ApiApproval[];
  username: string;
  roles: string[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Tất cả");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [senderFilter, setSenderFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [dialogTargets, setDialogTargets] = useState<ApiApproval[] | null>(null);
  const [dialogMode, setDialogMode] = useState<"approve" | "reject">("approve");
  const [reason, setReason] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");

  // Chỉ Quản lý hoặc Quản trị viên mới được quyết định, và không được
  // duyệt mục do chính mình yêu cầu. Đây chỉ là tiện ích giao diện;
  // API kiểm tra lại vai trò và người yêu cầu ở server.
  const canDecide = roles.includes("Quản lý") || roles.includes("Quản trị viên");
  const isDecidable = (item: ApiApproval) =>
    canDecide && item.status === "pending" && item.requestedBy !== username;

  const senders = useMemo(
    () => Array.from(new Set(approvals.map((item) => item.requestedBy))),
    [approvals],
  );
  const types = useMemo(
    () => Array.from(new Set(approvals.map((item) => item.type))),
    [approvals],
  );

  const counts = useMemo(() => {
    const byStatus: Record<ApiApprovalStatus, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    for (const item of approvals) {
      byStatus[item.status] += 1;
    }
    return byStatus;
  }, [approvals]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return approvals.filter((item) => {
      if (tab !== "Tất cả" && item.status !== TAB_STATUS[tab]) return false;
      if (typeFilter !== "" && item.type !== typeFilter) return false;
      if (senderFilter !== "" && item.requestedBy !== senderFilter) return false;
      if (
        query !== "" &&
        !`${item.subjectId} ${item.reason} ${item.requestedBy}`.toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [approvals, tab, search, typeFilter, senderFilter]);

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

  const selectedOnPage = paged.filter((item) => selected.has(item.id)).length;
  const allPageSelected = paged.length > 0 && selectedOnPage === paged.length;
  const decidableSelected = approvals.filter(
    (item) => selected.has(item.id) && isDecidable(item),
  ).length;

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
      for (const item of paged) {
        if (allPageSelected) {
          next.delete(item.id);
        } else {
          next.add(item.id);
        }
      }
      return next;
    });
  };

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("");
    setSenderFilter("");
    setTab("Tất cả");
    setPage(1);
    setNotice("");
  };

  const openDialog = (targets: ApiApproval[], mode: "approve" | "reject") => {
    const decidable = targets.filter((item) => isDecidable(item));
    if (decidable.length === 0) {
      return;
    }
    setDialogTargets(decidable);
    setDialogMode(mode);
    setReason("");
    setDialogError("");
    setNotice("");
  };

  // API không có endpoint duyệt hàng loạt nên duyệt lần lượt từng mục.
  // Mục nào lỗi thì dừng ngay và hiện message API của mục đó.
  const confirm = async (decision: "approve" | "reject") => {
    if (dialogTargets === null || submitting) {
      return;
    }
    if (decision === "reject" && reason.trim() === "") {
      return;
    }
    setSubmitting(true);
    setDialogError("");
    let done = 0;
    for (const target of dialogTargets) {
      const body =
        decision === "approve" && reason.trim() === ""
          ? {}
          : { reason: reason.trim() };
      let response: Response;
      try {
        response = await fetch(`/api/approvals/${encodeURIComponent(target.id)}/${decision}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        setDialogError(`Lỗi ở ${target.subjectId}: không gọi được API.`);
        setSubmitting(false);
        return;
      }
      if (!response.ok) {
        let message = `API trả về ${response.status}.`;
        try {
          const data: unknown = await response.json();
          const text = (data as Record<string, unknown> | null)?.message;
          if (typeof text === "string" && text.length > 0) {
            message = text;
          }
        } catch {
          // Giữ message mặc định ở trên.
        }
        setDialogError(`Lỗi ở ${target.subjectId}: ${message}`);
        setSubmitting(false);
        return;
      }
      done += 1;
    }
    const ids = new Set(dialogTargets.map((item) => item.id));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setPage(1);
    setDialogTargets(null);
    setSubmitting(false);
    setNotice(`Đã ${decision === "approve" ? "duyệt" : "từ chối"} ${done} mục.`);
    router.refresh();
  };

  const columns: TableColumn<ApiApproval>[] = [
    {
      key: "sel",
      header: (
        <input
          type="checkbox"
          aria-label="Chọn tất cả mục trang này"
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
      render: (row) => (
        <input
          type="checkbox"
          aria-label={`Chọn mục ${row.subjectId}`}
          checked={selected.has(row.id)}
          onChange={() => toggleOne(row.id)}
          className="size-4 cursor-pointer accent-red-700"
        />
      ),
      align: "center",
      headerClassName: "w-[40px]",
    },
    {
      key: "type",
      header: "Loại duyệt",
      render: (row) => (
        <span
          className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${approvalTypePill(row.type)}`}
        >
          {approvalTypeLabel(row.type)}
        </span>
      ),
      headerClassName: "w-[159px]",
    },
    {
      key: "target",
      header: "Mã / Đối tượng",
      render: (row) => row.subjectId,
      cellClassName: "text-xs font-medium text-gray-900",
      headerClassName: "w-[129px]",
    },
    {
      key: "content",
      header: "Nội dung",
      render: (row) => row.reason,
      cellClassName: "text-xs text-gray-700 !whitespace-normal",
      headerClassName: "w-[297px]",
    },
    {
      key: "sender",
      header: "Người gửi",
      render: (row) => row.requestedBy,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[149px]",
    },
    {
      key: "time",
      header: "Gửi lúc",
      render: (row) => formatDateTime(row.requestedAt),
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[109px]",
    },
    {
      key: "decider",
      header: "Người quyết định",
      render: (row) =>
        row.decidedBy === null ? (
          <span className="text-gray-400">-</span>
        ) : (
          <span className="flex flex-col">
            <span>{row.decidedBy}</span>
            {row.decisionReason !== null && row.decisionReason !== "" && (
              <span className="text-gray-500">{row.decisionReason}</span>
            )}
          </span>
        ),
      cellClassName: "text-xs text-gray-700 !whitespace-normal",
      headerClassName: "w-[149px]",
    },
    {
      key: "actions",
      header: "Hành động",
      render: (row) =>
        isDecidable(row) ? (
          <span className="flex items-center gap-2 text-xs font-medium">
            <button
              type="button"
              onClick={() => openDialog([row], "approve")}
              className="text-red-700 underline"
            >
              Duyệt
            </button>
            <button
              type="button"
              onClick={() => openDialog([row], "reject")}
              className="text-gray-500 underline"
            >
              Từ chối
            </button>
          </span>
        ) : (
          <span className="text-xs text-gray-400">-</span>
        ),
      headerClassName: "w-[139px]",
    },
  ];

  const kpis: { label: string; value: number }[] = [
    { label: "Chờ duyệt", value: counts.pending },
    { label: "Đã duyệt", value: counts.approved },
    { label: "Đã từ chối", value: counts.rejected },
    { label: "Tổng cộng", value: approvals.length },
  ];

  const tabs: { label: Tab; count: number }[] = [
    { label: "Tất cả", count: approvals.length },
    { label: "Chờ duyệt", count: counts.pending },
    { label: "Đã duyệt", count: counts.approved },
    { label: "Đã từ chối", count: counts.rejected },
  ];

  const dialogTitle =
    dialogTargets !== null && dialogTargets.length === 1
      ? `${dialogTargets[0].subjectId} - ${approvalTypeLabel(dialogTargets[0].type)}`
      : `${dialogTargets?.length ?? 0} mục đã chọn`;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-gray-900">Hàng đợi duyệt</h1>

      {notice !== "" && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm font-medium text-gray-500">{kpi.label}</p>
            <p className="mt-3 text-2xl font-semibold text-gray-900">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {tabs.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              setTab(item.label);
              setPage(1);
            }}
            className={`h-9 flex-1 rounded-md bg-white px-4 text-sm ${
              tab === item.label ? "font-bold text-red-700" : "text-gray-600"
            }`}
          >
            {item.label} ({item.count})
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
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
              placeholder="Tìm mã đơn, khách hàng, nội dung..."
              aria-label="Tìm trong hàng đợi duyệt"
              className="h-10 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none placeholder:text-gray-500 focus:border-gray-500"
            />
          </div>
          <div className="relative w-[200px] max-w-full">
            <select
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value);
                setPage(1);
              }}
              aria-label="Lọc theo loại duyệt"
              className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
            >
              <option value="">Tất cả loại duyệt</option>
              {types.map((type) => (
                <option key={type} value={type}>
                  {approvalTypeLabel(type)}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          <div className="relative w-[200px] max-w-full">
            <select
              value={senderFilter}
              onChange={(event) => {
                setSenderFilter(event.target.value);
                setPage(1);
              }}
              aria-label="Lọc theo người gửi"
              className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
            >
              <option value="">Tất cả người gửi</option>
              {senders.map((sender) => (
                <option key={sender} value={sender}>
                  {sender}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="flex h-9 items-center rounded-md px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Xóa bộ lọc
          </button>
        </div>
      </div>

      {selected.size > 0 && canDecide && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-gray-800">Đã chọn {selected.size} mục</p>
          <button
            type="button"
            disabled={decidableSelected === 0}
            onClick={() =>
              openDialog(
                approvals.filter((item) => selected.has(item.id)),
                "approve",
              )
            }
            className="flex h-8 items-center rounded-md bg-red-700 px-2.5 text-[13px] font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Duyệt đã chọn
          </button>
          <button
            type="button"
            disabled={decidableSelected === 0}
            onClick={() =>
              openDialog(
                approvals.filter((item) => selected.has(item.id)),
                "reject",
              )
            }
            className="flex h-8 items-center rounded-md border border-gray-300 bg-white px-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Từ chối đã chọn
          </button>
        </div>
      )}

      <section aria-label="Danh sách chờ duyệt" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <h2 className="flex h-11 items-center border-b border-gray-200 px-4 text-sm font-semibold text-gray-900">
          Danh sách chờ duyệt
        </h2>
        <Table bare columns={columns} rows={paged} rowKey={(row) => row.id} emptyText="Không có mục nào." />
        <div className="border-t border-gray-200">
          <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} range={range} />
        </div>
      </section>

      <Modal
        open={dialogTargets !== null}
        onClose={() => setDialogTargets(null)}
        title="Xác nhận duyệt"
        footer={
          <>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setDialogTargets(null)}
              className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Quay lại
            </button>
            <button
              type="button"
              disabled={submitting || reason.trim() === ""}
              onClick={() => confirm("reject")}
              className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Đang xử lý..." : "Từ chối"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => confirm("approve")}
              className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Đang xử lý..." : "Xác nhận duyệt"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-gray-500">{dialogTitle}</p>
          <div className="rounded-lg border border-gray-300 p-3 text-sm text-gray-700">
            {dialogTargets !== null && dialogTargets.length === 1 ? (
              dialogTargets[0].reason
            ) : (
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {(dialogTargets ?? []).map((item) => (
                  <li key={item.id}>
                    {item.subjectId} - {approvalTypeLabel(item.type)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {dialogError !== "" && (
            <p className="text-sm text-red-700">{dialogError}</p>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="approval-reason" className="text-sm font-medium text-gray-700">
              {dialogMode === "approve" ? "Lý do duyệt (không bắt buộc)" : "Lý do từ chối (bắt buộc)"}
            </label>
            <textarea
              id="approval-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Khách đã xác nhận qua điện thoại lúc 09:05..."
              rows={3}
              className="h-[72px] w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-gray-500"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
