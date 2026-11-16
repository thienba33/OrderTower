"use client";

// SPDX-License-Identifier: Apache-2.0
import { useMemo, useState } from "react";
import { Pagination } from "@/components/ui/Pagination";
import { Table, type TableColumn } from "@/components/ui/Table";
import { formatMoney } from "@/data/orders";
import {
  WAREHOUSE_STATUSES,
  WAREHOUSE_STATUS_PILL,
  inventoryStatus,
  type ApiInventoryItem,
  type WarehouseRow,
} from "./warehouse-types";

const PAGE_SIZE = 6;

function toRow(item: ApiInventoryItem): WarehouseRow {
  return { ...item, status: inventoryStatus(item), total: item.stock + item.reserved };
}

const warehouseColumns: TableColumn<WarehouseRow>[] = [
  { key: "sku", header: "SKU", render: (row) => <span className="font-medium text-gray-900">{row.sku}</span>, cellClassName: "w-[109px]" },
  { key: "name", header: "Sản phẩm", render: (row) => row.name, cellClassName: "w-[218px]" },
  { key: "unit", header: "Đơn vị", render: (row) => row.unit, cellClassName: "w-[89px]" },
  { key: "unitPrice", header: "Đơn giá", render: (row) => (row.unitPrice === null ? "-" : formatMoney(row.unitPrice)), cellClassName: "w-[109px]" },
  { key: "stock", header: "Tồn kho", render: (row) => String(row.stock), cellClassName: "w-[89px]" },
  { key: "reserved", header: "Đã giữ", render: (row) => String(row.reserved), cellClassName: "w-[89px]" },
  { key: "total", header: "Tổng", render: (row) => String(row.total), cellClassName: "w-[89px]" },
  {
    key: "status",
    header: "Trạng thái",
    render: (row) => (
      <span className={`inline-flex h-[22px] items-center rounded-full px-[10px] text-xs font-medium ${WAREHOUSE_STATUS_PILL[row.status]}`}>
        {row.status}
      </span>
    ),
    cellClassName: "w-[149px]",
  },
];

export default function WarehouseClient({ items }: { items: ApiInventoryItem[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedSku, setSelectedSku] = useState<string | null>(items[0]?.sku ?? null);

  const rows = useMemo(() => items.map(toRow), [items]);

  const counts = useMemo(() => {
    const count = (status: WarehouseRow["status"]) => rows.filter((row) => row.status === status).length;
    return {
      total: rows.length,
      low: count("Sắp hết"),
      out: count("Hết hàng"),
      stock: rows.reduce((sum, row) => sum + row.stock, 0),
      reserved: rows.reduce((sum, row) => sum + row.reserved, 0),
    };
  }, [rows]);

  // Các SKU sắp hết hoặc hết hàng; SKU thấp nhất là SKU có tồn kho thấp nhất.
  const lowRows = useMemo(
    () => rows.filter((row) => row.status === "Sắp hết" || row.status === "Hết hàng"),
    [rows],
  );
  const lowest = useMemo(
    () =>
      lowRows.reduce<WarehouseRow | null>(
        (min, row) => (min === null || row.stock < min.stock ? row : min),
        null,
      ),
    [lowRows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (q && ![row.sku, row.name].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selected = rows.find((row) => row.sku === selectedSku) ?? rows[0] ?? null;

  const kpis = [
    { label: "Tổng SKU", value: counts.total },
    { label: "Sắp hết", value: counts.low },
    { label: "Hết hàng", value: counts.out },
    { label: "Tổng tồn khả dụng", value: counts.stock },
    { label: "Tổng đã giữ", value: counts.reserved },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-xl font-semibold text-gray-900">Kho và tồn kho - Kho duy nhất</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm font-medium text-gray-600">{kpi.label}</p>
            <p className="text-2xl font-semibold text-gray-900">{kpi.value}</p>
          </div>
        ))}
      </div>

      {lowRows.length > 0 && lowest !== null && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center gap-3 px-4 py-3">
            <p className="flex-1 text-sm">
              <span className="font-bold text-red-800">
                CẢNH BÁO TỒN KHO: {lowRows.length} SKU sắp hết (thấp nhất: {lowest.sku} còn {lowest.stock} {lowest.unit}).
              </span>
              <span className="text-gray-500"> Chưa có đề xuất nhập tự động.</span>
            </p>
          </div>
          <div className="h-[3px] w-full bg-red-600" />
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Tìm SKU, tên sản phẩm..."
            aria-label="Tìm SKU, tên sản phẩm"
            className="h-10 w-[340px] rounded-md border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            aria-label="Trạng thái tồn"
            className="h-10 w-[200px] rounded-md border border-gray-300 px-3 text-sm text-gray-700"
          >
            <option value="">Tất cả trạng thái tồn</option>
            {WAREHOUSE_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => { setSearch(""); setStatusFilter(""); setPage(1); }}
            className="flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-gray-700"
          >
            Xóa bộ lọc
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex h-11 items-center px-4">
          <p className="text-sm font-semibold text-gray-900">Danh sách tồn kho theo SKU</p>
        </div>
        <Table
          columns={[
            ...warehouseColumns,
            {
              key: "action",
              header: "Hành động",
              render: (row) => (
                <button
                  type="button"
                  onClick={() => setSelectedSku(row.sku)}
                  className="text-xs font-medium text-red-700 underline"
                >
                  Chi tiết
                </button>
              ),
              cellClassName: "w-[99px]",
            },
          ]}
          rows={pageRows}
          rowKey={(row) => row.sku}
          emptyText="Không có SKU nào khớp bộ lọc"
          bare
        />
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          range={{ start: filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1, end: Math.min(page * PAGE_SIZE, filtered.length), total: filtered.length }}
        />
      </div>

      {selected !== null && (
        <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-semibold text-gray-900">Chi tiết tồn kho: {selected.sku} - {selected.name}</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Tồn kho hiện tại</p>
              <p className="text-sm font-semibold text-gray-900">{selected.stock} {selected.unit}</p>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Đã giữ cho đơn</p>
              <p className="text-sm font-semibold text-gray-900">{selected.reserved} {selected.unit}</p>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Tổng tồn</p>
              <p className="text-sm font-semibold text-gray-900">{selected.total} {selected.unit}</p>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Đơn giá</p>
              <p className="text-sm font-semibold text-gray-900">{selected.unitPrice === null ? "-" : formatMoney(selected.unitPrice)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
