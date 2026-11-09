"use client";

// SPDX-License-Identifier: Apache-2.0
import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Table, type TableColumn } from "@/components/ui/Table";
import {
  APPROVAL_ITEMS,
  APPROVAL_LEVEL_TEXT,
  APPROVAL_TYPES,
  APPROVAL_TYPE_PILL,
  type ApprovalItem,
  type ApprovalType,
} from "@/data/approvals";

const PAGE_SIZE = 6;

type Tab = "Tất cả" | ApprovalType;

const KPIS: { label: string; value: (counts: Map<ApprovalType, number>, total: number) => number }[] = [
  { label: "Chờ duyệt", value: (_counts, total) => total },
  { label: "Địa chỉ", value: (counts) => counts.get("Địa chỉ") ?? 0 },
  { label: "Hạn chế", value: (counts) => counts.get("Hạn chế") ?? 0 },
  { label: "Vượt tải", value: (counts) => counts.get("Vượt tải") ?? 0 },
  {
    label: "Điều tiết / AI",
    value: (counts) => (counts.get("Điều tiết") ?? 0) + (counts.get("Đề xuất AI") ?? 0),
  },
];

export default function ApprovalQueuePage() {
  const [items, setItems] = useState<ApprovalItem[]>(APPROVAL_ITEMS);
  const [tab, setTab] = useState<Tab>("Tất cả");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ApprovalType | "">("");
  const [senderFilter, setSenderFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(["AP-01", "AP-02"]));
  const [page, setPage] = useState(1);
  const [dialogTargets, setDialogTargets] = useState<ApprovalItem[] | null>(null);
  const [dialogMode, setDialogMode] = useState<"approve" | "reject">("approve");
  const [reason, setReason] = useState("");

  const senders = useMemo(() => Array.from(new Set(items.map((item) => item.sender))), [items]);

  const counts = useMemo(() => {
    const byType = new Map<ApprovalType, number>();
    for (const item of items) {
      byType.set(item.type, (byType.get(item.type) ?? 0) + 1);
    }
    return byType;
  }, [items]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (tab !== "Tất cả" && item.type !== tab) return false;
      if (typeFilter !== "" && item.type !== typeFilter) return false;
      if (senderFilter !== "" && item.sender !== senderFilter) return false;
      if (query !== "" && !`${item.target} ${item.content} ${item.sender}`.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [items, tab, search, typeFilter, senderFilter]);

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
  };

  const openDialog = (targets: ApprovalItem[], mode: "approve" | "reject") => {
    setDialogTargets(targets);
    setDialogMode(mode);
    setReason("");
  };

  const confirm = (_decision: "approve" | "reject") => {
    if (reason.trim() === "" || dialogTargets === null) {
      return;
    }
    const ids = new Set(dialogTargets.map((item) => item.id));
    setItems((prev) => prev.filter((item) => !ids.has(item.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setPage(1);
    setDialogTargets(null);
  };

  const columns: TableColumn<ApprovalItem>[] = [
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
          aria-label={`Chọn mục ${row.target}`}
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
          className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${APPROVAL_TYPE_PILL[row.type]}`}
        >
          {row.type}
        </span>
      ),
      headerClassName: "w-[159px]",
    },
    {
      key: "target",
      header: "Mã / Đối tượng",
      render: (row) => row.target,
      cellClassName: "text-xs font-medium text-gray-900",
      headerClassName: "w-[129px]",
    },
    {
      key: "content",
      header: "Nội dung",
      render: (row) => row.content,
      cellClassName: "text-xs text-gray-700 !whitespace-normal",
      headerClassName: "w-[297px]",
    },
    {
      key: "sender",
      header: "Người gửi",
      render: (row) => row.sender,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[149px]",
    },
    {
      key: "time",
      header: "Gửi lúc",
      render: (row) => row.time,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[109px]",
    },
    {
      key: "level",
      header: "Mức độ",
      render: (row) => <span className={APPROVAL_LEVEL_TEXT[row.level]}>{row.level}</span>,
      cellClassName: "text-xs",
      headerClassName: "w-[129px]",
    },
    {
      key: "actions",
      header: "Hành động",
      render: (row) => (
        <span className="flex items-center gap-2 text-xs font-medium">
          <button type="button" onClick={() => openDialog([row], "approve")} className="text-red-700 underline">
            Duyệt
          </button>
          <button type="button" onClick={() => openDialog([row], "reject")} className="text-gray-500 underline">
            Từ chối
          </button>
        </span>
      ),
      headerClassName: "w-[139px]",
    },
  ];

  const tabs: { label: Tab; count: number }[] = [
    { label: "Tất cả", count: items.length },
    ...APPROVAL_TYPES.map((type) => ({ label: type as Tab, count: counts.get(type) ?? 0 })),
  ];

  const dialogTitle =
    dialogTargets !== null && dialogTargets.length === 1
      ? `${dialogTargets[0].target} - ${dialogTargets[0].summary}`
      : `${dialogTargets?.length ?? 0} mục đã chọn`;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-gray-900">Hàng đợi duyệt</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {KPIS.map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm font-medium text-gray-500">{kpi.label}</p>
            <p className="mt-3 text-2xl font-semibold text-gray-900">{kpi.value(counts, items.length)}</p>
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
                setTypeFilter(event.target.value as ApprovalType | "");
                setPage(1);
              }}
              aria-label="Lọc theo loại duyệt"
              className="h-10 w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-8 text-sm text-gray-700 outline-none focus:border-gray-500"
            >
              <option value="">Tất cả loại duyệt</option>
              {APPROVAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
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

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-gray-800">Đã chọn {selected.size} mục</p>
          <button
            type="button"
            onClick={() => openDialog(items.filter((item) => selected.has(item.id)), "approve")}
            className="flex h-8 items-center rounded-md bg-red-700 px-2.5 text-[13px] font-medium text-white hover:bg-red-800"
          >
            Duyệt đã chọn
          </button>
          <button
            type="button"
            onClick={() => openDialog(items.filter((item) => selected.has(item.id)), "reject")}
            className="flex h-8 items-center rounded-md border border-gray-300 bg-white px-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-100"
          >
            Từ chối đã chọn
          </button>
        </div>
      )}

      <section aria-label="Danh sách chờ duyệt" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <h2 className="flex h-11 items-center border-b border-gray-200 px-4 text-sm font-semibold text-gray-900">
          Danh sách chờ duyệt
        </h2>
        <Table bare columns={columns} rows={paged} rowKey={(row) => row.id} />
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
              onClick={() => setDialogTargets(null)}
              className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Quay lại
            </button>
            <button
              type="button"
              disabled={reason.trim() === ""}
              onClick={() => confirm("reject")}
              className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Từ chối
            </button>
            <button
              type="button"
              disabled={reason.trim() === ""}
              onClick={() => confirm("approve")}
              className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Xác nhận duyệt
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-gray-500">{dialogTitle}</p>
          <div className="rounded-lg border border-gray-300 p-3 text-sm text-gray-700">
            {dialogTargets !== null && dialogTargets.length === 1 ? (
              dialogTargets[0].content
            ) : (
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {(dialogTargets ?? []).map((item) => (
                  <li key={item.id}>
                    {item.target} - {item.summary}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="approval-reason" className="text-sm font-medium text-gray-700">
              {dialogMode === "approve" ? "Lý do duyệt (bắt buộc)" : "Lý do từ chối (bắt buộc)"}
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
