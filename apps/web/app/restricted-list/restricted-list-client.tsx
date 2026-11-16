"use client";

// SPDX-License-Identifier: Apache-2.0
import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Table, type TableColumn } from "@/components/ui/Table";
import {
  RESTRICTED_ROWS,
  RESTRICTED_SOURCES,
  RESTRICTED_STATUSES,
  RESTRICTED_STATUS_PILL,
  formatRestrictedTotal,
  restrictedBasisRateClass,
  restrictedProductLabel,
  restrictedRateClass,
  type RestrictedRow,
  type RestrictedSource,
  type RestrictedStatus,
} from "@/data/restricted";

const PAGE_SIZE = 6;

const KPIS: { label: string; value: (counts: Map<RestrictedStatus, number>, total: number) => number }[] = [
  { label: "Tất cả trạng thái", value: (_counts, total) => total },
  { label: "Đã kiểm tra", value: (counts) => counts.get("Đã kiểm tra") ?? 0 },
  { label: "Hoàn nhiều lần", value: (counts) => counts.get("Hoàn nhiều lần") ?? 0 },
  { label: "Trong danh sách", value: (counts) => counts.get("Hạn chế") ?? 0 },
  { label: "Đã hủy", value: (counts) => counts.get("Đã hủy") ?? 0 },
  { label: "Chờ duyệt thêm", value: (counts) => counts.get("Chờ duyệt thêm") ?? 0 },
];

export default function RestrictedListPage() {
  const [rows, setRows] = useState<RestrictedRow[]>(RESTRICTED_ROWS);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<RestrictedSource | "">("");
  const [statusFilter, setStatusFilter] = useState<RestrictedStatus | "">("");
  const [selected, setSelected] = useState<Set<string>>(new Set(["DH-1061", "DH-1058"]));
  const [page, setPage] = useState(1);
  const [dialogRow, setDialogRow] = useState<RestrictedRow | null>(null);

  const counts = useMemo(() => {
    const byStatus = new Map<RestrictedStatus, number>();
    for (const row of rows) {
      byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
    }
    return byStatus;
  }, [rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "" && row.status !== statusFilter) return false;
      if (sourceFilter !== "" && row.source !== sourceFilter) return false;
      if (query !== "" && !`${row.id} ${row.customer} ${row.phone}`.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [rows, search, sourceFilter, statusFilter]);

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

  const selectedOnPage = paged.filter((row) => selected.has(row.id)).length;
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
      for (const row of paged) {
        if (allPageSelected) {
          next.delete(row.id);
        } else {
          next.add(row.id);
        }
      }
      return next;
    });
  };

  // Nut "Ra soat hoan nhieu lan" loc ra nhom khach trong danh sach han che,
  // cung la nhom "5 khach can quyet dinh" ke ben nut.
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

  const releaseRows = (ids: Set<string>) => {
    setRows((prev) => prev.filter((row) => !ids.has(row.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setPage(1);
    setDialogRow(null);
  };

  const cancelRows = (ids: Set<string>) => {
    setRows((prev) => prev.map((row) => (ids.has(row.id) ? { ...row, status: "Đã hủy" } : row)));
    setPage(1);
    setDialogRow(null);
  };

  const columns: TableColumn<RestrictedRow>[] = [
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
      render: (row) => (
        <input
          type="checkbox"
          aria-label={`Chọn đơn ${row.id}`}
          checked={selected.has(row.id)}
          onChange={() => toggleOne(row.id)}
          className="size-4 cursor-pointer accent-red-700"
        />
      ),
      align: "center",
      headerClassName: "w-[40px]",
    },
    {
      key: "id",
      header: "Mã đơn",
      render: (row) => row.id,
      cellClassName: "text-xs font-medium text-gray-900",
      headerClassName: "w-[99px]",
    },
    {
      key: "date",
      header: "Ngày đặt",
      render: (row) => row.date,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[109px]",
    },
    {
      key: "customer",
      header: "Khách hàng",
      render: (row) => row.customer,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[109px]",
    },
    {
      key: "phone",
      header: "SĐT",
      render: (row) => row.phone,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[119px]",
    },
    {
      key: "product",
      header: "Sản phẩm",
      render: (row) => `${row.productSku} x${row.quantity}`,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[167px]",
    },
    {
      key: "return1m",
      header: "Hoàn 1 tháng",
      render: (row) => <span className={restrictedRateClass(row.return1m)}>{row.return1m}%</span>,
      cellClassName: "text-xs",
      headerClassName: "w-[109px]",
    },
    {
      key: "return3m",
      header: "Hoàn 3 tháng",
      render: (row) => <span className={restrictedRateClass(row.return3m)}>{row.return3m}%</span>,
      cellClassName: "text-xs",
      headerClassName: "w-[109px]",
    },
    {
      key: "quantity",
      header: "Số lượng",
      render: (row) => row.quantity,
      cellClassName: "text-xs text-gray-700",
      headerClassName: "w-[79px]",
    },
    {
      key: "status",
      header: "Trạng thái",
      render: (row) => (
        <span
          className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${RESTRICTED_STATUS_PILL[row.status]}`}
        >
          {row.status}
        </span>
      ),
      headerClassName: "w-[129px]",
    },
    {
      key: "actions",
      header: "Hành động",
      render: (row) => (
        <button type="button" onClick={() => setDialogRow(row)} className="text-xs font-medium text-red-700 underline">
          Chi tiết
        </button>
      ),
      headerClassName: "w-[79px]",
    },
  ];

  const restrictedCount = counts.get("Hạn chế") ?? 0;
  const selectedRows = rows.filter((row) => selected.has(row.id));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-gray-900">Danh sách hạn chế</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {KPIS.map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm font-medium text-gray-500">{kpi.label}</p>
            <p className="mt-3 text-2xl font-semibold text-gray-900">{kpi.value(counts, rows.length)}</p>
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
        <div className="flex h-10 w-[150px] max-w-full items-center rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700">
          02/11/2026
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
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-sm font-medium text-gray-800">Đã chọn {selected.size} đơn</p>
          <button
            type="button"
            onClick={() => releaseRows(new Set(selectedRows.map((row) => row.id)))}
            className="flex h-8 items-center rounded-md bg-red-700 px-2.5 text-[13px] font-medium text-white hover:bg-red-800"
          >
            Cho đi đơn
          </button>
          <button
            type="button"
            onClick={() => cancelRows(new Set(selectedRows.map((row) => row.id)))}
            className="flex h-8 items-center rounded-md border border-gray-300 bg-white px-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-100"
          >
            Hủy đơn
          </button>
        </div>
      )}

      <section aria-label="Danh sách kiểm tra hoàn nhiều lần và hạn chế" className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <h2 className="flex h-11 items-center border-b border-gray-200 px-4 text-sm font-semibold text-gray-900">
          Danh sách kiểm tra hoàn nhiều lần và hạn chế
        </h2>
        <Table bare columns={columns} rows={paged} rowKey={(row) => row.id} />
        <div className="border-t border-gray-200">
          <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} range={range} />
        </div>
      </section>

      <Modal
        open={dialogRow !== null}
        onClose={() => setDialogRow(null)}
        title={dialogRow !== null ? `${dialogRow.id} - Chi tiết đơn hàng` : ""}
        footer={
          <>
            <button
              type="button"
              onClick={() => dialogRow !== null && cancelRows(new Set([dialogRow.id]))}
              className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Hủy đơn
            </button>
            <button
              type="button"
              onClick={() => dialogRow !== null && releaseRows(new Set([dialogRow.id]))}
              className="flex h-9 items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800"
            >
              Cho đi đơn
            </button>
          </>
        }
      >
        {dialogRow !== null && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-gray-500">
              Khách hàng: {dialogRow.customer} - SĐT: {dialogRow.phone} - Ngày đặt: {dialogRow.date}/2026
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[13px]">
                <p className="w-[130px] shrink-0 text-gray-500">Khách hàng</p>
                <p className="flex-1 text-gray-800">{dialogRow.customer}</p>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="w-[130px] shrink-0 text-gray-500">SĐT</p>
                <p className="text-gray-800">{dialogRow.phone}</p>
                {dialogRow.status === "Hạn chế" && (
                  <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full bg-red-50 px-2.5 text-xs font-medium text-red-700">
                    Trong danh sách hạn chế
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="w-[130px] shrink-0 text-gray-500">Sản phẩm</p>
                <p className="flex-1 text-gray-800">{restrictedProductLabel(dialogRow)}</p>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="w-[130px] shrink-0 text-gray-500">Giá trị đơn</p>
                <p className="flex-1 text-gray-800">{formatRestrictedTotal(dialogRow)}</p>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="w-[130px] shrink-0 text-gray-500">Kênh / Người bán</p>
                <p className="flex-1 text-gray-800">{dialogRow.channel}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm font-semibold text-gray-900">Căn cứ quyết định</p>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="flex-1 text-gray-500">Số đơn trong 3 tháng</p>
                <p className="font-semibold text-gray-900">{dialogRow.orders3m} đơn</p>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="flex-1 text-gray-500">Tỷ lệ hoàn 1 tháng</p>
                <p className={`font-semibold ${restrictedBasisRateClass(dialogRow.return1m)}`}>
                  {dialogRow.return1m}%
                </p>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <p className="flex-1 text-gray-500">Tỷ lệ hoàn 3 tháng</p>
                <p className={`font-semibold ${restrictedBasisRateClass(dialogRow.return3m)}`}>
                  {dialogRow.return3m}%
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
